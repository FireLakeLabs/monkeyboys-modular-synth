// Real browser acceptance for #135. Invoke prepare, Play once, then verify forms.
import { FUNCTION_FORMS } from '../src/modules/function-loops.fixtures.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { parseSource } from '../src/reader/syntax.ts'
import { saveLayout, sourceBody } from '../src/workspace/document.ts'
import { enableAutoApply, editorSource } from './editor-browser.mjs'
import { load, inspectCables } from './rack-feel-check.mjs'
import * as web from '@strudel/web'
const start = 'note("c3 e3 g3 b3").s("sine")'
const forms = [
  ...[
    ['vcf', '.chunk(4,x=>x.FX(lpf(800).lpq(1),lpf(1200).lpq(1)).rev())'],
    [
      'reverb',
      '.chunk(4,x=>x.FX(room(.5).roomsize(4)).FX(delay(.4).delaytime(.375).delayfeedback(.5)))',
    ],
  ].map(([type, call]) => ({ type, call, expression: start + call })),
  ...[
    '.gain(sine.range(.1,.5))',
    '.gain(.4).lfo({c:"gain",sync:.25,depthabs:.2,dc:0,shape:"sine",skew:.5})',
    '.attack(.01).decay(.2).sustain(.5).release(.1).gain(.4)',
    '.gain("<.2 .6>")',
  ].map((body) => ({
    type: 'vca',
    call: `.chunk(4,x=>x${body})`,
    expression: start + `.chunk(4,x=>x${body})`,
  })),
  ...FUNCTION_FORMS.map(([type, call]) => ({ type, call, expression: start + call })),
  {
    type: 'chunk',
    call: '.chunk(4, p => p.color("red").rev())',
    expression: start + '.chunk(4, p => p.color("red").rev())',
  },
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
export async function prepareFunctionProof() {
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
export async function verifyFunctionForm(index) {
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
export async function finishFunctionProof() {
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  web.Pattern.prototype.onTrigger = original
  return { stopped: true, physicalListening: false }
}

export function inspectFunctionUI() {
  const sends = [...document.querySelectorAll('[data-jack$=":send"]')]
  const cables = [...document.querySelectorAll('.cable.signal-function path:not(.cable-shadow)')]
  assert(sends.length > 0 && cables.length > 0, 'Missing function jacks/cables')
  for (const send of sends) {
    assert(
      send.getAttribute('aria-label').includes('function'),
      'Missing accessible function label',
    )
    assert(send.closest('.jack-label').textContent.includes('SEND'), 'Missing SEND role')
    assert(send.title.includes('=>'), 'Hover does not show lambda source')
    assert(getComputedStyle(send, '::after').content.includes('λ'), 'Missing non-colour jack mark')
  }
  for (const cable of cables) {
    assert(
      getComputedStyle(cable).strokeDasharray === '16px, 4px, 3px, 4px',
      'Missing distinct function dash',
    )
    assert(getComputedStyle(cable).stroke === 'rgb(140, 245, 218)', 'Missing Alien teal')
    assert(cable.textContent.includes('=>'), 'Cable hover does not show lambda')
  }
  return {
    sends: sends.map((e) => ({ label: e.getAttribute('aria-label'), source: e.title })),
    cables: cables.length,
    dashed: true,
    teal: true,
    lambdaMarks: true,
  }
}

export async function loadNestedRack() {
  const patch = read(
    '$: note("c3 e3 g3 b3").s("sine").chunk(4,x=>x.off(.125,y=>y.ply(2).rev()).iter(3)).gain(.1)\n',
  ).patch
  await load(generate(patch))
  return { patch, source: editorSource() }
}
export async function currentFunctionRack() {
  const document = read(editorSource())
  assert(document.layout === 'restored', 'Saved rack not restored')
  assert(
    JSON.stringify(read(document.source).patch) === JSON.stringify(document.patch),
    'Reopen identity',
  )
  return {
    patch: document.patch,
    source: editorSource(),
    body: sourceBody(editorSource()),
    ui: inspectFunctionUI(),
    geometry: inspectCables(),
  }
}
