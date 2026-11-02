import { generate } from '../codegen/generate'
import { graph, requireNode } from '../codegen/graph'
import { getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'
import type { JackSignal, KnobControl } from '../modules/types'
import type { ControlValue, JackRef, Patch, PlacedModule } from '../patch/types'

export const HP = 12
export const ROW_HP = 64
export const ROW_HEIGHT = 440

export function starterPatch(): Patch {
  return {
    version: 1,
    modules: [
      { id: 'mix1', type: 'mix', row: 0, hp: 0, look: 'instrument', values: {} },
      { id: 'out1', type: 'out', row: 0, hp: 12, look: 'instrument', values: {} },
    ],
    cables: [
      { id: 'c1', from: { module: 'mix1', jack: 'out' }, to: { module: 'out1', jack: 'in' } },
    ],
    names: {},
  }
}

export function validateRack(patch: Patch): Patch {
  for (const module of patch.modules) {
    const end = module.hp + getModuleSpec(module.type).hp
    if (end > ROW_HP) throw new Error('Module extends past the rail')
    if (
      patch.modules.some(
        (other) =>
          other.id !== module.id &&
          other.row === module.row &&
          module.hp < other.hp + getModuleSpec(other.type).hp &&
          other.hp < end,
      )
    )
      throw new Error('Modules cannot overlap')
  }
  generate(patch)
  return patch
}

/** Nearest free whole-HP interval, with ties to the left. */
export function freePosition(
  patch: Patch,
  type: string,
  row: number,
  wanted: number,
  moving?: string,
): number | null {
  const width = getModuleSpec(type).hp
  const positions = Array.from({ length: ROW_HP - width + 1 }, (_, i) => i)
    .filter(
      (hp) =>
        !patch.modules.some(
          (m) =>
            m.id !== moving &&
            m.row === row &&
            hp < m.hp + getModuleSpec(m.type).hp &&
            m.hp < hp + width,
        ),
    )
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)
  return positions[0] ?? null
}

