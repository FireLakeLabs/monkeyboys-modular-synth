import { isStack } from '../modules/composition'
import { controlEnabled } from '../modules/bindings'
import { effectRank } from '../modules/effects'
import { activeEffectRanks, planEffects } from '../codegen/effects'
import { generate } from '../codegen/generate'
import { graph, outputSignal, functionMembers, isSteps, requireNode } from '../codegen/graph'
import { getModuleSpec, VOICE_EFFECT_ORDER } from '../modules/catalog'
import { DEFAULT_LOOK, looksFor, type LookId } from '../modules/looks'
import type { Control, JackSignal, KnobControl, ModuleSpec, SwitchControl } from '../modules/types'
import type { Cable, ControlValue, JackRef, Patch, PlacedModule } from '../patch/types'
import { HP, ROW_HP, railWidth, validatePositions, type RailHp } from '../patch/layout'

export { ROW_HP, HP } from '../patch/layout'

export const ROW_HEIGHT = 440

export type SwitchStyle = 'toggle' | 'segments' | 'dropdown'

// Measured on the catalog's option labels at the panel's 11 px condensed type.
const SEGMENT_CHARACTER = 4.8
const SEGMENT_PADDING = 7
const PANEL_INSET = 10

export interface PanelControls {
  loose: readonly Control[]
  strips: readonly { group: string; controls: readonly Control[] }[]
  more: readonly Control[]
}

/** Where a module's controls appear. Placement never changes a value or its call. */
export function panelControls(spec: ModuleSpec, module?: PlacedModule): PanelControls {
  const shown = spec.controls
    .filter((control) => !module || controlEnabled(spec, module.values, control))
    .filter((control) => control.id !== spec.sampleTarget?.control)
    .toSorted((a, b) =>
      'group' in a || 'group' in b ? 0 : Number(a.kind === 'knob') - Number(b.kind === 'knob'),
    )
  const more = shown.filter((control) => 'more' in control && control.more)
  const panel = shown.filter((control) => !more.includes(control))
  const groups = [
    ...new Set(panel.flatMap((c) => ('group' in c && c.group !== undefined ? [c.group] : []))),
  ]
  return {
    loose: panel.filter((control) => !('group' in control && control.group !== undefined)),
    strips: groups.map((group) => ({
      group,
      controls: panel.filter((control) => 'group' in control && control.group === group),
    })),
    more,
  }
}

/** Presentation only: every style commits the same catalog option values. */
export function switchStyle(control: SwitchControl, hp: number): SwitchStyle {
  const { options } = control
  if (options.length === 2 && options.every(({ value }) => value === 'off' || value === 'on'))
    return 'toggle'
  if (options.length < 2 || options.length > 4) return 'dropdown'
  const width = options.reduce(
    (sum, { label }) => sum + label.length * SEGMENT_CHARACTER + SEGMENT_PADDING,
    0,
  )
  return width <= hp * HP - PANEL_INSET ? 'segments' : 'dropdown'
}

export function starterPatch(railHp: RailHp = ROW_HP, visibleHp: number = railHp): Patch {
  const mixHp = getModuleSpec('mix').hp
  return {
    version: 1,
    railHp,
    modules: [
      {
        id: 'mix1',
        type: 'mix',
        row: 0,
        hp: Math.max(0, Math.min(railHp, visibleHp) - mixHp),
        look: 'instrument',
        values: {},
      },
      { id: 'out1', type: 'out', row: 0, hp: 0, look: 'instrument', values: {} },
    ],
    cables: [
      { id: 'c1', from: { module: 'mix1', jack: 'out' }, to: { module: 'out1', jack: 'in' } },
    ],
    names: {},
  }
}

export function validateRack(patch: Patch): Patch {
  validatePositions(patch)
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
  if (type === 'out') return 0
  const width = getModuleSpec(type).hp
  const positions = Array.from({ length: railWidth(patch) - width + 1 }, (_, i) => i)
    .filter(
      (hp) =>
        !patch.modules.some(
          (m) =>
            m.type !== 'out' &&
            m.id !== moving &&
            m.row === row &&
            hp < m.hp + getModuleSpec(m.type).hp &&
            m.hp < hp + width,
        ),
    )
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)
  return positions[0] ?? null
}

