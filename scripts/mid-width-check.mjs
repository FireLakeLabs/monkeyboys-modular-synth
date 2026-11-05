// Run in a Vite page at 1024×768 and 900×768:
// (await import('/scripts/mid-width-check.mjs')).verifyMidWidth()
// This checks real layout/editor behavior without starting audio.
import { editorSource, editorView, enableAutoApply, typeAt } from './editor-browser.mjs'
import { inspectCables, loadEnveloped } from './rack-feel-check.mjs'

function assert(value, message) {
  if (!value) throw new Error(message)
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 50))
async function until(test) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for workspace')
}
const rect = (selector) => document.querySelector(selector).getBoundingClientRect()
const visible = (selector) => rect(selector).width > 0 && rect(selector).height > 0
async function view(name) {
  const button = [...document.querySelectorAll('.workspace-views button')].find(
    (item) => item.textContent === name,
  )
  assert(button, `Missing ${name} view control`)
  button.click()
  await until(() => button.getAttribute('aria-pressed') === 'true')
  await pause()
}
function inViewport(selector) {
  const box = rect(selector)
  assert(
    box.width > 0 &&
      box.height > 0 &&
      box.top >= 0 &&
      box.bottom <= innerHeight + 1 &&
      box.left >= 0 &&
      box.right <= innerWidth + 1,
    `${selector} is outside the viewport`,
  )
}
export function inspectLayout() {
  assert(document.documentElement.scrollHeight <= innerHeight + 1, 'Workspace needs page scrolling')
  assert(document.documentElement.scrollWidth <= innerWidth + 1, 'Workspace overflows page width')
  for (const selector of ['.workspace-views', '.library', '.rack', '.code', '.source-surface'])
    inViewport(selector)
  assert(
    Math.abs(rect('.rack').top - rect('.code').top) < 1,
    'Rack/code are not alongside each other',
  )
  const palette = document.querySelector('.library')
  assert(palette.scrollWidth > palette.clientWidth, 'Palette is not a horizontal strip')
  assert(palette.scrollHeight <= palette.clientHeight + 1, 'Palette needs vertical scrolling')
  return {
    width: innerWidth,
    height: innerHeight,
    pageHeight: document.documentElement.scrollHeight,
  }
}
async function showInCode() {
  const panel = document.querySelector('[data-module="osc1"]')
  panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 300 }))
  await until(() => document.querySelector('.module-menu'))
  const button = [...document.querySelectorAll('.module-menu button')].find(
    (item) => item.textContent.trim() === 'Show in code',
  )
  assert(button, 'Missing Show in code')
  button.click()
  await until(() => editorView().hasFocus && visible('.code'))
  const selection = editorView().state.selection.main
  assert(
    editorSource().slice(selection.from, selection.to).includes('.s("sawtooth")'),
    'Wrong source selected',
  )
  assert(document.querySelector('.source-selected'), 'Source highlight missing')
  return { from: selection.from, to: selection.to }
}
export async function verifyMidWidth() {
  assert(innerWidth >= 900 && innerWidth <= 1150, 'Use a 900–1150px viewport')
  enableAutoApply()
  await loadEnveloped()
  await view('Both')
  const layout = inspectLayout()
  document.querySelector('.rack-zoom button').click()
  await pause()
  const before = editorSource()
  for (const mode of ['Both', 'Rack']) {
    await view(mode)
    inViewport('.rack-scroll')
    inspectCables()
    const header = document.querySelector('[aria-label="Select osc1"]')
    header.click()
    await pause()
    assert(header.getAttribute('aria-pressed') === 'true', `${mode}: selection missing`)
    await showInCode()
    if (mode === 'Rack') assert(!visible('.rack'), 'Show in code did not open Code view')
    else assert(visible('.rack'), 'Show in code unexpectedly hid Both view')
    await view('Rack')
    assert(document.querySelector('[data-module="osc1"].selected'), 'Rack selection lost')
    await view('Code')
    assert(document.querySelector('.source-selected'), 'Code selection lost')
    inViewport('.source-surface')
  }
  assert(editorSource() === before, 'View changes rewrote source or saved rack state')
  // An unfinished draft and its local undo must survive hidden panes as well.
  const toggle = document.querySelector('.auto-apply input')
  toggle.click()
  await pause()
  const draft = `unfinished.dra\n${before}`
  typeAt(0, 'unfinished.dra\n')
  await until(() => document.querySelector('.sync-status').textContent === 'Unapplied changes')
  const selection = editorView().state.selection.main
  await view('Rack')
  await view('Code')
  assert(editorSource() === draft, 'Switching views lost the draft')
  assert(editorView().state.selection.main.eq(selection), 'Switching views lost cursor selection')
  const { undo } = await import('@codemirror/commands')
  assert(undo(editorView()), 'Draft undo was lost')
  assert(editorSource() === before, 'Draft undo did not restore original source')
  await until(() =>
    document.querySelector('.sync-status').textContent.startsWith('Rack matches code'),
  )
  await view('Both')
  return {
    ...layout,
    selection: 'rack and code preserved',
    showInCode: 'Both and Rack passed',
    draft: 'preserved with undo',
    cables: inspectCables(),
  }
}
