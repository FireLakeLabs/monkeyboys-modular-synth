import { expectedExport } from './editor-browser.mjs'
// Import from the Vite dev server in the harness browser; no audio is started.
import { editorSource, replaceSource } from './editor-browser.mjs'
import { libraryPatches } from '../src/library/catalog.ts'
import { read } from '../src/reader/index.ts'
import { sourceBody } from '../src/workspace/document.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function until(condition) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for patch name UI')
}
const nameInput = () => document.querySelector('[aria-label="Patch name"]')
function button(label, root = document) {
  const target = [...root.querySelectorAll('button')].find(
    (element) => element.textContent.trim() === label,
  )
  if (!target) throw new Error(`Missing button: ${label}`)
  return target
}
async function rename(name, key = 'Enter') {
  const input = nameInput()
  input.focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  if (key) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  else input.blur()
  await new Promise(requestAnimationFrame)
}
async function open(source, filename = 'externally-renamed.strudel') {
  document.querySelector('.workspace-notice-dismiss')?.click()
  const input = document.querySelector('input[type="file"]')
  const transfer = new DataTransfer()
  transfer.items.add(new File([source], filename, { type: 'text/plain' }))
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => document.querySelector('.workspace-notice')?.textContent.includes(filename))
  await until(() => document.querySelector('.sync-status').textContent.startsWith('Rack matches'))
}
async function exported() {
  let blob, filename
  const create = URL.createObjectURL.bind(URL)
  // oxlint-disable-next-line typescript/unbound-method -- Restore the original prototype method below.
  const click = HTMLAnchorElement.prototype.click
  URL.createObjectURL = (value) => {
    blob = value
    return create(value)
  }
  HTMLAnchorElement.prototype.click = function () {
    filename = this.download
  }
  try {
    button('Export').click()
    assert(blob, 'Export did not produce a file')
    return { source: await blob.text(), filename }
  } finally {
    URL.createObjectURL = create
    HTMLAnchorElement.prototype.click = click
  }
}

export async function verifyPatchNames() {
  const checks = []
  assert(nameInput().value === 'Untitled patch', 'Starter is not unnamed')
  const initial = editorSource()
  const recovery = localStorage.getItem('monkeyboy.workspace.v1')
  await rename('Cancelled unnamed title', 'Escape')
  assert(editorSource() === initial, 'Escape changed an unnamed file')
  assert(button('Undo').disabled, 'Escape added unnamed history')
  assert(localStorage.getItem('monkeyboy.workspace.v1') === recovery, 'Escape changed recovery')
  await rename('Café / lead ☀')
  const saved = editorSource()
  assert(sourceBody(saved) === sourceBody(initial), 'Rename changed executable code')
  assert(read(saved).patch.name === 'Café / lead ☀', 'Rename was not saved')
  button('Undo').click()
  await until(() => nameInput().value === 'Untitled patch')
  button('Redo').click()
  await until(() => nameInput().value === 'Café / lead ☀')
  await rename('Cancelled', 'Escape')
  assert(editorSource() === saved, 'Escape committed a rename')
  const download = await exported()
  assert(download.filename === 'Café - lead ☀.strudel', 'Wrong export filename')
  assert(download.source === expectedExport(saved), 'Export changed saved source')
  checks.push('Enter, Escape, Undo/Redo and sanitized Unicode export retain exact saved source')

  await rename('Other patch', null)
  await open(saved)
  assert(nameInput().value === 'Café / lead ☀', 'Open used filename instead of metadata')
  assert(editorSource() === saved, 'Open changed saved file')
  assert(
    JSON.stringify(read(editorSource()).patch) === JSON.stringify(read(saved).patch),
    'Open lost rack identity',
  )
  checks.push(
    'Blur commits; Open restores exact source/rack/name despite a different external filename',
  )

  await open(initial)
  assert(nameInput().value === 'Untitled patch', 'Old unnamed file inherited previous name')
  await rename('   ')
  assert((await exported()).filename === 'Untitled patch.strudel', 'Blank name has no fallback')
  button('New patch').click()
  await until(() => document.querySelectorAll('.module-panel').length === 2)
  assert(nameInput().value === 'Untitled patch', 'New inherited old name')
  checks.push('Older unnamed files, blank titles and New use Untitled patch')

  for (const entry of libraryPatches()) {
    button('Patch library').click()
    await until(() => document.querySelector('.patch-library')?.open)
    const library = document.querySelector('.patch-library')
    button(entry.title, library).click()
    await until(() => library.querySelector('h3')?.textContent === entry.title)
    button('Load patch', library).click()
    await until(
      () => !document.querySelector('.patch-library') || library.querySelector('.replace-prompt'),
    )
    if (document.querySelector('.patch-library')) button('Load patch', library).click()
    await until(() => !document.querySelector('.patch-library'))
    assert(nameInput().value === entry.title, `${entry.id}: header title missing`)
    assert(read(editorSource()).patch.name === entry.title, `${entry.id}: saved title missing`)
    assert(
      sourceBody(editorSource()) === sourceBody(entry.source),
      `${entry.id}: executable changed`,
    )
    assert(
      document.querySelector('.transport-status').textContent === 'Ready',
      `${entry.id}: autoplay`,
    )
  }
  checks.push('All 14 library entries use their title, preserve executable bytes and stay stopped')

  const accepted = editorSource()
  replaceSource('$: note(')
  await until(() => nameInput().disabled)
  assert((await exported()).source === '$: note(', 'Invalid draft export changed')
  button('Revert to last readable code').click()
  await until(() => !nameInput().disabled)
  assert(editorSource() === accepted, 'Revert lost named accepted source')
  await rename('Recovery sketch')
  const stored = JSON.parse(localStorage.getItem('monkeyboy.workspace.v1'))
  assert(read(stored.source).patch.name === 'Recovery sketch', 'Recovery lost name')
  checks.push(
    'Draft guard/export/revert preserve the name; recovery stores the complete named file',
  )
  return { browser: navigator.userAgent, checks }
}
