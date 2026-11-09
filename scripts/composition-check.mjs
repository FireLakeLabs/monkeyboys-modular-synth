import * as web from '@strudel/web'
import mixExercise from '../src/library/patches/modules/mix.strudel?raw'
import { play, stop, getClock } from '../src/strudel/engine.ts'
import { createPlayback } from '../src/strudel/playback.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/read.ts'
import { sourceBody, saveLayout, makeRackEditable } from '../src/workspace/document.ts'
import { setValue, placeModule, connect } from '../src/rack/model.ts'
import { replaceSource, editorSource } from './editor-browser.mjs'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const identity = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
export async function load(look = 'instrument', cv = false) {
  await stop()
  let patch = read(mixExercise).patch
  patch = { ...patch, modules: patch.modules.map((m) => ({ ...m, look })) }
  if (cv) {
    patch = placeModule(patch, 'lfo', 4)
    patch = connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'mix1', jack: 'cv1' })
  }
  const source = generate(patch)
  replaceSource(source)
  for (let i = 0; i < 200; i++) {
    if (
      editorSource() === source &&
      document.querySelectorAll('[data-module]').length === patch.modules.length &&
      document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code')
    )
      return source
    await pause(30)
  }
  throw new Error('Composition UI did not settle')
}
export function state() {
  const doc = read(editorSource())
  return {
    source: editorSource(),
    body: sourceBody(editorSource()),
    patch: doc.patch,
    layout: doc.layout,
    sourceExact: sourceBody(saveLayout(doc).source) === sourceBody(doc.source),
    identity: identity(read(saveLayout(doc).source).patch) === identity(doc.patch),
  }
}
async function pcm(ms = 800) {
  const ac = web.getAudioContext(),
    analyser = ac.createAnalyser(),
    output = web.getSuperdoughAudioController().output.destinationGain
  analyser.fftSize = 4096
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
  return { rms: Math.sqrt(sum / count), peak, samples: count }
}
const voice = (pitch, delay, room) =>
  `note("${pitch}*2").s("sine").gain(.08).delay(.3).delaytime(${delay}).delayfeedback(.25).room(.15).roomsize(${room})`
