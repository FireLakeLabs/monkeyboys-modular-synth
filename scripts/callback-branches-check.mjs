import * as web from '@strudel/web'
import { play, stop, getClock } from '../src/strudel/engine.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/read.ts'
import { sourceBody, saveLayout, makeRackEditable } from '../src/workspace/document.ts'
import { load } from './rack-feel-check.mjs'
import { editorSource } from './editor-browser.mjs'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (value, message) => {
  if (!value) throw new Error(message)
}
const identity = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
const equal = (a, b) => identity(a) === identity(b)
const base = 'note("c3 e3").s("sine").gain(.06)'
export const nested = `setcpm(240/4)\n$: ${base}.jux(p => stack(p.iter(3), /* inner */ p.off(.25, q => stack(q.iter(3),q.rev()))))\n`
export async function loadUI(look = 'instrument') {
  const doc = read(nested)
  const patch = {
    ...doc.patch,
    modules: doc.patch.modules.map((m) => ({ ...m, look: m.type === 'mix' ? look : m.look })),
  }
  const source = generate(patch)
  await load(source)
  return state()
}
export function state() {
  const source = editorSource(),
    doc = read(source)
  return { source, body: sourceBody(source), patch: doc.patch, layout: doc.layout }
}
let captured, original
export function capture() {
  if (original) return
  original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(this, callback, dominant)
  }
}
export function restore() {
  if (original) web.Pattern.prototype.onTrigger = original
  original = undefined
}
function events() {
  return captured
    .queryArc(0, 8)
    .filter((h) => h.hasOnset())
    .map((h) => {
      const { orbit: _ownedOrbit, ...value } = h.value
      return { value, begin: String(h.whole.begin), end: String(h.whole.end) }
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
export async function pcm(ms = 600) {
  const ac = web.getAudioContext(),
    output = web.getSuperdoughAudioController().output.destinationGain,
    analyser = ac.createAnalyser()
  output.connect(analyser)
  const frame = new Float32Array(analyser.fftSize)
  let sum = 0,
    count = 0,
    peak = 0
  try {
    for (let i = 0; i < Math.ceil(ms / 25); i++) {
      analyser.getFloatTimeDomainData(frame)
      for (const v of frame) {
        sum += v * v
        count++
        peak = Math.max(peak, Math.abs(v))
      }
      await pause(25)
    }
  } finally {
    output.disconnect(analyser)
  }
  return { rms: Math.sqrt(sum / count), samples: count, peak }
}
export async function liveState() {
  return { clock: getClock(), events: events(), pcm: await pcm() }
}
export async function runtimeProof() {
  capture()
  const forms = [
    ['jux-sample', 's("bd").gain(.06).jux(x => stack(x,x.rev()))'],
    ['superimpose', `${base}.superimpose(x => stack(x.fast(2),x.rev()))`],
    ['nested', `${base}.jux(p => stack(p.iter(3),p.off(.25,q=>stack(q.fast(2),q.rev()))))`],
    ['shared', `${base}.jux(p => (shared => stack(shared,shared.rev()))(p.fast(2)))`],
    [
      'nested-shared',
      `${base}.jux(p => (shared => stack(shared,shared.off(.25,q=>(inner=>stack(inner,inner.rev()))(q.fast(2)))))(p.iter(3)))`,
    ],
    [
      'opaque-local-routing',
      `${base}.jux(p => (shared => stack(shared,shared.rev()))(p.branch243(7)))`,
    ],
  ]
  const results = []
  try {
    for (const [name, expression] of forms) {
      const setup =
        name === 'opaque-local-routing'
          ? `globalThis.__branch243=0;\nregister('branch243',(n,p)=>{globalThis.__branch243++;return p.orbit(n)});\n`
          : ''
      const source = `${setup}setcpm(240/4)\n$: ${expression}\n`
      const doc = read(source),
        saved = saveLayout(doc)
      assert(sourceBody(saved.source) === source, 'Exact source')
      assert(equal(read(saved.source).patch, doc.patch), 'Complete saved identity')
      assert(
        doc.patch.modules.some((m) => m.type === 'mix' && m.values.mode === 'Stack'),
        `${name}: missing local Stack`,
      )
      if (!setup)
        assert(!doc.patch.modules.some((m) => m.type === 'code'), `${name}: unexpected CODE`)
      const regenerated = setup ? makeRackEditable(doc).source : generate(doc.patch)
      const samples = []
      for (const [form, code] of [
        ['original', source],
        ['regenerated', regenerated],
      ]) {
        await play(code, { volume: 0.5, resetEffects: true })
        await pause(600)
        const queried = events(),
          measured = await pcm()
        assert(queried.length > 0 && measured.rms > 0.0001, `${name}/${form}: silent`)
        const orbits = Object.keys(web.getSuperdoughAudioController().nodes)
        if (setup) {
          assert(globalThis.__branch243 === 1, 'Shared helper was duplicated')
          assert(equal(orbits.toSorted(), ['1', '7']), 'JUX original or opaque inner orbit changed')
        }
        samples.push({
          form,
          source: sourceBody(code),
          events: queried,
          pcm: measured,
          orbits,
          ...(setup ? { constructions: globalThis.__branch243 } : {}),
        })
        await stop()
      }
      assert(equal(samples[0].events, samples[1].events), `${name}: original/regenerated events`)
      if (name === 'superimpose')
        assert(samples[0].events.length === 64, 'Original plus both additional copies lost')
      results.push({ name, sourceExact: true, savedIdentity: true, samples })
    }
    await pause(500)
    const stopped = await pcm()
    assert(stopped.rms < 0.0001, 'Stop left audible output')
    await play('silence', { volume: 0.5, resetEffects: true })
    const replacement = await pcm()
    assert(
      replacement.rms < 0.0001 &&
        Object.keys(web.getSuperdoughAudioController().nodes).length === 0,
      'Replacement retained local audio',
    )
    return { results, stopped, replacement, physicalListening: false }
  } finally {
    await stop()
    restore()
  }
}
