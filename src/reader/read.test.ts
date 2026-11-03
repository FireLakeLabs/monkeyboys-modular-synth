import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { graph } from '../codegen/graph'
import { RACK_MARKER } from '../codegen/layout'
import { getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'
import { read, tryRead } from './read'

function module(
  type: string,
  values: Record<string, ControlValue> = {},
  id = `${type}1`,
): PlacedModule {
  return { id, type, values, row: 0, hp: 0, look: DEFAULT_LOOK[getModuleSpec(type).family] }
}
function wire(from: PlacedModule, to: PlacedModule, jack?: string): Cable {
  const output = getModuleSpec(from.type).jacks.find((jack) => jack.direction === 'out')
  const input = jack ?? getModuleSpec(to.type).jacks.find((jack) => jack.direction === 'in')?.id
  if (!output || !input) throw new Error('Invalid fixture cable')
  return {
    id: `${from.id}-${to.id}-${input}`,
    from: { module: from.id, jack: output.id },
    to: { module: to.id, jack: input },
  }
}
function chain(...modules: PlacedModule[]): Patch {
  return {
    version: 1,
    modules,
    names: {},
    cables: modules.flatMap((from, index) => {
      const to = modules[index + 1]
      return to ? [wire(from, to)] : []
    }),
  }
}
const voice = (...middle: PlacedModule[]): Patch =>
  chain(module('seq', { steps: ['c3', 'e3'] }), module('osc'), ...middle, module('out'))
const sounding = (source: string): string => source.split(RACK_MARKER)[0]?.trim() ?? ''

describe('source and rack round trips are separate contracts', () => {
  const fixtures: Patch[] = [
    { version: 1, modules: [], cables: [], names: {} },
    chain(module('mix'), module('out')),
    voice(
      module('vcf'),
      module('vca'),
      module('delay'),
      module('reverb'),
      module('iter'),
      module('jux'),
    ),
    chain(
      module('seq', { mode: 'degree', steps: '0 <3 5>', rate: 2 }),
      module('quant', { root: 'Eb', scale: 'dorian' }),
      module('osc', { tune: -12 }),
      module('out', { bpm: 135, vol: 0.2 }),
    ),
    chain(module('drums'), module('smpl', { bank: 'RolandTR808', speed: 0.75 }), module('out')),
    voice(module('code', { text: '.chunk(4, x => x.hurry(2)) // retain' })),
    voice(module('vcf'), module('vcf', { cutoff: 1200 }, 'vcf2')),
  ]
  it.each(fixtures.map((patch, index) => ({ patch, index })))(
    'restores generated fixture $index byte-for-byte and with identical saved state',
    ({ patch }) => {
      const source = generate(patch)
      const doc = read(source)
      expect(generate(doc)).toBe(source)
      expect(doc.layout).toBe('restored')
      expect(doc.patch).toEqual(patch)
      expect(() => graph(doc.patch)).not.toThrow()
      expect(
        doc.bindings.every((binding) =>
          doc.patch.modules.some((module) => module.id === binding.module),
        ),
      ).toBe(true)
    },
  )
  it.each(['env', 'lfo'])(
    'restores %s fan-out, bypassed settings, volume and disconnected drafts',
    (type) => {
      const filter = module('vcf'),
        amp = module('vca'),
        mod = module(type)
      const patch = voice(filter, amp, module('delay', { mix: 0, time: 1.25 }))
      patch.modules.push(mod, module('code', { text: 'unfinished(' }))
      const first = patch.modules[0]
      if (first) {
        first.row = 3
        first.hp = 19
        first.look = 'vintage'
      }
      patch.cables.push(wire(mod, filter, 'cv'), wire(mod, amp, 'cv'))
      const doc = read(generate(patch))
      expect(doc.patch).toEqual({
        ...patch,
        names: type === 'lfo' ? { 'lfo1:out': 'mb_lfo1' } : patch.names,
      })
      expect(generate(doc)).toBe(generate(patch))
    },
  )
  it('restores dependent named outputs and nested mixer levels', () => {
    const seq = module('seq'),
      osc = module('osc'),
      filter = module('vcf'),
      inner = module('mix'),
      outer = module('mix', {}, 'mix2'),
      out = module('out')
    const patch: Patch = {
      version: 1,
      modules: [seq, osc, filter, inner, outer, out],
      names: { 'seq1:note': 'notes', 'osc1:out': 'lead' },
      cables: [
        wire(seq, osc),
        wire(seq, module('osc', {}, 'osc2')),
        wire(osc, inner, 'in1'),
        wire(osc, filter),
        wire(filter, inner, 'in2'),
        wire(inner, outer, 'in3'),
        wire(outer, out),
      ],
    }
    patch.modules.push(module('osc', {}, 'osc2'))
    const doc = read(generate(patch))
    expect(doc.patch).toEqual(patch)
    expect(doc.layout).toBe('restored')
  })
  it('refuses silent regeneration after direct graph mutation', () => {
    const doc = read('$: note("c3").s("sine").lpf(800)')
    const filter = doc.patch.modules.find((module) => module.type === 'vcf')
    expect(filter).toBeDefined()
    if (filter) filter.values['cutoff'] = 1200
    expect(() => generate(doc)).toThrow(/source-aware/)
  })
})

describe('handwritten catalog projection', () => {
  it('maps scalar controls and preserves unknown suffixes, callbacks, comments and statement order', () => {
    const source = `// 🐒\r\nconst helper = x => x.hurry(2);\r\nsetcpm(144/4);\r\n$: note('c3 [e3 g3]*2').fast(2).s('square').transpose(-12)\r\n  .lpf(/* cutoff */ 800).lpq(2).gain(.5)\r\n  /* exact */ .chunk(4, x => x.hurry(2)).delay(.4).delaytime(.375).delayfeedback(.5)\r\n  .room(.5).roomsize(4).iter(3).jux(x => x.fast(2));\r\n`
    const doc = read(source)
    expect(generate(doc)).toBe(source)
    expect(doc.patch.modules.map((module) => module.type)).toEqual([
      'seq',
      'osc',
      'vcf',
      'vca',
      'code',
      'delay',
      'reverb',
      'iter',
      'jux',
      'mix',
      'out',
    ])
    expect(doc.patch.modules.find((module) => module.type === 'seq')?.values).toMatchObject({
      steps: 'c3 [e3 g3]*2',
      rate: 2,
    })
    expect(doc.patch.modules.find((module) => module.type === 'osc')?.values).toEqual({
      wave: 'square',
      tune: -12,
    })
    expect(doc.patch.modules.find((module) => module.type === 'code')?.values['text']).toBe(
      '\r\n  /* exact */ .chunk(4, x => x.hurry(2))',
    )
    const filter = doc.patch.modules.find((module) => module.type === 'vcf')
    const span = doc.bindings.find((binding) => binding.module === filter?.id)?.controls['cutoff']
    expect(span && source.slice(span.start, span.end)).toBe('800')
  })
  it('reads stack arguments and $ lines in order, including more than four voices', () => {
    const doc = read('stack(s("bd"), s("hh"));\n$: s("sd")\n$: s("cp")\n$: s("rim")\n$: s("lt")')
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'drums')
        .map((module) => module.values['grid']),
    ).toEqual(['bd', 'hh', 'sd', 'cp', 'rim', 'lt'])
    expect(doc.patch.modules.filter((module) => module.type === 'mix')).toHaveLength(2)
    expect(() => graph(doc.patch)).not.toThrow()
  })
  it('resolves const dependencies once and names outputs used at least twice', () => {
    const source =
      'const notes = note("c3 e3"); const lead = notes.s("sine");\n$: lead.delay(.4)\n$: lead.room(.5)'
    const doc = read(source)
    expect(doc.patch.modules.filter((module) => module.type === 'seq')).toHaveLength(1)
    expect(doc.patch.modules.filter((module) => module.type === 'osc')).toHaveLength(1)
    expect(Object.values(doc.patch.names)).toEqual(['lead'])
    expect(generate(doc)).toBe(source)
  })
  it('retains computed settings, unsupported sources and imported routing as CODE', () => {
    const source =
      '$: mystery(foo).lpf(800).orbit(7)\n$: note("c3").s("sine").gain(sine).jux(x => x.hurry(2))["orbit"](2)'
    const doc = read(source)
    expect(generate(doc)).toBe(source)
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'code')
        .map((module) => module.values['text']),
    ).toEqual(expect.arrayContaining(['mystery(foo)', '.orbit(7)']))
    expect(doc.patch.modules.some((module) => module.type === 'vcf')).toBe(true)
    expect(() => graph(doc.patch)).not.toThrow()
  })
  it.each(['lp', 'hp', 'bp'])('binds %s LFO modulation in target units', (mode) => {
    const doc = read(`$: note("c3").s("sine").${mode}f(saw.range(800,600).slow(4)).${mode}q(2)`)
    expect(doc.patch.modules.find((module) => module.type === 'lfo')?.values).toEqual({
      shape: 'saw',
      rate: 4,
      depth: -200,
    })
    expect(doc.patch.modules.find((module) => module.type === 'vcf')?.values).toEqual({
      mode,
      cutoff: 800,
      res: 2,
    })
    expect(doc.patch.cables.some((cable) => cable.to.jack === 'cv')).toBe(true)
  })
  it('shares an LFO with the target-specific default depth at each destination', () => {
    const doc = read(
      'const wobble = sine.slow(4);\n$: note("c3").s("sine").lpf(wobble.range(800,2400)).gain(wobble.range(.8,.3))',
    )
    const lfo = doc.patch.modules.find((module) => module.type === 'lfo')
    expect(lfo?.values).toEqual({ shape: 'sine', rate: 4 })
    expect(doc.patch.cables.filter((cable) => cable.from.module === lfo?.id)).toHaveLength(2)
    expect(Object.values(doc.patch.names)).toEqual(['wobble'])
  })
  it('retains local rate transforms on a shared LFO as CODE', () => {
    const source =
      'const wobble = sine.slow(4);\n$: note("c3").s("sine").lpf(wobble.range(800,2400).slow(2))'
    const doc = read(source)
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'code')
        .map((module) => module.values['text']),
    ).toContain('.lpf(wobble.range(800,2400).slow(2))')
    expect(doc.patch.modules.filter((module) => module.type === 'vcf')).toHaveLength(0)
    expect(generate(doc)).toBe(source)
  })
  it('keeps parenthesized receivers as complete CODE sources', () => {
    const source = '$: (note("c3").s("sine")).chunk(4, x => x.hurry(2))'
    const doc = read(source)
    const code = doc.patch.modules.find((module) => module.type === 'code')?.values['text']
    expect(code).toBe('(note("c3").s("sine")).chunk(4, x => x.hurry(2))')
    expect(() => generate(doc.patch)).not.toThrow()
    expect(generate(doc)).toBe(source)
  })
  it('does not expose comment-bearing signed numbers as editable tokens', () => {
    const source =
      'setcpm(+ /* tempo */ 120/4);\nconst wobble = sine.slow(+ /* rate */ 4);\n$: note("c3").fast(+ /* seq */ 2).s("sine").lpf(wobble.range(800,2400)).postgain(+ /* gain */ .5)'
    const doc = read(source)
    const controls = doc.bindings.flatMap((binding) => Object.values(binding.controls))
    expect(controls.some((span) => source.slice(span.start, span.end).includes('/*'))).toBe(false)
    expect(doc.patch.modules.find((module) => module.type === 'seq')?.values['rate']).toBe(2)
    expect(doc.patch.modules.find((module) => module.type === 'out')?.values['bpm']).toBe(120)
  })
  it.each(['lp', 'hp', 'bp'])(
    'groups complete %s and amplitude envelopes at their CV targets',
    (mode) => {
      const doc = read(
        `$: note("c3").s("sine").${mode}f(800).${mode}q(2).${mode}env(4).${mode}attack(.01).${mode}decay(.2).${mode}sustain(.5).${mode}release(.1).attack(.02).decay(.3).sustain(.6).release(.2).gain(.8)`,
      )
      expect(
        doc.patch.modules.filter((module) => module.type === 'env').map((module) => module.values),
      ).toEqual([
        { atk: 0.01, dec: 0.2, sus: 0.5, rel: 0.1 },
        { atk: 0.02, dec: 0.3, sus: 0.6, rel: 0.2 },
      ])
      expect(
        doc.patch.cables
          .filter((cable) => cable.to.jack === 'cv')
          .map((cable) => doc.patch.modules.find((module) => module.id === cable.to.module)?.type),
      ).toEqual(['vcf', 'vca'])
      expect(doc.patch.modules.filter((module) => module.type === 'code')).toHaveLength(0)
    },
  )
  it('keeps sample declarations and pattern transforms readable through the implicit sampler', () => {
    const doc = read(
      'samples("github:example/samples");\nconst beat = s("bd(3,8)");\n$: beat.fast(2).bank("RolandTR808").lpf(800)',
    )
    expect(doc.patch.modules.map((module) => module.type)).toEqual([
      'drums',
      'code',
      'smpl',
      'vcf',
      'mix',
      'out',
    ])
    expect(doc.patch.modules.find((module) => module.type === 'drums')?.values['grid']).toBe(
      'bd(3,8)',
    )
    expect(doc.patch.modules.find((module) => module.type === 'code')?.values['text']).toBe(
      '.fast(2)',
    )
  })
  it.each(['setcpm(30)', 'setcpm(120/4)', 'setCpm(30)', 'setCpm(120/4)', 'setcps(.5)'])(
    'reads tempo %s',
    (tempo) => {
      expect(
        read(`${tempo};\n$: s("bd")`).patch.modules.find((module) => module.type === 'out')?.values[
          'bpm'
        ],
      ).toBe(120)
    },
  )
  it('never executes valid or invalid imported JavaScript', () => {
    const source = 'throw new Error("must not execute");\n$: custom().lpf(999999)'
    expect(generate(read(source))).toBe(source)
    const invalid = tryRead('// 🐒\r\n$: note("c").lpf(')
    expect(invalid).toMatchObject({ kind: 'invalid', offset: 23, line: 2, column: 16 })
    expect(invalid).not.toHaveProperty('document')
  })
})

