import { controlValue } from '../modules/values'
import { numericNotation } from '../patch/notation'
import { isRailHp } from '../patch/layout'
import { getModuleSpec } from '../modules/catalog'
import { callMethod, tupleControls } from '../modules/bindings'
import { looksFor } from '../modules/looks'
import type { Control, GridRow, JackSignal, ModuleSpec } from '../modules/types'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'

export interface Node {
  module: PlacedModule
  spec: ModuleSpec
  inputs: Map<string, Cable>
  outputs: Map<string, Cable[]>
}

export function control(node: Node, id: string): Control {
  const found = node.spec.controls.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown control: ${node.module.id}.${id}`)
  return found
}

export function value(node: Node, id: string): ControlValue {
  return controlValue(node.module, control(node, id))
}

export function number(node: Node, id: string): number {
  const result = value(node, id)
  if (typeof result !== 'number') throw new Error(`Expected number: ${node.module.id}.${id}`)
  return result
}

export function string(node: Node, id: string): string {
  const result = value(node, id)
  if (typeof result !== 'string') throw new Error(`Expected text: ${node.module.id}.${id}`)
  return result
}

export function isSteps(candidate: ControlValue): candidate is string | readonly string[] {
  return (
    typeof candidate === 'string' ||
    (Array.isArray(candidate) && candidate.every((step: unknown) => typeof step === 'string'))
  )
}

export function isGrid(candidate: ControlValue): candidate is string | readonly GridRow[] {
  return (
    typeof candidate === 'string' ||
    (Array.isArray(candidate) &&
      candidate.every(
        (row: unknown) =>
          typeof row === 'object' &&
          row !== null &&
          'sample' in row &&
          typeof row.sample === 'string' &&
          'steps' in row &&
          Array.isArray(row.steps) &&
          row.steps.every((step: unknown) => step === 0 || step === 1),
      ))
  )
}

function validValue(item: Control, candidate: ControlValue, node: Node): boolean {
  switch (item.kind) {
    case 'knob':
      // LFO depth is expressed in the target knob's units, not its fallback range.
      return (
        typeof candidate === 'number' &&
        Number.isFinite(candidate) &&
        (item.step !== 1 || Number.isInteger(candidate)) &&
        ((['lfo', 'env'].includes(node.spec.id) && item.id === 'depth') ||
          (candidate >= item.min && candidate <= item.max))
      )
    case 'switch':
      return item.options.some((option) => option.value === candidate)
    case 'text':
      return typeof candidate === 'string'
    case 'steps':
      return (
        isSteps(candidate) &&
        (node.spec.modSource !== 'sequence' ||
          numericNotation(typeof candidate === 'string' ? candidate : candidate.join(' '))) &&
        (typeof candidate === 'string' ||
          (candidate.length > 0 && candidate.length <= item.maxSteps))
      )
    case 'grid':
      return (
        isGrid(candidate) &&
        (typeof candidate === 'string' ||
          candidate.every((row) => item.stepCounts.includes(row.steps.length)))
      )
  }
}

/** Validate the graph before traversing it; disconnected incomplete chains are legal. */
export function graph(patch: Patch): Map<string, Node> {
  if (patch.version !== 1) throw new Error('Unsupported patch version')
  if (patch.name !== undefined && typeof patch.name !== 'string')
    throw new Error('Invalid patch name')
  if (patch.railHp !== undefined && !isRailHp(patch.railHp)) throw new Error('Invalid rail width')
  const rows = patch.rows
  if (
    rows !== undefined &&
    (!Number.isSafeInteger(rows) ||
      rows < 1 ||
      patch.modules.some((m) => m.type !== 'out' && m.row >= rows))
  )
    throw new Error('Invalid rack row count')
  const nodes = new Map<string, Node>()
  const unique = new Set<string>()
  for (const module of patch.modules) {
    if (!module.id || nodes.has(module.id))
      throw new Error(`Duplicate/empty module ID: ${module.id}`)
    const spec = getModuleSpec(module.type)
    if (spec.unique && unique.has(spec.id)) throw new Error(`Duplicate unique module: ${spec.id}`)
    unique.add(spec.id)
    if (
      !Number.isInteger(module.row) ||
      module.row < 0 ||
      !Number.isInteger(module.hp) ||
      module.hp < 0 ||
      !looksFor(spec.family).includes(module.look)
    )
      throw new Error(`Invalid layout: ${module.id}`)
    const node: Node = { module, spec, inputs: new Map(), outputs: new Map() }
    for (const [id, candidate] of Object.entries(module.values)) {
      if (!validValue(control(node, id), candidate, node))
        throw new Error(`Invalid control value: ${module.id}.${id}`)
    }
    for (const item of spec.controls) {
      if (!('call' in item) || item.call?.argument.kind !== 'tuple') continue
      const span = item.call.argument.ascending
      const active = tupleControls(
        item.call,
        callMethod(item.call, (id) => string(node, id)),
      )
      if (
        span &&
        span.every((id) => active.includes(id)) &&
        number(node, span[0]) >= number(node, span[1])
      )
        throw new Error(`${module.id}: ${span[0]} must be less than ${span[1]}`)
      const bounded = item.call.argument.atMost
      if (
        bounded &&
        bounded.every((id) => active.includes(id)) &&
        number(node, bounded[0]) > number(node, bounded[1])
      )
        throw new Error(`${module.id}: ${bounded[0]} must be at most ${bounded[1]}`)
    }
    if (spec.id === 'mix') {
      for (const channel of [1, 2, 3, 4]) {
        const name = string(node, `name${channel}`)
        if (
          name &&
          (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name.startsWith('S') || name.endsWith('_'))
        )
          throw new Error(
            'Channel names must be identifiers without leading S or trailing underscore',
          )
        const pair = string(node, `channels${channel}`)
        if (
          !/^[1-9]\d*:[1-9]\d*$/.test(pair) ||
          pair.split(':').some((part) => !Number.isSafeInteger(Number(part)))
        )
          throw new Error('Output requires a positive channel pair, such as 1:2')
      }
    }
    nodes.set(module.id, node)
  }
  const ids = new Set<string>()
  for (const cable of patch.cables) {
    if (!cable.id || ids.has(cable.id)) throw new Error(`Duplicate/empty cable ID: ${cable.id}`)
    ids.add(cable.id)
    const from = nodes.get(cable.from.module)
    const to = nodes.get(cable.to.module)
    const output = from?.spec.jacks.find((jack) => jack.id === cable.from.jack)
    const input = to?.spec.jacks.find((jack) => jack.id === cable.to.jack)
    if (!from || !to || output?.direction !== 'out' || input?.direction !== 'in')
      throw new Error(`Invalid cable endpoints: ${cable.id}`)
    if (to.inputs.has(input.id)) throw new Error(`Occupied input: ${to.module.id}:${input.id}`)
    if (
      from.spec.id === 'lfo' &&
      value(from, 'mode') === 'SMOOTH' &&
      !input.cvTarget &&
      to.spec.modSource !== 'sampleHold'
    )
      throw new Error('SMOOTH LFO connects to CV or S&H; use STEP for pattern utilities')
    if (from.spec.id === 'env' && !input.cvTarget)
      throw new Error('ENV connects directly to a CV target; utilities transform pattern signals')
    to.inputs.set(input.id, cable)
    from.outputs.set(output.id, [...(from.outputs.get(output.id) ?? []), cable])
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(node: Node): void {
    if (visiting.has(node.module.id)) throw new Error('Patch cycles are not supported')
    if (visited.has(node.module.id)) return
    visiting.add(node.module.id)
    for (const cable of node.inputs.values()) visit(requireNode(nodes, cable.from.module))
    visiting.delete(node.module.id)
    visited.add(node.module.id)
  }
  for (const node of nodes.values()) visit(node)
  function signal(node: Node): JackSignal {
    const output = node.spec.jacks.find((jack) => jack.direction === 'out')
    if (output?.signal !== 'any') return output?.signal ?? 'any'
    const input = node.inputs.get('in')
    return input ? signal(requireNode(nodes, input.from.module)) : 'any'
  }
  for (const node of nodes.values()) {
    for (const [id, cable] of node.inputs) {
      const input = node.spec.jacks.find((jack) => jack.id === id)
      const actual = signal(requireNode(nodes, cable.from.module))
      if (actual !== 'any' && input?.signal !== 'any' && input?.signal !== actual)
        throw new Error(`Incompatible cable signal: ${cable.id}`)
    }
  }
  return nodes
}

export function requireNode(nodes: Map<string, Node>, id: string): Node {
  const node = nodes.get(id)
  if (!node) throw new Error(`Unknown module: ${id}`)
  return node
}
