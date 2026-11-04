// Run in the shared preview at desktop and mid widths. No audio starts here.
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { looksFor } from '../src/modules/looks.ts'
import { starterPatch, placeModule, connect } from '../src/rack/model.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { editorSource, enableAutoApply, replaceSource } from './editor-browser.mjs'
import { inspectCables } from './rack-feel-check.mjs'

const pause = () => new Promise((resolve) => setTimeout(resolve, 40))
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for output panel')
}
function button(text) {
  const element = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text,
  )
  assert(element, `Missing ${text}`)
  return element
}
function choose(selector, value) {
  const input = document.querySelector(selector)
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
async function load(patch) {
  enableAutoApply()
  const source = generate(patch)
  replaceSource(source)
  await until(() => editorSource() === source && document.querySelector('[data-module="osc1"]'))
  await until(
    () => JSON.parse(localStorage.getItem('monkeyboy.workspace.v1') ?? 'null')?.source === source,
  )
  await until(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  await pause()
}
export function fixture(look = 'instrument', sourceRow = 2) {
  let patch = starterPatch(104)
  patch = placeModule(patch, 'mix', 1, 0, 'mix1')
  patch = placeModule(patch, 'seq', sourceRow, 50)
  patch = placeModule(patch, 'osc', sourceRow, 62)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'out1', jack: 'in' }, true)
  patch.modules = patch.modules.map((m) => (m.type === 'out' ? { ...m, look } : m))
  patch.rows = 3
  return patch
}
export async function verifyOutputPanel() {
  if (document.querySelector('.workspace').dataset.rackFocus === 'true')
    button('Restore workspace').click()
  const originalView = document.querySelector('.workspace').dataset.view
  const results = []
  for (const [index, look] of looksFor('hardware').entries()) {
    await load(fixture(look, index % 3))
    choose('[aria-label="Rack zoom"]', '1.5')
    await pause()
    const output = document.querySelector('.output-panel [data-module="out1"]')
    const scroller = document.querySelector('.rack-scroll')
    assert(!scroller.contains(output), 'OUT still occupies a rail')
    assert(output.querySelectorAll('.numeric-control').length === 2, 'Missing BPM or VOL')
    assert(output.querySelector('[data-jack="out1:in"]'), 'Missing OUT IN')
    assert(!output.querySelector('.module-header').draggable, 'OUT can be dragged')
    const before = output.getBoundingClientRect().toJSON()
    const source = editorSource()
    scroller.scrollTo({ left: 300, top: 350 })
    await pause()
    const after = output.getBoundingClientRect().toJSON()
    assert(before.x === after.x && before.y === after.y, 'OUT moved with rail scroll')
    assert(
      scroller.scrollLeft > 0 && scroller.scrollTop > 0,
      'Both rail scroll axes were not exercised',
    )
    results.push({
      look,
      sourceRow: index % 3,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      ...inspectCables(),
    })
    button('Fit rack').click()
    await pause()
    assert(
      scroller.scrollWidth <= scroller.clientWidth + 1 &&
        scroller.scrollHeight <= scroller.clientHeight + 1,
      'Fit rack clips rails',
    )
    inspectCables()
    assert(editorSource() === source, 'Zoom or scroll wrote source')
    button('Focus rack').click()
    await pause()
    assert(
      document.querySelector('.library').getBoundingClientRect().width === 0,
      'Focus retains palette',
    )
    assert(
      document.querySelector('.code').getBoundingClientRect().width === 0,
      'Focus retains code',
    )
    const focusBounds = output.getBoundingClientRect().toJSON()
    const frameBounds = document.querySelector('.rack-frame').getBoundingClientRect()
    assert(frameBounds.height < innerHeight, 'Focused frame grew beyond the window')
    choose('[aria-label="Rack zoom"]', '1.5')
    await pause()
    scroller.scrollTo({ left: 250, top: 600 })
    await pause()
    const focusedAfter = output.getBoundingClientRect()
    assert(scroller.scrollTop > 0, 'Focused rails did not scroll internally')
    assert(
      focusedAfter.top >= 0 && focusedAfter.bottom <= innerHeight,
      'Focused OUT left the viewport',
    )
    assert(focusBounds.y === focusedAfter.y, 'OUT moved during focused rail scrolling')
    inspectCables()
    button('Restore workspace').click()
    await pause()
    assert(
      document.querySelector('.workspace').dataset.view === originalView,
      'Focus lost prior view',
    )
    assert(editorSource() === source, 'Focus changed source')
  }
  choose('[aria-label="Rail width"]', '84')
  await until(() => read(editorSource()).patch.railHp === 84)
  const patch = read(editorSource()).patch
  assert(patch.modules.find((m) => m.id === 'osc1').hp === 62, 'Width change reflowed module')
  const source = editorSource()
  choose('[aria-label="Rail width"]', '64')
  await pause()
  assert(editorSource() === source, 'Invalid width reduction changed source')
  assert(
    document.querySelector('[aria-label="Rail width"]').value === '84',
    'Rejected width not restored',
  )
  const vol = document.querySelector('.output-panel [role="slider"][aria-label="VOL"]')
  vol.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  await until(
    () => read(editorSource()).patch.modules.find((m) => m.type === 'out').values.vol === 0.75,
  )
  assert(sourceBody(editorSource()) === sourceBody(source), 'VOL rewrote executable source')
  const bpm = document.querySelector('.output-panel [role="slider"][aria-label="BPM"]')
  bpm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  await until(() => sourceBody(editorSource()).includes('setcpm(122/4)'))
  assert(
    document.querySelector('.header-tempo [aria-label="Set BPM"]').textContent.trim() === '122',
    'Header tempo did not follow OUT',
  )
  return {
    results,
    width: 84,
    rejectedWidth: 64,
    vol: 0.75,
    bpm: 122,
    executableVolumePreserved: true,
  }
}