describe('layout trust and conservative reconciliation', () => {
  function fixture(): Patch {
    const patch = voice(module('vcf'), module('delay'))
    const filter = patch.modules.find((module) => module.type === 'vcf')
    if (filter) {
      filter.row = 3
      filter.hp = 21
      filter.look = 'vintage'
    }
    return patch
  }
  it('retains unique IDs and looks after scalar edits or inserting an unknown call', () => {
    const source = generate(fixture()).replace('.lpf(800)', '.lpf(1200)\n  .hurry(2)')
    const doc = read(source)
    expect(doc.layout).toBe('reconciled')
    expect(doc.patch.modules.find((module) => module.id === 'vcf1')).toMatchObject({
      row: 3,
      hp: 21,
      look: 'vintage',
      values: { cutoff: 1200 },
    })
    expect(generate(doc)).toBe(source)
  })
  it('retains grouped module identity and literal bindings after a scalar-only edit', () => {
    const original = generate(fixture())
    for (const source of [original, original.replace('.lpf(800)', '.lpf(1200)')]) {
      const doc = read(source)
      expect(doc.patch.modules.find((module) => module.id === 'vcf1')).toMatchObject({
        row: 3,
        hp: 21,
        look: 'vintage',
      })
      expect(doc.patch.modules.find((module) => module.id === 'delay1')?.type).toBe('delay')
      const cutoff = doc.bindings.find((binding) => binding.module === 'vcf1')?.controls['cutoff']
      expect(cutoff && source.slice(cutoff.start, cutoff.end)).toBe(
        source === original ? '800' : '1200',
      )
      const time = doc.bindings.find((binding) => binding.module === 'delay1')?.controls['time']
      expect(time && source.slice(time.start, time.end)).toBe('0.375')
    }
  })
  it('keeps exact repeated calls by order, but never guesses identities after an ambiguous insertion', () => {
    const patch = voice(module('vcf'), module('vcf', {}, 'vcf2'))
    expect(read(generate(patch)).patch).toEqual(patch)
    const source = generate(patch).replace(
      '.s("sawtooth")',
      '.s("sawtooth")\n  .lpf(800)\n  .lpq(1)',
    )
    const doc = read(source)
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'vcf')
        .every((module) => !['vcf1', 'vcf2'].includes(module.id)),
    ).toBe(true)
  })
  it.each([
    (source: string) => source.replace('"version": 1', '"version": 9'),
    (source: string) => source.replace('"look": "vintage"', '"look": "neon"'),
    (source: string) => source.replace('"row": 3', '"row": -1'),
    (source: string) => source.replace('"role": "module"', '"role": "cv"'),
    (source: string) => source.replace('"orbit": 1', '"orbit": 7'),
    (source: string) => source.replace('"type": "vcf"', '"type": "missing"'),
  ])('rejects invalid or unverified metadata while preserving the playable source', (corrupt) => {
    const source = corrupt(generate(fixture()))
    const doc = read(source)
    expect(doc.layout).toBe('invalid')
    expect(doc.diagnostics).toHaveLength(1)
    expect(generate(doc)).toBe(source)
    expect(sounding(generate(doc))).toBe(sounding(source))
    expect(doc.patch.modules.find((module) => module.type === 'vcf')?.look).toBe('instrument')
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'code')
        .some((module) => module.values['text'] === '\n  .orbit(1)'),
    ).toBe(true)
  })
  it('does not treat a rack marker inside a string as metadata', () => {
    expect(read(`const comment = ${JSON.stringify(RACK_MARKER)};\n$: s("bd")`).layout).toBe(
      'absent',
    )
  })
})