/** Find space without shifting neighbors; a full rail spills onto the next one. */
export function placementPosition(
  patch: Patch,
  type: string,
  row = 0,
  wanted = 0,
  moving?: string,
): { row: number; hp: number } {
  for (;;) {
    const hp = freePosition(patch, type, row, wanted, moving)
    if (hp !== null) return { row, hp }
    row++
    wanted = 0
  }
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
  if (moving && type === 'out') throw new Error('OUT is pinned to the case')
  const hp = freePosition(patch, type, row, wanted, moving)
  if (hp === null) throw new Error('No room here — use Add row')
  if (moving) {
    if (!patch.modules.some((m) => m.id === moving && m.type === type))
      throw new Error('Unknown module')
    return validateRack({
      ...patch,
      modules: patch.modules.map((m) => (m.id === moving ? { ...m, row, hp } : m)),
      rows: Math.max(rackRows(patch), row + 1),
    })
  }
  const module: PlacedModule = {
    id: nextId(
      type,
      patch.modules.map((m) => m.id),
    ),
    type,
    row: type === 'out' ? 0 : row,
    hp,
    look: DEFAULT_LOOK[spec.family],
    values: Object.fromEntries(
      spec.controls
        .filter((c) => Object.hasOwn(spec.legacyDefaults ?? {}, c.id))
        .map((c) => [c.id, c.default]),
    ),
  }
  return validateRack({
    ...patch,
    modules: [...patch.modules, module],
    rows: type === 'out' ? rackRows(patch) : Math.max(rackRows(patch), row + 1),
  })
}

export function removeModule(patch: Patch, id: string): Patch {
  if (patch.modules.find((m) => m.id === id)?.type === 'out')
    throw new Error('OUT cannot be deleted while the rack is open')
  return validateRack({
    ...patch,
    modules: patch.modules.filter((m) => m.id !== id),
    cables: patch.cables.filter((c) => c.from.module !== id && c.to.module !== id),
    names: Object.fromEntries(
      Object.entries(patch.names).filter(([key]) => !key.startsWith(`${id}:`)),
    ),
    rows: rackRows(patch),
  })
}

/** Routing activity is independent of whether omitted controls own any source bytes. */
export function routedModules(patch: Patch): Set<string> {
  const routed = new Set<string>()
  function visit(id: string) {
    if (routed.has(id)) return
    routed.add(id)
    for (const cable of patch.cables) if (cable.to.module === id) visit(cable.from.module)
  }
  for (const module of patch.modules) if (module.type === 'out') visit(module.id)
  return routed
}

export function rackRows(patch: Patch): number {
  return Math.max(
    patch.rows ?? 1,
    ...patch.modules.filter((m) => m.type !== 'out').map((m) => m.row + 1),
  )
}

/** Opens an empty rail directly below `above`; lower rails keep their modules, HP and wiring. */
export function insertRow(patch: Patch, above: number): Patch {
  const rows = rackRows(patch)
  if (!Number.isInteger(above) || above < 0 || above >= rows)
    throw new Error('Cannot insert a row here')
  return validateRack({
    ...patch,
    modules: patch.modules.map((m) =>
      m.type !== 'out' && m.row > above ? { ...m, row: m.row + 1 } : m,
    ),
    rows: rows + 1,
  })
}

/** Removing an empty rail closes its gap; module HP positions and wiring stay intact. */
export function removeRow(patch: Patch, row: number): Patch {
  const rows = rackRows(patch)
  if (!Number.isInteger(row) || row < 0 || row >= rows || rows === 1)
    throw new Error('Cannot remove this row')
  if (patch.modules.some((m) => m.type !== 'out' && m.row === row))
    throw new Error('Only empty rows can be removed')
  return validateRack({
    ...patch,
    modules: patch.modules.map((m) =>
      m.type !== 'out' && m.row > row ? { ...m, row: m.row - 1 } : m,
    ),
    rows: rows - 1,
  })
}

export function setValue(
  patch: Patch,
  module: string,
  control: string,
  value: ControlValue,
): Patch {
  if (!patch.modules.some((m) => m.id === module)) throw new Error('Unknown module')
  const next = validateRack({
    ...patch,
    modules: patch.modules.map((m) => {
      if (m.id !== module) return m
      const next = { ...m, values: { ...m.values, [control]: value } }
      if (next.fx !== undefined && effectRank(next) === undefined) {
        const { fx: _fx, ...outer } = next
        return outer
      }
      return next
    }),
  })
  const changed = next.modules.find((m) => m.id === module)
  if (changed?.type === 'seq' && control === 'len' && typeof value === 'number') {
    const steps =
      changed.values.steps ?? getModuleSpec('seq').controls.find((c) => c.id === 'steps')?.default
    if (steps !== undefined && isSteps(steps) && typeof steps !== 'string' && value > steps.length)
      return setValue(
        next,
        module,
        'steps',
        Array.from({ length: value }, (_, i) => steps[i] ?? '~'),
      )
  }
  return next
}

