// Focused #212 acceptance, using the production library, editor and engine.
import * as web from '@strudel/web'
import { libraryPatches } from '../src/library/catalog.ts'
import { read } from '../src/reader/index.ts'
import { generate } from '../src/codegen/generate.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { editorSource, expectedExport } from './editor-browser.mjs'

export const dubEntry = libraryPatches().find((entry) => entry.id === 'war-pigs-dub-afterimage')
const CPS = 56 / 240
const SLOT = 1 / 8 // One eighth note, in cycles.
const ENGINE_CLEANUP = 0.01

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const status = () => document.querySelector('.transport-status')?.textContent
const rounded = (value) => Math.round(value * 1e6) / 1e6
function assert(ok, message) {
  if (!ok) throw new Error(message)
}
async function until(test, label) {
  for (let i = 0; i < 1000; i++) {
    if (test()) return
    await pause(25)
  }
  throw new Error(`Dub timed out: ${label}`)
}
function button(name) {
  const result = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name,
  )
  assert(result, `Missing ${name}`)
  return result
}
function fileAction(name) {
  button('File').click()
  button(name).click()
}
export async function loadDub() {
  fileAction('Patch library')
  await until(() => document.querySelector('.patch-library')?.open, 'library')
  button(dubEntry.title).click()
  await until(
    () => document.querySelector('.patch-library h3')?.textContent === dubEntry.title,
    'selection',
  )
  assert(
    document.querySelector('.patch-path').textContent === 'Complete patches / War Pigs experiments',
    'Collection path',
  )
  button('Load patch').click()
  await until(() => !document.querySelector('.patch-library'), 'load')
  assert(status() === 'Ready', 'Library load autoplayed')
  assert(editorSource() === dubEntry.source, 'Library source changed')
  return { stopped: true, modules: read(editorSource()).patch.modules.length }
}
export async function stopDub() {
  const stop = document.querySelector('.topbar [aria-label="Stop"]')
  if (stop) {
    stop.click()
    await until(() => status() === 'Ready', 'stop')
  }
}
function events(begin, end) {
  return web
    .getPattern()
    .queryArc(begin, end, { _cps: CPS })
    .filter((h) => h.hasOnset())
    .map((h) => ({ begin: Number(h.whole.begin), end: Number(h.whole.end), ...h.value }))
    .sort(
      (a, b) =>
        a.begin - b.begin || a.orbit - b.orbit || String(a.note).localeCompare(String(b.note)),
    )
}
export function overlap(intervals) {
  const edges = intervals
    .flatMap(({ begin, end }) => [
      [begin, 1],
      [end, -1],
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let active = 0,
    peak = 0
  for (const [, delta] of edges) {
    active += delta
    peak = Math.max(peak, active)
  }
  return peak
}
export function eventBudget(all, cps = CPS) {
  const phrase = all.filter((e) => e.begin >= 6 && e.begin < 12)
  const lane = (list, orbit) => list.filter((e) => e.orbit === orbit)
  const starts = {
    total: phrase.length,
    anchor: lane(phrase, 1).length,
    reply: lane(phrase, 2).length,
    low: lane(phrase, 3).length,
  }
  const windowPeak = Math.max(
    ...phrase.map((e) => all.filter((o) => o.begin >= e.begin && o.begin < e.begin + SLOT).length),
  )
  const life = all.map((e) => ({ ...e, end: e.end + (e.release + ENGINE_CLEANUP) * cps }))
  const voices = {
    total: overlap(life),
    anchor: overlap(lane(life, 1)),
    reply: overlap(lane(life, 2)),
    low: overlap(lane(life, 3)),
  }
  assert(
    starts.total <= 48 && starts.anchor <= 32 && starts.reply <= 8 && starts.low <= 8,
    'Dub phrase start budget exceeded',
  )
  assert(windowPeak <= 8, 'Dub sliding window budget exceeded')
  assert(
    voices.total <= 8 && voices.anchor <= 4 && voices.reply <= 2 && voices.low <= 2,
    'Dub voice overlap budget exceeded',
  )
  assert(
    all.every(
      (e) =>
        Number.isFinite(e.end) &&
        e.end > e.begin &&
        e.end - e.begin <= (e.orbit === 2 ? 3 / 8 : 2) &&
        e.release <= 0.5,
    ),
    'Dub gate/release budget exceeded',
  )
  for (const e of all.filter((e) => e.orbit === 1 && e.end - e.begin < 1 / 8))
    assert(
      life.filter(
        (o) =>
          o.orbit === 1 &&
          o.begin < e.begin &&
          o.end > e.begin &&
          all.filter((p) => p.orbit === 1 && p.begin === o.begin).length === 2,
      ).length === 0,
      'Sub-slot ornament overlaps prior dyad tail',
    )
  return { starts, windowPeak, voices }
}
export function verifyDubEvents() {
  const all = events(0, 18)
  const first = all.filter((e) => e.begin < 6)
  const normalize = (e, shift = 0) => ({
    slot: rounded((e.begin - shift) * 8),
    slots: rounded((e.end - e.begin) * 8),
    note: String(e.note).toLowerCase(),
    orbit: e.orbit,
    velocity: e.velocity ?? 1,
  })
  const snapshot = (orbit, row) =>
    assert(
      JSON.stringify(first.filter((e) => e.orbit === orbit).map((e) => normalize(e))) ===
        JSON.stringify(
          row.map(([slot, slots, note, velocity = 1]) => ({ slot, slots, note, orbit, velocity })),
        ),
      `Lane ${orbit} onset/pitch/duration/accent differs`,
    )
  snapshot(1, [
    [0, 8.5, 'b3'],
    [0, 8.5, 'e3'],
    [10, 0.5, 'd3', 0.6],
    [10.5, 1.5, 'e3', 0.8],
    [12, 8.5, 'a3', 0.95],
    [12, 8.5, 'd3', 0.95],
    [22, 1, 'g#3', 0.6],
    [23, 0.5, 'g#3', 0.6],
    [23.5, 0.5, 'a3', 0.7],
    [24, 8.5, 'g#3', 0.85],
    [34, 1, 'd3', 0.65],
    [35, 1, 'e3', 0.8],
    [36, 8.5, 'a3', 0.95],
    [36, 8.5, 'd3', 0.95],
    [46, 1, 'g#3', 0.6],
    [47, 0.5, 'g#3', 0.6],
    [47.5, 0.5, 'a3', 0.7],
  ])
  snapshot(2, [
    [9, 1, 'b4', 0.7],
    [21, 1, 'a4', 0.7],
    [33, 1, 'e4', 0.7],
    [45, 1, 'a4', 0.7],
  ])
  snapshot(3, [
    [0, 10, 'e2'],
    [12, 10, 'd2'],
    [22, 12, 'e2'],
    [36, 10, 'd2'],
    [46, 2, 'e2'],
  ])
  for (const shift of [6, 12])
    assert(
      JSON.stringify(
        all.filter((e) => e.begin >= shift && e.begin < shift + 6).map((e) => normalize(e, shift)),
      ) === JSON.stringify(first.map((e) => normalize(e))),
      'Repeated phrase differs',
    )
  const reply = first.filter((e) => e.orbit === 2)
  assert(
    reply.every(
      (e) =>
        e.s === 'triangle' &&
        e.bandf === 650 &&
        e.bandq === 2 &&
        e.bpenv === 1 &&
        e.bpattack === e.attack &&
        e.bpdecay === e.decay &&
        e.bpsustain === e.sustain &&
        e.bprelease === e.release &&
        e.pan === 0.6 &&
        e.delay === 0.2 &&
        e.delayfeedback === 0.25 &&
        e.delaysync === 0.125 &&
        !e.FX,
    ),
    'Native delay or ENV fan-out changed',
  )
  assert(
    first.filter((e) => e.orbit !== 2).every((e) => !e.delay && !e.room && !e.FX),
    'Another active effect path',
  )
  const budgets = [40, 56, 240].map((bpm) => ({ bpm, ...eventBudget(all, bpm / 240) }))
  const rejects = (fixture, reason) => {
    try {
      eventBudget(fixture)
    } catch (e) {
      if (reason.test(e.message)) return true
      throw e
    }
    return false
  }
  const source = all.find((e) => e.orbit === 2)
  const negative = {
    density: rejects(
      [
        ...all,
        ...Array.from({ length: 9 }, (_, i) => ({
          ...source,
          orbit: 1,
          begin: 6.5 + i / 100,
          end: 6.501 + i / 100,
          release: 0,
        })),
      ],
      /sliding window/,
    ),
    starts: rejects(
      [
        ...all,
        ...Array.from({ length: 16 }, (_, i) => ({
          ...source,
          orbit: 1,
          begin: 6 + i * 0.3,
          end: 6.001 + i * 0.3,
          release: 0,
        })),
      ],
      /phrase start/,
    ),
    overlap: rejects(
      [...all, ...Array.from({ length: 3 }, () => ({ ...source, begin: 6.5, end: 6.8 }))],
      /voice overlap/,
    ),
    gate: rejects(
      all.map((e) => (e === source ? { ...e, end: e.begin + 0.5 } : e)),
      /gate\/release/,
    ),
  }
  assert(Object.values(negative).every(Boolean), 'Negative budget case passed')
  const longestGapSeconds =
    Math.max(
      ...[1, 2, 3].map((orbit) => {
        const lane = all.filter((e) => e.orbit === orbit)
        return Math.max(...lane.slice(1).map((e, i) => e.begin - lane[i].begin))
      }),
    ) / CPS
  return {
    budgets,
    negative,
    longestGapSeconds,
    bars: [0, 1.5, 3, 4.5, 6],
    groups: Array.from({ length: 17 }, (_, i) => (i * 3) / 8),
    events: first.map((e) => normalize(e)),
  }
}

export async function dubRoundTrip() {
  await stopDub()
  const before = editorSource()
  assert(before === dubEntry.source, 'Export must start from bundled default bytes')
  const original = URL.createObjectURL.bind(URL)
  let blob
  URL.createObjectURL = (value) => {
    blob = value
    return original(value)
  }
  try {
    fileAction('Export')
  } finally {
    URL.createObjectURL = original
  }
  const saved = await blob.text()
  assert(saved === expectedExport(before), 'Export changed saved source')
  const transfer = new DataTransfer()
  transfer.items.add(new File([saved], 'dub.strudel', { type: 'text/plain' }))
  const input = document.querySelector('input[type="file"]')
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => editorSource() === saved, 'reopen')
  assert(sourceBody(saved).endsWith(sourceBody(before)), 'Executable source lost on export')
  const [was, now] = [read(before).patch, read(saved).patch]
  assert(
    JSON.stringify(now.modules) === JSON.stringify(was.modules) &&
      JSON.stringify(now.cables) === JSON.stringify(was.cables) &&
      ['name', 'names', 'railHp', 'rows'].every(
        (key) => JSON.stringify(now[key]) === JSON.stringify(was[key]),
      ),
    'Full saved rack differs',
  )
  assert(generate(read(saved)) === saved, 'Exact exported bytes lost')
  assert(
    JSON.stringify(read(editorSource()).patch) === JSON.stringify(now),
    'Reopened export identity differs',
  )
  return {
    sourceExact: true,
    rackExact: true,
    fanout: now.cables
      .filter((c) => /^env2$/.test(c.from.module))
      .map((c) => `${c.from.module}->${c.to.module}.${c.to.jack}`),
  }
}

export function installDubProbe() {
  const oscillators = [],
    noises = [],
    triggers = [],
    buffers = new Map()
  // oxlint-disable-next-line typescript/unbound-method -- Each captured prototype method is called with its original receiver.
  const start = OscillatorNode.prototype.start,
    // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original oscillator receiver.
    stop = OscillatorNode.prototype.stop
  // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original buffer source receiver.
  const noiseStart = AudioBufferSourceNode.prototype.start,
    // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original buffer source receiver.
    noiseStop = AudioBufferSourceNode.prototype.stop
  const onTrigger = web.Pattern.prototype.onTrigger
  const records = new WeakMap()
  const offline = (node) => node.context instanceof OfflineAudioContext
  OscillatorNode.prototype.start = function (time) {
    // The pinned FM modulator starts without a time, at the moment it is built.
    const record = {
      begin: time ?? this.context.currentTime,
      end: null,
      frequency: this.frequency.value,
      type: this.type,
      offline: offline(this),
    }
    records.set(this, record)
    oscillators.push(record)
    return start.call(this, time)
  }
  OscillatorNode.prototype.stop = function (time = 0) {
    const record = records.get(this)
    if (record && record.end === null) record.end = time
    return stop.call(this, time)
  }
  AudioBufferSourceNode.prototype.start = function (time, ...rest) {
    if (!buffers.has(this.buffer)) buffers.set(this.buffer, buffers.size)
    const record = {
      begin: time ?? this.context.currentTime,
      end: null,
      buffer: buffers.get(this.buffer),
      offline: offline(this),
    }
    records.set(this, record)
    noises.push(record)
    return noiseStart.call(this, time, ...rest)
  }
  AudioBufferSourceNode.prototype.stop = function (time = 0) {
    const record = records.get(this)
    if (record && record.end === null) record.end = time
    return noiseStop.call(this, time)
  }
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    return onTrigger.call(
      this,
      (hap, now, cps, target) => {
        triggers.push({
          cycle: Number(hap.whole.begin),
          target,
          cps,
          duration: Number(hap.whole.end) - Number(hap.whole.begin),
          release: hap.value.release,
          orbit: hap.value.orbit,
          pan: hap.value.pan,
          delay: hap.value.delay,
          feedback: hap.value.delayfeedback,
          bandf: hap.value.bandf,
          postgain: hap.value.postgain,
        })
        callback(hap, now, cps, target)
      },
      dominant,
    )
  }
  const controller = () => web.getSuperdoughAudioController()
  return {
    read: () => ({
      oscillators: structuredClone(oscillators),
      noises: structuredClone(noises),
      triggers: structuredClone(triggers),
      orbits: Object.keys(controller().nodes),
      buses: Object.keys(controller().buses ?? {}),
      delays: Object.entries(controller().nodes)
        .filter(([, o]) => o.delayNode)
        .map(([orbit, o]) => ({
          orbit,
          time: o.delayNode.delayTime.value,
          feedback: o.delayNode.feedback.value,
        })),
      reverbs: Object.values(controller().nodes).filter((o) => o.reverbNode).length,
      now: web.getAudioContext().currentTime,
    }),
    restore: () => {
      OscillatorNode.prototype.start = start
      OscillatorNode.prototype.stop = stop
      AudioBufferSourceNode.prototype.start = noiseStart
      AudioBufferSourceNode.prototype.stop = noiseStop
      web.Pattern.prototype.onTrigger = onTrigger
    },
  }
}

