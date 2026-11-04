// run: npx vitest run --config spike/vitest.config.ts
import '@strudel/core/euclid.mjs'
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { mini, m, miniAllStrings } from '@strudel/mini/mini.mjs'
import { buildTree, walkCells, type Span } from './tree.mts'
import { idioms, repoCorpus, upstreamCorpus } from './corpus.mts'
miniAllStrings()

const leaves = (text: string) => {
  const out: Span[] = []
  walkCells(buildTree(text), (c) => { if (c.shape === 'atom') out.push(c.body) })
  return out
}
const key = (s: Span) => `${s.start}:${s.end}`
function audit(text: string) {
  const bodies = new Set(leaves(text).map(key))
  const args = new Set<string>()
  const atoms = /[^\s@!?*/:(),\[\]<>{}|%]+/g
  walkCells(buildTree(text), (c) => c.mods.forEach((m) => {
    for (const hit of m.raw.matchAll(atoms)) args.add(key({ start: m.span.start + hit.index, end: m.span.start + hit.index + hit[0].length }))
  }))
  const haps = mini(text).queryArc(0, 8).filter((h: any) => h.hasOnset())
  let none = 0, exact = 0, multi = 0, off = 0, rawTrimmed = 0
  const offExamples: string[] = []
  for (const h of haps) {
    const locs: { start: number; end: number }[] = h.context.locations ?? []
    if (!locs.length) { none++; continue }
    if (locs.length > 1) multi++
    // `mini` quotes the text, so upstream offsets are one past the literal's first byte.
    const mapped = locs.map((l) => {
      const raw = { start: l.start - 1, end: l.end - 1 }
      // Upstream's whitespace correction counts only spaces, so trim newline and tab here.
      const end = raw.start + text.slice(raw.start, raw.end).trimEnd().length
      if (end !== raw.end) rawTrimmed++
      return { start: raw.start, end }
    })
    // Modifier arguments such as the 4 in bd*4 also report; exactly one location is the leaf.
    const hits = new Set(mapped.filter((l) => bodies.has(key(l))).map(key))
    if (hits.size === 1 && mapped.every((l) => bodies.has(key(l)) || args.has(key(l)))) exact++
    else { off++; offExamples.push(JSON.stringify(mapped.map((l) => text.slice(l.start, l.end)))) }
  }
  return { text, events: haps.length, none, exact, multi, off, rawTrimmed, offExamples: [...new Set(offExamples)].slice(0, 3) }
}
it('audits every corpus', () => {
  const all = [...new Set([...repoCorpus(), ...upstreamCorpus(), ...idioms])]
  const rows = all.flatMap((s) => { try { return [audit(s)] } catch (e) { return [{ text: s, error: (e as Error).message.slice(0, 80) }] } })
  const whitespace = ['c2\n  e2', 'c2\te2', 'c2  e2', '  c2\n\n\te2 ', 'c2\n[e2\n g2]', 'ça ñ2'].map(audit)
  // One leaf, several sounding positions.
  const repeats = ['a!3 b', 'a*3 b', 'a(3,8) b', '[a b]*2', '<a b>!2'].map((text) => {
    const hs = mini(text).queryArc(0, 1).filter((h: any) => h.hasOnset())
    return { text, events: hs.map((h: any) => ({ at: h.whole.begin.toFraction(), leaf: text.slice(h.context.locations[0].start - 1, h.context.locations[0].end - 1) })) }
  })
  // Reversal moves the event; the location still names the source cell.
  const rev = mini('a [b c] d').rev().queryArc(0, 1).filter((h: any) => h.hasOnset()).map((h: any) => ({ at: h.whole.begin.toFraction(), value: h.value, leaf: 'a [b c] d'.slice(h.context.locations[0].start - 1, h.context.locations[0].end - 1) }))
  // Two literals in one voice: GATES-style struct and CV SEQ-style patterned arguments.
  const offsetsOf = (p: any) => p.queryArc(0, 1).filter((h: any) => h.hasOnset()).map((h: any) => ({ value: h.value, locations: h.context.locations }))
  const struct = offsetsOf(m('c2 eb2 g2', 100).struct(m('x ~ x x', 200)))
  const patternedArg = offsetsOf(m('c2 e2', 100).fast(m('<1 2>', 200)))
  const tail = offsetsOf(mini('bd:3'))
  const euclidArg = offsetsOf(mini('bd(<3 5>,8)'))
  writeFileSync('spike/out-events.json', JSON.stringify({ rows, whitespace, repeats, rev, struct, patternedArg, tail, euclidArg }, null, 1))
}, 60000)
