// Focused #210 acceptance, using the production library, editor and engine.
import * as web from '@strudel/web'
import { libraryPatches } from '../src/library/catalog.ts'
import { read } from '../src/reader/index.ts'
import { generate } from '../src/codegen/generate.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { editorSource, expectedExport } from './editor-browser.mjs'

export const doomEntry = libraryPatches().find((entry) => entry.id === 'war-pigs-doom-instrument')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const status = () => document.querySelector('.transport-status')?.textContent
function assert(ok, message) {
  if (!ok) throw new Error(message)
}
async function until(test, label) {
  for (let i = 0; i < 1000; i++) {
    if (test()) return
    await pause(25)
  }
  throw new Error(`Doom timed out: ${label}`)
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
export async function loadDoom() {
  fileAction('Patch library')
  await until(() => document.querySelector('.patch-library')?.open, 'library')
  button(doomEntry.title).click()
  await until(
    () => document.querySelector('.patch-library h3')?.textContent === doomEntry.title,
    'selection',
  )
  assert(
    document.querySelector('.patch-path').textContent === 'Complete patches / War Pigs experiments',
    'Collection path',
  )
  button('Load patch').click()
  await until(() => !document.querySelector('.patch-library'), 'load')
  assert(status() === 'Ready', 'Library load autoplayed')
  assert(editorSource() === doomEntry.source, 'Library source changed')
  return { stopped: true, modules: read(editorSource()).patch.modules.length }
}
export async function stopDoom() {
  const stop = document.querySelector('.topbar [aria-label="Stop"]')
  if (stop) {
    stop.click()
    await until(() => status() === 'Ready', 'stop')
  }
}
function events(begin, end) {
  return web
    .getPattern()
    .queryArc(begin, end, { _cps: 56 / 240 })
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
export function eventBudget(all) {
  const phrase = all.filter((e) => e.begin >= 6 && e.begin < 12)
  const windowPeak = Math.max(
    ...phrase.map(
      (e) => all.filter((other) => other.begin >= e.begin && other.begin < e.begin + 1 / 8).length,
    ),
  )
  const lifetimes = all.map((e) => ({ ...e, end: e.end + ((e.release + 0.01) * 56) / 240 }))
  const voices = overlap(lifetimes)
  const anchor = overlap(lifetimes.filter((e) => e.orbit === 1))
  assert(phrase.length <= 64 && windowPeak <= 8, 'Doom starts budget exceeded')
  assert(voices <= 8 && anchor <= 4, 'Doom voice/DRIVE overlap budget exceeded')
  assert(
    all.every((e) => e.end - e.begin <= 2 && e.release <= (e.orbit === 3 ? 1 : 0.5)),
    'Doom lifetime cap exceeded',
  )
  return { starts: phrase.length, windowPeak, voices, anchor }
}
export function verifyDoomEvents() {
  const all = events(0, 18)
  const first = all.filter((e) => e.begin < 6)
  const normalize = (e, shift = 0) => ({
    slot: (e.begin - shift) * 8,
    slots: (e.end - e.begin) * 8,
    note: String(e.note).toLowerCase(),
    orbit: e.orbit,
    velocity: e.velocity ?? 1,
  })
  const expectedAnchor = [
    [0, 9, 'b3', 1],
    [0, 9, 'e3', 1],
    [10, 1, 'd3', 0.6],
    [11, 1, 'e3', 0.75],
    [12, 9, 'a3', 0.95],
    [12, 9, 'd3', 0.95],
    [22, 1, 'g#3', 0.5],
    [23, 1, 'a3', 0.65],
    [24, 9, 'g#3', 0.8],
    [34, 1, 'd3', 0.6],
    [35, 1, 'e3', 0.75],
    [36, 9, 'a3', 0.95],
    [36, 9, 'd3', 0.95],
    [46, 1, 'g#3', 0.5],
    [47, 1, 'a3', 0.65],
  ].map(([slot, slots, note, velocity]) => ({ slot, slots, note, orbit: 1, velocity }))
  assert(
    JSON.stringify(first.filter((e) => e.orbit === 1).map((e) => normalize(e))) ===
      JSON.stringify(expectedAnchor),
    'Anchor onset/pitch/duration/accent snapshot differs',
  )
  assert(
    JSON.stringify(first.filter((e) => e.orbit === 2).map((e) => normalize(e))) ===
      JSON.stringify(
        [0, 12, 24, 36].map((slot, i) => ({
          slot,
          slots: 9,
          note: i % 2 ? 'd2' : 'e2',
          orbit: 2,
          velocity: 1,
        })),
      ),
    'Low snapshot differs',
  )
  assert(
    JSON.stringify(first.filter((e) => e.orbit === 3).map((e) => normalize(e))) ===
      JSON.stringify([{ slot: 24, slots: 16, note: 'b4', orbit: 3, velocity: 1 }]),
    'Warning snapshot differs',
  )
  for (const shift of [6, 12])
    assert(
      JSON.stringify(
        all.filter((e) => e.begin >= shift && e.begin < shift + 6).map((e) => normalize(e, shift)),
      ) === JSON.stringify(first.map((e) => normalize(e))),
      'Phrase accumulates or changes across repeats',
    )
  assert(
    first
      .filter((e) => e.orbit === 1)
      .every(
        (e) =>
          e.cutoff === 720 &&
          e.lpenv === 2 &&
          e.lpattack === e.attack &&
          e.lpdecay === e.decay &&
          e.lpsustain === e.sustain &&
          e.lprelease === e.release,
      ),
    'Shared ENV event semantics changed',
  )
  const warning = first.find((e) => e.orbit === 3)
  assert(warning.vib === 56 / 240 / 4 && warning.vibmod === 3, 'Native warning modulation differs')
  const budget = eventBudget(all)
  let rejected = false
  try {
    eventBudget(all.flatMap((e) => (e.orbit === 1 ? [e, e, e] : [e])))
  } catch {
    rejected = true
  }
  assert(rejected, 'Overlapping chord fixture passed acceptance')
  return { budget, events: first, repeats: 3, negativeChordFixtureRejected: rejected }
}
export async function doomRoundTrip() {
  await stopDoom()
  const before = editorSource()
  assert(before === doomEntry.source, 'Export must start from bundled default bytes')
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
  transfer.items.add(new File([saved], 'doom.strudel', { type: 'text/plain' }))
  const input = document.querySelector('input[type="file"]')
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => editorSource() === saved, 'reopen')
  assert(sourceBody(saved).endsWith(sourceBody(before)), 'Executable source lost on export')
  assert(
    JSON.stringify(read(saved).patch.modules) === JSON.stringify(read(before).patch.modules) &&
      JSON.stringify(read(saved).patch.cables) === JSON.stringify(read(before).patch.cables) &&
      ['name', 'names', 'railHp', 'rows'].every(
        (key) => JSON.stringify(read(saved).patch[key]) === JSON.stringify(read(before).patch[key]),
      ),
    'Full saved rack differs',
  )
  assert(generate(read(saved)) === saved, 'Exact exported bytes lost')
  assert(
    JSON.stringify(read(editorSource()).patch) === JSON.stringify(read(saved).patch),
    'Reopened export identity differs',
  )
  return {
    sourceExact: true,
    rackExact: true,
    fanout: read(saved).patch.cables.filter((c) => c.from.module === 'env1'),
  }
}
export async function bounceDoom() {
  await stopDoom()
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
      view = new DataView(buffer)
    const rate = view.getUint32(24, true),
      channels = view.getUint16(22, true),
      frames = view.getUint32(40, true) / (channels * 2)
    let peak = 0,
      sum = 0,
      clipped = 0
    for (let i = 44; i < buffer.byteLength; i += 2) {
      const sample = view.getInt16(i, true) / 32768
      peak = Math.max(peak, Math.abs(sample))
      sum += sample * sample
      if (Math.abs(sample) >= 32767 / 32768) clipped++
    }
    assert(Math.abs(frames / rate - 6 / (56 / 240)) < 1 / rate, 'Wrong phrase duration')
    assert(peak > 0.001 && clipped === 0, 'Silent or full-scale default WAV')
    const rmsWindow = (cycle, duration = 0.08) => {
      let energy = 0,
        count = 0
      for (
        let frame = Math.floor((cycle / (56 / 240)) * rate);
        frame < Math.floor((cycle / (56 / 240) + duration) * rate);
        frame++
      ) {
        const v = view.getInt16(44 + frame * channels * 2, true) / 32768
        energy += v * v
        count++
      }
      return Math.sqrt(energy / count)
    }
    return {
      seconds: frames / rate,
      rate,
      channels,
      peak,
      rms: Math.sqrt(sum / (frames * channels)),
      clipped,
      accents: { strongGsharp: rmsWindow(3.03), softGsharp: rmsWindow(2.78) },
      bytes: buffer.byteLength,
    }
  } finally {
    URL.createObjectURL = original
  }
}

