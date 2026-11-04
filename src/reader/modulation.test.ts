import utilitiesSource from '../library/patches/modulation-utilities.strudel?raw'
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { generate, generateDocument } from '../codegen/generate'
import { graph } from '../codegen/graph'
import { connect, placeModule, setLook, setValue, starterPatch } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { read } from './read'
import { parseSource } from './syntax'
import type { Patch } from '../patch/types'

let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs'].map(
        (entry) => import(/* @vite-ignore */ entry),
      ),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(source: string): unknown {
  const parsed = parseSource(source)
  const declarations = parsed.scopes
    .filter((s) => s.kind === 'declaration')
    .map((s) => `const ${s.descriptor.anchor} = ${source.slice(s.start, s.end)};`)
    .join('\n')
  const voices = parsed.scopes
    .filter((s) => s.kind === 'voice')
    .map(
      (s) =>
        `(${source.slice(s.start, s.end)}).queryArc(0, 4).map(h => ({ value: h.value, begin: h.whole.begin.toString(), end: h.whole.end.toString() }))`,
    )
  // Repository-owned fixtures only, using the pinned real engine without browser audio.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(...Object.keys(runtime), `${declarations}\nreturn [${voices.join(',')}];`)(
    ...Object.values(runtime),
  )
}
function fixture(
  target: string,
  control: string,
  source: string,
  values: Record<string, number | string> = {},
): Patch {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', ...(target === 'osc' ? [] : [target]), source])
    patch = placeModule(patch, type, patch.modules.length)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  if (target !== 'osc')
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: `${target}1`, jack: 'in' })
  patch = connect(patch, { module: `${target}1`, jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const jack = getModuleSpec(target).jacks.find((j) => j.cvTarget === control)
  if (!jack) throw new Error('Missing target jack')
  patch = connect(
    patch,
    { module: `${source}1`, jack: 'out' },
    { module: `${target}1`, jack: jack.id },
  )
  for (const [id, value] of Object.entries(values)) patch = setValue(patch, `${source}1`, id, value)
  return patch
}

const targets = CATALOG.flatMap((spec) =>
  spec.jacks.filter((j) => j.cvTarget).map((j) => ({ type: spec.id, control: j.cvTarget ?? '' })),
).filter((t) => t.type !== 'mix')
describe.each(targets)('$type $control generalized CV', ({ type, control }) => {
  for (const [source, values] of [
    ['lfo', { mode: 'SMOOTH' }],
    ['lfo', { mode: 'STEP' }],
    ['env', {}],
    ['cvseq', { steps: type === 'vcf' ? '<400 800 1200>' : '<0 1 0>' }],
  ] as const) {
    const name = `${source} ${'mode' in values ? values.mode : ''}`
    it(`${name}: writes a real target and independently restores exact saved state`, () => {
      const patch = fixture(type, control, source, values)
      const generated = generateDocument(patch)
      const doc = read(generated.code)
      expect(doc.layout).toBe('restored')
      expect(doc.patch).toEqual(patch)
      expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(false)
      expect(doc.bindings.some((b) => b.module === `${source}1` && b.role === 'cv')).toBe(true)
      expect(read(saveLayout(doc).source).patch).toEqual(patch)
    })
    it(`${name}: exact source and real engine events survive a source-owned round trip`, () => {
      const body = sourceBody(generate(fixture(type, control, source, values)))
      const sourceText = body.replace('$: ', '// preserved voice\n$: ').replace(/\n  /g, '\n    ')
      const doc = read(sourceText)
      expect(generate(doc)).toBe(sourceText)
      expect(doc.patch.modules.some((m) => m.type === source)).toBe(true)
      expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
      expect(events(generate(doc.patch))).toEqual(events(sourceText))
    })
  }
})

it('defaults a new LFO to SMOOTH but imports and saves legacy signals as STEP without changing bytes', () => {
  const patch = placeModule(starterPatch(), 'lfo', 1)
  expect(patch.modules.find((m) => m.type === 'lfo')?.values.mode).toBe('SMOOTH')
  const source = '$: note("c3").s("sine").lpf(sine.range(800, 2400).slow(4))\n'
  const doc = read(source)
  expect(doc.patch.modules.find((m) => m.type === 'lfo')?.values.mode ?? 'STEP').toBe('STEP')
  expect(generate(doc)).toBe(source)
  expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
})

it('writes native VCA/filter envelopes and native pitch envelope/vibrato units', () => {
  expect(sourceBody(generate(fixture('vca', 'level', 'env')))).toContain('.attack(0.01)')
  expect(sourceBody(generate(fixture('vcf', 'cutoff', 'env')))).not.toContain('.env(')
  expect(sourceBody(generate(fixture('vcf', 'cutoff', 'env')))).toContain('.lpenv(4)')
  expect(sourceBody(generate(fixture('osc', 'tune', 'env', { depth: 7 })))).toContain('.penv(7)')
  expect(sourceBody(generate(fixture('osc', 'tune', 'lfo', { depth: 2 })))).toContain(
    '.vib(0.125).vibmod(2)',
  )
})

for (const [chain, expected] of [
  [['samplehold'], 'sine.slow(4).segment(8)'],
  [['attenuverter'], 'sine.slow(4).mul(1).range(0, 1)'],
  [['samplehold', 'attenuverter'], 'sine.slow(4).segment(8).mul(1).range(0, 1)'],
] as const) {
  it(`round trips ${chain.join(' → ')} as pattern modulation with actual engine events`, () => {
    let patch = fixture('vcf', 'cutoff', 'lfo', { mode: 'STEP' })
    patch = { ...patch, cables: patch.cables.filter((c) => c.from.module !== 'lfo1') }
    let previous = 'lfo1'
    for (const type of chain) {
      patch = placeModule(patch, type, patch.modules.length)
      patch = connect(patch, { module: previous, jack: 'out' }, { module: `${type}1`, jack: 'in' })
      previous = `${type}1`
    }
    patch = connect(patch, { module: previous, jack: 'out' }, { module: 'vcf1', jack: 'cv' })
    const code = generate(patch)
    expect(sourceBody(code)).toContain(`.lpf(${expected})`)
    expect(read(code).patch).toEqual(patch)
    const plain = read(sourceBody(code))
    expect(plain.patch.modules.some((m) => m.type === chain[0])).toBe(true)
    expect(events(generate(plain.patch))).toEqual(events(code))
    expect(read(saveLayout(plain).source).patch).toEqual(plain.patch)
  })
}

it('mixes two numeric sequences and supports exponential attenuverter mapping', () => {
  const source =
    '$: note("c3*4").s("sine").lpf(mini("400 800").add(mini("0 200"))).lpq(1).orbit(1)\n'
  const doc = read(source)
  expect(doc.patch.modules.filter((m) => m.type === 'cvseq')).toHaveLength(2)
  expect(doc.patch.modules.some((m) => m.type === 'modmix')).toBe(true)
  expect(doc.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toEqual([
    '.orbit(1)',
  ])
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
  const exp = '$: note("c3*4").s("sine").lpf(sine.mul(-0.5).rangex(100, 1000)).lpq(1).orbit(1)'
  const exponential = read(exp)
  expect(exponential.patch.modules.find((m) => m.type === 'attenuverter')?.values.scale).toBe('EXP')
  expect(events(generate(exponential.patch))).toEqual(events(exp))
  expect(read(saveLayout(exponential).source).patch).toEqual(exponential.patch)
})

it('rejects incompatible signals, utility cycles and invalid depths at the graph boundary', () => {
  const patch = fixture('vcf', 'cutoff', 'lfo')
  expect(() => setValue(patch, 'lfo1', 'depth', 11000)).toThrow('depth')
  const added = placeModule(patch, 'samplehold', 5)
  expect(() =>
    connect(added, { module: 'osc1', jack: 'out' }, { module: 'samplehold1', jack: 'in' }),
  ).toThrow('signal')
  expect(() =>
    graph({
      ...added,
      cables: [
        ...added.cables,
        {
          id: 'loop',
          from: { module: 'samplehold1', jack: 'out' },
          to: { module: 'samplehold1', jack: 'in' },
        },
      ],
    }),
  ).toThrow('cycles')
})

it('keeps unsupported modulator objects as CODE with exact source', () => {
  const source = '$: note("c3").s("sine").lpf(800).lfo({ sync: 1, curve: 3 }).env({ a: 1 })'
  const doc = read(source)
  expect(generate(doc)).toBe(source)
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toHaveLength(2)
})

it('preserves a shared SMOOTH LFO across targets with independent target-unit defaults', () => {
  let patch = fixture('vcf', 'cutoff', 'lfo')
  patch = placeModule(patch, 'vca', 6)
  patch = connect(patch, { module: 'vcf1', jack: 'out' }, { module: 'vca1', jack: 'in' })
  patch = connect(patch, { module: 'vca1', jack: 'out' }, { module: 'mix1', jack: 'in1' }, true)
  patch = connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'vca1', jack: 'cv' })
  const doc = read(generate(patch))
  expect(doc.patch).toEqual(patch)
  expect(read(saveLayout(doc).source).patch).toEqual(patch)
})

