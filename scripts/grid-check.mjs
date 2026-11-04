// In-page source/rack acceptance for the shared nested editor. Native pointer and
// keyboard coverage is in nested-steps-browser.mjs.
import { editorSource, replaceSource, enableAutoApply } from './editor-browser.mjs'
const pause = () => new Promise((resolve) => setTimeout(resolve, 25))
const assert = (value, message) => {
  if (!value) throw new Error(message)
}
const button = (text, root = document) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
async function until(test) {
  for (let n = 0; n < 200; n++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for nested editor')
}
function fill(input, value) {
  const proto =
    input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function load(source) {
  enableAutoApply()
  replaceSource(source)
  await pause()
  await until(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function edit(cell, value) {
  cell.focus()
  await pause()
  cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await until(() => document.querySelector('[aria-label="Cell value"]'))
  const input = document.querySelector('[aria-label="Cell value"]')
  fill(input, value)
  await pause()
  input.form.requestSubmit()
  await pause()
}
export async function verifyGrids() {
  button('Discard saved patch')?.click()
  button('Close library')?.click()
  const { read } = await import('../src/reader/index.ts')
  const { sourceBody, saveLayout } = await import('../src/workspace/document.ts')
  const source = "// keep 🐒\r\n$: note('c2  [e2\t g2]@2 c3').s('sine').lpf(800) /* tail */\r\n"
  await load(source)
  const before = editorSource()
  const e = document.querySelector('.mini-cell[aria-label="Step e2"]')
  e.focus()
  e.blur()
  assert(editorSource() === before, 'Focus rewrote source')
  await edit(e, 'f2')
  await until(() => sourceBody(editorSource()) === source.replace('e2', 'f2'))
  assert(read(editorSource()).layout === 'restored', 'Nested edit lost saved identity')
  await load(source.replace('e2', 'a2'))
  assert(document.querySelector('.mini-cell[aria-label="Step a2"]'), 'Code edit left stale cell')
  button('Text mode', document.querySelector('.step-editor')).click()
  await until(() => document.querySelector('[aria-label="Step notation"]'))
  const input = document.querySelector('[aria-label="Step notation"]')
  fill(input, '<3@3 4 5 @3 6>*2')
  await pause()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await until(() => document.querySelector('.mini-editor .mini-cell'))
  assert(
    !document.querySelector('[aria-label="Step notation"]'),
    'Chosen constructs fell back to whole text',
  )
  await load("// beat\n$: s('[bd ~]*4, [~ hh]*4').degradeBy(.1).bank('RolandTR808')\n")
  assert(document.querySelectorAll('.mini-row-name').length === 2, 'Drum lanes missing')
  assert(
    document.querySelectorAll('.mini-ghost').length > 0,
    'Whole-row repetition has no ghost copies',
  )
  const rest = document.querySelector('[data-module="drums1"] .mini-rest')
  const drumBefore = sourceBody(editorSource())
  rest.click()
  await pause()
  rest.click()
  await until(() => sourceBody(editorSource()) !== drumBefore)
  const d = read(editorSource()),
    saved = saveLayout(d)
  assert(
    JSON.stringify(read(saved.source).patch) === JSON.stringify(d.patch),
    'Drum edit lost identity',
  )
  assert(
    sourceBody(editorSource()).includes("degradeBy(.1).bank('RolandTR808')"),
    'Drum toggle changed suffix',
  )
  button('+ Voice', document.querySelector('.grid-editor')).click()
  await until(() => document.querySelectorAll('.mini-row-name').length === 3)
  assert(read(editorSource()).layout === 'restored', 'Silent + Voice did not persist')
  assert(
    document.querySelector('.transport-status').textContent === 'Ready',
    'Grid proof started audio',
  )
  return [
    'Nested source edits preserve every other byte, quote, CRLF and saved identity',
    'External source refresh and whole text Enter return to the nested editor',
    'Drum ghosts, second-click toggle and silent + Voice preserve suffix and saved identity',
  ]
}
