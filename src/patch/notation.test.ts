import { describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { drumText, drumView, stepView } from './notation'

const steps = getModuleSpec('seq').controls.find((control) => control.kind === 'steps')
const drums = getModuleSpec('drums').controls.find((control) => control.kind === 'grid')
if (!steps || !drums) throw new Error('Missing pattern controls')

describe('notation grid views', () => {
  it('shows plain notes, degrees, rests and flat alternations as individual cells', () => {
    expect(stepView(' c2\n c2 eb2 g2 c3 bb2 g2 eb2 ', steps)).toEqual({
      kind: 'grid',
      value: ['c2', 'c2', 'eb2', 'g2', 'c3', 'bb2', 'g2', 'eb2'],
    })
    expect(stepView('0 ~ <3 5> -2', steps)).toEqual({
      kind: 'grid',
      value: ['0', '~', '<3 5>', '-2'],
    })
  })
  it.each([
    '<3@3 4 5 @3 6>*2',
    'c2 [e2 g2]',
    'c2*2',
    'c2!2',
    '<3 5>7',
    '',
    Array.from({ length: 17 }, () => 'c2').join(' '),
  ])('keeps unsupported sequence %s in text with a reason', (text) => {
    expect(stepView(text, steps)).toMatchObject({ kind: 'text', reason: expect.any(String) })
  })
  it.each(['_', '.', '..'])('keeps standalone timing operator %s out of both grids', (operator) => {
    expect(stepView(`c2 ${operator} e2`, steps)).toMatchObject({
      kind: 'text',
      reason: expect.any(String),
    })
    expect(drumView(`[${operator} ~]*4`, drums)).toMatchObject({
      kind: 'text',
      reason: expect.any(String),
    })
  })
  it('shows flat drum rows and generator repetitions without changing their step timing', () => {
    expect(drumView('bd ~ bd ~ bd ~ bd ~, [~ hh]*4, sd*8', drums)).toEqual({
      kind: 'grid',
      value: [
        { sample: 'bd', steps: [1, 0, 1, 0, 1, 0, 1, 0] },
        { sample: 'hh', steps: [0, 1, 0, 1, 0, 1, 0, 1] },
        { sample: 'sd', steps: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
    })
  })
  it.each([
    'bd(3,8)',
    'bd ~ sd ~ bd ~ sd ~',
    'bd*4',
    'bd*8, hh*16',
    '[bd ~]*999999999999',
    '[bd [hh sd]]*4',
  ])('keeps unsupported drum notation %s in text with a reason', (text) => {
    expect(drumView(text, drums)).toMatchObject({ kind: 'text', reason: expect.any(String) })
  })
  it('writes grid edits using the same notation as the rack', () => {
    expect(drumText([{ sample: 'bd', steps: [1, 0, 1, 0, 1, 0, 1, 1] }])).toBe(
      'bd ~ bd ~ bd ~ bd bd',
    )
  })
})
