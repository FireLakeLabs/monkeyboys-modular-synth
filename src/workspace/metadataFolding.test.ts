import { expect, it } from 'vitest'
import { EditorState, Text, Transaction } from '@codemirror/state'
import { foldedRanges } from '@codemirror/language'
import { RACK_MARKER } from '../codegen/layout'
import { foldRackMetadata, metadataFolding } from './metadataFolding'
import { editorChanges } from './editorChanges'
import { fromPatch } from './document'
import { starterPatch } from '../rack/model'

const code = '$: note("c3")'
const block = `\n\n${RACK_MARKER}\n// {"version":999}\n`
const source = code + block

function editor(text = source) {
  const state = EditorState.create({
    doc: Text.of(text.split('\n')),
    extensions: metadataFolding,
  })
  return state.update({ effects: foldRackMetadata(state) }).state
}

it('folds the trailing metadata payload while retaining every source byte', () => {
  const state = editor()
  const ranges: { from: number; to: number }[] = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to })
  })
  expect(ranges).toEqual([{ from: code.length + 2 + RACK_MARKER.length, to: source.length }])
  expect(state.doc.toString()).toBe(source)
})

it.each([
  { from: code.length + 1, to: code.length + 2, insert: '' },
  { from: source.indexOf('999'), insert: '2' },
  { from: source.length, insert: 'oops' },
  { from: 0, to: source.length, insert: 'oops' },
])('protects metadata and its separating newline from ordinary edits: %j', (changes) => {
  expect(editor().update({ changes, userEvent: 'input' }).state.doc.toString()).toBe(source)
})

it('allows code edits and keeps the metadata folded at its new position', () => {
  const state = editor().update({ changes: { from: 0, to: 2, insert: '// hi\n$:' } }).state
  expect(state.doc.toString()).toBe(`// hi\n${source}`)
  expect(foldedRanges(state).size).toBe(1)
})

it('lets typing continue on a new code line before the protected separator', () => {
  const nextLine = editor().update({ changes: { from: code.length, insert: '\n' } }).state
  const typed = nextLine.update({
    changes: { from: code.length + 1, insert: '  .lpf(800)' },
  }).state
  expect(typed.doc.toString()).toBe(`${code}\n  .lpf(800)${block}`)
})

it('allows trusted rack rewrites and whole-file paste, then folds the replacement', () => {
  for (const userEvent of ['rack', 'input.paste']) {
    const replacement = source.replace('c3', '東京').replace('999', '123')
    const next = editor().update({
      changes: { from: 0, to: source.length, insert: replacement },
      annotations: Transaction.userEvent.of(userEvent),
    }).state
    expect(next.doc.toString()).toBe(replacement)
    expect(foldedRanges(next).size).toBe(1)
  }
})

it('refuses a partial paste into metadata', () => {
  expect(
    editor()
      .update({
        changes: { from: source.indexOf('999'), insert: '123' },
        userEvent: 'input.paste',
      })
      .state.doc.toString(),
  ).toBe(source)
})

it('keeps the known block folded and protected while code has an unfinished string or comment', () => {
  for (const insert of ['"', '/*', '`']) {
    const draft = editor().update({ changes: { from: 0, insert } }).state
    expect(foldedRanges(draft).size).toBe(1)
    const attempted = draft.update({
      changes: { from: draft.doc.length, insert: 'oops' },
      userEvent: 'input',
    }).state
    expect(attempted.doc.toString()).toBe(insert + source)
  }
})

it('preserves exact mixed line endings through a code edit', () => {
  const text = `${code}\r\n${RACK_MARKER}\n// {}\r\n`
  const next = editor(text).update({
    changes: { from: text.indexOf('c3'), to: text.indexOf('c3') + 2, insert: '東京' },
  }).state
  expect(next.doc.toString()).toBe(`$: note("東京")\r\n${RACK_MARKER}\n// {}\r\n`)
})

it('removes the old metadata fold when a minimal rack rewrite installs a different file', () => {
  const before = fromPatch(starterPatch()).source
  const replacement = `const marker = ${JSON.stringify(RACK_MARKER)};\n/*\n${RACK_MARKER}\n*/\n${RACK_MARKER}\n// earlier comment\n$: s("bd")\n\n${RACK_MARKER}\n// {"version":999}\n`
  const next = editor(before).update({
    changes: editorChanges(before, replacement),
    userEvent: 'rack',
  }).state
  const ranges: { from: number; to: number }[] = []
  foldedRanges(next).between(0, next.doc.length, (from, to) => {
    ranges.push({ from, to })
  })
  expect(ranges).toEqual([
    { from: replacement.lastIndexOf(RACK_MARKER) + RACK_MARKER.length, to: replacement.length },
  ])
})
