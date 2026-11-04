// run: npx vitest run --config spike/vitest.config.ts
import '@strudel/core/euclid.mjs'
import { mini, miniAllStrings } from '@strudel/mini/mini.mjs'
import { buildTree, type Cell, type Mod, type Tree } from './tree.mts'
import * as E from './edits.mts'
miniAllStrings()
const CYCLES = 8
type Ev = string
function events(text: string): Ev[] {
  return mini(text).queryArc(0, CYCLES)
    .filter((h: any) => h.hasOnset())
    .map((h: any) => `${h.whole.begin.toFraction()}-${h.whole.end.toFraction()}:${JSON.stringify(h.value)}`)
    .sort()
}
// Deliberately awkward imported formatting: double spaces, tabs, newlines.
const MESSY = '  c2   [e2  g2]@2\n\t<a2   b2>!2  [c3,e3]  bd:3*2  c2 _ _  ~ '
interface Case { name: string; before: string; run: (t: string, tree: Tree) => E.Splice; exact: string; same: string }
const mod = (c: Cell, kind: Mod['kind']) => c.mods.find((m) => m.kind === kind)!
const cases: Case[] = [
  { name: 'replace a note', before: 'c2   [e2  g2]  a2', run: (t, r) => E.replaceAtom(E.atom(r, 'g2'), 'b2'), exact: 'c2   [e2  b2]  a2', same: 'c2 [e2 b2] a2' },
  { name: 'split a step', before: 'c2   e2  a2', run: (t, r) => E.split(t, E.atom(r, 'e2')), exact: 'c2   [e2 e2]  a2', same: 'c2 [e2 e2] a2' },
  { name: 'split a nested step', before: 'c2 [e2  g2]', run: (t, r) => E.split(t, E.atom(r, 'g2')), exact: 'c2 [e2  [g2 g2]]', same: 'c2 [e2 [g2 g2]]' },
  { name: 'split keeps modifiers', before: 'c2@3  e2', run: (t, r) => E.split(t, E.atom(r, 'c2')), exact: '[c2 c2]@3  e2', same: '[c2 c2]@3 e2' },
  { name: 'merge a group', before: 'c2  [e2   g2]@2  a2', run: (t, r) => E.merge(t, E.find(r, (c) => c.shape === 'seq')), exact: 'c2  e2@2  a2', same: 'c2 e2@2 a2' },
  { name: 'add *n', before: 'c2   e2', run: (t, r) => E.addMod(E.atom(r, 'e2'), '*2'), exact: 'c2   e2*2', same: 'c2 e2*2' },
  { name: 'add /n', before: 'c2   e2', run: (t, r) => E.addMod(E.atom(r, 'c2'), '/2'), exact: 'c2/2   e2', same: 'c2/2 e2' },
  { name: 'add !n', before: 'c2   e2', run: (t, r) => E.addMod(E.atom(r, 'e2'), '!3'), exact: 'c2   e2!3', same: 'c2 e2 e2 e2' },
  { name: 'add @n', before: 'c2   e2', run: (t, r) => E.addMod(E.atom(r, 'c2'), '@3'), exact: 'c2@3   e2', same: 'c2 _ _ e2' },
  { name: 'add ?', before: 'c2   e2', run: (t, r) => E.addMod(E.atom(r, 'e2'), '?'), exact: 'c2   e2?', same: 'c2 e2?' },
  { name: 'add euclid', before: 'bd   sd', run: (t, r) => E.addMod(E.atom(r, 'bd'), '(3,8)'), exact: 'bd(3,8)   sd', same: 'bd(3,8) sd' },
  { name: 'add sample index', before: 'bd   sd', run: (t, r) => E.addMod(E.atom(r, 'sd'), ':2'), exact: 'bd   sd:2', same: 'bd sd:2' },
  { name: 'change @n', before: 'c2@2  e2', run: (t, r) => E.setMod(mod(E.atom(r, 'c2'), 'weight'), '@4'), exact: 'c2@4  e2', same: 'c2@4 e2' },
  { name: 'change a bare ? to a probability', before: 'c2?  e2', run: (t, r) => E.setMod(mod(E.atom(r, 'c2'), 'degrade'), '?0.2'), exact: 'c2?0.2  e2', same: 'c2?0.2 e2' },
  { name: 'change !n', before: 'c2!3  e2', run: (t, r) => E.setMod(mod(E.atom(r, 'c2'), 'replicate'), '!2'), exact: 'c2!2  e2', same: 'c2 c2 e2' },
  { name: 'remove a modifier', before: 'c2*2?  e2', run: (t, r) => E.removeMod(t, mod(E.atom(r, 'c2'), 'fast')), exact: 'c2?  e2', same: 'c2? e2' },
  { name: 'remove one elongation', before: 'c2 _ _  e2', run: (t, r) => E.removeMod(t, mod(E.atom(r, 'c2'), 'elongate')), exact: 'c2 _  e2', same: 'c2@2 e2' },
  { name: 'add an alternative', before: 'c2   e2', run: (t, r) => E.addAlternative(t, E.atom(r, 'e2'), 'g2'), exact: 'c2   <e2 g2>', same: 'c2 <e2 g2>' },
  { name: 'extend alternatives', before: 'c2   <e2   g2>', run: (t, r) => E.addAlternative(t, E.find(r, (c) => c.shape === 'alt'), 'a2'), exact: 'c2   <e2   g2 a2>', same: 'c2 <e2 g2 a2>' },
  { name: 'add a chord note', before: 'c2   e2', run: (t, r) => E.addChordNote(t, E.atom(r, 'c2'), 'g2'), exact: '[c2, g2]   e2', same: '[c2,g2] e2' },
  { name: 'extend a chord in its own style', before: '[c2,e2]   a2', run: (t, r) => E.addChordNote(t, E.find(r, (c) => c.join === 'stack'), 'g2'), exact: '[c2,e2,g2]   a2', same: '[c2,e2,g2] a2' },
  { name: 'add a random choice', before: 'c2   e2', run: (t, r) => E.addChoice(t, E.atom(r, 'c2'), 'g2'), exact: '[c2 | g2]   e2', same: '[c2 | g2] e2' },
  { name: 'extend random choices', before: '[c2|e2]   a2', run: (t, r) => E.addChoice(t, E.find(r, (c) => c.join === 'choose'), 'g2'), exact: '[c2|e2|g2]   a2', same: '[c2|e2|g2] a2' },
  { name: 'insert a step', before: 'c2   e2', run: (t, r) => E.insertAfter(E.atom(r, 'c2'), '~'), exact: 'c2 ~   e2', same: 'c2 ~ e2' },
  { name: 'delete a step', before: 'c2   e2  g2', run: (t, r) => E.removeCell(t, E.atom(r, 'e2')), exact: 'c2   g2', same: 'c2 g2' },
  { name: 'delete the last step', before: 'c2   e2', run: (t, r) => E.removeCell(t, E.atom(r, 'e2')), exact: 'c2', same: 'c2' },
  { name: 'edit a text cell', before: 'c2  bd*<2 3>  e2', run: (t, r) => E.editTextCell(t, E.find(r, (c) => c.text === 'bd'), 'bd*<2 4>'), exact: 'c2  bd*<2 4>  e2', same: 'c2 bd*<2 4> e2' },
]
const failures: string[] = []
const results: unknown[] = []
for (const c of cases) {
  const tree = buildTree(c.before)
  const s = c.run(c.before, tree)
  const after = E.apply(c.before, s)
  const exact = after === c.exact
  const outside = c.before.slice(0, s.start) === after.slice(0, s.start) && c.before.slice(s.end) === after.slice(s.start + s.text.length)
  const reparsed = (() => { try { buildTree(after); return true } catch { return false } })()
  const same = JSON.stringify(events(after)) === JSON.stringify(events(c.same))
  const changed = JSON.stringify(events(after)) !== JSON.stringify(events(c.before))
  results.push({ name: c.name, before: c.before, after, exact, outside, reparsed, same, changed })
  if (!exact || !outside || !reparsed || !same) failures.push(`${c.name}: ${JSON.stringify(c.before)} -> ${JSON.stringify(after)} exact=${exact} outside=${outside} reparsed=${reparsed} same=${same}`)
}
// Edits inside MESSY keep every other byte, including the tabs and newline.
const messy = buildTree(MESSY)
const messyEdits: [string, (t: string, r: Tree) => E.Splice][] = [
  ['note', (t, r) => E.replaceAtom(E.atom(r, 'e2'), 'f2')],
  ['modifier', (t, r) => E.setMod(mod(E.find(r, (c) => c.shape === 'seq' && c.mods.length > 0), 'weight'), '@3')],
  ['alternative', (t, r) => E.addAlternative(t, E.find(r, (c) => c.shape === 'alt'), 'd2')],
  ['chord', (t, r) => E.addChordNote(t, E.find(r, (c) => c.join === 'stack'), 'g3')],
  ['sample index', (t, r) => E.setMod(mod(E.atom(r, 'bd'), 'index'), ':4')],
]
const messyResults = messyEdits.map(([name, run]) => {
  const s = run(MESSY, messy); const after = E.apply(MESSY, s)
  const ok = MESSY.slice(0, s.start) === after.slice(0, s.start) && MESSY.slice(s.end) === after.slice(s.start + s.text.length) && (buildTree(after), true)
  if (!ok) failures.push(`messy ${name}`)
  return { name, after: JSON.stringify(after), ok }
})
// Refusals.
const refusals = [['[a', 'unbalanced'], ['a b', 'two cells'], ['a, b', 'layers'], ['', 'empty']].map(([raw, why]) => {
  const tree = buildTree('c2 bd*<2 3>')
  try { E.editTextCell(tree.text, E.atom(tree, 'bd'), raw!); failures.push(`accepted ${why}`); return { raw, why, refused: false } }
  catch (e) { return { raw, why, refused: true, message: (e as Error).message } }
})
// Random seeds are positional: krill numbers `?` and `|` in source order.
const seedA = events('c2? e2? g2? a2?')
const seedAfter = events('c2 e2? g2? a2?')
const onlySecond = (l: Ev[]) => l.filter((e) => e.includes('e2') || e.includes('g2') || e.includes('a2'))
const seedShift = { removedFirstQuestionMark: JSON.stringify(onlySecond(seedA)) !== JSON.stringify(onlySecond(seedAfter)) }
import { it } from 'vitest'; import { writeFileSync } from 'node:fs'; it('edits', () => { writeFileSync('spike/out-edits.json', JSON.stringify({ results, passed: cases.length - failures.filter((f) => !f.startsWith('messy') && !f.startsWith('accepted')).length, total: cases.length, messyResults, refusals, seedShift, failures }, null, 1))
}, 60000)
