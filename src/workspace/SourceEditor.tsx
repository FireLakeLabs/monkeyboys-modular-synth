import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  Text,
  Transaction,
} from '@codemirror/state'
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import type { ReadResult, SourceDocument } from '../reader/types'
import { sourceSegments, sourceTreatments, type SourceTreatment } from './highlighting'
import { editorChanges } from './editorChanges'
import { foldRackMetadata, metadataFolding } from './metadataFolding'
import { soundingTokens, type SubscribeSourceFeedback } from './soundingTokens'
import { setSourceDiagnostic, sourceDiagnostics } from './sourceDiagnostics'

const setSourceDecorations = StateEffect.define<DecorationSet>()
const sourceDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    // Input can shorten the document before React publishes its new treatments.
    // Keep every range valid during that interval, including invalid drafts.
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects)
      if (effect.is(setSourceDecorations)) next = effect.value
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

function reportEditing(
  view: EditorView,
  treatments: SourceTreatment[] | null,
  report: (id: string | null) => void,
) {
  // Keep the last known editing owner during an unaccepted draft, as the rack
  // still shows that revision. Blur always ends editing; acceptance remaps it.
  if (!treatments && view.hasFocus) return
  const { from, to } = view.state.selection.main
  const owner =
    view.hasFocus &&
    treatments?.find(
      (span) => span.className.includes('source-cyber') && span.start <= from && span.end >= to,
    )
  report(owner ? (owner.modules[0] ?? null) : null)
}