// The dry square, upper triangle and low triangle identify this patch's source lanes.
export function sources(state, after = -Infinity) {
  const live = state.oscillators.filter((o) => !o.offline && (o.end ?? Infinity) > after)
  const anchor = live.filter((o) => o.type === 'square')
  const low = live.filter((o) => o.type === 'triangle' && o.frequency < 100)
  const reply = live.filter((o) => o.type === 'triangle' && o.frequency >= 100)
  const modulators = live.filter((o) => o.type === 'sine')
  const noise = state.noises.filter((n) => !n.offline && (n.end ?? Infinity) > after)
  const peaks = {
    primary: overlap([...anchor, ...low, ...reply]),
    anchor: overlap(anchor),
    low: overlap(low),
    reply: overlap(reply),
    modulators: overlap(modulators),
    noise: overlap(noise),
  }
  return { anchor, low, reply, modulators, noise, peaks }
}

export async function liveDubPCM(ms = 1000) {
  const controller = web.getSuperdoughAudioController(),
    analyser = controller.audioContext.createAnalyser()
  controller.output.destinationGain.connect(analyser)
  const started = controller.audioContext.currentTime
  const phases = []
  let peak = 0,
    sum = 0,
    count = 0
  try {
    for (let elapsed = 0; elapsed < ms; elapsed += 25) {
      const frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      const index = Math.floor((controller.audioContext.currentTime - started) / (6 / CPS))
      const phase = (phases[index] ??= { sum: 0, count: 0 })
      for (const v of frame) {
        phase.sum += v * v
        phase.count++
        peak = Math.max(peak, Math.abs(v))
        sum += v * v
        count++
      }
      await pause(25)
    }
  } finally {
    controller.output.destinationGain.disconnect(analyser)
  }
  return {
    peak,
    rms: Math.sqrt(sum / count),
    phaseRMS: phases.map((p) => Math.sqrt(p.sum / p.count)),
  }
}

