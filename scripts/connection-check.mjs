// Import from the Vite dev server in a browser; no audio is started.
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
  throw new Error('Timed out waiting for cable UI')
}
const jack = (key) => document.querySelector(`[data-jack="${key}"]`)
const button = (text) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === text)

const notice = () => document.querySelector('.workspace-notice')?.textContent ?? ''

export async function prepareConnectionFixture() {
  enableAutoApply()
  replaceSource(
    "// retain\nconst lead = note('c3').s('sine');\n$: lead.lpf(800).gain(.2);\n$: lead.gain(.1);\n",
  )
  await pause()
  await until(() => document.querySelector('.sync-status').textContent === 'Rack matches code')
  document.querySelector('[aria-label="Add LFO"]').click()
  await until(() => jack('lfo1:out'))
}

export async function verifyConnectionTargets() {
  const { read } = await import('../src/reader/index.ts')
  await prepareConnectionFixture()
  const before = editorSource()
  const beforePatch = JSON.stringify(read(before).patch)
  const results = []

  // Pointer path: inspect the target before the drop, then convert with Undo.
  jack('lfo1:out').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  await until(() => jack('vcf1:cv').classList.contains('warning'))
  const target = jack('vcf1:cv')
  target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  await until(() => document.querySelector('[role="tooltip"]'))
  const reason = document.querySelector('[role="tooltip"]').textContent
  assert(reason.includes('rewrites it in rack style'), 'Unclear reason')
  assert(target.title === reason, 'Hover title differs from visible reason')
  assert(editorSource() === before, 'Preview changed source')
  assert(target.classList.contains('warning'), 'Converting target gives no warning')
  const bounds = target.getBoundingClientRect()
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      buttons: 1,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }),
  )
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  await until(() => editorSource() !== before)
  assert(notice().includes('Code rewritten in rack style'), 'Rewrite was not announced')
  button('Undo', document.querySelector('.workspace-notice')).click()
  await until(() => editorSource() === before)
  assert(JSON.stringify(read(editorSource()).patch) === beforePatch, 'Undo left a rack change')
  results.push(
    'Pointer drop warns before converting, says so after, and Undo restores exact source',
  )

  // Keyboard activation uses the same assessment and exposes the reason on focus.
  jack('lfo1:out').focus()
  jack('lfo1:out').click()
  // Undo rebuilt the panels, so find the jack again.
  const retried = jack('vcf1:cv')
  await until(() => retried.classList.contains('warning'))
  retried.focus()
  await until(() => document.querySelector('[role="tooltip"]'))
  assert(document.querySelector('[role="tooltip"]').textContent === reason, 'Focus reason differs')
  assert(retried.getAttribute('aria-describedby') === 'cable-target-hint', 'Missing description')
  retried.click()
  await until(() => editorSource() !== before)
  assert(
    read(editorSource()).patch.cables.some(
      (cable) =>
        cable.from.module === 'lfo1' && cable.to.module === 'vcf1' && cable.to.jack === 'cv',
    ),
    'Conversion did not complete cable',
  )
  results.push('Keyboard focus gives the same reason; conversion completes the cable')

  // A supported imported replacement must stay available and never produce a refusal.
  await prepareConnectionFixture()
  document.querySelector('[aria-label="Add ITER"]').click()
  await until(() => jack('iter1:in'))
  jack('osc1:out').click()
  await until(() => jack('iter1:in').classList.contains('valid'))
  jack('iter1:in').click()
  await until(() => !button('Cancel cable'))
  jack('iter1:out').click()
  await until(() => jack('vcf1:in').classList.contains('valid'))
  const snapshot = editorSource()
  jack('vcf1:in').click()
  await until(() => editorSource() !== snapshot)
  assert(!notice().includes('rewritten'), 'A supported replacement rewrote the code')
  assert(editorSource().includes('// retain'), 'Supported replacement lost comments')
  assert(read(editorSource()).layout === 'restored', 'Replacement lost saved identity')
  results.push('Supported imported replacement stays valid, acts at once, saves and reopens')

  // Type-incompatible inputs still use the graph boundary.
  jack('lfo1:out').click()
  await until(() => jack('vcf1:in').classList.contains('blocked'))
  const validSource = editorSource()
  jack('vcf1:in').click()
  await until(() => !button('Cancel cable'))
  assert(editorSource() === validSource, 'Incompatible drop changed source')
  assert(!notice().includes('rewritten'), 'Incompatible drop converted the code')
  assert(document.querySelector('.transport-status').textContent === 'Ready', 'Audio started')
  results.push('Incompatible target remains blocked; no mutation, conversion or autoplay')
  return results
}