it('preserves real Strudel events in handwritten examples, including shared orbit routing', async () => {
  const controlsEntry = '@strudel/core/controls.mjs',
    patternsEntry = '@strudel/core/pattern.mjs',
    signalsEntry = '@strudel/core/signal.mjs'
  const controls: Record<string, unknown> = await import(/* @vite-ignore */ controlsEntry)
  const patterns: Record<string, unknown> = await import(/* @vite-ignore */ patternsEntry)
  const signals: Record<string, unknown> = await import(/* @vite-ignore */ signalsEntry)
  const source =
    'const lead = note("c3").s("sawtooth");\n$: lead.lpf(800).gain(.5).postgain(.25).orbit(7)\n$: lead.delay(.4).orbit(7)'
  function events(code: string): unknown {
    let body = code
    const program = parse(code, { ecmaVersion: 'latest' })
    for (const statement of [...program.body].reverse())
      if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
        body =
          body.slice(0, statement.start) +
          `voices.push(${code.slice(statement.body.expression.start, statement.body.expression.end)})` +
          body.slice(statement.end)
    const runtime = { ...patterns, ...signals, ...controls, setcpm: () => {} }
    // Test fixtures only; production reading never executes source.
    // oxlint-disable-next-line typescript/no-implied-eval
    const run = new Function(
      ...Object.keys(runtime),
      `const voices = [];\n${body}\nreturn voices.flatMap(voice => voice.queryArc(0,1).map(event => event.value))`,
    )
    return run(...Object.values(runtime))
  }
  expect(events(generate(read(source)))).toEqual([
    { note: 'c3', s: 'sawtooth', cutoff: 800, gain: 0.5, postgain: 0.25, orbit: 7 },
    { note: 'c3', s: 'sawtooth', delay: 0.4, orbit: 7 },
  ])
  for (const fixture of [
    '$: note("c3").s("sine").lpf(800).lpq(2).gain(.5).delay(.4).delaytime(.375).delayfeedback(.5).room(.5).roomsize(4).orbit(7)',
    '$: note("c3").s("sine").attack(.01).decay(.2).sustain(.5).release(.1).gain(.8).orbit(7)',
    '$: note("c3").s("sine").hpf(800).hpq(2).hpenv(4).hpattack(.01).hpdecay(.2).hpsustain(.5).hprelease(.1).orbit(7)',
    '$: note("c3").s("sine").lpf(saw.range(800,2400).slow(4)).lpq(2).orbit(7)',
    '$: s("bd").bank("RolandTR808").speed(.75).orbit(7)',
  ]) {
    const document = read(fixture)
    expect(events(generate(document))).toEqual(events(fixture))
    // This independently exercises the projected graph through the existing writer,
    // so exact source retention cannot hide an incorrect catalog/control mapping.
    expect(events(generate(document.patch))).toEqual(events(fixture))
  }
})

