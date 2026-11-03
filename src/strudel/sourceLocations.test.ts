import { expect, it } from 'vitest'
import { read } from '../reader'
import { activityPlan } from './activity'
import { sourceLocations } from './sourceLocations'

it('maps real event-location shapes after two inserted voice observers back to the exact source', () => {
  const source =
    '// 🐒\n$: note("c3 e3").s("sine")\n$: note("g3 a3").s("triangle")\n$: note("b3").s("sine")'
  const plan = activityPlan(read(source))
  for (const token of ['c3', 'g3', 'b3']) {
    const start = plan.code.indexOf(token)
    const spans = sourceLocations(
      { context: { locations: [{ start, end: start + 2 }] } },
      source.length,
      plan.sourceOffset,
    )
    expect(spans).toEqual([{ start: source.indexOf(token), end: source.indexOf(token) + 2 }])
    expect(spans.map((span) => source.slice(span.start, span.end))).toEqual([token])
  }
  const inserted = plan.code.indexOf('context =>')
  expect(
    sourceLocations(
      { context: { locations: [{ start: inserted, end: inserted + 4 }] } },
      source.length,
      plan.sourceOffset,
    ),
  ).toEqual([])
})
it('rejects malformed, reversed and out-of-source locations without inventing attribution', () => {
  for (const hap of [
    null,
    {},
    {
      context: {
        locations: [
          null,
          {},
          { start: -1, end: 2 },
          { start: 3, end: 1 },
          { start: 0, end: 100 },
          { start: '0', end: 1 },
          { start: 0.5, end: 1 },
        ],
      },
    },
  ]) {
    expect(sourceLocations(hap, 10, (offset) => offset)).toEqual([])
  }
})
