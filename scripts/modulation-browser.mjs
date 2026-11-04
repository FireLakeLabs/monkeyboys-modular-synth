// Real pinned-engine PCM probe, served by Vite. Does not form part of the app bundle.
import { play, stop } from '../src/strudel/engine.ts'
import * as web from '@strudel/web'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/read.ts'
import { saveLayout, sourceBody } from '../src/workspace/document.ts'
import { starterPatch, placeModule, connect, setValue } from '../src/rack/model.ts'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const identity = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )
const require = (condition, message) => {
  if (!condition) throw new Error(message)
}

export function sustainedPatch(
  mode = 'SMOOTH',
  depth = 0.4,
  { target = 'vca', nested = false, source = 'lfo' } = {},
) {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', 'code', 'vca', source]) patch = placeModule(patch, type, 1)
  for (const [from, to, jack] of [
    ['seq1', 'osc1', 'note'],
    ['osc1', 'code1', 'in'],
    ['code1', 'vca1', 'in'],
    ['vca1', 'mix1', 'in1'],
    [`${source}1`, target === 'mix' ? 'mix1' : 'vca1', target === 'mix' ? 'cv1' : 'cv'],
  ])
    patch = connect(
      patch,
      { module: from, jack: from === 'seq1' ? 'note' : 'out' },
      { module: to, jack },
    )
  for (const [module, id, value] of [
    ['seq1', 'steps', 'c3/8'],
    ['osc1', 'wave', 'sine'],
    ['code1', 'text', '.attack(.01).decay(.01).sustain(1).release(.01)'],
    ['vca1', 'level', target === 'mix' ? 1 : 0.2],
    ...(source === 'lfo'
      ? [
          ['lfo1', 'mode', mode],
          ['lfo1', 'rate', 0.5],
          ['lfo1', 'depth', depth],
        ]
      : source === 'env'
        ? [
            ['env1', 'depth', depth],
            ['env1', 'atk', 2],
          ]
        : [['cvseq1', 'steps', '<.2 .6>']]),
  ])
    patch = setValue(patch, module, id, value)
  if (target === 'mix') patch = setValue(patch, 'mix1', 'ch1', 0.2)
  if (nested) {
    patch = placeModule(patch, 'mix', 3)
    patch = setValue(patch, 'mix2', 'ch1', 0.5)
    patch = connect(patch, { module: 'mix1', jack: 'out' }, { module: 'mix2', jack: 'in1' })
    patch = connect(patch, { module: 'mix2', jack: 'out' }, { module: 'out1', jack: 'in' }, true)
  }
  return patch
}

export async function measureSustained(mode = 'SMOOTH', depth = 0.4, options = {}) {
  await stop()
  await pause(300)
  const patch = sustainedPatch(mode, depth, options)
  const code = generate(patch)
  const document = read(code)
  require(identity(document.patch) === identity(patch), 'Generated rack identity')
  require(identity(read(saveLayout(document).source).patch) ===
    identity(patch), 'Saved rack identity')
  globalThis.modulationOnsets = []
  const source = sourceBody(code).replace(
    '.orbit(1)',
    '.orbit(1).onTrigger((hap, now, cps, t) => globalThis.modulationOnsets.push({begin:String(hap.whole.begin), end:String(hap.whole.end), t}), false)',
  )
  await play(source, { resetEffects: true })
  const ac = web.getAudioContext()
  const output = web.getSuperdoughAudioController().output.destinationGain
  const analyser = ac.createAnalyser()
  analyser.fftSize = 2048
  output.connect(analyser)
  const frames = []
  const samples = new Float32Array(analyser.fftSize)
  for (let i = 0; i < 180; i++) {
    analyser.getFloatTimeDomainData(samples)
    frames.push(Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length))
    await pause(30)
  }
  output.disconnect(analyser)
  await stop()
  const sounding = frames.slice(25).filter((v) => v > 0.00001)
  require(sounding.length > 100, 'Sustained PCM missing')
  const sorted = sounding.toSorted((a, b) => a - b)
  const low = sorted[Math.floor(sorted.length * 0.1)],
    high = sorted[Math.floor(sorted.length * 0.9)]
  const ratio = high / low
  require(globalThis.modulationOnsets.length ===
    1, `Expected one note, got ${globalThis.modulationOnsets.length}`)
  if (!options.source || options.source === 'lfo')
    require(mode === 'SMOOTH' ? ratio > 1.5 : ratio < 1.1, `Within-note ${mode} ratio ${ratio}`)
  return {
    mode,
    ...options,
    depth,
    sampleRate: ac.sampleRate,
    low,
    high,
    ratio,
    onsets: globalThis.modulationOnsets,
    frames,
    physicalListening: false,
    executable: sourceBody(code),
  }
}