export function sequenceText(module: PlacedModule, steps: readonly string[]): string {
  if (module.type === 'gates') return steps.join(' ')
  if (module.type === 'switch') return `<${steps.join(' ')}>`
  if (getModuleSpec(module.type).modSource === 'sequence') return `<${steps.join(' ')}>`
  const length =
    module.values.len ?? getModuleSpec('seq').controls.find((c) => c.id === 'len')?.default
  if (typeof length !== 'number') throw new Error('Missing SEQ length')
  return steps.slice(0, length).join(' ')
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
    if (m && ['lfo', 'env'].includes(m.type)) return id
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

export function cableSignal(
  patch: Patch,
  from: JackRef,
  members?: ReadonlyMap<string, string>,
): JackSignal {
  const nodes = graph(patch)
  const loops = members ?? functionMembers(nodes)
  const node = nodes.get(from.module)
  if (!node) return 'any'
  const jack = node.spec.jacks.find((j) => j.id === from.jack)
  if (jack?.direction === 'in') {
    if (node.spec.composition?.inputs.includes(from.jack) && !isStack(node.module)) return 'audio'
    const cable = patch.cables.find((c) => c.to.module === from.module && c.to.jack === from.jack)
    return cable ? cableSignal(patch, cable.from, loops) : jack.signal
  }
  return outputSignal(nodes, node, from.jack, new Map(loops))
}

export function cableKind(
  patch: Patch,
  cable: Cable,
  members?: ReadonlyMap<string, string>,
): JackSignal | 'audio-mod' {
  const target = patch.modules.find((m) => m.id === cable.to.module)
  const cv =
    target && getModuleSpec(target.type).jacks.find((j) => j.id === cable.to.jack)?.cvTarget
  const signal = cableSignal(patch, cable.from, members)
  return signal === 'audio' && cv ? 'audio-mod' : signal
}

function pathContains(
  patch: Patch,
  id: string,
  type: string,
  direction: 'upstream' | 'downstream',
  seen = new Set<string>(),
): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  if (patch.modules.find((m) => m.id === id)?.type === type) return true
  return patch.cables.some((c) =>
    direction === 'upstream'
      ? c.to.module === id &&
        c.to.jack !== 'cv' &&
        pathContains(patch, c.from.module, type, direction, seen)
      : c.from.module === id && pathContains(patch, c.to.module, type, direction, seen),
  )
}

export function cableWarnings(patch: Patch, cable: Cable): string[] {
  const warnings: string[] = []
  if (pathContains(patch, cable.from.module, 'speak', 'upstream'))
    warnings.push(
      'Speech bypasses effects, MIX level and OUT volume. This cable carries speech events, not WebAudio.',
    )
  if (
    cableKind(patch, cable) === 'audio' &&
    patch.cables.filter(
      (c) =>
        c.from.module === cable.from.module &&
        c.from.jack === cable.from.jack &&
        cableKind(patch, c) === 'audio',
    ).length > 1
  )
    warnings.push('Audio split plays each connected branch; levels add.')
  return warnings
}

/** Informational audible chains; sends and imported fixed-order setters stay explicit. */
export function effectNotes(patch: Patch): string[] {
  const { paths, inline } = planEffects(graph(patch))
  return [
    ...new Set(
      paths
        .filter((path) => path.length > 0)
        .map((path) => {
          const stages = path.filter((n) => inline.has(n.module.id) || n.module.fx === true)
          const native = path.filter((n) => !stages.includes(n))
          const label = (node: (typeof path)[number]) => `${node.spec.name} (${node.module.id})`
          const groups = new Map<number, typeof native>()
          for (const node of native) {
            for (const rank of activeEffectRanks(node))
              groups.set(rank, [...(groups.get(rank) ?? []), node])
          }
          const nativeLabels = [...groups.entries()]
            .sort(([a], [b]) => a - b)
            .map(([rank, group]) => {
              const first = group[0]
              if (!first) return ''
              if (group.length === 1)
                return activeEffectRanks(first).length > 1
                  ? `${label(first)} [${Object.entries(VOICE_EFFECT_ORDER).find(([, value]) => value === rank)?.[0]}]`
                  : label(first)
              return `${[...new Set(group.map((n) => n.spec.name))].join('/')} (${group.map((n) => n.module.id).join(', ')}) — later native setters override matching controls`
            })
          return `You hear: ${[...stages.map(label), ...nativeLabels].join(' → ')}. ${stages.length ? 'FX stages run in cable order; inline DELAY/REVERB keep their tails per note.' : 'Native effects use the fixed voice chain; DELAY/REVERB are orbit sends.'}`
        }),
    ),
  ]
}