// Observe actual oscillator start/stop calls and connected DRIVE worklets. This
// measures this patch on the pinned engine, not a general performance profiler.
export function installDoomProbe() {
  const oscillators = [],
    triggers = [],
    worklets = new WeakSet(),
    active = new Set()
  let cumulativeDrivePeak = 0
  // oxlint-disable-next-line typescript/unbound-method -- Each captured prototype method is called with its original receiver.
  const start = OscillatorNode.prototype.start,
    // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original oscillator receiver.
    stop = OscillatorNode.prototype.stop
  // oxlint-disable-next-line typescript/unbound-method -- Each captured prototype method is called with its original receiver.
  const connect = AudioNode.prototype.connect,
    // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original node receiver.
    disconnect = AudioNode.prototype.disconnect
  const Worklet = window.AudioWorkletNode,
    onTrigger = web.Pattern.prototype.onTrigger
  const records = new WeakMap()
  OscillatorNode.prototype.start = function (time = 0) {
    const record = {
      begin: time,
      end: null,
      frequency: this.frequency.value,
      type: this.type,
      offline: this.context instanceof OfflineAudioContext,
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
  window.AudioWorkletNode = new Proxy(Worklet, {
    construct(target, args) {
      const node = Reflect.construct(target, args)
      if (args[1] === 'distort-processor') worklets.add(node)
      return node
    },
  })
  AudioNode.prototype.connect = function (...args) {
    if (worklets.has(this) && !(this.context instanceof OfflineAudioContext)) {
      active.add(this)
      cumulativeDrivePeak = Math.max(cumulativeDrivePeak, active.size)
    }
    return connect.apply(this, args)
  }
  AudioNode.prototype.disconnect = function (...args) {
    if (worklets.has(this) && args.length === 0) active.delete(this)
    return disconnect.apply(this, args)
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
          cutoff: hap.value.cutoff,
          distort: hap.value.distort,
          postgain: hap.value.postgain,
        })
        callback(hap, now, cps, target)
      },
      dominant,
    )
  }
  return {
    read: () => ({
      oscillators: structuredClone(oscillators),
      triggers: structuredClone(triggers),
      cumulativeDrivePeak,
      activeDrive: active.size,
      orbits: Object.keys(web.getSuperdoughAudioController().nodes),
      buses: Object.keys(web.getSuperdoughAudioController().buses ?? {}),
    }),
    restore: () => {
      OscillatorNode.prototype.start = start
      OscillatorNode.prototype.stop = stop
      AudioNode.prototype.connect = connect
      AudioNode.prototype.disconnect = disconnect
      window.AudioWorkletNode = Worklet
      web.Pattern.prototype.onTrigger = onTrigger
    },
  }
}
export async function liveDoomPCM(ms = 1000) {
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

export async function immediateDoomReplay() {
  button('Play').click()
  await until(() => status() === 'Playing', 'first immediate Play')
  await pause(250)
  const before = web.getAudioContext().currentTime
  await stopDoom()
  button('Play').click()
  await until(() => status() === 'Playing', 'immediate replay')
  const elapsed = web.getAudioContext().currentTime - before
  const pcm = await liveDoomPCM(300)
  await stopDoom()
  return { before, elapsed, pcm }
}

export async function stopHeldDoom(probe) {
  let held
  await until(() => {
    const time = web.getAudioContext().currentTime
    held = probe
      .read()
      .oscillators.find(
        (o) =>
          !o.offline &&
          o.frequency > 20 &&
          o.type === 'sawtooth' &&
          time > o.begin + 0.15 &&
          time < o.end - 3,
      )
    return held
  }, 'known held anchor before Stop')
  const requestedAt = web.getAudioContext().currentTime
  await stopDoom()
  const stoppedAt = web.getAudioContext().currentTime
  const pcm = await liveDoomPCM(200)
  return { requestedAt, stoppedAt, held, pcm }
}
