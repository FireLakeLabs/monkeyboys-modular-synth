// Real browser acceptance for #132. Invoke prepare, Play once, then verify forms.
import { CHORD_SOURCE, PATTERN_FORMS } from '../src/modules/pattern-time.fixtures.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { parseSource } from '../src/reader/syntax.ts'
import { saveLayout, sourceBody } from '../src/workspace/document.ts'
import { enableAutoApply, editorSource } from './editor-browser.mjs'
import { load, inspectCables } from './rack-feel-check.mjs'
import * as web from '@strudel/web'

const start =
  'note("<[c3,eb3,g3] [d3,f3,a3] [e3,g3,b3] [f3,a3,c4]> [g3,b3,d4] [a3,c4,e4] [b3,d4,f4]").s("sine")'
const forms = [
  ...PATTERN_FORMS.map((form) => ({ ...form, expression: start + form.call })),
  { type: 'chord', call: '.voicing()', expression: CHORD_SOURCE + '.arp("0 1 2 1").s("sine")' },
  ...['.arp("0 1 2 1")', '.hurry(8)'].map((tail) => ({
    type: 'clock',
    call: '.swingBy(0,4)' + tail,
    expression: CHORD_SOURCE + '.s("sine").swingBy(0,4)' + tail,
  })),
]
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let i = 0; i < 200; i++) {
    if (test()) return
    await pause(50)
  }
  throw new Error('Timed out waiting for transport')
}
let captured
let original
export async function preparePatternProof() {
  enableAutoApply()
  original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(this, callback, dominant)
  }
  await load('$: note("c3*4").s("sine").gain(0.1)\n')
  return { forms: forms.length, userGesture: 'Play' }
}
function events(expression) {
  // Only the committed example matrix is evaluated; no user source enters this helper.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(web),
    `return (${expression}).queryArc(0,4).filter(h=>h.hasOnset()).map(h=>{
    const {orbit,...value}=h.value;
    return {value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}
  })`,
  )
  return run(...Object.values(web)).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )
}
export async function verifyPatternForm(index) {
  const form = forms[index]
  assert(form && original, 'Prepare proof first, then choose a valid form')
  const stop = document.querySelector('.topbar .play[aria-label=Stop]')
  if (stop) stop.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  const source = `setcpm(180/4)\n$: ${form.expression}.gain(0.1)\n`
  await load(source)
  assert(sourceBody(editorSource()) === source, `${form.call}: changed imported source`)
  const documentBefore = read(editorSource())
  const module = documentBefore.patch.modules.find((m) => m.type === form.type)
  assert(module, `${form.call}: missing module`)
  const saved = saveLayout(documentBefore)
  assert(
    JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    `${form.call}: saved identity`,
  )
  const generated = generate(saved.patch)
  const scope = parseSource(generated).scopes.find((s) => s.kind === 'voice')
  assert(scope, 'Missing generated voice')
  const expected = events(form.expression + '.gain(0.1)')
  assert(expected.length > 0, `${form.call}: empty events`)
  assert(
    JSON.stringify(events(generated.slice(scope.start, scope.end))) === JSON.stringify(expected),
    `${form.call}: regenerated events differ`,
  )
  document.querySelector('.topbar .play[aria-label=Play]').click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Playing')
  await pause(250)
  const context = web.getAudioContext()
  const output = web.getSuperdoughAudioController().output.destinationGain
  const analyser = context.createAnalyser()
  output.connect(analyser)
  let energy = 0
  let samples = 0
  try {
    for (let i = 0; i < 60; i++) {
      const frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      for (const value of frame) energy += value * value
      samples += frame.length
      await pause(30)
    }
  } finally {
    output.disconnect(analyser)
  }
  const pcm = { rms: Math.sqrt(energy / samples), samples }
  assert(pcm.rms > 0.0001, `${form.call}: silent PCM ${pcm.rms}`)
  assert(captured.queryArc(0, 4).length > 0, `${form.call}: no scheduled pattern events`)
  assert(sourceBody(editorSource()) === source, `${form.call}: playback changed source`)
  const cables = inspectCables()
  return {
    type: form.type,
    call: form.call,
    events: expected.length,
    ...pcm,
    cables: cables.cables,
    sourceExact: true,
    savedIdentity: true,
    eventRoundTrip: true,
  }
}
export async function finishPatternProof() {
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  web.Pattern.prototype.onTrigger = original
  return { stopped: true, physicalListening: false }
}
