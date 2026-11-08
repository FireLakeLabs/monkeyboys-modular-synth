// Real browser acceptance for #132. Invoke prepare, Play once, then verify forms.
import { SOUND_FORMS } from '../src/modules/sound-effects.fixtures.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { parseSource } from '../src/reader/syntax.ts'
import { saveLayout, sourceBody } from '../src/workspace/document.ts'
import { enableAutoApply, editorSource } from './editor-browser.mjs'
import { load, inspectCables } from './rack-feel-check.mjs'
import * as web from '@strudel/web'

const forms = SOUND_FORMS
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
export async function prepareSoundProof() {
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
export async function verifySoundForm(index, override) {
  const form = override ?? forms[index]
  assert(form && original, 'Prepare proof first, then choose a valid form')
  const stop = document.querySelector('.topbar .play[aria-label=Stop]')
  if (stop) stop.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  const source = `setcpm(180/4)\n$: ${form.expression}.gain(0.1)\n`
  await load(source)
  assert(sourceBody(editorSource()) === source, `${form.expression}: changed imported source`)
  const documentBefore = read(editorSource())
  const module = documentBefore.patch.modules.find((m) => m.type === form.type)
  assert(module, `${form.expression}: missing module`)
  const saved = saveLayout(documentBefore)
  assert(
    JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    `${form.expression}: saved identity`,
  )
  const generated = generate(saved.patch)
  const scope = parseSource(generated).scopes.find((s) => s.kind === 'voice')
  assert(scope, 'Missing generated voice')
  const expected = events(form.expression + '.gain(0.1)')
  assert(expected.length > 0, `${form.expression}: empty events`)
  assert(
    JSON.stringify(events(generated.slice(scope.start, scope.end))) === JSON.stringify(expected),
    `${form.expression}: regenerated events differ`,
  )
  if (form.expression.endsWith('.shape()'))
    return {
      type: form.type,
      expression: form.expression,
      engineLimit:
        'Nullary shape has no numeric amount; pinned-engine runtime fails. Preserved without normalizing.',
      sourceExact: true,
      savedIdentity: true,
      eventRoundTrip: true,
    }
  document.querySelector('.topbar .play[aria-label=Play]').click()
  await until(
    () =>
      ['Playing', 'Audio error'].includes(
        document.querySelector('.transport-status')?.textContent,
      ) || !!document.querySelector('.engine-error'),
  )
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
  assert(
    pcm.rms > 0.0001,
    `${form.expression}: silent PCM ${JSON.stringify({ ...pcm, diagnostics: window.sampleDiagnostics?.() ?? 'unknown', patternEvents: captured?.queryArc(0, 4).length })}`,
  )
  assert(captured.queryArc(0, 4).length > 0, `${form.expression}: no scheduled pattern events`)
  assert(sourceBody(editorSource()) === source, `${form.expression}: playback changed source`)
  const cables = inspectCables()
  return {
    type: form.type,
    call: form.expression,
    events: expected.length,
    ...pcm,
    cables: cables.cables,
    sourceExact: true,
    savedIdentity: true,
    eventRoundTrip: true,
  }
}
export async function finishSoundProof() {
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  web.Pattern.prototype.onTrigger = original
  return { stopped: true, physicalListening: false }
}

export async function verifyPanCV(mode) {
  const { connect, placeModule, setValue, starterPatch } = await import('../src/rack/model.ts')
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  let patch = starterPatch()
  const kind = mode === 'ENV' ? 'env' : mode === 'CV SEQ' ? 'cvseq' : 'lfo'
  for (const [i, type] of ['seq', 'osc', 'pan', kind].entries())
    patch = placeModule(patch, type, i + 1)
  patch = setValue(patch, 'seq1', 'steps', 'c3')
  patch = setValue(patch, 'osc1', 'wave', 'sine')
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'pan1', jack: 'in' })
  patch = connect(patch, { module: 'pan1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  if (kind === 'lfo') {
    patch = setValue(patch, 'lfo1', 'mode', mode)
    patch = setValue(patch, 'lfo1', 'rate', 0.25)
  }
  if (kind === 'env') {
    patch = setValue(patch, 'env1', 'atk', 0.3)
    patch = setValue(patch, 'env1', 'dec', 0.3)
  }
  if (kind === 'cvseq') patch = setValue(patch, 'cvseq1', 'steps', '<0 1>')
  patch = connect(patch, { module: `${kind}1`, jack: 'out' }, { module: 'pan1', jack: 'cv' })
  if (kind !== 'cvseq') patch = setValue(patch, `${kind}1`, 'depth', 0.25)
  const source = generate(patch)
  const identity = (value) =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    )
  assert(identity(read(source).patch) === identity(patch), 'PAN CV rack identity')
  if (mode === 'SMOOTH' || mode === 'ENV')
    assert(source.includes('depthabs: 0.5'), 'PAN CV must double native depth')
  await load(source)
  document.querySelector('.topbar .play[aria-label=Play]').click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Playing')
  const context = web.getAudioContext(),
    output = web.getSuperdoughAudioController().output.destinationGain
  const splitter = context.createChannelSplitter(2),
    left = context.createAnalyser(),
    right = context.createAnalyser()
  output.connect(splitter)
  splitter.connect(left, 0)
  splitter.connect(right, 1)
  const balances = []
  let energy = 0
  try {
    for (let i = 0; i < 65; i++) {
      const a = new Float32Array(left.fftSize),
        b = new Float32Array(right.fftSize)
      left.getFloatTimeDomainData(a)
      right.getFloatTimeDomainData(b)
      const l = Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length),
        r = Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length)
      energy += l + r
      if (l + r > 0.001) balances.push((r - l) / (r + l))
      await pause(25)
    }
  } finally {
    output.disconnect(splitter)
    splitter.disconnect()
    left.disconnect()
    right.disconnect()
  }
  assert(energy > 0.01 && balances.length > 10, `${mode}: missing stereo PCM`)
  const spread = Math.max(...balances) - Math.min(...balances)
  if (mode === 'SMOOTH' || mode === 'ENV')
    assert(spread > 0.05, `${mode}: pan did not move within note`)
  if (mode === 'STEP') assert(spread < 0.05, `STEP moved within a sustained note: ${spread}`)
  document.querySelector('.topbar .play[aria-label=Stop]').click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  return {
    mode,
    stereoFrames: balances.length,
    balanceRange: [Math.min(...balances), Math.max(...balances)],
    spread,
    energy,
    savedIdentity: true,
  }
}