it('keeps an explicit CODE amplitude envelope beside SMOOTH CV through save/reopen', () => {
  let patch = fixture('vca', 'level', 'lfo')
  patch = placeModule(patch, 'code', 8)
  patch = setValue(patch, 'code1', 'text', '.attack(.01).decay(.01).sustain(1).release(.01)')
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'code1', jack: 'in' })
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'vca1', jack: 'in' }, true)
  expect(read(saveLayout(read(generate(patch))).source).patch).toEqual(patch)
})

it.each(['lfo', 'cvseq', 'samplehold', 'attenuverter', 'modmix'])(
  'reads and saves named %s outputs without losing their graph',
  (type) => {
    let patch: Patch
    if (['samplehold', 'attenuverter', 'modmix'].includes(type)) {
      const library = read(utilitiesSource).patch
      patch = { ...library, names: { ...library.names, [`${type}1:out`]: 'motion' } }
    } else {
      patch = fixture('vcf', 'cutoff', type, type === 'lfo' ? { mode: 'STEP' } : {})
      patch = { ...patch, names: { [`${type}1:out`]: 'motion' } }
    }
    const code = generate(patch)
    const doc = read(code)
    expect(doc.patch).toEqual(patch)
    expect(doc.bindings.some((b) => b.module === `${type}1` && b.role === 'cv')).toBe(true)
    expect(read(saveLayout(doc).source).patch).toEqual(patch)
    expect(events(generate(read(sourceBody(code)).patch))).toEqual(events(code))
  },
)