export async function immediateDubReplay() {
  button('Play').click()
  await until(() => status() === 'Playing', 'first immediate Play')
  await pause(250)
  const before = web.getAudioContext().currentTime
  await stopDub()
  button('Play').click()
  await until(() => status() === 'Playing', 'immediate replay')
  const elapsed = web.getAudioContext().currentTime - before
  const pcm = await liveDubPCM(300)
  await stopDub()
  return { before, elapsed, pcm }
}

export async function stopHeldDub(probe) {
  let heldVoice
  await until(() => {
    const time = web.getAudioContext().currentTime
    heldVoice = probe
      .read()
      .oscillators.find(
        (o) =>
          !o.offline &&
          o.frequency >= 100 &&
          o.type === 'square' &&
          time > o.begin + 0.15 &&
          time < o.end - 2,
      )
    return heldVoice
  }, 'known held anchor before Stop')
  const requestedAt = web.getAudioContext().currentTime
  await stopDub()
  const stoppedAt = web.getAudioContext().currentTime
  const pcm = await liveDubPCM(200)
  return { requestedAt, stoppedAt, held: heldVoice, pcm }
}
export async function bounceDub() {
  await stopDub()
  const original = URL.createObjectURL.bind(URL)
  let blob
  URL.createObjectURL = (value) => {
    if (value.type === 'audio/wav') blob = value
    return original(value)
  }
  try {
    fileAction('Bounce WAV')
    await until(() => blob && status() === 'Ready', 'bounce')
    const view = new DataView(await blob.arrayBuffer())
    let peak = 0,
      sum = 0,
      clipped = 0
    for (let i = 44; i < view.byteLength; i += 2) {
      const v = view.getInt16(i, true) / 32768
      peak = Math.max(peak, Math.abs(v))
      sum += v * v
      if (Math.abs(v) >= 32767 / 32768) clipped++
    }
    return {
      rate: view.getUint32(24, true),
      channels: view.getUint16(22, true),
      seconds: (view.byteLength - 44) / (view.getUint32(24, true) * 4),
      peak,
      rms: Math.sqrt(sum / ((view.byteLength - 44) / 2)),
      clipped,
    }
  } finally {
    URL.createObjectURL = original
  }
}

