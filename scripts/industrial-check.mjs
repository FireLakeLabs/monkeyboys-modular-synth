// Focused #211 acceptance, using the production library, editor and engine.
import * as web from '@strudel/web'
import { libraryPatches } from '../src/library/catalog.ts'
import { read } from '../src/reader/index.ts'
import { generate } from '../src/codegen/generate.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { editorSource, expectedExport } from './editor-browser.mjs'

export const industrialEntry = libraryPatches().find(
  (entry) => entry.id === 'war-pigs-industrial-triplets',
)
const CPS = 56 / 240
const SLOT = 1 / 8 // One eighth note, in cycles.
const SLOT_SECONDS = SLOT / CPS
const RATIO = 2.41
const ENGINE_CLEANUP = 0.01
// Each 12/8 bar starts with a whole group of three eighths free of noise onsets.
const EMPTY_GROUPS = [0, 12, 24, 36]
const LANES = { anchor: 1, machinery: 2, low: 3 }

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
  throw new Error(`Industrial timed out: ${label}`)
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
export async function loadIndustrial() {
  fileAction('Patch library')
  await until(() => document.querySelector('.patch-library')?.open, 'library')
  button(industrialEntry.title).click()
  await until(
    () => document.querySelector('.patch-library h3')?.textContent === industrialEntry.title,
    'selection',
  )
  assert(
    document.querySelector('.patch-path').textContent === 'Complete patches / War Pigs experiments',
    'Collection path',
  )
  button('Load patch').click()
  await until(() => !document.querySelector('.patch-library'), 'load')
  assert(status() === 'Ready', 'Library load autoplayed')
  assert(editorSource() === industrialEntry.source, 'Library source changed')
  return { stopped: true, modules: read(editorSource()).patch.modules.length }
}
export async function stopIndustrial() {
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
const lifetimeEnd = (e) => e.end + (e.release + ENGINE_CLEANUP) * CPS

// Expects three phrases of expanded onsets, so windows and lifetimes cross both seams.
export function eventBudget(all) {
  const phrase = all.filter((e) => e.begin >= 6 && e.begin < 12)
  const lane = (list, orbit) => list.filter((e) => e.orbit === orbit)
  const starts = {
    total: phrase.length,
    anchor: lane(phrase, LANES.anchor).length,
    machinery: lane(phrase, LANES.machinery).length,
    low: lane(phrase, LANES.low).length,
  }
  const windowPeak = Math.max(
    ...phrase.map(
      (e) => all.filter((other) => other.begin >= e.begin && other.begin < e.begin + SLOT).length,
    ),
  )
  const lifetimes = all.map((e) => ({ ...e, end: lifetimeEnd(e) }))
  const voices = {
    total: overlap(lifetimes),
    anchor: overlap(lane(lifetimes, LANES.anchor)),
    machinery: overlap(lane(lifetimes, LANES.machinery)),
    low: overlap(lane(lifetimes, LANES.low)),
  }
  assert(
    starts.total <= 96 && starts.anchor <= 40 && starts.machinery <= 48 && starts.low <= 8,
    'Industrial phrase start budget exceeded',
  )
  assert(windowPeak <= 8, 'Industrial sliding window budget exceeded')
  assert(
    voices.total <= 8 && voices.anchor <= 4 && voices.machinery <= 2 && voices.low <= 2,
    'Industrial voice overlap budget exceeded',
  )
  assert(
    all
      .filter((e) => e.orbit !== LANES.machinery)
      .every((e) => e.end - e.begin <= 2 && e.release <= 0.25),
    'Industrial anchor/low lifetime cap exceeded',
  )
  assert(
    lane(all, LANES.machinery).every(
      (e) => e.end - e.begin <= 1 / 16 && e.attack <= 0.02 && e.release <= 0.1,
    ),
    'Industrial noise gate/envelope cap exceeded',
  )
  // Each group stays clear of onsets and of every earlier hit's gate, release and cleanup.
  const noise = lane(all, LANES.machinery)
  for (const repeat of [0, 6, 12])
    for (const slot of EMPTY_GROUPS) {
      const begin = repeat + slot * SLOT
      const end = begin + 3 * SLOT
      assert(
        noise.every((e) => e.begin >= end || lifetimeEnd(e) <= begin),
        `Noise sounds in the empty group at slot ${slot}`,
      )
    }
  return { starts, windowPeak, voices }
}

export function verifyIndustrialEvents() {
  const all = events(0, 18)
  const first = all.filter((e) => e.begin < 6)
  const normalize = (e, shift = 0) => ({
    slot: rounded((e.begin - shift) / SLOT),
    slots: rounded((e.end - e.begin) / SLOT),
    note: String(e.note).toLowerCase(),
    orbit: e.orbit,
    velocity: e.velocity ?? 1,
  })
  const snapshot = (list, orbit, row) =>
    JSON.stringify(list.filter((e) => e.orbit === orbit).map((e) => normalize(e))) ===
    JSON.stringify(row)
  const expectedAnchor = [
    [0, 10, 'b3', 1],
    [0, 10, 'e3', 1],
    [10, 0.5, 'd3', 0.6],
    [10.5, 1.5, 'e3', 0.8],
    [12, 10, 'a3', 0.95],
    [12, 10, 'd3', 0.95],
    [22, 1, 'g#3', 0.6],
    [23, 0.5, 'g#3', 0.6],
    [23.5, 0.5, 'a3', 0.7],
    [24, 10, 'g#3', 0.85],
    [34, 1, 'd3', 0.65],
    [35, 1, 'e3', 0.8],
    [36, 10, 'a3', 0.95],
    [36, 10, 'd3', 0.95],
    [46, 1, 'g#3', 0.6],
    [47, 0.5, 'g#3', 0.6],
    [47.5, 0.5, 'a3', 0.7],
  ].map(([slot, slots, note, velocity]) => ({ slot, slots, note, orbit: 1, velocity }))
  assert(
    snapshot(first, LANES.anchor, expectedAnchor),
    'Anchor onset/pitch/duration/accent snapshot differs',
  )
  const third = 1 / 6
  const bar = (offset, hits) =>
    hits.map(([slot, slots, velocity]) => ({
      slot: rounded(offset + slot),
      slots: rounded(slots),
      note: 'c3',
      orbit: 2,
      velocity,
    }))
  const double = [
    [8, 0.25, 0.45],
    [8.5, 0.25, 0.6],
  ]
  const triple = [
    [8, third, 0.4],
    [8 + 2 * third, third, 0.5],
    [8 + 4 * third, third, 0.65],
  ]
  const group = (subdivision, ghost = []) => [
    [3, 0.5, 1],
    [6, 0.5, 0.8],
    ...ghost,
    ...subdivision,
    [9, 0.5, 0.9],
  ]
  assert(
    snapshot(first, LANES.machinery, [
      ...bar(0, group(double)),
      ...bar(12, group(triple)),
      ...bar(24, group(double, [[7, 0.5, 0.5]])),
      ...bar(36, group(triple)),
    ]),
    'Machinery onset/gate/velocity snapshot differs',
  )
  assert(
    snapshot(
      first,
      LANES.low,
      [
        [0, 10, 'e2'],
        [12, 10, 'd2'],
        [22, 12, 'e2'],
        [36, 10, 'd2'],
        [46, 2, 'e2'],
      ].map(([slot, slots, note]) => ({ slot, slots, note, orbit: 3, velocity: 1 })),
    ),
    'Low snapshot differs',
  )
  for (const shift of [6, 12])
    assert(
      JSON.stringify(
        all.filter((e) => e.begin >= shift && e.begin < shift + 6).map((e) => normalize(e, shift)),
      ) === JSON.stringify(first.map((e) => normalize(e))),
      'Phrase accumulates or changes across repeats',
    )
  const anchors = first.filter((e) => e.orbit === LANES.anchor)
  const noise = first.filter((e) => e.orbit === LANES.machinery)
  assert(
    anchors.every(
      (e) =>
        e.s === 'triangle' &&
        e.fmi === 1 &&
        e.fmh === RATIO &&
        ['fmattack', 'fmdecay', 'fmsustain', 'fmrelease'].every((key) => e[key] === undefined) &&
        e.cutoff === 2200 &&
        e.lpenv === 1 &&
        e.lpattack === e.attack &&
        e.lpdecay === e.decay &&
        e.lpsustain === e.sustain &&
        e.lprelease === e.release,
    ),
    'Steady FM or anchor ENV fan-out event semantics changed',
  )
  assert(
    noise.every(
      (e) =>
        e.s === 'white' &&
        e.bandf === 2000 &&
        e.bandq === 2 &&
        e.bpenv === 1 &&
        e.bpattack === e.attack &&
        e.bpdecay === e.decay &&
        e.bpsustain === e.sustain &&
        e.bprelease === e.release,
    ),
    'Noise ENV fan-out to the BP filter changed',
  )
  const budget = eventBudget(all)
  // Each fixture exceeds one limit alone, so the named check must be what rejects it.
  const rejects = (fixture, reason) => {
    try {
      eventBudget(fixture)
    } catch (error) {
      if (reason.test(error.message)) return true
      throw error
    }
    return false
  }
  const anchor = all.find((e) => e.orbit === LANES.anchor)
  const hit = all.find((e) => e.orbit === LANES.machinery)
  const startOverrun = rejects(
    all.flatMap((e) => (e.orbit === LANES.anchor ? [e, e, e] : [e])),
    /phrase start budget/,
  )
  const overlapOverrun = rejects(
    [...all, ...[0, 6, 12].flatMap((begin) => [1, 2, 3].map(() => ({ ...anchor, begin })))],
    /voice overlap budget/,
  )
  const windowOverrun = rejects(
    [
      ...all,
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        ...hit,
        begin: 6.5 + n / 80,
        end: 6.5 + n / 80 + 0.001,
      })),
    ],
    /sliding window budget/,
  )
  const longGate = rejects(
    all.map((e) => (e.orbit === LANES.machinery && e.begin === 6.375 ? { ...e, end: 6.5 } : e)),
    /noise gate/,
  )
  const filledGroup = rejects(
    [...all, { ...hit, begin: 1 / 8, end: 1 / 8 + 1 / 16 }],
    /empty group/,
  )
  assert(
    startOverrun && overlapOverrun && windowOverrun && longGate && filledGroup,
    'An overrun fixture passed',
  )
  const laneGap = (orbit) => {
    const list = all.filter((e) => e.orbit === orbit)
    return Math.max(...list.slice(1).map((e, i) => e.begin - (list[i]?.begin ?? e.begin)))
  }
  return {
    budget,
    repeats: 3,
    negativeFixturesRejected: {
      startOverrun,
      overlapOverrun,
      windowOverrun,
      longGate,
      filledGroup,
    },
    longestGapSeconds: Math.max(...Object.values(LANES).map(laneGap)) / CPS,
    events: first.map((e) => ({
      slot: rounded(e.begin / SLOT),
      slots: rounded((e.end - e.begin) / SLOT),
      note: e.note,
      orbit: e.orbit,
      velocity: e.velocity ?? 1,
    })),
  }
}

