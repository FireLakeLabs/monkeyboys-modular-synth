/** How many strings draw today vs under the proposed set, and how many text cells each needs. */
import { writeFileSync } from 'node:fs'
import { buildTree, walkCells, type Cell } from './tree.mts'
import { idioms, repoCorpus, upstreamCorpus } from './corpus.mts'
const atom = /^(?![_.]+$)(?:[\w#.:+-]+|~)$/
function flatToday(text: string): boolean { // mirrors src/patch/notation.ts stepView
  const tokens = text.trim().match(/<[^<>]*>|[^\s]+/g) ?? []
  if (!tokens.length || tokens.length > 16) return false
  if (tokens.join(' ').replace(/\s+/g, ' ') !== text.trim().replace(/\s+/g, ' ')) return false
  return tokens.every((t) => atom.test(t) || (t.startsWith('<') && t.endsWith('>') && t.slice(1, -1).trim().split(/\s+/).every((p) => atom.test(p))))
}
const drawnMod = new Set(['weight', 'elongate', 'replicate', 'fast', 'slow', 'degrade', 'euclid', 'index'])
function textCell(c: Cell): string | null {
  if (c.shape === 'poly') return '{ }'
  for (const m of c.mods) {
    if (!drawnMod.has(m.kind)) return m.raw.slice(0, 2)
    if (m.patterned && m.kind !== 'index') return 'patterned arg'
  }
  return null
}
function study(list: string[]) {
  let today = 0, full = 0, partial = 0, whole = 0
  const reasons = new Map<string, number>()
  for (const s of list) {
    if (flatToday(s)) today++
    const tree = buildTree(s)
    let cells = 0, text = 0
    const blocked = new Set<Cell>()
    walkCells(tree, (c, _d, parents) => {
      if (parents.some((p) => blocked.has(p))) return
      cells++
      const why = textCell(c)
      if (why) { text++; blocked.add(c); reasons.set(why, (reasons.get(why) ?? 0) + 1) }
    })
    if (tree.marker) reasons.set('^ marker', (reasons.get('^ marker') ?? 0) + 1)
    if (!text && !tree.marker) full++
    else if (text < cells) partial++
    else whole++
  }
  return { strings: list.length, today, full, partial, whole, reasons: Object.fromEntries(reasons) }
}
const repo = repoCorpus().filter((s) => !/^[A-Za-z]+:[a-z]+$/.test(s) && !/^[a-z]+$/.test(s))
const out = { repo: study(repo), idioms: study(idioms), upstream: study(upstreamCorpus()) }
writeFileSync('spike/out-coverage.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
