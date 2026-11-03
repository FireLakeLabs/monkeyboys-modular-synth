// Run in the app's browser preview with:
// await (await import('/scripts/error-positions-browser.mjs')).checkErrorPositions()
import { editorSource, editorView, replaceSource, enableAutoApply } from './editor-browser.mjs'
import { read } from '../src/reader/index.ts'
import { saveLayout } from '../src/workspace/document.ts'

export async function checkErrorPositions() {
  const checks = []
  const assert = (value, message) => {
    if (!value) throw new Error(message)
  }
  async function until(predicate) {
    const deadline = performance.now() + 5000
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Timed out waiting for editor state')
      await new Promise(requestAnimationFrame)
    }
  }
  const markers = () => [...document.querySelectorAll('.source-error-marker')]
  const alert = () => document.querySelector('[role=alert]')?.textContent ?? ''
  const accepted = () =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code')
  const revert = async (source) => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === 'Revert to last readable code',
    )
    assert(button, 'Revert is available')
    button.click()
    await until(() => editorSource() === source && accepted())
    assert(markers().length === 0 && !alert(), 'Revert clears the diagnostic and marker')
  }
  const restore = [...document.querySelectorAll('button')].find(
    (item) => item.textContent === 'Restore last patch',
  )
  if (restore) {
    restore.click()
    await until(() => !document.querySelector('[role=dialog]'))
  }
  await until(() => document.querySelector('.cm-content'))
  enableAutoApply()
  const body = `setcpm(30)\n\n$: note("c2 c2 eb2 g2 c3 bb2 g2 eb2")\n  .s("sawtooth")\n  .lpf(sine\n  .slow(4)\n  .range(800, 2400))\n  .lpq(8)\n  .postgain(0.8)\n  .orbit(1)\n`
  const original = saveLayout(read(body)).source
  replaceSource(original)
  await until(
    () =>
      accepted() &&
      editorSource() === original &&
      JSON.parse(localStorage.getItem('monkeyboy.workspace.v1'))?.source === original,
  )
  const rack = () =>
    [...document.querySelectorAll('[data-module]')].map((panel) => ({
      id: panel.dataset.module,
      values: [...panel.querySelectorAll('input, select, textarea')].map(
        (control) => control.value,
      ),
    }))
  const originalRack = JSON.stringify(rack())
  const opener = original.indexOf('.lpq(8') + 4
  editorView().dispatch({
    changes: { from: opener + 2, to: opener + 3 },
    userEvent: 'delete.backward',
  })
  const invalid = editorSource()
  await until(() => alert().startsWith('Line 8, column 7:') && markers().length === 1)
  assert(markers()[0].title.includes("Unclosed '('"), 'Opener diagnosis names the missing bracket')
  const line = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find(
    (item) => item.textContent === '8',
  )
  assert(
    line && Math.abs(line.getBoundingClientRect().y - markers()[0].getBoundingClientRect().y) < 4,
    'Gutter marker aligns with line 8',
  )
  assert(document.querySelectorAll('.cm-foldPlaceholder').length === 1, 'Metadata stays folded')
  const saved = JSON.parse(localStorage.getItem('monkeyboy.workspace.v1'))
  assert(
    saved.source === original && saved.draft === invalid,
    'Invalid draft retains the accepted file and exact draft',
  )
  assert(
    JSON.stringify(rack()) === originalRack,
    'Displayed rack module IDs and control values are retained',
  )
  checks.push(
    'Issue #65 voice: missing lpq closer reports line 8 and its opener column, with an aligned gutter marker; saved rack/source and exact draft are retained',
  )
  await revert(original)
  checks.push('Revert restores the exact last readable file and clears the marker')

  const position = original.indexOf('.lpq(8') + 5
  editorView().dispatch({
    changes: { from: position, to: position + 1, insert: ',' },
    userEvent: 'input.type',
  })
  await until(() => alert().startsWith('Line 8, column 8:') && markers().length === 1)
  assert(markers()[0].title.includes('Unexpected token'), 'Other syntax errors keep their token')
  checks.push('Balanced-bracket syntax errors retain their exact code token and gutter marker')
  editorView().dispatch({
    changes: { from: position, to: position + 1, insert: '8' },
    userEvent: 'input.type',
  })
  assert(markers().length === 0, 'Input clears a stale marker synchronously')
  await until(accepted)
  checks.push('Correcting a draft clears stale markers immediately and accepts the readable code')

  const marker = '// ── @monkeyboy rack v1 ──'
  const tricky = `const marker = ${JSON.stringify(marker + ' [')};\nconst template = \`( [ \${1 + 2}\`;\nconst regex = /[({]/;\n/* [ { */\n$: note(\n"c3"\n\n${marker}\n// {"version":999}\n`
  replaceSource(tricky)
  await until(() => alert().startsWith('Line 5, column 8:') && markers().length === 1)
  assert(
    document.querySelectorAll('.cm-foldPlaceholder').length === 1,
    'Only actual trailing metadata folds',
  )
  checks.push(
    'Marker-like strings and literal/comment brackets do not steal the metadata boundary or opener diagnosis',
  )

  const { unfoldEffect } = await import('@codemirror/language')
  const { editorFolds } = await import('./editor-browser.mjs')
  editorView().dispatch({ effects: editorFolds().map((range) => unfoldEffect.of(range)) })
  const numbers = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .map((item) => item.textContent)
    .filter(Boolean)
  assert(numbers.join(',') === '1,2,3,4,5,6,7', 'Unfolded metadata lines have no numbers')
  checks.push('Line numbers cover code only, including when metadata is unfolded')

  replaceSource('$: note(')
  assert(
    markers().length === 0,
    'Shortening the document clears its old diagnostic without a range error',
  )
  await until(() => alert().startsWith('Line 1, column 8:') && markers().length === 1)
  await revert(original)
  checks.push(
    'Shortening an invalid draft updates its marker safely; Revert still restores the accepted file',
  )
  return { userAgent: navigator.userAgent, checks, physicalListening: false }
}