export type ConnectionAssessment =
  | { kind: 'blocked'; message: string }
  | {
      kind: 'valid' | 'warning' | 'unresolved'
      signal: JackSignal | 'audio-mod'
      message: string
      replaces?: JackRef
    }

/** Preview the whole proposed graph without touching committed state. */
export function assessConnection(
  patch: Patch,
  from: JackRef,
  to: JackRef,
  moving?: string,
): ConnectionAssessment {
  try {
    const next = connect(patch, from, to, true, moving)
    const cable = next.cables.at(-1)
    if (!cable) throw new Error('Missing proposed cable')
    const signal = cableKind(next, cable)
    const opaque =
      pathContains(next, from.module, 'code', 'upstream') ||
      pathContains(next, to.module, 'code', 'downstream')
    const warnings = [
      ...new Set([
        ...cableWarnings(next, cable),
        ...next.cables.flatMap((c) =>
          cableWarnings(next, c).filter((warning) => !cableWarnings(patch, c).includes(warning)),
        ),
      ]),
    ]
    const occupied = patch.cables.some(
      (c) => c.to.module === to.module && c.to.jack === to.jack && c.id !== moving,
    )
    return {
      kind: signal === 'any' || opaque ? 'unresolved' : warnings.length ? 'warning' : 'valid',
      signal,
      ...(occupied ? { replaces: to } : {}),
      message: [
        `${from.module}:${from.jack} → ${to.module}:${to.jack} · ${signal === 'any' ? 'signal unresolved until its source is connected' : signal}`,
        ...warnings,
        ...(opaque ? ['CODE semantics are unverified; inspect the source.'] : []),
        ...(occupied ? [`Replaces the cable into ${to.module} ${to.jack}`] : []),
      ].join(' · '),
    }
  } catch (error) {
    return { kind: 'blocked', message: error instanceof Error ? error.message : String(error) }
  }
}

export function depthControl(
  patch: Patch,
  module: PlacedModule,
  control: KnobControl,
): KnobControl & { perTarget?: boolean } {
  if (!['lfo', 'env'].includes(module.type) || control.id !== 'depth') return control
  const nodes = graph(patch)
  const targets: KnobControl[] = []
  const visited = new Set<string>()
  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
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

/** Keyboard movement follows the drag taper, with at least one allowed catalog step. */
export function keyboardValue(
  control: KnobControl,
  value: number,
  key: string,
  fine = false,
): number | null {
  if (key === 'Home') return control.min
  if (key === 'End') return control.max
  if (key === 'Backspace') return control.default
  const direction =
    key === 'ArrowUp' || key === 'ArrowRight'
      ? 1
      : key === 'ArrowDown' || key === 'ArrowLeft'
        ? -1
        : 0
  if (!direction) return null
  if (control.detents) {
    const ordered = [...control.detents].sort((a, b) => direction * (a - b))
    return ordered.find((n) => direction * (n - value) > 0) ?? value
  }
  const movement = draggedValue(
    control,
    normalized(control, value) + direction / (fine ? 1000 : 100),
  )
  return direction * (movement - value) > 0
    ? movement
    : snap(control, value + direction * control.step)
}

export function setLook(patch: Patch, id: string, look: LookId, family = false): Patch {
  const module = patch.modules.find((m) => m.id === id)
  if (!module) throw new Error('Unknown module')
  const group = getModuleSpec(module.type).family
  if (!looksFor(group).includes(look)) throw new Error('Look belongs to another family')
  return validateRack({
    ...patch,
    modules: patch.modules.map((m) =>
      m.id === id || (family && getModuleSpec(m.type).family === group) ? { ...m, look } : m,
    ),
  })
}

export function duplicateModule(patch: Patch, id: string): Patch {
  const module = patch.modules.find((m) => m.id === id)
  if (!module) throw new Error('Unknown module')
  if (getModuleSpec(module.type).unique) throw new Error('This module is unique')
  let row = module.row
  while (freePosition(patch, module.type, row, module.hp) === null) row++
  const placed = placeModule(patch, module.type, row, module.hp)
  const copy = placed.modules.at(-1)
  if (!copy) throw new Error('Could not duplicate module')
  return validateRack({
    ...placed,
    modules: placed.modules.map((m) =>
      m.id === copy.id ? { ...m, look: module.look, values: structuredClone(module.values) } : m,
    ),
  })
}

export function renameOutput(patch: Patch, key: string, name: string): Patch {
  return validateRack({ ...patch, names: { ...patch.names, [key]: name } })
}

export function setRailWidth(patch: Patch, railHp: RailHp): Patch {
  return validateRack({ ...patch, railHp })
}
