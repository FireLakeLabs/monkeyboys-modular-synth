import { useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react'
import { Compartment, EditorState, Text, Transaction } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { foldGutter, foldService } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import type { SourceEditor } from '../workspace/SourceEditor'
import { sourceSegments, sourceTreatments } from '../workspace/highlighting'
import { RACK_MARKER } from '../codegen/layout'
import type { SourceFeedback } from '../strudel/engine'
import { editorChanges } from './editorChanges'

// The DOM ref is the one intentional incompatibility: do not impersonate a textarea.
export type PrototypeProps = Omit<ComponentProps<typeof SourceEditor>, 'editor'> & {
  editor: RefObject<EditorView | null>
  feedback: SourceFeedback | null
  error: { offset: number; message: string } | null
}

export function CodeMirrorSourceEditor(props: PrototypeProps) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  const styling = useRef(new Compartment())
  const pendingSource = useRef<string | null>(null)
  useLayoutEffect(() => {
    current.current = props
  })

  useLayoutEffect(() => {
    if (!host.current) return
    const notifyEditing = (view: EditorView) => {
      const { document, editingModule } = current.current
      const { from, to } = view.state.selection.main
      const owner =
        document &&
        view.hasFocus &&
        sourceTreatments(document).find(
          (span) => span.className.includes('source-cyber') && span.start <= from && span.end >= to,
        )
      editingModule(owner ? (owner.modules[0] ?? null) : null)
    }
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: Text.of(current.current.source.split('\n')),
        extensions: [
          EditorState.lineSeparator.of('\n'),
          lineNumbers(),
          javascript(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lintGutter(),
          foldGutter(),
          foldService.of((state, from) => {
            const line = state.doc.lineAt(from)
            return line.text === RACK_MARKER && line.to < state.doc.length
              ? { from: line.to, to: state.doc.length }
              : null
          }),
          styling.current.of([]),
          EditorView.theme(
            {
              '&': { height: '440px', background: '#090c11', color: '#dce5e9' },
              '.cm-scroller': { fontFamily: 'monospace', fontSize: '12px', overflow: 'auto' },
              '.cm-content': { padding: '12px 0' },
              '.cm-gutters': { background: '#15171b', color: '#9aa0a8' },
              '.cm-event': { background: '#f4a462', color: '#101113' },
              '&.cm-focused .cm-cursor': { borderLeftColor: '#e4e6ea' },
            },
            { dark: true },
          ),
          EditorView.contentAttributes.of({ 'aria-label': 'Strudel source', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.every((tr) => tr.annotation(Transaction.userEvent) === 'rack')
            )
              current.current.change(update.state.doc.toString())
            if (update.selectionSet || update.focusChanged || update.docChanged)
              notifyEditing(update.view)
          }),
          EditorView.domEventHandlers({
            compositionstart: () => {
              current.current.composing(true)
            },
            compositionend: () => {
              current.current.composing(false)
              const pending = pendingSource.current
              pendingSource.current = null
              // Re-render/accept the final composition before a caller rewrite.
              if (pending !== null) current.current.change(view.state.doc.toString())
            },
            blur: () => {
              current.current.editingModule(null)
            },
          }),
        ],
      }),
    })
    const editor = current.current.editor
    editor.current = view
    return () => {
      editor.current = null
      view.destroy()
    }
  }, [])

  useLayoutEffect(() => {
    const view = props.editor.current
    if (!view) return
    const before = view.state.doc.toString()
    if (before !== props.source) {
      if (view.composing) {
        pendingSource.current = props.source
        return
      }
      view.dispatch({
        changes: editorChanges(before, props.source),
        annotations: [Transaction.userEvent.of('rack'), Transaction.addToHistory.of(false)],
      })
    }
    const segments = sourceSegments(
      props.source,
      props.document ? sourceTreatments(props.document) : [],
      props.selected,
    )
    const marks = segments.flatMap((segment) =>
      segment.text && segment.className.trim()
        ? [
            Decoration.mark({ class: segment.className.trim() }).range(
              segment.start,
              segment.start + segment.text.length,
            ),
          ]
        : [],
    )
    const active = props.feedback?.source === props.source ? props.feedback.spans : []
    const decorations: DecorationSet = Decoration.set(
      [
        ...marks,
        ...active.map((span) => Decoration.mark({ class: 'cm-event' }).range(span.start, span.end)),
      ],
      true,
    )
    view.dispatch({
      effects: styling.current.reconfigure([
        EditorView.decorations.of(decorations),
        EditorView.contentAttributes.of({ 'aria-invalid': String(props.invalid) }),
      ]),
    })
    view.dispatch(
      setDiagnostics(
        view.state,
        props.error
          ? [
              {
                from: Math.min(props.error.offset, view.state.doc.length),
                to: Math.min(props.error.offset + 1, view.state.doc.length),
                severity: 'error',
                message: props.error.message,
              },
            ]
          : [],
      ),
    )
  })
  return <div ref={host} className="editor-spike" />
}