export function SourceEditor(props: {
  source: string
  document: SourceDocument | null
  selected: string | null
  editor: RefObject<EditorView | null>
  sourceFeedback: SubscribeSourceFeedback
  invalid: boolean
  diagnostic: Extract<ReadResult, { kind: 'invalid' }> | null
  status: ReactNode
  change: (source: string) => void
  composing: (value: boolean) => void
  editingModule: (id: string | null) => void
  stepHistory: (direction: 'undo' | 'redo') => boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLOutputElement>(null)
  const treatments = useMemo(
    () => (props.document ? sourceTreatments(props.document) : null),
    [props.document],
  )
  const decorations = useMemo(
    () =>
      Decoration.set(
        sourceSegments(props.source, treatments ?? [], props.selected).flatMap((segment) =>
          segment.text && segment.className.trim()
            ? [
                Decoration.mark({ class: segment.className.trim() }).range(
                  segment.start,
                  segment.start + segment.text.length,
                ),
              ]
            : [],
        ),
      ),
    [props.source, treatments, props.selected],
  )
  const current = useRef({ props, treatments })
  const styling = useRef(new Compartment())
  const draftHistory = useRef(new Compartment())
  useLayoutEffect(() => {
    current.current = { props, treatments }
  })

  useLayoutEffect(() => {
    if (!host.current) return
    // Selection is editor-local: moving the caret must not rerender the workspace
    // or rebuild source treatments. CodeMirror owns this output's text.
    const reportCursor = (state: EditorState) => {
      const head = state.selection.main.head
      const line = state.doc.lineAt(head)
      if (cursor.current)
        cursor.current.textContent = `Ln ${line.number}, Col ${head - line.from + 1}`
    }
    let compositionTimer: ReturnType<typeof setTimeout> | undefined
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: Text.of(current.current.props.source.split('\n')),
        extensions: [
          EditorState.lineSeparator.of('\n'),
          metadataFolding,
          sourceDiagnostics,
          javascript(),
          draftHistory.current.of(history()),
          keymap.of(defaultKeymap),
          styling.current.of([]),
          sourceDecorations,
          soundingTokens(current.current.props.sourceFeedback, (event) => {
            const { props, treatments } = current.current
            if (props.document?.source !== event.source || !treatments) return []
            return event.spans.filter(
              (span) =>
                treatments.some(
                  (owner) =>
                    owner.className.includes('source-token') &&
                    !owner.className.includes('source-cyber') &&
                    owner.start <= span.start &&
                    owner.end >= span.end,
                ) &&
                !treatments.some(
                  (owner) =>
                    owner.className.includes('source-cyber') &&
                    owner.start < span.end &&
                    owner.end > span.start,
                ),
            )
          }),
          EditorView.theme(
            {
              '&': { height: '100%' },
              '.cm-scroller': { overflow: 'auto' },
              '.cm-gutters': { background: '#15171b', color: '#9aa0a8' },
              '.cm-foldPlaceholder': {
                background: '#23272d',
                color: '#9aa0a8',
                borderColor: '#3e454d',
              },
              '&.cm-focused .cm-cursor': { borderLeftColor: '#e4e6ea' },
            },
            { dark: true },
          ),
          EditorView.contentAttributes.of({ 'aria-label': 'Strudel source', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            const { props, treatments } = current.current
            if (update.selectionSet || update.docChanged) reportCursor(update.state)
            if (
              update.docChanged &&
              !update.transactions.every((tr) => tr.annotation(Transaction.userEvent) === 'rack')
            )
              props.change(update.state.doc.toString())
            if (update.selectionSet || update.focusChanged || update.docChanged)
              // Accepted spans describe the old document until React installs the
              // new revision. Preserve editing ownership across that boundary.
              reportEditing(update.view, update.docChanged ? null : treatments, props.editingModule)
          }),
          EditorView.domEventHandlers({
            keydown: (event, view) => {
              if (
                !(event.ctrlKey || event.metaKey) ||
                event.altKey ||
                event.key.toLowerCase() !== 'z'
              )
                return false
              event.preventDefault()
              if (event.isComposing || view.composing || event.repeat) return true
              const direction = event.shiftKey ? 'redo' : 'undo'
              const { props } = current.current
              if (!props.document && (direction === 'undo' ? undoDepth : redoDepth)(view.state))
                (direction === 'undo' ? undo : redo)(view)
              else props.stepHistory(direction)
              return true
            },
            compositionstart: () => {
              clearTimeout(compositionTimer)
              current.current.props.composing(true)
            },
            compositionend: () => {
              // CM flushes pending DOM mutations after compositionend. Publish the final
              // document before releasing the reader/rack gate, never an earlier prop.
              compositionTimer = setTimeout(() => {
                current.current.props.change(view.state.doc.toString())
                current.current.props.composing(false)
              }, 0)
            },
          }),
        ],
      }),
    })
    view.dispatch({ effects: foldRackMetadata(view.state) })
    reportCursor(view.state)
    const editor = current.current.props.editor
    editor.current = view
    return () => {
      clearTimeout(compositionTimer)
      editor.current = null
      view.destroy()
    }
  }, [])

  useLayoutEffect(() => {
    const view = props.editor.current
    if (!view || view.composing) return
    const before = view.state.doc.toString()
    if (before !== props.source)
      view.dispatch({
        changes: editorChanges(before, props.source),
        annotations: [Transaction.userEvent.of('rack'), Transaction.addToHistory.of(false)],
      })
  }, [props.source, props.editor])

  useLayoutEffect(() => {
    const view = props.editor.current
    if (!view) return
    view.dispatch({
      effects: [
        setSourceDecorations.of(decorations),
        styling.current.reconfigure([
          EditorView.contentAttributes.of({ 'aria-invalid': String(props.invalid) }),
        ]),
      ],
    })
    reportEditing(view, treatments, props.editingModule)
  }, [decorations, props.invalid, props.editor, props.editingModule, treatments])

  useLayoutEffect(() => {
    props.editor.current?.dispatch({ effects: setSourceDiagnostic.of(props.diagnostic) })
  }, [props.diagnostic, props.editor])

  useLayoutEffect(() => {
    const view = props.editor.current
    // Accepted source + graph history belongs to the app (#63). Removing and
    // reinstalling the extension checkpoints draft undo without resetting selection.
    if (!view || !props.document) return
    view.dispatch({ effects: draftHistory.current.reconfigure([]) })
    view.dispatch({ effects: draftHistory.current.reconfigure(history()) })
  }, [props.document, props.editor])

  return (
    <>
      <div ref={host} className="source-surface" />
      <footer className="editor-status" aria-label="Editor status">
        <output
          ref={cursor}
          className="cursor-position"
          aria-live="off"
          aria-label="Cursor position"
        />
        {props.status}
      </footer>
    </>
  )
}
