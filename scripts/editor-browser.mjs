// Shared browser-suite adapter: inspect the public editor state, including virtualized text.
import { EditorView } from '@codemirror/view'
import { Text } from '@codemirror/state'

export function editorView() {
  const content = document.querySelector('.cm-content')
  const view = content && EditorView.findFromDOM(content)
  if (!view) throw new Error('Source editor has not mounted')
  return view
}
export const editorDecorations = () => editorView().state.facet(EditorView.decorations)
export const editorSource = () => editorView().state.doc.toString()
export function replaceSource(source) {
  const view = editorView()
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: Text.of(source.split('\n')) },
    userEvent: 'input',
  })
}