export async function runtimeProof() {
  let captured
  const original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(this, callback, dominant)
  }
  const cases = [
    {
      name: 'stack-native',
      source: `setcpm(240/4)\n$: stack(${voice('a3', 0.125, 0.3)},${voice('e4', 0.25, 0.5)})\n`,
      orbits: 1,
      native: true,
    },
    {
      name: 'voices-separated',
      source: `setcpm(240/4)\n$: ${voice('a3', 0.125, 0.3)}.orbit(1)\n$: ${voice('e4', 0.25, 0.5)}.orbit(2)\n`,
      orbits: 2,
      native: true,
    },
    {
      name: 'stack-inner-orbits',
      source: `setcpm(240/4)\n$: stack(${voice('a3', 0.125, 0.3)}.orbit(7),${voice('e4', 0.25, 0.5)}.orbit(8))\n`,
      orbits: 2,
      native: true,
      inner: true,
    },
    {
      name: 'stack-custom-routing',
      source: `globalThis.__mix242calls = 0;
register('route242',(n,p)=>{globalThis.__mix242calls++;return p.orbit(n)});
setcpm(240/4)
$: stack(${voice('a3', 0.125, 0.3)}.route242(7),${voice('e4', 0.25, 0.5)}.route242(8))
`,
      orbits: 2,
      native: true,
      inner: true,
      custom: true,
    },
    {
      name: 'stack-inline',
      source:
        'setcpm(240/4)\n$: stack(note("a3*2").s("sine").gain(.08).FX(delay(.3).delaytime(.125).delayfeedback(.25)),note("e4*2").s("sine").gain(.08).FX(room(.2).roomsize(.5)))\n',
      orbits: 1,
      native: false,
    },
  ]
  const results = []
  try {
    for (const item of cases) {
      const doc = read(item.source),
        regenerated = item.custom ? makeRackEditable(doc).source : generate(doc.patch)
      assert(sourceBody(saveLayout(doc).source) === item.source, 'Exact source')
      assert(identity(read(saveLayout(doc).source).patch) === identity(doc.patch), 'Saved identity')
      const samples = []
      for (const [form, source] of [
        ['original', item.source],
        ['regenerated', regenerated],
      ]) {
        await play(source, { volume: 0.5, resetEffects: true })
        await pause(800)
        const events = captured
          .queryArc(0, 2)
          .filter((h) => h.hasOnset())
          .map((h) => ({ begin: Number(h.whole.begin), ...h.value }))
        const nodes = web.getSuperdoughAudioController().nodes
        const entries = Object.entries(nodes)
        assert(
          entries.length === item.orbits,
          `${item.name}/${form}: orbit count ${entries.length}`,
        )
        if (item.native)
          assert(
            entries.every(([, n]) => n.delayNode && n.reverbNode),
            'Missing native send buses',
          )
        else
          assert(
            entries.every(([, n]) => !n.delayNode && !n.reverbNode),
            'Inline FX leaked to native sends',
          )
        if (item.inner)
          assert(
            events.every((e) => [7, 8].includes(e.orbit)),
            'Inner orbit overridden',
          )
        const measured = await pcm()
        assert(measured.rms > 0.0001, `${item.name}/${form}: silent PCM`)
        if (item.custom)
          assert(globalThis.__mix242calls === 2, 'Custom helper call duplicated or lost')
        samples.push({
          form,
          source: sourceBody(source),
          events,
          orbits: entries.map(([key]) => key),
          pcm: measured,
        })
        await stop()
      }
      // Generated routing is deliberately tested above; all other onset fields/times agree.
      const musical = (events) => events.map(({ orbit: _orbit, ...event }) => event)
      assert(
        identity(musical(samples[0].events)) === identity(musical(samples[1].events)),
        `${item.name}: scheduled event drift`,
      )
      results.push({ name: item.name, samples })
    }
    // Mode-only structural replacement must remove the former independent send buses.
    let patch = read(cases[1].source.replaceAll('.orbit(1)', '').replaceAll('.orbit(2)', '')).patch
    const playback = createPlayback(patch)
    await playback.play()
    await pause(900)
    const old = web.getSuperdoughAudioController().nodes[2]
    assert(old?.delayNode, 'Missing second Voices bus')
    const mixer = patch.modules.find((m) => m.type === 'mix')
    patch = setValue(patch, mixer.id, 'mode', 'Stack')
    await playback.update(patch)
    await pause(900)
    const after = web.getSuperdoughAudioController().nodes
    assert(
      Object.keys(after).length === 1 && !Object.values(after).includes(old),
      'Mode switch retained old bus',
    )
    const retained = after[1]
    const gain = patch.modules.find((m) => m.type === 'vca')
    await playback.update(setValue(patch, gain.id, 'level', 0.1))
    await pause(500)
    assert(
      web.getSuperdoughAudioController().nodes[1] === retained,
      'Literal live edit reset shared bus',
    )
    const live = await pcm()
    assert(live.rms > 0.0001, 'Live edit silent')
    await playback.stop()
    await pause(1600)
    const stopped = await pcm(400)
    assert(!getClock().running, 'Stop retained scheduling')
    assert(stopped.rms < 0.001, 'Stop retained PCM beyond bounded tails')
    await playback.update(read('$: stack()\n'))
    await playback.play()
    await pause(500)
    const replacement = await pcm(300)
    assert(
      replacement.rms < 0.001 && Object.keys(web.getSuperdoughAudioController().nodes).length === 0,
      'Empty replacement leaked routes/audio',
    )
    await playback.stop()
    return {
      results,
      modeReplacement: true,
      liveEdit: live,
      stopped,
      replacement,
      physicalListening: false,
    }
  } finally {
    await stop()
    web.Pattern.prototype.onTrigger = original
  }
}