export async function industrialRoundTrip() {
  await stopIndustrial()
  const before = editorSource()
  assert(before === industrialEntry.source, 'Export must start from bundled default bytes')
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
  transfer.items.add(new File([saved], 'industrial.strudel', { type: 'text/plain' }))
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
      .filter((c) => /^env[12]$/.test(c.from.module))
      .map((c) => `${c.from.module}->${c.to.module}.${c.to.jack}`),
  }
}

// Hann-windowed single-bin amplitude of the mono sum. Noise varies per context, so
// callers compare bounds and partials rather than sample digests.
function measure(view) {
  const rate = view.getUint32(24, true),
    channels = view.getUint16(22, true),
    frames = view.getUint32(40, true) / (channels * 2)
  const sample = (frame) => {
    let sum = 0
    for (let c = 0; c < channels; c++)
      sum += view.getInt16(44 + (frame * channels + c) * 2, true) / 32768
    return sum / channels
  }
  const span = (t0, t1) => [Math.floor(t0 * rate), Math.min(frames, Math.floor(t1 * rate))]
  const amplitude = (t0, t1, frequency) => {
    const [from, to] = span(t0, t1)
    let re = 0,
      im = 0,
      weight = 0
    for (let frame = from; frame < to; frame++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * (frame - from)) / (to - from - 1))
      const phase = (2 * Math.PI * frequency * frame) / rate
      const value = sample(frame) * hann
      re += value * Math.cos(phase)
      im -= value * Math.sin(phase)
      weight += hann
    }
    return (2 * Math.hypot(re, im)) / weight
  }
  const rms = (t0, t1) => {
    const [from, to] = span(t0, t1)
    let sum = 0
    for (let frame = from; frame < to; frame++) sum += sample(frame) ** 2
    return Math.sqrt(sum / (to - from))
  }
  const peak = (t0, t1) => {
    const [from, to] = span(t0, t1)
    let top = 0
    for (let frame = from; frame < to; frame++) top = Math.max(top, Math.abs(sample(frame)))
    return top
  }
  return { rate, channels, frames, amplitude, rms, peak }
}
const held = (wav, t0, t1, root, fifth) => {
  const window = (frequency) => wav.amplitude(t0, t1, frequency)
  const carriers = [root, fifth].map(window)
  const sidebands = [root, fifth].flatMap((f) => [window(f * (RATIO - 1)), window(f * (RATIO + 1))])
  return {
    carriers,
    sidebands,
    sidebandRatio: Math.max(...sidebands) / Math.min(...carriers),
  }
}
const seconds = (slot) => slot * SLOT_SECONDS
const hitBand = (wav, hits, low, high) => {
  let energy = 0
  for (const slot of hits)
    for (let frequency = low; frequency <= high; frequency += 100)
      energy += wav.amplitude(seconds(slot), seconds(slot) + 0.12, frequency) ** 2
  return Math.sqrt(energy)
}