// Observe float PCM before the production Bounce path quantizes its WAV.
// This keeps the -60 dB tail check above 16-bit quantization's floor.
export async function isolatedDubPCM({ bpm = 56, sync = 0.125, send = 0.2, feedback = 0.25 } = {}) {
  const { setValue } = await import('../src/rack/model.ts')
  const { editDocument } = await import('../src/workspace/document.ts')
  const engine = await import('../src/strudel/engine.ts')
  let doc = read(dubEntry.source)
  for (const [id, key, value] of [
    ['mix1', 'solo2', 'on'],
    ['seq2', 'steps', 'b4 ~@95'],
    ['clock2', 'division', 12],
    ['out1', 'bpm', bpm],
    ['delay1', 'sync', sync],
    ['delay1', 'mix', send],
    ['delay1', 'fdbk', feedback],
  ])
    doc = editDocument(doc, setValue(doc.patch, id, key, value))
  // oxlint-disable-next-line typescript/unbound-method -- Invoked with the original offline context receiver.
  const original = OfflineAudioContext.prototype.startRendering
  let buffer
  OfflineAudioContext.prototype.startRendering = function () {
    return original.call(this).then((result) => {
      buffer = result
      return result
    })
  }
  try {
    await engine.bounce(doc.source, {
      cycles: Math.ceil((7.5 * bpm) / 240),
      name: 'dub-isolated',
      volume: 0.8,
    })
    assert(buffer, 'Missing float render')
    const samples = buffer.getChannelData(0),
      rate = buffer.sampleRate
    const dryDocument = editDocument(doc, setValue(doc.patch, 'delay1', 'mix', 0))
    await engine.bounce(dryDocument.source, {
      cycles: Math.ceil((7.5 * bpm) / 240),
      name: 'dub-isolated-dry',
      volume: 0.8,
    })
    const dry = buffer.getChannelData(0)
    const residual = samples.map((v, i) => v - dry[i])
    const peak = (from, to) => {
      let p = 0
      for (
        let i = Math.floor(from * rate);
        i < Math.min(samples.length, Math.floor(to * rate));
        i++
      )
        p = Math.max(p, Math.abs(samples[i]))
      return p
    }
    const dryPeak = peak(0, 0.22)
    const expected = Math.min(sync / (bpm / 240), 1)
    // Fit a scaled copy of the source waveform, rather than matching envelope peaks.
    const taps = []
    for (let repeat = 1; repeat <= 3; repeat++) {
      let best = { correlation: -1 }
      const center = expected * repeat
      for (
        let shift = Math.round((center - 0.004) * rate);
        shift <= Math.round((center + (repeat * 128) / rate + 0.004) * rate);
        shift++
      ) {
        let xy = 0,
          xx = 0,
          yy = 0
        for (let i = 0; i < Math.floor(Math.min(0.2, expected * 0.8) * rate); i++) {
          const x = dry[i],
            y = residual[shift + i]
          xy += x * y
          xx += x * x
          yy += y * y
        }
        const correlation = xy / Math.sqrt(xx * yy)
        if (correlation > best.correlation)
          best = { seconds: shift / rate, correlation, scale: xy / xx }
      }
      taps.push(best)
      if (best.seconds !== undefined) {
        const shift = Math.round(best.seconds * rate)
        for (let i = 0; i < Math.floor(0.45 * rate); i++) residual[shift + i] -= dry[i] * best.scale
      }
    }
    const tailEnd = 1 / 8 / (bpm / 240) + 0.15
    const tailPeak = peak(tailEnd + 5, tailEnd + 6)
    const beforeRepeatPeak = peak(0.3, Math.min(0.45, expected - 0.01))
    return {
      bpm,
      sync,
      send,
      feedback,
      rate,
      dryPeak,
      taps,
      repeatPeaks: [1, 2, 3].map((n) => peak(expected * n, expected * n + 0.22)),
      beforeRepeatPeak,
      tailEnd,
      tailPeak,
      tailDb: 20 * Math.log10(Math.max(tailPeak, 1e-30) / dryPeak),
      duration: samples.length / rate,
    }
  } finally {
    OfflineAudioContext.prototype.startRendering = original
  }
}

