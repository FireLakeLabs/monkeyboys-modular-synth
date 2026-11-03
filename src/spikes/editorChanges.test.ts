import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState, Text } from '@codemirror/state'
import { editorChanges } from './editorChanges'

describe('rack rewrites', () => {
  it('maps a backward selection between two disjoint edits rather than replacing the whole draft', () => {
    const before = 'note("c3").lpf(800)\n// keep selection here\n// metadata 800'
    const after = 'note("c3").lpf(1800)\n// keep selection here\n// metadata 1800'
    const anchor = before.indexOf('here') + 4
    const head = before.indexOf('selection')
    const state = EditorState.create({
      doc: before,
      selection: EditorSelection.range(anchor, head),
    })
    const next = state.update({ changes: editorChanges(before, after) }).state
    expect(next.doc.toString()).toBe(after)
    expect(next.selection.main.anchor).toBe(anchor + 1)
    expect(next.selection.main.head).toBe(head + 1)
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe('selection here')
  })
  it('retains mixed line endings, astral characters, comments and unfinished source exactly', () => {
    const before = '// 🐒\r\nnote("c3")\n'
    const after = '// 🐒\r\nnote("東京")\n.lpf(\r\n'
    const state = EditorState.create({ doc: Text.of(before.split('\n')) })
    const next = state.update({ changes: editorChanges(before, after) }).state
    expect(next.doc.toString()).toBe(after)
  })
})

it('CodeMirror history omits a rack transaction excluded from editor history', async () => {
  const { history, undo } = await import('@codemirror/commands')
  const { Transaction } = await import('@codemirror/state')
  let state = EditorState.create({ doc: 'note("c3").lpf(800)', extensions: [history()] })
  state = state.update({
    changes: { from: 8, insert: ' ' },
    annotations: Transaction.userEvent.of('input.type'),
  }).state
  const changed = state.doc.toString().replace('800', '1800')
  state = state.update({
    changes: editorChanges(state.doc.toString(), changed),
    annotations: Transaction.addToHistory.of(false),
  }).state
  expect(
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state
      },
    }),
  ).toBe(true)
  expect(state.doc.toString()).toBe('note("c3").lpf(1800)')
  expect(
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state
      },
    }),
  ).toBe(false)
})
