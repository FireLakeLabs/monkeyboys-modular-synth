import { EditorState, StateField, Transaction } from '@codemirror/state'
import {
  codeFolding,
  foldEffect,
  foldedRanges,
  foldGutter,
  foldService,
  unfoldEffect,
} from '@codemirror/language'
import { lineNumbers } from '@codemirror/view'
import { rackMetadata } from '../reader/metadata'
import type { Span } from '../reader/types'

const metadata = StateField.define<Span | null>({
  create: (state) => rackMetadata(state.doc.toString()),
  update(value, transaction) {
    if (!transaction.docChanged) return value
    let editsCodeOnly = value !== null
    transaction.changes.iterChangedRanges((_from, to) => {
      if (value && to > value.start) editsCodeOnly = false
    })
    // An unfinished string/comment must not expose an already protected block.
    return value && editsCodeOnly
      ? {
          start: transaction.changes.mapPos(value.start, 1),
          end: transaction.changes.mapPos(value.end, 1),
        }
      : rackMetadata(transaction.newDoc.toString())
  },
})

export function foldRackMetadata(state: EditorState) {
  const range = state.field(metadata)
  if (!range) return []
  const from = state.doc.lineAt(range.start).to
  return from < range.end ? [foldEffect.of({ from, to: range.end })] : []
}

export const metadataFolding = [
  metadata,
  codeFolding({ placeholderText: '… read only' }),
  foldGutter(),
  foldService.of((state, lineStart, lineEnd) => {
    const range = state.field(metadata)
    return range && range.start >= lineStart && range.start <= lineEnd && lineEnd < range.end
      ? { from: lineEnd, to: range.end }
      : null
  }),
  lineNumbers({
    formatNumber: (number, state) => {
      const range = state.field(metadata)
      return range && number >= state.doc.lineAt(range.start).number ? '' : String(number)
    },
  }),
  EditorState.changeFilter.of((transaction) => {
    if (transaction.annotation(Transaction.userEvent) === 'rack') return true
    const range = transaction.startState.field(metadata)
    if (!range) return true
    let allowed = true
    // A whole-file paste is an explicit document replacement, including its saved rack.
    // Ordinary typing, cut, deletion and partial pastes cannot touch the block.
    const length = transaction.startState.doc.length
    const markerLine = transaction.startState.doc.lineAt(range.start).from
    const prefix = transaction.startState.sliceDoc(0, markerLine)
    const codeEnd = markerLine - (prefix.endsWith('\r\n') ? 2 : prefix.endsWith('\n') ? 1 : 0)
    transaction.changes.iterChangedRanges((from, to) => {
      if (
        !(transaction.isUserEvent('input.paste') && from === 0 && to === length) &&
        (from > codeEnd || to > codeEnd)
      )
        allowed = false
    })
    return allowed
  }),
  EditorState.transactionExtender.of((transaction) => {
    if (!transaction.docChanged) return null
    const previous = transaction.startState.field(metadata)
    const effects = foldRackMetadata(transaction.state)
    if (previous) {
      const start = transaction.startState.doc.lineAt(previous.start).to
      // Minimal file rewrites may map the old fold onto unrelated marker-like text.
      // Remove that mapped fold before installing the new reader-owned boundary.
      const mapped = foldedRanges(transaction.startState)
        .update({ filter: (from, to) => from === start && to === previous.end })
        .map(transaction.changes)
      mapped.between(0, transaction.newDoc.length, (from, to) => {
        effects.unshift(unfoldEffect.of({ from, to }))
      })
    }
    return { effects }
  }),
]
