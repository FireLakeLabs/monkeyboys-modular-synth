import * as web from '@strudel/web'
import mixExercise from '../src/library/patches/modules/mix.strudel?raw'
import { play, stop, getClock, bounce } from '../src/strudel/engine.ts'
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
/** Controlled seeded IRs let the actual renderer compare PCM, independently of events. */
async function offlineProof() {
  // oxlint-disable-next-line typescript/unbound-method -- Restore the original static method exactly after binding its calls.
  const originalCreate = URL.createObjectURL,
    create = originalCreate.bind(URL),
    random = Math.random
  let wav
  URL.createObjectURL = (blob) => {
    if (blob.type === 'audio/wav') wav = blob
    return create(blob)
  }
  // Reverb's impulse generator uses Math.random in this context. A fixed nonzero
  // seeded sequence removes IR variation while retaining nonzero wet output and unique voice IDs.
  let seed = 242
  Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  const shared = `setcpm(240/4)\n$: stack(${voice('a3', 0.125, 0.3)},${voice('e4', 0.25, 0.5)}).orbit(1)\n`
  const separated = `setcpm(240/4)\n$: ${voice('a3', 0.125, 0.3)}.orbit(1)\n$: ${voice('e4', 0.25, 0.5)}.orbit(2)\n`
  const spread = `const parts=[${voice('a3', 0.125, 0.3)}.orbit(7),${voice('e4', 0.25, 0.5)}.orbit(8)];\nsetcpm(240/4)\n$: stack(...parts)\n`
  async function render(source) {
    wav = undefined
    seed = 242
    await bounce(source, { cycles: 2, name: 'mix-242-proof', volume: 0.5 })
    assert(wav, 'Missing actual rendered WAV')
    const buffer = await wav.arrayBuffer(),
      view = new DataView(buffer)
    assert(
      new TextDecoder().decode(buffer.slice(0, 4)) === 'RIFF' && view.getUint16(34, true) === 16,
      'Unexpected WAV encoding',
    )
    const samples = new Int16Array(buffer.slice(44)),
      pcm = Float64Array.from(samples, (n) => n / 32768)
    const rms = Math.sqrt(pcm.reduce((sum, n) => sum + n * n, 0) / pcm.length)
    assert(rms > 0.0001, 'Offline renderer silent')
    return { pcm, rms, rate: view.getUint32(24, true), channels: view.getUint16(22, true) }
  }
  const pairs = []
  const rendered = []
  function difference(a, b) {
    assert(a.length === b.length, 'Rendered frame count changed')
    let energy = 0,
      max = 0
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i]
      energy += d * d
      max = Math.max(max, Math.abs(d))
    }
    return { rms: Math.sqrt(energy / a.length), max }
  }
  try {
    for (const [name, source] of [
      ['shared-native', shared],
      ['separated-native', separated],
      ['opaque-spread-routing', spread],
    ]) {
      const before = await render(source),
        repeat = await render(source),
        after = await render(makeRackEditable(read(source)).source)
      const delta = difference(before.pcm, after.pcm),
        repeatDelta = difference(before.pcm, repeat.pcm)
      // Even identical-source renders vary at sample level. Bound conversion by
      // that measured reference, require matched energy, and retain a send-sharing negative control.
      assert(
        delta.rms <= repeatDelta.rms * 1.5 + 2 / 32768 &&
          Math.abs(after.rms - before.rms) / before.rms < 0.01,
        `${name}: original/regenerated PCM changed ${JSON.stringify({ delta, repeatDelta, before: before.rms, after: after.rms })}`,
      )
      rendered.push(before)
      pairs.push({
        name,
        frames: before.pcm.length / before.channels,
        rate: before.rate,
        channels: before.channels,
        originalRms: before.rms,
        regeneratedRms: after.rms,
        repeatRms: repeat.rms,
        difference: delta,
        repeatDifference: repeatDelta,
      })
    }
    const sharingDifference = difference(rendered[0].pcm, rendered[1].pcm)
    assert(
      sharingDifference.rms / rendered[0].rms > 0.05,
      'Shared/separate send PCM negative control did not differ',
    )
    return {
      impulseSeed: 242,
      energyRelativeLimit: 0.01,
      repeatVariationAllowance: 1.5,
      quantizationFloor: 2 / 32768,
      pairs,
      sharingDifference,
    }
  } finally {
    URL.createObjectURL = originalCreate
    Math.random = random
  }
}

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
      name: 'stack-spread-routing',
      source: `const parts=[${voice('a3', 0.125, 0.3)}.orbit(7),${voice('e4', 0.25, 0.5)}.orbit(8)];\nsetcpm(240/4)\n$: stack(...parts)\n`,
      orbits: 2,
      native: true,
      inner: true,
      setup: true,
    },
    {
      name: 'stack-named-fanout',
      source:
        'const phrase=stack(note("a3*2").s("sine").gain(.08),note("e4*2").s("sine").gain(.08));\nsetcpm(240/4)\n$: phrase.delay(.3).delaytime(.125).delayfeedback(.25).orbit(1)\n$: phrase.room(.15).roomsize(.5).orbit(2)\n',
      orbits: 2,
      split: true,
    },
    {
      name: 'stack-post-setters',
      source:
        'setcpm(240/4)\n$: stack(note("a3*2"),note("e4*2")).s("sine").gain(.08).lpf(700).lpq(1).delay(.3).delaytime(.125).delayfeedback(.25).room(.15).roomsize(.3)\n',
      orbits: 1,
      native: true,
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
        regenerated = item.custom || item.setup ? makeRackEditable(doc).source : generate(doc.patch)
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
        if (item.split)
          assert(
            nodes[1]?.delayNode &&
              !nodes[1]?.reverbNode &&
              nodes[2]?.reverbNode &&
              !nodes[2]?.delayNode,
            'Fan-out shared native sends',
          )
        else if (item.native)
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
    const isolation = []
    for (const [name, input] of [
      [
        'code-after-owned-stack',
        `register('identity242',(v,p)=>p);\nsetcpm(240/4)\n$: stack(note("a3*2"),note("e4*2")).s("sine").gain(.08).identity242(1).room(.15).roomsize(.3)\n$: note("c4*2").s("sine").gain(.08).delay(.3).delaytime(.125).delayfeedback(.25)\n`,
      ],
      [
        'opaque-stack-default',
        'setcpm(240/4)\n$: stack(note("a3*2").s("sine").gain(.08).postgain(.5),note("e4*2").s("sine").gain(.08)).room(.15).roomsize(.3)\n$: note("c4*2").s("sine").gain(.08).delay(.3).delaytime(.125).delayfeedback(.25)\n',
      ],
      [
        'callback-parameter-o',
        'setcpm(240/4)\n$: note("a3*2").superimpose(o=>o.fast(2)).s("sine").gain(.08).room(.15).roomsize(.3)\n$: note("c4*2").s("sine").gain(.08).delay(.3).delaytime(.125).delayfeedback(.25)\n',
      ],
    ]) {
      const source = makeRackEditable(read(input)).source
      await play(source, { volume: 0.5, resetEffects: true })
      await pause(800)
      const controller = web.getSuperdoughAudioController(),
        nodes = controller.nodes
      assert(
        Object.keys(nodes).length === 2 &&
          nodes[1]?.reverbNode &&
          !nodes[1]?.delayNode &&
          nodes[2]?.delayNode &&
          !nodes[2]?.reverbNode,
        `${name}: default/native sends collided`,
      )
      const signal = await pcm(500)
      assert(signal.rms > 0.0001, `${name}: silent PCM`)
      isolation.push({
        name,
        source: sourceBody(source),
        orbits: Object.keys(nodes),
        separateSends: true,
        pcm: signal,
      })
      await stop()
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
      isolation,
      offline: await offlineProof(),
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
