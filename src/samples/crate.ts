import { getModuleSpec } from '../modules/catalog'
import { controlValue } from '../modules/values'
import { buildTree, textCell, type Cell } from '../patch/mini'
import type { Patch } from '../patch/types'
import { isGrid } from '../codegen/graph'
import { drumText } from '../patch/notation'
import { setValue } from '../rack/model'
import type { SourceDocument } from '../reader/types'
import type { SamplePackResource } from '../strudel/engine'
import { cartridges } from '../workspace/cartridges'
import type { SampleBank } from './manifest'
import { packKey } from './packs'

export const SOUND_MIME = 'application/x-monkeyboy-sound'
export interface SoundChoice {
  name: string
  n: number
}
export const soundToken = ({ name, n }: SoundChoice) => `${name}:${n}`
export function soundChoice(value: unknown): SoundChoice {
  if (
    !value ||
    typeof value !== 'object' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !/^[\w-]+$/.test(value.name) ||
    !('n' in value) ||
    typeof value.n !== 'number' ||
    !Number.isInteger(value.n) ||
    value.n < 0
  )
    throw new Error('Invalid sound card')
  return { name: value.name, n: value.n }
}
export function variantCount(bank: SampleBank): number {
  return Array.isArray(bank)
    ? bank.length
    : Math.max(0, ...Object.values(bank).map((paths) => paths.length))
}
export function seatedResources(
  document: SourceDocument,
  resources: readonly SamplePackResource[],
) {
  const keys = new Set(
    cartridges(document).flatMap((entry) => (entry.pack ? [packKey(entry.pack)] : [])),
  )
  return resources.filter((resource) => keys.has(resource.key))
}

/** Replace sounding atoms in one row, retaining rests, nesting and timing modifiers. */
export function replaceDrumRow(text: string, row: number, choice: SoundChoice): string {
  const tree = buildTree(text)
  const layer = tree.root[row]
  if (!layer || (tree.join !== 'stack' && row !== 0)) throw new Error('Choose a DRUMS row')
  const edits: { start: number; end: number; text: string }[] = []
  const visit = (cell: Cell) => {
    if (textCell(cell)) throw new Error('Edit this row in Text mode before dropping a sound')
    if (cell.layers) cell.layers.forEach((layer) => layer.cells.forEach(visit))
    else if (cell.shape === 'atom') {
      const index = cell.mods.find((mod) => mod.kind === 'index')
      edits.push({ ...cell.body, text: soundToken(choice) })
      if (index) edits.push({ ...index.span, text: '' })
    }
  }
  layer.cells.forEach(visit)
  if (!edits.length) throw new Error('Add a sounding step before dropping a sound')
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
  buildTree(text)
  return text
}

