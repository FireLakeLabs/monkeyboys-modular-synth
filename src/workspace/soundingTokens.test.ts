import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { expireTokenActivity, setTokenActivity, tokenActivity } from './soundingTokens'

const source = '$: note("c3 e3").s("sine")'
const c3 = { start: 9, end: 11 }
const e3 = { start: 12, end: 14 }
function active(state: EditorState) {
  const text: string[] = []
  state.field(tokenActivity).decorations.between(0, state.doc.length, (from, to) => {
    text.push(state.sliceDoc(from, to))
  })
  return text
}
const event = (spans = [c3], expires = 400) => setTokenActivity.of({ source, spans, expires })

describe('sounding source tokens', () => {
  it('marks exact tokens, accumulates simultaneous events and refreshes a retrigger independently', () => {
    let state = EditorState.create({ doc: source, extensions: [tokenActivity] })
    state = state.update({ effects: event() }).state
    expect(active(state)).toEqual(['c3'])
    state = state.update({ effects: event([e3], 500) }).state
    expect(active(state)).toEqual(['c3', 'e3'])
    state = state.update({ effects: event([c3, c3], 700) }).state
    state = state.update({ effects: expireTokenActivity.of(500) }).state
    expect(active(state)).toEqual(['c3'])
    state = state.update({ effects: expireTokenActivity.of(700) }).state
    expect(active(state)).toEqual([])
    expect(state.doc.toString()).toBe(source)
  })

  it('clears immediately on edits and refuses feedback for a different evaluated source', () => {
    let state = EditorState.create({ doc: source, extensions: [tokenActivity] })
    state = state.update({ effects: event() }).state
    expect(active(state)).toEqual(['c3'])
    state = state.update({ changes: { from: 9, to: 11, insert: 'g3' } }).state
    expect(active(state)).toEqual([])
    state = state.update({ effects: event() }).state
    expect(active(state)).toEqual([])
    state = state.update({
      effects: setTokenActivity.of({ source: state.doc.toString(), spans: [c3], expires: 400 }),
    }).state
    expect(active(state)).toEqual(['g3'])
    state = state.update({ effects: setTokenActivity.of(null) }).state
    expect(active(state)).toEqual([])
  })

  it('does not invent marks for empty or out-of-document spans', () => {
    const state = EditorState.create({ doc: source, extensions: [tokenActivity] })
    expect(active(state.update({ effects: event([]) }).state)).toEqual([])
    expect(
      active(
        state.update({
          effects: event([
            { start: -1, end: 1 },
            { start: 2, end: 100 },
          ]),
        }).state,
      ),
    ).toEqual([])
  })
})
