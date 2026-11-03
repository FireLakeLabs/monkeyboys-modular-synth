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
