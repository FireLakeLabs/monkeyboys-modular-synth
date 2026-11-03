// Run in the Vite page with: (await import('/scripts/grid-check.mjs')).verifyGrids().
// No audio is started. The real controls drive all source mutations.
import { editorSource, replaceSource, enableAutoApply } from './editor-browser.mjs'

const pause = () => new Promise((resolve) => setTimeout(resolve, 25))
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for grid UI')
}
const button = (text, root = document) =>
  [...root.querySelectorAll('button')].find((node) => node.textContent.trim() === text)
const input = (label) => document.querySelector(`[aria-label="${label}"]`)
function fill(node, value) {
  assert(node, 'Missing field')
  node.focus()
  const prototype =
    node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value)
  node.dispatchEvent(new Event('input', { bubbles: true }))
}
function enter(node) {
  node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}
async function load(source) {
  enableAutoApply()
  replaceSource(source)
  await pause()
  await until(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}

export async function verifyGrids() {
  button('Discard saved patch')?.click()
  button('Close library')?.click()
  await pause()
  await until(() => document.querySelector('.cm-content'))
  const { read } = await import('../src/reader/index.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  const results = []
  const source =
    "// keep 🐒\r\n$: note('c2 c2 eb2 g2 c3 bb2 g2 eb2').s('sine').lpf(800) /* tail */\r\n"
  await load(source)
  await until(() => input('Step 1'))
  assert(!input('Step notation'), 'Plain source opened text mode')
  const beforeFocus = editorSource()
  input('Step 1').focus()
  input('Step 1').blur()
  assert(editorSource() === beforeFocus, 'Unchanged step blur rewrote source')
  fill(input('Step 1'), 'd2')
  input('Step 1').blur()
  await until(() => editorSource().includes('d2 c2 eb2'))
  assert(
    sourceBody(editorSource()) ===
      source.replace("'c2 c2 eb2 g2 c3 bb2 g2 eb2'", '"d2 c2 eb2 g2 c3 bb2 g2 eb2"'),
    'SEQ changed surrounding source',
  )
  let doc = read(editorSource())
  assert(doc.layout === 'restored', 'SEQ save did not reopen')
  results.push(
    'Imported SEQ shows 16 cells; grid edit preserves surrounding CRLF/comments/quotes and reopens',
  )

  // Code edits must refresh the existing fields, not leave their old defaultValue.
  await load(editorSource().replace('d2 c2 eb2', 'e2 c2 eb2').replace('lpf(800)', 'lpf(1200)'))
  await until(() => input('Step 1')?.value === 'e2')
  assert(document.querySelector('.step-editor'), 'Sibling code edit lost SEQ grid')
  const beforeView = editorSource()
  button('Text mode', document.querySelector('.step-editor')).click()
  await until(() => input('Step notation'))
  assert(editorSource() === beforeView, 'Text mode changed source')
  assert(!button('Apply', input('Step notation').parentElement), 'Notation retained Apply button')
  fill(input('Step notation'), '<3@3 4 5 @3 6>*2')
  enter(input('Step notation'))
  await until(() => editorSource().includes('<3@3'))
  assert(
    input('Step notation').parentElement.textContent.includes('cannot show'),
    'Missing fallback explanation',
  )
  fill(input('Step notation'), 'c3 e3 g3')
  input('Step notation').blur()
  await until(() => input('Step 1')?.value === 'c3')
  results.push(
    'Code edits refresh grid cells; Text mode is presentation-only; Enter applies complex notation with a reason; blur restores plain grid',
  )

  await load(
    "// beat\r\n$: s('[bd ~]*4, [~ hh]*4').degradeBy(.1) /* keep */.bank('RolandTR808')\r\n",
  )
  await until(() => input('bd step 1'))
  const beforeSampleFocus = editorSource()
  input('Sample 1').focus()
  input('Sample 1').blur()
  assert(editorSource() === beforeSampleFocus, 'Unchanged sample blur rewrote source')
  const drumBefore = sourceBody(editorSource())
  input('bd step 8').click()
  await until(() => input('bd step 8')?.getAttribute('aria-pressed') === 'true')
  assert(
    sourceBody(editorSource()) ===
      drumBefore.replace("'[bd ~]*4, [~ hh]*4'", '"bd ~ bd ~ bd ~ bd bd, [~ hh]*4"'),
    'DRUMS changed surrounding source',
  )
  doc = read(editorSource())
  assert(doc.layout === 'restored', 'DRUMS save did not reopen')
  await load(editorSource().replace('degradeBy(.1)', 'degradeBy(.2)'))
  await until(() => input('bd step 8'))
  button('+ Voice', document.querySelector('.grid-editor')).click()
  await until(() => input('Sample 3'))
  assert(read(editorSource()).layout === 'restored', 'Silent new drum voice did not save')
  button('Text mode', document.querySelector('.grid-editor')).click()
  await until(() => input('Drum notation'))
  fill(input('Drum notation'), 'bd*8, hh*8')
  enter(input('Drum notation'))
  await until(() => input('hh step 8')?.getAttribute('aria-pressed') === 'true')
  button('Text mode', document.querySelector('.grid-editor')).click()
  await until(() => input('Drum notation'))
  fill(input('Drum notation'), 'bd(3,8)')
  input('Drum notation').blur()
  await until(() => editorSource().includes('bd(3,8)'))
  assert(
    input('Drum notation').parentElement.textContent.includes('cannot show'),
    'Missing drum reason',
  )
  results.push(
    'Imported DRUMS repetitions show grid; toggles preserve surrounding source; sibling edits retain grid; silent + Voice persists; Enter/blur apply and explain fallback',
  )

  button('Patch library').click()
  await until(() => button('909 drum machine'))
  button('909 drum machine').click()
  await until(() => button('Load patch…'))
  button('Load patch…').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Load patch').click()
  await until(() => !document.querySelector('.patch-library') && input('bd step 1'))
  assert(!input('Drum notation'), 'Library DRUMS loaded text mode')
  await load(editorSource().replace('degradeBy(0.1)', 'degradeBy(0.2)'))
  await until(() => input('bd step 1'))
  results.push('Library DRUMS shows grid before and after code edit')

  button('Patch library').click()
  await until(() => button('Enveloped synth'))
  button('Enveloped synth').click()
  await until(() => button('Load patch…'))
  button('Load patch…').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Load patch').click()
  await until(() => !document.querySelector('.patch-library') && input('Step 1'))
  assert(!input('Step notation'), 'Library SEQ loaded text mode')
  await load(editorSource().replace('.lpf(900)', '.lpf(1200)'))
  await until(() => input('Step 1'))
  assert(document.querySelector('.step-editor'), 'Library code edit lost grid')
  results.push('Library SEQ shows grid before and after code edit')
  assert(
    document.querySelector('.transport-status').textContent === 'Ready',
    'Grid checks started audio',
  )
  return results
}