const coupledCases = [
  ['lfo', 'mode', 'STEP', '.range(800, 2400)'],
  ['lfo', 'skew', 0.25, 'skew: 0.25'],
  ['env', 'depth', 6, '.penv(6)'],
  ['samplehold', 'rate', 4, '.segment(4)'],
  ['attenuverter', 'amount', -0.5, '.mul(-0.5)'],
  ['attenuverter', 'min', 100, '.range(100, 1500)'],
  ['attenuverter', 'max', 2000, '.range(300, 2000)'],
  ['attenuverter', 'scale', 'EXP', '.rangex(300, 1500)'],
  ['cvseq', 'steps', '<0 400>', 'mini("<0 400>")'],
] as const
it.each(coupledCases)(
  'edits coupled %s.%s and independently reopens its saved identity',
  (type, id, value, token) => {
    const patch =
      type === 'lfo'
        ? fixture('vcf', 'cutoff', 'lfo')
        : type === 'env'
          ? fixture('osc', 'tune', 'env')
          : read(utilitiesSource).patch
    const original = read(generate(patch))
    const changed = editDocument(original, setValue(patch, `${type}1`, id, value))
    expect(changed.patch.modules.find((m) => m.id === `${type}1`)?.values[id]).toEqual(value)
    expect(sourceBody(changed.source)).toContain(token)
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(read(saveLayout(changed).source).patch).toEqual(changed.patch)
    expect(events(generate(read(sourceBody(changed.source)).patch))).toEqual(events(changed.source))
  },
)

it('rejects smooth inputs to pattern utilities until S&H or STEP makes sampling explicit', () => {
  const patch = placeModule(fixture('vcf', 'cutoff', 'lfo'), 'attenuverter', 7)
  expect(() =>
    connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'attenuverter1', jack: 'in' }),
  ).toThrow('STEP')
  const sampled = placeModule(patch, 'samplehold', 8)
  expect(() =>
    connect(sampled, { module: 'lfo1', jack: 'out' }, { module: 'samplehold1', jack: 'in' }),
  ).not.toThrow()
  expect(() => setValue(fixture('vcf', 'cutoff', 'cvseq'), 'cvseq1', 'steps', 'c3')).toThrow(
    'Invalid control',
  )
})