export async function liveDubTail() {
  const { setValue } = await import('../src/rack/model.ts')
  const { editDocument } = await import('../src/workspace/document.ts')
  const engine = await import('../src/strudel/engine.ts')
  let doc = read(dubEntry.source)
  for (const [id, key, value] of [
    ['mix1', 'solo2', 'on'],
    ['seq2', 'steps', 'b4 ~@95'],
    ['clock2', 'division', 12],
  ])
    doc = editDocument(doc, setValue(doc.patch, id, key, value))
  await engine.stop()
  await engine.play(doc.source, { volume: 0.8, resetEffects: true })
  const attack = await liveDubPCM(150)
  await engine.stop()
  const immediate = await liveDubPCM(150)
  await pause(5700)
  const final = await liveDubPCM(1000)
  return {
    attack,
    immediate,
    final,
    tailDb: 20 * Math.log10(Math.max(final.peak, 1e-30) / attack.peak),
  }
}

export async function delayBusIdentity(action) {
  const controller = web.getSuperdoughAudioController()
  if (action === 'remember') window.dubBus = controller.nodes[2]?.delayNode
  return {
    same: window.dubBus === controller.nodes[2]?.delayNode,
    present: !!controller.nodes[2]?.delayNode,
    feedback: controller.nodes[2]?.delayNode?.feedback.value,
  }
}

export async function waitForDubReply(probe) {
  await until(() => {
    const state = probe.read(),
      reply = state.triggers.filter((t) => t.orbit === 2).at(-1)
    return reply && state.now > reply.target + 0.05 && state.now < reply.target + 0.25
  }, 'recent reply before bus edit')
}
