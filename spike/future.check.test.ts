// run: npx vitest run --config spike/vitest.config.ts
import '@strudel/core/euclid.mjs'
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { note, n, lpf } from '@strudel/core/controls.mjs'
import { m, mini, miniAllStrings } from '@strudel/mini/mini.mjs'
import '@strudel/tonal/tonal.mjs'
import '@strudel/tonal/voicings.mjs'
import { chord } from '@strudel/core/controls.mjs'
miniAllStrings()
const onsets = (p: any, to = 2) => p.queryArc(0, to).filter((h: any) => h.hasOnset())
const loc = (h: any) => (h.context.locations ?? []).map((l: any) => l.start)
it('covers the sequencers that have not landed yet', () => {
  // !n: capture the source position before a transform moves the event, as #90 does for cells.
  const captured = mini('a!3 b')
    .withHap((h: any) => h.setContext({ ...h.context, sourcePos: h.whole.begin.cyclePos().toFraction() }))
    .rev()
  const copies = onsets(captured, 1).map((h: any) => ({ now: h.whole.begin.toFraction(), source: h.context.sourcePos, value: h.value }))
  // CHORD: does a voiced note still name its chord cell?
  let voiced: unknown
  try {
    voiced = onsets(chord(m('<Cm7 Fm7>', 100)).voicing()).map((h: any) => ({ value: h.value, starts: loc(h) }))
  } catch (e) { voiced = `error: ${(e as Error).message}` }
  // Scale degrees through .scale().
  let degrees: unknown
  try {
    degrees = onsets(n(m('0 [2 4]', 100)).scale('C:minor'), 1).map((h: any) => ({ value: h.value, starts: loc(h) }))
  } catch (e) { degrees = `error: ${(e as Error).message}` }
  // CV SEQ: a patterned control argument beside a note literal.
  const cv = onsets(note(m('c2 e2', 100)).lpf(m('<400 800>', 200))).map((h: any) => ({ value: h.value, starts: loc(h) }))
  writeFileSync('spike/out-future.json', JSON.stringify({ copies, voiced, degrees, cv }, null, 1))
})
