import { effectRanks } from '../modules/effects'
import { outputSignal, requireNode, type Node } from './graph'

export function activeEffectRanks(node: Node) {
  return effectRanks(node.module, {
    patched: new Set(
      node.spec.jacks
        .filter((j) => j.cvTarget && node.inputs.has(j.id))
        .flatMap((j) => j.cvTarget ?? []),
    ),
  })
}

export function activeEffectRank(node: Node) {
  return activeEffectRanks(node)[0]
}

/** Final paths include shared declarations and nested mixer leaves. */
export function planEffects(nodes: Map<string, Node>) {
  // A shared stage must use the same representation in every branch. Propagate
  // inline membership across overlapping paths before writing named declarations.
  const paths: Node[][] = []
  const loops = new Set<string>()
  function stagePaths(node: Node, tail: Node[] = []) {
    const path = activeEffectRank(node) === undefined ? tail : [node, ...tail]
    const returned = node.inputs.get('return')
    if (returned && returned.from.jack !== 'send' && !loops.has(node.module.id)) {
      loops.add(node.module.id)
      let upstream: typeof returned | undefined = returned
      while (upstream && upstream.from.jack !== 'send')
        upstream = requireNode(nodes, upstream.from.module).inputs.get('in')
      if (upstream?.from.module === node.module.id)
        stagePaths(requireNode(nodes, returned.from.module))
    }
    // Bus senders and sidechain/CV sources are independent voice paths. Return
    // processing never moves into a sender's chain across that boundary.
    for (const [id, cable] of node.inputs) {
      const source = requireNode(nodes, cable.from.module)
      if (
        id === 'side' ||
        (node.spec.jacks.find((j) => j.id === id)?.cvTarget &&
          outputSignal(nodes, source, cable.from.jack) === 'audio')
      )
        stagePaths(source)
    }
    const inputs = [...node.inputs].filter(
      ([id, cable]) =>
        id !== 'return' &&
        id !== 'side' &&
        cable.from.jack !== 'send' &&
        !node.spec.jacks.find((j) => j.id === id)?.cvTarget,
    )
    if (!inputs.length || node.spec.id === 'aux') paths.push(path)
    for (const [, cable] of inputs)
      stagePaths(requireNode(nodes, cable.from.module), node.spec.id === 'aux' ? [] : path)
  }
  for (const node of nodes.values()) if (node.spec.id === 'out') stagePaths(node)
  const inline = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const original of paths) {
      const path = original.filter((n) => n.module.fx !== 'native')
      const ranks = path.map(activeEffectRanks)
      const ordered =
        path.some((n) => n.module.fx === true || inline.has(n.module.id)) ||
        ranks.some((rank, i) => i > 0 && Math.min(...rank) <= Math.max(...(ranks[i - 1] ?? [])))
      if (ordered)
        for (const node of path)
          if (!inline.has(node.module.id)) {
            inline.add(node.module.id)
            changed = true
          }
    }
  }
  return { inline, paths }
}
