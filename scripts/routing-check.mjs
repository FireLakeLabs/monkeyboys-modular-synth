// Real-browser acceptance helpers; imported only by the routing browser driver.
import * as web from '@strudel/web'
import { play, stop } from '../src/strudel/engine.ts'
import { createPlayback } from '../src/strudel/playback.ts'
import { generate } from '../src/codegen/generate.ts'
import { routingFixture } from '../src/testing/routingCases.ts'
import { read } from '../src/reader/read.ts'
import { saveLayout } from '../src/workspace/document.ts'
import { connect, setValue, removeCable, placeModule } from '../src/rack/model.ts'
import { editorSource, replaceSource } from './editor-browser.mjs'

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const require = (value, message) => {
  if (!value) throw new Error(message)
}
const identity = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
async function until(test) {
  for (let i = 0; i < 150; i++) {
    if (test()) return
    await pause(40)
  }
  throw new Error('Routing UI did not settle')
}
let captured, original
export function prepare() {
  original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(this, callback, dominant)
  }
}
export async function load(kind, look = 'instrument') {
  document.querySelector('.topbar .play[aria-label=Stop]')?.click()
  await stop()
  let patch = routingFixture(kind)
  patch = { ...patch, modules: patch.modules.map((m) => ({ ...m, look })) }
  const source = generate(patch)
  replaceSource(source)
  await until(
    () =>
      editorSource() === source &&
      document.querySelectorAll('[data-module]').length === patch.modules.length &&
      patch.modules.every((m) =>
        document.querySelector(`[data-module="${m.id}"]`)?.classList.contains(`look-${look}`),
      ) &&
      document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  require(identity(read(source).patch) === identity(patch), 'Generated saved identity')
  require(identity(read(saveLayout(read(source)).source).patch) ===
    identity(patch), 'Reopened identity')
  return { modules: patch.modules.length, sourceExact: editorSource() === source }
}
async function pcm(node, ms = 1800) {
  const ac = web.getAudioContext(),
    analyser = ac.createAnalyser()
  analyser.fftSize = 4096
  node.connect(analyser)
  const data = new Float32Array(analyser.fftSize),
    frames = []
  try {
    for (let i = 0; i < Math.ceil(ms / 25); i++) {
      analyser.getFloatTimeDomainData(data)
      frames.push(Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length))
      await pause(25)
    }
  } finally {
    node.disconnect(analyser)
  }
  return { rms: Math.sqrt(frames.reduce((sum, v) => sum + v * v, 0) / frames.length), frames }
}
export async function verify(kind) {
  await until(() => document.querySelector('.transport-status')?.textContent === 'Playing')
  await pause(350)
  const pattern = captured
  require(pattern?.queryArc, 'Missing actual scheduled pattern')
  const events = pattern
    .queryArc(0, 4)
    .filter((h) => h.hasOnset())
    .map((h) => ({ begin: Number(h.whole.begin), ...h.value }))
  require(events.length > 0, 'Missing scheduled events')
  const controller = web.getSuperdoughAudioController()
  const measured = await pcm(controller.output.destinationGain)
  require(measured.rms > 0.0001, `${kind} silent PCM`)
  if (kind === 'gates') require(events.filter((e) => e.begin < 1).length === 5, 'GATES attacks')
  if (kind === 'switch') {
    const notes = events.toSorted((a, b) => a.begin - b.begin).map((e) => e.note)
    require(identity(notes) === identity(['c3', 'c3', 'd3', 'e3']), 'SWITCH cycle selection')
  }
  if (kind === 'aux')
    require(events.some((e) => e.s === 'bus' && e.n === 1) &&
      events.filter((e) => e.bus === 1).length === 32, 'AUX routing')
  if (kind === 'duck') {
    require(events.some((e) => e.duckorbit === 2), 'DUCK target')
    const gains = []
    for (let i = 0; i < 80; i++) {
      gains.push(controller.nodes[2].output.gain.value)
      await pause(10)
    }
    require(Math.min(...gains) < 0.8 && Math.max(...gains) > 0.95, 'DUCK did not move target gain')
    measured.targetGain = { min: Math.min(...gains), max: Math.max(...gains) }
  }
  if (kind === 'audio-mod')
    require(events.some((e) => e.bmod?.[0]?.bus === 1) &&
      events.some((e) => e.bus === 1 && e.dry === 0), 'Audio bus events')
  const source = editorSource()
  require(generate(read(source)) === source, 'Playback changed exact source')
  return {
    kind,
    events: events.length,
    rms: measured.rms,
    ...(measured.targetGain ? { targetGain: measured.targetGain } : {}),
    sampleRate: web.getAudioContext().sampleRate,
    sourceExact: true,
    savedIdentity: true,
    busKeys: Object.keys(controller.buses),
    physicalListening: false,
  }
}
export function inspectCable() {
  const cable = document.querySelector('.cable.signal-audio-mod')
  require(cable, 'Missing audio-mod cable')
  const core = cable.querySelector('.audio-mod-core'),
    outer = cable.querySelector('.cable-paint')
  require(core && outer, 'Missing double stroke')
  require(getComputedStyle(core).strokeDasharray === '3px, 7px', 'Missing distinct dash')
  require(getComputedStyle(core).stroke !== getComputedStyle(outer).stroke, 'Missing two tones')
  const jack = document.querySelector('[data-jack="vcf1:cv"]')
  require(jack.getAttribute('aria-label').includes('audio-mod'), 'Missing accessible signal')
  require(getComputedStyle(jack, '::after').content.includes('≋'), 'Missing non-colour jack center')
  return {
    dash: getComputedStyle(core).strokeDasharray,
    inner: getComputedStyle(core).stroke,
    outer: getComputedStyle(outer).stroke,
    jack: jack.getAttribute('aria-label'),
    mark: '≋',
  }
}
export async function verifyReset() {
  await stop()
  const patch = routingFixture('audio-mod'),
    transport = createPlayback(patch)
  await transport.play()
  await pause(300)
  const controller = web.getSuperdoughAudioController(),
    first = controller.buses[1]
  require(first, 'Missing first bus')
  await transport.update(setValue(patch, 'vcf1', 'cutoff', 800))
  await pause(250)
  require(controller.buses[1] === first, 'Knob reset bus')
  await transport.update({ ...patch, prelude: 'const reserved = s("sine").bus(1)' })
  await until(() => controller.buses[2])
  const second = controller.buses[2]
  require(second &&
    second !== first &&
    !controller
      .buses[1], `Allocation did not replace bus state: ${identity({ keys: Object.keys(controller.buses), sameFirst: controller.buses[1] === first, state: transport.getSnapshot() })}`)
  await transport.stop()
  await transport.play()
  await until(() => controller.buses[2] && controller.buses[2] !== second)
  require(controller.buses[1] === undefined &&
    controller.buses[2] !== second, 'Stop/replay reused stale bus')
  await transport.stop()
  return { knobRetainsBus: true, reservationRenumbersAndResets: true, replayResets: true }
}
export async function verifyAudioRate() {
  // A VCA makes the carrier's 40-Hz sidebands measurable within one long note.
  let patch = routingFixture('audio-mod')
  patch = removeCable(
    patch,
    patch.cables.find((c) => c.to.module === 'vcf1' && c.to.jack === 'cv').id,
  )
  patch = placeModule(patch, 'vca', 3)
  patch = setValue(patch, 'vca1', 'level', 0.2)
  patch = setValue(patch, 'seq1', 'steps', 'c3/8')
  patch = connect(patch, { module: 'osc2', jack: 'out' }, { module: 'vca1', jack: 'in' })
  patch = connect(patch, { module: 'vca1', jack: 'out' }, { module: 'mix1', jack: 'in1' }, true)
  async function spectrum(p) {
    await stop()
    await play(generate(p), { resetEffects: true })
    await pause(550)
    const ac = web.getAudioContext(),
      node = web.getSuperdoughAudioController().output.destinationGain
    const a = ac.createAnalyser()
    a.fftSize = 16384
    a.smoothingTimeConstant = 0
    node.connect(a)
    try {
      await pause(400)
      const bins = new Float32Array(a.frequencyBinCount)
      a.getFloatFrequencyData(bins)
      const peak = (hz) =>
        Math.max(
          ...bins.slice(
            Math.floor(((hz - 6) * a.fftSize) / ac.sampleRate),
            Math.ceil(((hz + 6) * a.fftSize) / ac.sampleRate),
          ),
        )
      return { carrier: peak(130.8128), lower: peak(90.8128), upper: peak(170.8128) }
    } finally {
      node.disconnect(a)
    }
  }
  const baseline = await spectrum(patch)
  const modulated = await spectrum(
    connect(patch, { module: 'osc1', jack: 'out' }, { module: 'vca1', jack: 'cv' }),
  )
  await stop()
  require(modulated.lower > baseline.lower + 15 &&
    modulated.upper > baseline.upper + 15, 'Missing audio-rate sidebands')
  return { baseline, modulated, withinNoteAudioRate: true, physicalListening: false }
}
export async function finish() {
  await stop()
  web.Pattern.prototype.onTrigger = original
}

