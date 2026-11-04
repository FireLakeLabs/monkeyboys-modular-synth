import { parse, tokenizer } from 'acorn'
import type { Patch } from '../patch/types'
import { outputSignal, requireNode, type Node } from './graph'

/** Rack routing is active only when its destination reaches OUT. */
export function routingPlan(nodes: Map<string, Node>, patch: Patch) {
  const active = new Set<string>()
  function visit(node: Node) {
    if (active.has(node.module.id)) return
    active.add(node.module.id)
    for (const cable of node.inputs.values())
      if (cable.from.jack !== 'send') visit(requireNode(nodes, cable.from.module))
  }
  for (const node of nodes.values()) if (node.spec.id === 'out') visit(node)
  // Reserve literal source-owned bus addresses, including return/modulator references.
  const reserved = new Set<number>()
  function scan(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (
      'type' in value &&
      value.type === 'CallExpression' &&
      'callee' in value &&
      'arguments' in value &&
      Array.isArray(value.arguments)
    ) {
      const callee = value.callee
      if (
        callee &&
        typeof callee === 'object' &&
        'property' in callee &&
        callee.property &&
        typeof callee.property === 'object' &&
        ('name' in callee.property || 'value' in callee.property)
      ) {
        const name = 'name' in callee.property ? callee.property.name : callee.property.value
        const arg: unknown = value.arguments[0]
        if (arg && typeof arg === 'object') {
          if (
            ['bus', 'n'].includes(String(name)) &&
            'value' in arg &&
            typeof arg.value === 'number'
          )
            reserved.add(arg.value)
          if (name === 'bmod' && 'properties' in arg && Array.isArray(arg.properties))
            for (const p of arg.properties) {
              if (
                p?.key &&
                ['b', 'bus'].includes(p.key.name ?? p.key.value) &&
                typeof p.value?.value === 'number'
              )
                reserved.add(p.value.value)
            }
        }
      }
    }
    for (const child of Object.values(value)) scan(child)
  }
  for (const module of patch.modules) {
    if (!active.has(module.id) || module.type !== 'code' || typeof module.values.text !== 'string')
      continue
    const text = module.values.text
    scan(
      parse(
        tokenizer(text, { ecmaVersion: 'latest' }).getToken().type.label === '.'
          ? `silence${text}\n`
          : `(${text}\n)`,
        {
          ecmaVersion: 'latest',
        },
      ),
    )
  }
  if (patch.prelude) scan(parse(patch.prelude, { ecmaVersion: 'latest' }))
  const buses = new Map<string, number>()
  let next = 1
  function allocate(key: string) {
    const found = buses.get(key)
    if (found !== undefined) return found
    while (reserved.has(next)) next++
    const bus = next++
    buses.set(key, bus)
    return bus
  }
  const sends: { node: Node; bus: number }[] = []
  const audioCV = new Map<string, number>()
  const ducks: Node[] = []
  for (const id of active) {
    const node = requireNode(nodes, id)
    if (node.spec.id === 'aux') {
      const bus = allocate(`aux:${id}`)
      for (const cable of node.inputs.values())
        sends.push({ node: requireNode(nodes, cable.from.module), bus })
    }
    if (node.spec.id === 'duck' && node.inputs.has('side')) ducks.push(node)
    for (const [jack, cable] of node.inputs) {
      if (!node.spec.jacks.find((j) => j.id === jack)?.cvTarget) continue
      const source = requireNode(nodes, cable.from.module)
      if (outputSignal(nodes, source, cable.from.jack) !== 'audio') continue
      const key = `${cable.from.module}:${cable.from.jack}`
      const existing = buses.has(`audio:${key}`)
      const bus = allocate(`audio:${key}`)
      audioCV.set(`${id}:${jack}`, bus)
      if (!existing) sends.push({ node: source, bus })
    }
  }
  return { buses, sends, audioCV, ducks }
}