it('keeps routing when one of two anonymous voices with the same root is edited', () => {
  const mix = module('mix')
  const out = module('out')
  const filter = module('vcf'),
    otherFilter = module('vcf', {}, 'vcf2')
  const first = [module('seq'), module('osc'), filter]
  const second = [module('seq', {}, 'seq2'), module('osc', {}, 'osc2'), otherFilter]
  const patch: Patch = {
    version: 1,
    modules: [...first, ...second, mix, out],
    names: {},
    cables: [
      ...chain(...first).cables,
      ...chain(...second).cables,
      wire(filter, mix, 'in1'),
      wire(otherFilter, mix, 'in2'),
      wire(mix, out),
    ],
  }
  const source = generate(patch).replace('.lpq(1)', '.lpq(8)')
  expect(read(source).patch.modules.some((item) => item.type === 'code')).toBe(false)
  expect(generate(read(source))).toBe(source)
})

it.each(['.orbit(7)', '.orbit(sine)', '.orbit(1).orbit(1)'])(
  'retains changed or ambiguous generated routing %s as CODE',
  (routing) => {
    const source = generate(voice(module('vcf')))
      .replace('.lpq(1)', '.lpq(8)')
      .replace('.orbit(1)', routing)
    const document = read(source)
    expect(
      document.patch.modules
        .filter((item) => item.type === 'code')
        .map((item) => item.values['text']),
    ).toEqual(expect.arrayContaining([expect.stringContaining('.orbit(')]))
    expect(generate(document)).toBe(source)
  },
)

it('retains generated routing when another voice reserves an orbit in CODE', () => {
  const custom = module('code', { text: 's("bd").orbit(1)' })
  const seq = module('seq'),
    osc = module('osc'),
    filter = module('vcf')
  const mix = module('mix'),
    out = module('out')
  const patch: Patch = {
    version: 1,
    modules: [custom, seq, osc, filter, mix, out],
    names: {},
    cables: [
      wire(custom, mix, 'in1'),
      wire(seq, osc),
      wire(osc, filter),
      wire(filter, mix, 'in2'),
      wire(mix, out),
    ],
  }
  const source = generate(patch).replace('.lpq(1)', '.lpq(8)')
  const document = read(source)
  const code = document.patch.modules.filter((item) => item.type === 'code')
  expect(code).toHaveLength(1)
  expect(code[0]?.values['text']).toContain('.orbit(1)')
  expect(code[0]?.values['text']).not.toContain('.orbit(2)')
  expect(generate(document)).toBe(source)
})