it('keeps unsupported bias/implicit-target objects exact rather than projecting a different modulation', () => {
  for (const suffix of [
    '.gain(.8).lfo({sync:.25,depthabs:-.5,dc:0,shape:"sine",skew:.5})',
    '.lpf(800).lpq(1).lfo({sync:.25,depthabs:2,dc:0,shape:"sine",skew:.5})',
  ]) {
    const source = `$: note("c3").s("sine")${suffix}`
    const doc = read(source)
    expect(doc.patch.modules.some((m) => m.type === 'lfo')).toBe(false)
    expect(generate(doc)).toBe(source)
  }
})

it.each(['setcpm(15)', 'setCpm(60/4)', 'setcps(.25)'])(
  'preserves pitch vibrato rate with %s',
  (tempo) => {
    const source = `${tempo}; $: note("c3").s("sine").transpose(0).vib(.125).vibmod(2).orbit(1)`
    const doc = read(source)
    expect(doc.patch.modules.find((m) => m.type === 'lfo')?.values.rate).toBe(2)
    expect(events(generate(doc.patch))).toEqual(events(source))
    expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
  },
)

it('does not invent a target range for an unscaled signal argument', () => {
  const source = '$: note("c3").s("sine").lpf(sine)'
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'lfo')).toBe(false)
  expect(generate(doc)).toBe(source)
})

it.each([40, 120, 240])(
  'retains OSC modulation ownership at the slowest pitch LFO rate, BPM %i',
  (bpm) => {
    const patch = setValue(fixture('osc', 'tune', 'lfo', { rate: 16 }), 'out1', 'bpm', bpm)
    const doc = read(generate(patch))
    expect(doc.bindings.some((b) => b.module === 'lfo1' && b.role === 'cv')).toBe(true)
    expect(read(saveLayout(doc).source).patch).toEqual(patch)
    const changed = editDocument(doc, setLook(patch, 'osc1', 'powder'))
    expect(read(changed.source).patch).toEqual(changed.patch)
  },
)

it.each(['smooth and sampled', 'pitch and filter LFO', 'pitch and filter ENV'])(
  'restores shared sources with adapter-specific fields: %s',
  (scenario) => {
    let patch = fixture('vcf', 'cutoff', scenario === 'pitch and filter ENV' ? 'env' : 'lfo')
    const source = scenario === 'pitch and filter ENV' ? 'env1' : 'lfo1'
    if (scenario === 'smooth and sampled') {
      patch = placeModule(placeModule(patch, 'samplehold', 8), 'vca', 9)
      patch = connect(patch, { module: source, jack: 'out' }, { module: 'samplehold1', jack: 'in' })
      patch = connect(patch, { module: 'samplehold1', jack: 'out' }, { module: 'vca1', jack: 'cv' })
      patch = connect(patch, { module: 'vcf1', jack: 'out' }, { module: 'vca1', jack: 'in' })
      patch = connect(patch, { module: 'vca1', jack: 'out' }, { module: 'mix1', jack: 'in1' }, true)
    } else {
      patch = connect(patch, { module: source, jack: 'out' }, { module: 'osc1', jack: 'tune' })
      patch = setValue(patch, source, 'depth', 2)
      if (source === 'lfo1') {
        patch = setValue(
          setValue(setValue(patch, source, 'shape', 'tri'), source, 'skew', 0.25),
          source,
          'rate',
          6,
        )
      }
    }
    patch = { ...patch, names: generateDocument(patch).layout.names }
    const doc = read(generate(patch))
    expect(read(saveLayout(doc).source).patch).toEqual(patch)
    const changed = editDocument(doc, setLook(patch, 'vcf1', 'powder'))
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(events(generate(changed.patch))).toEqual(events(generate(patch)))
  },
)

it.each(['gain(.8)', 'lpf(800).lpq(1)'])(
  'retains additive generic ENV as CODE on native-envelope target %s',
  (target) => {
    const control = target.startsWith('gain') ? 'gain' : 'lpf'
    const envelope = `.env({c:"${control}",a:.01,d:.2,s:.5,r:.1,depthabs:-.5})`
    const source = `$: note("c3").s("sine").${target}${envelope}.orbit(1)`
    const doc = read(source)
    expect(doc.patch.modules.some((m) => m.type === 'env')).toBe(false)
    expect(doc.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toContain(
      envelope,
    )
    expect(generate(doc)).toBe(source)
    expect(events(generate(doc.patch))).toEqual(events(source))
    expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
  },
)