/** Make one downstream sampler's implicit bank/index explicit before a row overrides it. */
function unbankDrums(patch: Patch, moduleId: string, text: string): { patch: Patch; text: string } {
  const samplers = new Set<string>()
  const visited = new Set<string>()
  let unbankedConsumer = false
  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const module = patch.modules.find((module) => module.id === id)
    if (!module) return
    if (module.type === 'smpl') {
      samplers.add(id)
      return
    }
    if (getModuleSpec(module.type).soundSource) {
      unbankedConsumer = true
      return
    }
    for (const cable of patch.cables.filter((cable) => cable.from.module === id))
      visit(cable.to.module)
  }
  visit(moduleId)
  const settings = [...samplers].map((id) => {
    const module = patch.modules.find((module) => module.id === id)
    if (!module) throw new Error('Missing sampler')
    const spec = getModuleSpec(module.type)
    const get = (id: string) => {
      const control = spec.controls.find((control) => control.id === id)
      return control && controlValue(module, control)
    }
    if (get('sample'))
      throw new Error('This row has a downstream sound selector; drop on SMPL instead')
    const bank = get('bank'),
      n = get('n')
    return { id, bank: typeof bank === 'string' ? bank : '', n: typeof n === 'number' ? n : 0 }
  })
  const signatures = settings.map(({ bank, n }) => JSON.stringify([bank, n]))
  if (unbankedConsumer) signatures.push(JSON.stringify(['', 0]))
  if (new Set(signatures).size > 1)
    throw new Error('This row feeds different sampler banks or indices; drop on each SMPL instead')
  const setting = settings[0]
  if (!setting || (!setting.bank && !setting.n)) return { patch, text }
  const tree = buildTree(text)
  const edits: { start: number; end: number; text: string }[] = []
  function qualify(cell: Cell) {
    if (textCell(cell)) throw new Error('Edit this row in Text mode before dropping a sound')
    if (cell.layers) cell.layers.forEach((layer) => layer.cells.forEach(qualify))
    else if (cell.shape === 'atom') {
      const name = text.slice(cell.body.start, cell.body.end)
      const n = typeof setting?.n === 'number' && setting.n !== 0 ? setting.n : undefined
      edits.push({
        ...cell.body,
        text: `${setting?.bank ? `${setting.bank}_` : ''}${name}${n === undefined ? '' : `:${n}`}`,
      })
      const index = cell.mods.find((mod) => mod.kind === 'index')
      if (n !== undefined && index) edits.push({ ...index.span, text: '' })
    }
  }
  tree.root.forEach((layer) => layer.cells.forEach(qualify))
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
  for (const { id } of settings) {
    patch = setValue(patch, id, 'bank', '')
    patch = setValue(patch, id, 'n', 0)
  }
  return { patch, text }
}

function requireNeutralBanks(patch: Patch, moduleId: string, visited = new Set<string>()) {
  if (visited.has(moduleId)) return
  visited.add(moduleId)
  const module = patch.modules.find((module) => module.id === moduleId)
  if (!module) return
  const spec = getModuleSpec(module.type)
  if (module.type === 'smpl') {
    const control = spec.controls.find((control) => control.id === 'bank')
    if (control && controlValue(module, control))
      throw new Error(
        `Clear ${moduleId} BANK before choosing this sample, or drop on SMPL instead.`,
      )
  }
  for (const cable of patch.cables.filter((cable) => cable.to.module === moduleId)) {
    const jack = spec.jacks.find((jack) => jack.id === cable.to.jack)
    if (jack && !jack.cvTarget && !['gate', 'side', 'return'].includes(jack.id))
      requireNeutralBanks(patch, cable.from.module, visited)
  }
}
export function dropSound(
  patch: Patch,
  moduleId: string,
  choice: SoundChoice,
  row?: number,
): Patch {
  choice = soundChoice(choice)
  const module = patch.modules.find((module) => module.id === moduleId)
  if (!module) throw new Error('Missing sample target')
  const spec = getModuleSpec(module.type)
  if (module.type === 'drums') {
    const control = spec.controls.find((control) => control.id === 'grid')
    if (!control) throw new Error('Missing drum grid')
    const value = controlValue(module, control)
    const text = typeof value === 'string' ? value : isGrid(value) ? drumText(value) : '~'
    const unbanked = unbankDrums(patch, moduleId, text)
    return setValue(
      unbanked.patch,
      moduleId,
      'grid',
      replaceDrumRow(unbanked.text, row ?? 0, choice),
    )
  }
  const target = spec.sampleTarget
  if (!target || (target.prefix && !choice.name.startsWith(target.prefix)))
    throw new Error('Drop a seated wt_ sound on WAVETABLE')
  if (module.type === 'smpl') {
    patch = setValue(patch, moduleId, 'bank', '')
    patch = setValue(patch, moduleId, 'n', 0)
    return setValue(patch, moduleId, target.control, soundToken(choice))
  }
  if (spec.soundSource) requireNeutralBanks(patch, moduleId)
  return setValue(patch, moduleId, target.control, soundToken(choice))
}