function nextId(prefix: string, ids: readonly string[]): string {
  let n = 1
  while (ids.includes(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export function placeModule(
  patch: Patch,
  type: string,
  row: number,
  wanted = 0,
  moving?: string,
): Patch {
  const spec = getModuleSpec(type)
  const hp = freePosition(patch, type, row, wanted, moving)
  if (hp === null) throw new Error('No room here — use Add row')
  if (moving) {
    if (!patch.modules.some((m) => m.id === moving && m.type === type))
      throw new Error('Unknown module')
    return validateRack({
      ...patch,
      modules: patch.modules.map((m) => (m.id === moving ? { ...m, row, hp } : m)),
    })
  }
  const module: PlacedModule = {
    id: nextId(
      type,
      patch.modules.map((m) => m.id),
    ),
    type,
    row,
    hp,
    look: DEFAULT_LOOK[spec.family],
    values: {},
  }
  return validateRack({ ...patch, modules: [...patch.modules, module] })
}

export function removeModule(patch: Patch, id: string): Patch {
  return validateRack({
    ...patch,
    modules: patch.modules.filter((m) => m.id !== id),
    cables: patch.cables.filter((c) => c.from.module !== id && c.to.module !== id),
    names: Object.fromEntries(
      Object.entries(patch.names).filter(([key]) => !key.startsWith(`${id}:`)),
    ),
  })
}

export function setValue(
  patch: Patch,
  module: string,
  control: string,
  value: ControlValue,
): Patch {
  if (!patch.modules.some((m) => m.id === module)) throw new Error('Unknown module')
  return validateRack({
    ...patch,
    modules: patch.modules.map((m) =>
      m.id === module ? { ...m, values: { ...m.values, [control]: value } } : m,
    ),
  })
}

export function removeCable(patch: Patch, id: string): Patch {
  return validateRack({ ...patch, cables: patch.cables.filter((c) => c.id !== id) })
}

export function connect(
  patch: Patch,
  from: JackRef,
  to: JackRef,
  replace = false,
  moving?: string,
): Patch {
  const occupied = patch.cables.find(
    (c) => c.to.module === to.module && c.to.jack === to.jack && c.id !== moving,
  )
  if (occupied && !replace) throw new Error('Input occupied — choose Replace or Cancel')
  let next: Patch = {
    ...patch,
    cables: [
      ...patch.cables.filter((c) => c.id !== moving && (!replace || c.id !== occupied?.id)),
      {
        id:
          moving ??
          nextId(
            'c',
            patch.cables.map((c) => c.id),
          ),
        from,
        to,
      },
    ],
  }
  // Repatching a modulation source restores target-owned depth defaults. Following
  // passthroughs here also handles a late connection from an Alien output to CV.
  const upstream = (id: string): string | undefined => {
    const m = next.modules.find((item) => item.id === id)
    if (m?.type === 'lfo') return id
    if (!m || !['iter', 'jux', 'code'].includes(m.type)) return undefined
    const c = next.cables.find((item) => item.to.module === id && item.to.jack === 'in')
    return c ? upstream(c.from.module) : undefined
  }
  graph(next) // Reject cycles before walking passthroughs.
  const lfo = upstream(from.module)
  if (lfo)
    next = {
      ...next,
      modules: next.modules.map((m) => {
        if (m.id !== lfo) return m
        const values = { ...m.values }
        delete values.depth
        return { ...m, values }
      }),
    }
  return validateRack(next)
}

export function cableSignal(patch: Patch, from: JackRef): JackSignal {
  const module = patch.modules.find((m) => m.id === from.module)
  const jack = module && getModuleSpec(module.type).jacks.find((j) => j.id === from.jack)
  if (jack?.signal !== 'any') return jack?.signal ?? 'any'
  const input = patch.cables.find((c) => c.to.module === from.module && c.to.jack === 'in')
  return input ? cableSignal(patch, input.from) : 'any'
}

export function depthControl(
  patch: Patch,
  module: PlacedModule,
  control: KnobControl,
): KnobControl & { perTarget?: boolean } {
  if (module.type !== 'lfo' || control.id !== 'depth') return control
  const nodes = graph(patch)
  const targets: KnobControl[] = []
  function visit(id: string) {
    const node = requireNode(nodes, id)
    for (const cables of node.outputs.values())
      for (const cable of cables) {
        const target = requireNode(nodes, cable.to.module)
        const jack = target.spec.jacks.find((j) => j.id === cable.to.jack)
        const knob = target.spec.controls.find((c) => c.id === jack?.cvTarget)
        if (knob?.kind === 'knob' && knob.modulation) targets.push(knob)
        else if (['iter', 'jux', 'code'].includes(target.spec.id)) visit(target.module.id)
      }
  }
  visit(module.id)
  const first = targets[0]
  if (!first?.modulation) return control
  const min = Math.max(...targets.map((t) => t.modulation?.min ?? control.min))
  const max = Math.min(...targets.map((t) => t.modulation?.max ?? control.max))
  return {
    ...control,
    min,
    max,
    default: Math.max(min, Math.min(max, first.modulation.default)),
    perTarget: targets.some((t) => t.modulation?.default !== first.modulation?.default),
    step: first.unit === 'Hz' && targets.every((t) => t.unit === 'Hz') ? 1 : control.step,
    ...(targets.every((t) => t.unit === first.unit) && first.unit ? { unit: first.unit } : {}),
  }
}

export function snap(control: KnobControl, value: number): number {
  const clamped = Math.max(control.min, Math.min(control.max, value))
  const candidates = control.detents ?? [
    control.min + Math.round((clamped - control.min) / control.step) * control.step,
    control.default,
    control.max,
  ]
  return Number(
    candidates
      .reduce(
        (best, n) => (Math.abs(n - clamped) < Math.abs(best - clamped) ? n : best),
        candidates[0] ?? clamped,
      )
      .toFixed(6),
  )
}

export function normalized(control: KnobControl, value: number): number {
  return control.taper === 'log'
    ? Math.log(value / control.min) / Math.log(control.max / control.min)
    : (value - control.min) / (control.max - control.min)
}

export function draggedValue(control: KnobControl, position: number): number {
  const p = Math.max(0, Math.min(1, position))
  return snap(
    control,
    control.taper === 'log'
      ? control.min * (control.max / control.min) ** p
      : control.min + p * (control.max - control.min),
  )
}
