// Shared browser-suite adapter: inspect the public editor state, including virtualized text.
import { EditorView } from '@codemirror/view'
import { Text } from '@codemirror/state'
import { foldedRanges } from '@codemirror/language'

export function editorView() {
  const content = document.querySelector('.cm-content')
  const view = content && EditorView.findFromDOM(content)
  if (!view) throw new Error('Source editor has not mounted')
  return view
}
export const editorDecorations = () => editorView().state.facet(EditorView.decorations)
export const editorSource = () => editorView().state.doc.toString()
export function editorFolds() {
  const state = editorView().state
  const ranges = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to })
  })
  return ranges
}
export function replaceSource(source) {
  const view = editorView()
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: Text.of(source.split('\n')) },
    userEvent: 'input.paste',
  })
}

// Legacy live-edit suites explicitly opt in; application/shortcut suites keep the default.
export function enableAutoApply() {
  const toggle = document.querySelector('.auto-apply input')
  if (!toggle) throw new Error('Auto-apply control has not mounted')
  if (!toggle.checked) toggle.click()
}
