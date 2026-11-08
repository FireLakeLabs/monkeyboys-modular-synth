import { describe, expect, it } from 'vitest'
import {
  arrangementCells,
  arrangementLength,
  formatArrangement,
  isArrangement,
  paintArrangement,
  parseArrangement,
} from './arrangement'

describe('arranger lane text', () => {
  it('reads one cycle per step, with repeats', () => {
    expect(parseArrangement('<1!2 0 1>')).toEqual([true, true, false, true])
    expect(parseArrangement('<  0!3  >')).toEqual([false, false, false])
    expect(parseArrangement('')).toEqual([])
  })

  it.each(['1 0', '<1 x>', '<1!0>', '<1!>', '<>', '<1 [0 1]>', '<1?>', '<1@2>', '<0!257>'])(
    'leaves %s to the code',
    (text) => expect(isArrangement(text)).toBe(false),
  )

  it('writes runs and omits a lane that always plays', () => {
    expect(formatArrangement([false, false, true, true, true, false])).toBe('<0!2 1!3 0>')
    expect(formatArrangement([true, true])).toBe('')
    expect(formatArrangement([])).toBe('')
  })

  it('repeats a shorter lane across the song as the engine does', () => {
    expect(arrangementCells('<1 0>', 5)).toEqual([true, false, true, false, true])
    expect(arrangementCells('', 3)).toEqual([true, true, true])
    expect(arrangementLength('<1!4 0!12>')).toBe(16)
  })

  it('paints a cycle range in either drag direction', () => {
    expect(paintArrangement('', { length: 8, from: 5, to: 2, on: false })).toBe('<1!2 0!4 1!2>')
    expect(paintArrangement('<1!2 0!4 1!2>', { length: 8, from: 2, to: 5, on: true })).toBe('')
    expect(paintArrangement('<0 1>', { length: 4, from: 0, to: 0, on: true })).toBe('<1!2 0 1>')
  })
})
