import { StateEffect, StateField } from '@codemirror/state'
import { EditorView, GutterMarker, gutter } from '@codemirror/view'
import type { ReadResult } from '../reader/types'

type Diagnostic = Extract<ReadResult, { kind: 'invalid' }>

export const setSourceDiagnostic = StateEffect.define<Diagnostic | null>()

const diagnostic = StateField.define<Diagnostic | null>({
  create: () => null,
  update(value, transaction) {
    let next = transaction.docChanged ? null : value
    for (const effect of transaction.effects)
      if (effect.is(setSourceDiagnostic))
        next = effect.value?.source === transaction.newDoc.toString() ? effect.value : null
    return next
  },
})

class ErrorMarker extends GutterMarker {
  readonly label: string
  constructor(label: string) {
    super()
    this.label = label
  }
  eq(other: ErrorMarker) {
    return this.label === other.label
  }
  toDOM() {
    const marker = document.createElement('span')
    marker.className = 'source-error-marker'
    marker.textContent = '●'
    marker.title = this.label
    marker.setAttribute('aria-label', this.label)
    return marker
  }
}

export const sourceDiagnostics = [
  diagnostic,
  gutter({
    class: 'cm-sourceErrors',
    lineMarker(view, line) {
      const error = view.state.field(diagnostic)
      return error && view.state.doc.lineAt(error.offset).from === line.from
        ? new ErrorMarker(`Line ${error.line}, column ${error.column + 1}: ${error.message}`)
        : null
    },
    lineMarkerChange: (update) =>
      update.startState.field(diagnostic) !== update.state.field(diagnostic),
  }),
  EditorView.theme({
    '.cm-sourceErrors .cm-gutterElement': { minWidth: '1em', color: '#f293ba' },
    '.source-error-marker': { cursor: 'help' },
  }),
]