export async function verifyOrderedSound(types) {
  const { connect, placeModule, setValue, starterPatch, effectNotes } =
    await import('../src/rack/model.ts')
  let patch = starterPatch()
  for (const [i, type] of ['seq', 'osc', ...types].entries())
    patch = placeModule(patch, type, i + 1)
  patch = setValue(patch, 'seq1', 'steps', 'c3*2')
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  let from = { module: 'osc1', jack: 'out' }
  for (const module of patch.modules.filter((m) => types.includes(m.type))) {
    patch = connect(patch, from, { module: module.id, jack: 'in' })
    from = { module: module.id, jack: 'out' }
  }
  if (types.includes('pan')) patch = setValue(patch, 'pan1', 'pan', 0.3)
  patch = connect(patch, from, { module: 'mix1', jack: 'in1' })
  const code = generate(patch)
  const identity = (value) =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    )
  assert(identity(read(code).patch) === identity(patch), 'Ordered sound rack identity')
  const scope = parseSource(code).scopes.find((s) => s.kind === 'voice')
  assert(scope, 'Ordered voice')
  const expression = code.slice(scope.start, scope.end)
  const result = await verifySoundForm(-1, { type: types[0], expression })
  return {
    ...result,
    types,
    fxCalls: (expression.match(/\.FX\(/g) ?? []).length,
    note: effectNotes(patch)[0],
  }
}
export async function verifyReviewForms() {
  const results = []
  for (const call of [
    '.coarse(4).coarse(1)',
    '.transient(.5).transient(0)',
    '.phaserdepth(.3).phaserdepth(.75)',
  ]) {
    const type = call.startsWith('.coarse')
      ? 'lofi'
      : call.startsWith('.transient')
        ? 'comp'
        : 'phaser'
    results.push(await verifySoundForm(-1, { type, expression: 'note("c3*2").s("sine")' + call }))
  }
  results.push(await verifySoundForm(-1, { type: 'drive', expression: 's("bd*2").soft()' }))
  return results
}
export async function verifySharedOperatorSave() {
  const { connect, placeModule, setLook, starterPatch } = await import('../src/rack/model.ts')
  const { editDocument } = await import('../src/workspace/document.ts')
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  let patch = starterPatch()
  for (const [i, type] of ['seq', 'osc', 'seq', 'osc', 'fmop'].entries())
    patch = placeModule(patch, type, i + 1)
  for (const channel of [1, 2]) {
    patch = connect(
      patch,
      { module: `seq${channel}`, jack: 'note' },
      { module: `osc${channel}`, jack: 'note' },
    )
    patch = connect(
      patch,
      { module: 'fmop1', jack: 'out' },
      { module: `osc${channel}`, jack: 'fm' },
    )
    patch = connect(
      patch,
      { module: `osc${channel}`, jack: 'out' },
      { module: 'mix1', jack: `in${channel}` },
    )
  }
  const source = generate(patch),
    doc = read('// preserve sharing\n' + source)
  const edited = editDocument(doc, setLook(doc.patch, 'osc1', 'vintage'))
  await load(edited.source)
  assert(
    document.querySelectorAll('[data-module="fmop1"]').length === 1,
    'Shared operator rendered once',
  )
  assert(
    document.querySelector('[data-module="osc1"]').classList.contains('look-vintage'),
    'Saved oscillator look',
  )
  assert(editorSource() === edited.source, 'Shared operator source preserved')
  return {
    operators: 1,
    look: 'vintage',
    savedIdentity: JSON.stringify(read(edited.source).patch) === JSON.stringify(edited.patch),
    sourceExact: true,
  }
}
