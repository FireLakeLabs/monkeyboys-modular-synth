import { effectRank } from '../modules/effects'
import { isLoopChain, loopMethod } from '../modules/functions'
import { parse } from 'acorn'
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
    case 'drawbars':
      return (
        Array.isArray(candidate) &&
        candidate.length > 0 &&
        candidate.length <= item.maxBars &&
        candidate.every(
          (n: unknown) =>
            typeof n === 'number' && Number.isFinite(n) && n >= item.min && n <= item.max,
        )
      )
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
      return (
        typeof candidate === 'string' &&
        (!node.spec.sampleTarget?.prefix ||
          item.id !== node.spec.sampleTarget.control ||
          candidate === '' ||
          (candidate.startsWith(node.spec.sampleTarget.prefix) &&
            /^[\w-]+(?::\d+)?$/.test(candidate)))
      )
    case 'steps':
      return (
        isSteps(candidate) &&
        ((node.spec.modSource !== 'sequence' && node.spec.id !== 'switch') ||
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
    if (
      module.fx !== undefined &&
      ((module.fx !== true && module.fx !== 'native') || effectRank(module) === undefined)
    )
      throw new Error('Invalid FX stage')
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
    if (module.functionParameter !== undefined) {
      if (!spec.functionLoop || !/^[A-Za-z_$][\w$]*$/.test(module.functionParameter))
        throw new Error('Invalid function parameter')
      parse(`(${module.functionParameter} => ${module.functionParameter})`, {
        ecmaVersion: 'latest',
      })
    }
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
    if (
      from.spec.operatorTarget &&
      (to.spec.id !== from.spec.operatorTarget.type || input.id !== from.spec.operatorTarget.jack)
    )
      throw new Error('FM OP connects to OSC FM')
    if (to.spec.id === 'osc' && input.id === 'fm' && from.spec.id !== 'fmop')
      throw new Error('OSC FM requires FM OP')
    to.inputs.set(input.id, cable)
    from.outputs.set(output.id, [...(from.outputs.get(output.id) ?? []), cable])
  }
  for (const node of nodes.values()) {
    const gate = node.inputs.get('gate')
    if (node.spec.id === 'seq' && gate && requireNode(nodes, gate.from.module).spec.id !== 'gates')
      throw new Error('SEQ GATE requires GATES')
    if (
      node.spec.id === 'gates' &&
      [...node.outputs.values()]
        .flat()
        .some((c) => requireNode(nodes, c.to.module).spec.id !== 'seq' || c.to.jack !== 'gate')
    )
      throw new Error('GATES connects to SEQ GATE')
  }
  const loops = functionMembers(nodes)
  for (const key of Object.keys(patch.names)) {
    const [id, jack] = key.split(':')
    if (jack === 'send' || (id && loops.has(id)))
      throw new Error('Function outputs are local to their loop and cannot be named')
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(node: Node): void {
    if (visiting.has(node.module.id)) throw new Error('Patch cycles are not supported')
    if (visited.has(node.module.id)) return
    visiting.add(node.module.id)
    for (const cable of node.inputs.values()) {
      if (cable.from.jack !== 'send') visit(requireNode(nodes, cable.from.module))
    }
    visiting.delete(node.module.id)
    visited.add(node.module.id)
  }
  for (const node of nodes.values()) visit(node)
  const signal = (node: Node, jack = 'out') => outputSignal(nodes, node, jack, loops)
  for (const node of nodes.values()) {
    for (const [id, cable] of node.inputs) {
      const input = node.spec.jacks.find((jack) => jack.id === id)
      const actual = signal(requireNode(nodes, cable.from.module), cable.from.jack)
      if (actual === 'function' && id === 'in' && loops.has(node.module.id)) continue
      if (actual === 'audio' && input?.cvTarget) continue
      if (actual !== 'any' && input?.signal !== 'any' && input?.signal !== actual)
        throw new Error(`Incompatible cable signal: ${cable.id}`)
    }
  }
  return nodes
}

/** Incomplete SEND chains are saved but do not replace the preset until RETURN is connected. */
export function functionMembers(nodes: Map<string, Node>): Map<string, string> {
  const members = new Map<string, string>()
  for (const owner of nodes.values()) {
    if (!owner.spec.functionLoop) continue
    const sends = owner.outputs.get('send') ?? []
    if (sends.length > 1) throw new Error('Function loops require a single chain')
    if (sends.length && !loopMethod(owner.spec, owner.module))
      throw new Error('Select the function mode before connecting SEND')
    let cable = sends[0]
    const seen = new Set<string>([owner.module.id])
    while (cable) {
      const node = requireNode(nodes, cable.to.module)
      if (cable.to.jack === 'return') {
        if (node !== owner) throw new Error('Function RETURN must close its own SEND')
        break
      }
      if (cable.to.jack !== 'in' || !isLoopChain(node.spec))
        throw new Error('Function loops accept chain modules, excluding sources, MIX and OUT')
      if (seen.has(node.module.id)) throw new Error('Function loop cycle')
      if (members.has(node.module.id) && members.get(node.module.id) !== owner.module.id)
        throw new Error('A module cannot belong to two function loops')
      seen.add(node.module.id)
      members.set(node.module.id, owner.module.id)
      const next = node.outputs.get('out') ?? []
      if (next.length > 1) throw new Error('Function loops require a single chain')
      cable = next[0]
    }
  }
  for (const owner of nodes.values()) {
    let cable = owner.inputs.get('return')
    if (cable && !loopMethod(owner.spec, owner.module))
      throw new Error('Select the function mode before connecting RETURN')
    const seen = new Set<string>()
    while (cable) {
      if (cable.from.jack === 'send') {
        if (cable.from.module !== owner.module.id)
          throw new Error('Function RETURN must close its own SEND')
        break
      }
      const node = requireNode(nodes, cable.from.module)
      if (cable.from.jack !== 'out' || !isLoopChain(node.spec))
        throw new Error('Function loops accept chain modules, excluding sources, MIX and OUT')
      if (seen.has(node.module.id) || node === owner) throw new Error('Function loop cycle')
      seen.add(node.module.id)
      if (members.has(node.module.id) && members.get(node.module.id) !== owner.module.id)
        throw new Error('Function RETURN must close its own SEND')
      members.set(node.module.id, owner.module.id)
      if ((node.outputs.get('out')?.length ?? 0) > 1)
        throw new Error('Function loops require a single chain')
      cable = node.inputs.get('in')
    }
  }
  // Nesting is ownership, not signal feedback. Reject recursive containment.
  for (const id of members.keys()) {
    const seen = new Set<string>([id])
    let parent = members.get(id)
    while (parent) {
      if (seen.has(parent)) throw new Error('Function loop nesting cycle')
      seen.add(parent)
      parent = members.get(parent)
    }
  }
  return members
}

export function requireNode(nodes: Map<string, Node>, id: string): Node {
  const node = nodes.get(id)
  if (!node) throw new Error(`Unknown module: ${id}`)
  return node
}

/** Effective output signal, including passthrough chains and function-loop membership. */
export function outputSignal(
  nodes: Map<string, Node>,
  node: Node,
  jack = 'out',
  loops = functionMembers(nodes),
): JackSignal {
  if (jack === 'send' || loops.has(node.module.id)) return 'function'
  const output =
    node.spec.jacks.find((j) => j.id === jack && j.direction === 'out') ??
    node.spec.jacks.find((j) => j.direction === 'out')
  if (output?.signal !== 'any') return output?.signal ?? 'any'
  const input = node.inputs.get('in')
  return input
    ? outputSignal(nodes, requireNode(nodes, input.from.module), input.from.jack, loops)
    : 'any'
}