export async function bounceIndustrial() {
  await stopIndustrial()
  const original = URL.createObjectURL.bind(URL)
  let blob
  URL.createObjectURL = (value) => {
    if (value.type === 'audio/wav') blob = value
    return original(value)
  }
  try {
    button('File').click()
    const input = document.querySelector('[aria-label="Bounce cycles"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '6')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await pause(0)
    button('Bounce WAV').click()
    await until(() => blob && status() === 'Ready', 'six-cycle bounce')
    const buffer = await blob.arrayBuffer(),
      view = new DataView(buffer),
      wav = measure(view)
    let peak = 0,
      sum = 0,
      clipped = 0,
      count = 0
    for (let i = 44; i < buffer.byteLength; i += 2) {
      const value = view.getInt16(i, true) / 32768
      peak = Math.max(peak, Math.abs(value))
      sum += value * value
      if (Math.abs(value) >= 32767 / 32768) clipped++
      count++
    }
    const duration = wav.frames / wav.rate
    assert(Math.abs(duration - 6 / CPS) < 1 / wav.rate, 'Wrong phrase duration')
    const hits = [3, 6, 9, 15, 18, 21, 27, 30, 33, 39, 42, 45]
    return {
      seconds: duration,
      rate: wav.rate,
      channels: wav.channels,
      bytes: buffer.byteLength,
      peak,
      rms: Math.sqrt(sum / count),
      clipped,
      // E and D dyad gates span slots 0–10 and 12–22; each window is half a second.
      fm: {
        eEarly: held(wav, 0.8, 1.3, 164.81, 246.94),
        eMid: held(wav, 2.4, 2.9, 164.81, 246.94),
        eLate: held(wav, 4.4, 4.9, 164.81, 246.94),
        dMid: held(wav, 8.8, 9.3, 146.83, 220),
      },
      // Accented hits, then a window past each hit's gate, release and cleanup.
      noise: {
        hitPeak: Math.max(...hits.map((slot) => wav.peak(seconds(slot), seconds(slot) + 0.06))),
        hitRMS: Math.max(...hits.map((slot) => wav.rms(seconds(slot), seconds(slot) + 0.06))),
        afterGateRMS: Math.max(
          ...hits.map((slot) => wav.rms(seconds(slot) + 0.34, seconds(slot) + 0.5)),
        ),
        emptyGroupRMS: Math.max(
          ...EMPTY_GROUPS.map((slot) => wav.rms(seconds(slot), seconds(slot + 3))),
        ),
        band: hitBand(wav, hits, 1600, 2400),
        upperBand: hitBand(wav, hits, 2600, 3400),
      },
      // Carrier level under the first hit of each bar, compared across renders.
      carrierDuringHit: [
        wav.amplitude(seconds(3), seconds(3.5), 164.81),
        wav.amplitude(seconds(15), seconds(15.5), 146.83),
      ],
      lowRoot: wav.amplitude(2.4, 2.9, 82.41),
    }
  } finally {
    URL.createObjectURL = original
  }
}

// Observe actual source starts and stops. This measures this patch on the pinned
// engine; it is not a general performance profiler.
export function installIndustrialProbe() {
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
          orbit: hap.value.orbit,
          fmi: hap.value.fmi,
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

// Sorts probed live sources into the lanes this patch's triangle/sine split allows.
export function sources(state, after = -Infinity) {
  const live = state.oscillators.filter((o) => !o.offline && (o.end ?? Infinity) > after)
  const anchor = live.filter((o) => o.type === 'triangle' && o.frequency >= 100)
  const low = live.filter((o) => o.type === 'triangle' && o.frequency < 100)
  const modulators = live.filter((o) => o.type === 'sine')
  const noise = state.noises.filter((n) => !n.offline && (n.end ?? Infinity) > after)
  const peaks = {
    primary: overlap([...anchor, ...low]),
    anchor: overlap(anchor),
    low: overlap(low),
    modulators: overlap(modulators),
    noise: overlap(noise),
  }
  return { anchor, low, modulators, noise, peaks }
}

export async function liveIndustrialPCM(ms = 1000) {
  const controller = web.getSuperdoughAudioController(),
    analyser = controller.audioContext.createAnalyser()
  controller.output.destinationGain.connect(analyser)
  let peak = 0,
    sum = 0,
    count = 0
  try {
    for (let elapsed = 0; elapsed < ms; elapsed += 25) {
      const frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      for (const v of frame) {
        peak = Math.max(peak, Math.abs(v))
        sum += v * v
        count++
      }
      await pause(25)
    }
  } finally {
    controller.output.destinationGain.disconnect(analyser)
  }
  return { peak, rms: Math.sqrt(sum / count) }
}

export async function immediateIndustrialReplay() {
  button('Play').click()
  await until(() => status() === 'Playing', 'first immediate Play')
  await pause(250)
  const before = web.getAudioContext().currentTime
  await stopIndustrial()
  button('Play').click()
  await until(() => status() === 'Playing', 'immediate replay')
  const elapsed = web.getAudioContext().currentTime - before
  const pcm = await liveIndustrialPCM(300)
  await stopIndustrial()
  return { before, elapsed, pcm }
}

export async function stopHeldIndustrial(probe) {
  let heldVoice
  await until(() => {
    const time = web.getAudioContext().currentTime
    heldVoice = probe
      .read()
      .oscillators.find(
        (o) =>
          !o.offline &&
          o.frequency >= 100 &&
          o.type === 'triangle' &&
          time > o.begin + 0.15 &&
          time < o.end - 3,
      )
    return heldVoice
  }, 'known held anchor before Stop')
  const requestedAt = web.getAudioContext().currentTime
  await stopIndustrial()
  const stoppedAt = web.getAudioContext().currentTime
  const pcm = await liveIndustrialPCM(200)
  return { requestedAt, stoppedAt, held: heldVoice, pcm }
}
