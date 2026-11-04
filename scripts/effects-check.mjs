// #134 real UI/REPL/output proof. Run prepare, click Play, then verify.
import * as web from '@strudel/web'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { connect, placeModule, setValue, starterPatch } from '../src/rack/model.ts'
import { editDocument, saveLayout, sourceBody } from '../src/workspace/document.ts'
import { enableAutoApply, editorSource } from './editor-browser.mjs'
import { load } from './rack-feel-check.mjs'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (test, message) => {
  if (!test) throw new Error(message)
}
async function until(test) {
  for (let i = 0; i < 200; i++) {
    if (test()) return
    await pause(30)
  }
  throw new Error('Timed out waiting for transport')
}
function fixture(types) {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', ...types]) patch = placeModule(patch, type, 1)
  patch = setValue(patch, 'seq1', 'steps', 'c3*4')
  const chain = patch.modules.filter((m) => !['mix', 'out'].includes(m.type))
  chain.forEach((from, i) => {
    const to = chain[i + 1]
    patch = connect(
      patch,
      { module: from.id, jack: from.type === 'seq' ? 'note' : 'out' },
      { module: to?.id ?? 'mix1', jack: to?.type === 'osc' ? 'note' : to ? 'in' : 'in1' },
    )
  })
  patch = placeModule(patch, 'vca', 2)
  patch = setValue(patch, 'vca1', 'level', 0.15)
  const first = chain[1],
    second = chain[2]
  patch = connect(patch, { module: first.id, jack: 'out' }, { module: 'vca1', jack: 'in' })
  patch = connect(patch, { module: 'vca1', jack: 'out' }, { module: second.id, jack: 'in' }, true)
  return patch
}
const cases = [
  { name: 'native', types: ['vcf', 'delay', 'reverb'] },
  { name: 'reordered', types: ['reverb', 'delay', 'vcf'] },
  { name: 'repeated', types: ['vcf', 'vcf'] },
]
let captured, original
export async function prepareEffectsProof() {
  enableAutoApply()
  original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(this, callback, dominant)
  }
  await load(generate(fixture(cases[0].types)))
  return { next: 'Click Play, then verifyEffectsProof()' }
}
export async function verifyEffectsProof() {
  const results = []
  try {
    for (const { name, types } of cases) {
      document.querySelector('.topbar .play[aria-label=Stop]')?.click()
      await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
      const patch = fixture(types),
        code = generate(patch)
      await load(code)
      assert(
        JSON.stringify(read(editorSource()).patch) === JSON.stringify(read(code).patch),
        'UI rack identity',
      )
      assert(
        document.querySelector('.rack-note')?.textContent.includes('You hear:'),
        'Missing order note',
      )
      assert(
        ![...document.querySelectorAll('.rack-warning')].some((n) =>
          n.textContent.includes('regardless of cable order'),
        ),
        'Stale warning',
      )
      document.querySelector('.topbar .play[aria-label=Play]').click()
      await until(() => document.querySelector('.transport-status')?.textContent === 'Playing')
      await pause(200)
      const events = captured
        .queryArc(0, 1)
        .filter((h) => h.hasOnset())
        .map((h) => h.value)
      assert(events.length > 0, `${name}: no real scheduled events`)
      assert(
        name === 'native' ? !events[0].FX : events[0].FX?.length >= 2,
        `${name}: wrong FX representation`,
      )
      assert(
        events.every((e) => e.orbit === 1),
        `${name}: final orbit changed`,
      )
      const context = web.getAudioContext(),
        output = web.getSuperdoughAudioController().output.destinationGain
      const analyser = context.createAnalyser()
      output.connect(analyser)
      let energy = 0,
        samples = 0
      try {
        for (let i = 0; i < 35; i++) {
          const frame = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(frame)
          for (const value of frame) energy += value * value
          samples += frame.length
          await pause(30)
        }
      } finally {
        output.disconnect(analyser)
      }
      const rms = Math.sqrt(energy / samples)
      assert(rms > 0.0001, `${name}: silent PCM`)
      assert(editorSource() === code, `${name}: playback changed source`)
      results.push({
        name,
        events,
        pcm: { rms, samples },
        note: document.querySelector('.rack-note').textContent,
      })
    }
    document.querySelector('.topbar .play[aria-label=Stop]').click()
    await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
    const source = '$: note("c3").s("sine").FX(lpf(500), /* second */ lpf(1200))\n'
    const saved = saveLayout(read(source)),
      second = saved.patch.modules.filter((m) => m.type === 'vcf')[1]
    const edited = editDocument(saved, setValue(saved.patch, second.id, 'cutoff', 900))
    await load(edited.source)
    assert(
      sourceBody(editorSource()) === source.replace('1200', '900'),
      'FX literal edited surrounding source',
    )
    assert(
      JSON.stringify(read(editorSource()).patch) === JSON.stringify(edited.patch),
      'Imported FX reopen identity',
    )
    return { results, importedLiteral: true, physicalListening: false }
  } finally {
    document.querySelector('.topbar .play[aria-label=Stop]')?.click()
    if (original) web.Pattern.prototype.onTrigger = original
  }
}