export function inspectPanel(kind) {
  const m = document.querySelector(`[data-module="${kind}1"]`)
  require(m, `Missing ${kind} panel`)
  const rect = m.getBoundingClientRect(),
    jacks = [...m.querySelectorAll('[data-jack]')]
  for (const jack of jacks) {
    const r = jack.getBoundingClientRect()
    require(r.width >= 23.5 && r.height >= 23.5, `${kind} jack below 24px target`)
    require(r.left >= rect.left - 1 &&
      r.right <= rect.right + 1 &&
      r.top >= rect.top - 1 &&
      r.bottom <= rect.bottom + 1, `${kind} jack outside panel`)
  }
  return { kind, jacks: jacks.length, width: rect.width }
}

export async function verifySoloRouting() {
  const results = []
  for (const kind of ['aux', 'audio-mod', 'duck']) {
    await stop()
    const patch = setValue(routingFixture(kind), 'mix1', kind === 'duck' ? 'solo2' : 'solo1', 'on')
    await play(generate(patch), { resetEffects: true })
    const haps = captured
      .queryArc(0, 1)
      .filter((h) => h.hasOnset())
      .map((h) => h.value)
    const privateVoices = haps.filter((h) =>
      kind === 'duck' ? h.duckorbit !== undefined : h.bus !== undefined,
    )
    require(privateVoices.length ===
      (kind === 'aux'
        ? 8
        : kind === 'duck'
          ? 4
          : 1), `${kind} solo lost private routing: ${privateVoices.length}`)
    require(privateVoices.every(
      (h) => h.dry === 0 && h.delay === 0 && h.room === 0,
    ), `${kind} private routing became audible`)
    require(haps.some((h) => h.dry !== 0), `${kind} solo lost its destination`)
    results.push({ kind, privateEvents: privateVoices.length, silentPrivateOutput: true })
  }
  await stop()
  return results
}
export async function verifyDuckLeadingRest() {
  await stop()
  let patch = setValue(routingFixture('duck'), 'seq2', 'steps', '~ c3')
  patch = setValue(patch, 'mix1', 'channels2', '3:4')
  const transport = createPlayback(patch),
    unsubscribe = transport.subscribe(() => {})
  const observations = []
  try {
    for (const action of ['startup', 'structural replacement', 'replay']) {
      if (action === 'startup') await transport.play()
      else if (action === 'replay') {
        await transport.stop()
        await transport.play()
      } else {
        patch = { ...patch, prelude: 'const keep = s("sine").bus(5)' }
        await transport.update(patch)
        // Actual cable topology replacement, not just changing a knob.
        patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in3' })
        await transport.update(patch)
      }
      await pause(150)
      require(transport.getSnapshot().status ===
        'playing', `${action}: leading rest stopped playback: ${transport.getSnapshot().error}`)
      const controller = web.getSuperdoughAudioController(),
        routed = []
      const connectOutput = controller.output.connectToDestination
      controller.output.connectToDestination = (input, channels) => {
        if (input === controller.nodes[2]?.output) routed.push(channels)
        return connectOutput(input, channels)
      }
      try {
        await pause(2200)
        require(transport.getSnapshot().status ===
          'playing', `${action}: DUCK failed after target onset: ${transport.getSnapshot().error}`)
        require(routed.some(
          (channels) => identity(channels) === identity([2, 3]),
        ), `${action}: target output pair changed`)
        observations.push({ action, playingThroughLeadingRest: true, targetChannels: [2, 3] })
      } finally {
        controller.output.connectToDestination = connectOutput
      }
    }
  } finally {
    await transport.stop()
    unsubscribe()
  }
  return observations
}
