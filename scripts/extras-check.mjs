// Browser-only acceptance fixtures. Audio initialization/Play/Stop remain in engine.ts.
import * as web from '@strudel/web'
import * as engine from '../src/strudel/engine.ts'
import { read } from '../src/reader/index.ts'
import { generate } from '../src/codegen/generate.ts'
import { parseSource } from '../src/reader/syntax.ts'
import { saveLayout, sourceBody } from '../src/workspace/document.ts'
import { connect, placeModule, setValue, starterPatch } from '../src/rack/model.ts'
import { editorSource } from './editor-browser.mjs'
import { load, inspectPanels, inspectCables } from './rack-feel-check.mjs'

let captured
const triggered = []
const failures = []
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export function prepare() {
  const original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    if (dominant !== false) return original.call(this, callback, dominant)
    captured = this
    return original.call(
      this,
      (hap, now, cps, target) => {
        triggered.push({ value: hap.value, now, target })
        callback(hap, now, cps, target)
      },
      dominant,
    )
  }
  engine.subscribe((event) => {
    if (event.type === 'failure') failures.push(event.message)
  })
}
export function reset() {
  triggered.length = 0
  failures.length = 0
}
function events(pattern) {
  return pattern
    .queryArc(0, 4, { _cps: web.getCps() })
    .filter((h) => h.hasOnset())
    .map((h) => ({
      value: h.value,
      begin: h.whole.begin.toString(),
      end: h.whole.end.toString(),
      dominant: !!h.context.dominantTrigger,
    }))
}
function semantic(events) {
  return events.map(({ value, ...event }) => {
    if (value && typeof value === 'object') {
      const { orbit: _orbit, ...controls } = value
      value = Object.keys(controls).length === 1 && 'value' in controls ? controls.value : controls
    }
    return { ...event, value }
  })
}
export function proof() {
  const source = editorSource(),
    doc = read(source),
    saved = saveLayout(doc),
    generated = generate(doc.patch)
  const scope = parseSource(generated).scopes.find((s) => s.kind === 'voice')
  if (!scope || !captured) throw Error('No captured, scheduled fixture pattern')
  // Only generated forms from committed test fixtures enter this pure query.
  // oxlint-disable-next-line typescript/no-implied-eval
  const query = new Function(
    ...Object.keys(web),
    web.transpiler(`(${generated.slice(scope.start, scope.end)})`).output,
  )(...Object.values(web))
  const actual = events(captured),
    reopened = events(query)
  return {
    source,
    sourceExact: generate(doc) === source,
    savedIdentity: JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    patch: doc.patch,
    actualEvents: actual,
    generatedEvents: reopened,
    eventEquivalent: JSON.stringify(semantic(actual)) === JSON.stringify(semantic(reopened)),
    triggered: [...triggered],
    failures: [...failures],
  }
}
export async function measure() {
  const context = web.getAudioContext(),
    output = web.getSuperdoughAudioController().output.destinationGain
  const analyser = context.createAnalyser()
  analyser.fftSize = 8192
  analyser.smoothingTimeConstant = 0
  output.connect(analyser)
  let energy = 0,
    frames = 0,
    peak = 0
  for (let i = 0; i < 25; i++) {
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    for (const x of data) {
      energy += x * x
      frames++
      peak = Math.max(peak, Math.abs(x))
    }
    await pause(20)
  }
  const spectrum = new Float32Array(analyser.frequencyBinCount)
  analyser.getFloatFrequencyData(spectrum)
  let bin = 1
  for (let i = 2; i < spectrum.length; i++) if (spectrum[i] > spectrum[bin]) bin = i
  output.disconnect(analyser)
  return {
    rms: Math.sqrt(energy / frames),
    peak,
    frames,
    sampleRate: context.sampleRate,
    frequency: (bin * context.sampleRate) / analyser.fftSize,
  }
}
export async function layout(type, look) {
  let patch = starterPatch()
  patch = { ...patch, modules: patch.modules.map((m) => (m.type === 'mix' ? { ...m, hp: 22 } : m)) }
  patch = placeModule(patch, type, 0, 0)
  if (type === 'bytebeat') patch = setValue(patch, 'bytebeat1', 'timeMode', 'offset')
  if (type === 'speak') {
    patch = placeModule(patch, 'code', 0, 38)
    patch = setValue(patch, 'code1', 'text', '"<hello modular world>"')
    patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'speak1', jack: 'in' })
  }
  patch = connect(patch, { module: `${type}1`, jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const baseline = sourceBody(generate(patch))
  patch = { ...patch, modules: patch.modules.map((m) => (m.type === type ? { ...m, look } : m)) }
  const source = generate(patch)
  if (sourceBody(source) !== baseline) throw Error('Look changed executable code')
  await load(source)
  await document.fonts.ready
  return { id: `${type}1`, source, baseline }
}
export function geometry(look) {
  return { panels: inspectPanels(look), ...inspectCables() }
}
export function state() {
  return {
    source: editorSource(),
    patch: read(editorSource()).patch,
    triggered: [...triggered],
    failures: [...failures],
  }
}
