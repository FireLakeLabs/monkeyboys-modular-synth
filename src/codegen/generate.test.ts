import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'
import { generate } from './generate'
import { RACK_MARKER } from './layout'

function module(
  type: string,
  values: Record<string, ControlValue> = {},
  id = `${type}1`,
): PlacedModule {
  return { id, type, row: 0, hp: 0, look: DEFAULT_LOOK[getModuleSpec(type).family], values }
}

function wire(from: PlacedModule, to: PlacedModule, jack?: string): Cable {
  const output = getModuleSpec(from.type).jacks.find((item) => item.direction === 'out')
  const input = jack ?? getModuleSpec(to.type).jacks.find((item) => item.direction === 'in')?.id
  if (!output || !input) throw new Error('Invalid test wire')
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
    cables: modules.flatMap((item, i) => {
      const next = modules[i + 1]
      return next ? [wire(item, next)] : []
    }),
  }
}

function sound(patch: Patch): string {
  const result = generate(patch)
  // Every fixture also has to be executable JavaScript, including its trailing layout.
  expect(() => parse(result, { ecmaVersion: 'latest' })).not.toThrow()
  return result.split(RACK_MARKER)[0]?.trim() ?? ''
}

function metadata(patch: Patch): unknown {
  const block = generate(patch).split(RACK_MARKER)[1]
  if (!block) throw new Error('Missing rack block')
  const result: unknown = JSON.parse(
    block
      .trim()
      .split('\n')
      .map((line) => line.slice(3))
      .join('\n'),
  )
  return result
}

const seq = () => module('seq', { steps: ['c2', 'eb2', 'g2'] })
const osc = () => module('osc')
const out = () => module('out')

describe('patch → Strudel', () => {
  it('emits one voice in cable order with catalog defaults and dedicated routing', () => {
    const patch = chain(
      seq(),
      osc(),
      module('vcf'),
      module('vca'),
      module('delay'),
      module('reverb'),
      module('iter'),
      module('jux'),
      out(),
    )
    expect(sound(patch)).toBe(`setcpm(120/4)

$: note("c2 eb2 g2")
  .s("sawtooth")
  .lpf(800)
  .lpq(1)
  .gain(0.8)
  .delay(0.4)
  .delaytime(0.375)
  .delayfeedback(0.5)
  .room(0.5)
  .roomsize(4)
  .iter(4)
  .jux(rev)
  .orbit(1)`)
  })

  it('writes degree mode, length, rate, quantization and tuning', () => {
    expect(
      sound(
        chain(
          module('seq', { mode: 'degree', steps: ['0', '3', '5', '<7 10>'], len: 3, rate: 2 }),
          module('quant', { root: 'Eb', scale: 'dorian' }),
          module('osc', { wave: 'square', tune: -12 }),
          module('out', { bpm: 135, vol: 0.1 }),
        ),
      ),
    ).toBe(`setcpm(135/4)

$: n("0 3 5")
  .fast(2)
  .scale("Eb:dorian")
  .s("square")
  .transpose(-12)
  .orbit(1)`)
  })

  it('keeps richer source mini notation in text mode and escapes it as a JS literal', () => {
    expect(
      sound(chain(module('seq', { steps: 'c2 [eb2 g2]*2 "x"\\y\n~' }), osc(), out())),
    ).toContain('note("c2 [eb2 g2]*2 \\"x\\"\\\\y\\n~")')
  })

  it('compresses repeating drum rows, omits empty rows and writes a sample bank', () => {
    expect(sound(chain(module('drums'), module('smpl'), out()))).toBe(`setcpm(120/4)

$: s("[bd ~]*4, [~ ~ sd ~]*2, [~ hh]*4")
  .bank("RolandTR909")
  .orbit(1)`)
  })

  it('handles all-on, non-repeating and empty grids, plus drop and sample speed', () => {
    expect(
      sound(
        chain(
          module('drums', {
            grid: [
              { sample: 'hh', steps: [1, 1, 1, 1, 1, 1, 1, 1] },
              { sample: 'bd', steps: [1, 0, 0, 0, 0, 0, 0, 1] },
            ],
            drop: 0.25,
          }),
          module('smpl', { bank: '', speed: 0.75 }),
          out(),
        ),
      ),
    ).toContain('s("hh*8, bd ~ ~ ~ ~ ~ ~ bd")\n  .degradeBy(0.25)\n  .speed(0.75)')
    expect(
      sound(chain(module('drums', { grid: [] }), module('smpl', { bank: 'RolandTR808' }), out())),
    ).toContain('s("~")\n  .bank("RolandTR808")')
    expect(sound(chain(module('drums', { grid: 'bd(3,8)' }), module('smpl'), out()))).toContain(
      's("bd(3,8)")',
    )
  })

  it.each(['rev', 'fast2', 'press', 'iter4'])('writes JUX option %s', (right) => {
    const expected: Record<string, string> = {
      rev: 'rev',
      fast2: 'x => x.fast(2)',
      press: 'press',
      iter4: 'x => x.iter(4)',
    }
    expect(sound(chain(seq(), osc(), module('jux', { right }), out()))).toContain(
      `.jux(${expected[right]})`,
    )
  })

  it('omits only the catalog omission values and rounds numbers to three decimals', () => {
    const patch = chain(module('drums'), module('smpl', { bank: '', speed: 1 }), out())
    expect(sound(patch)).not.toMatch(/\.speed|\.bank|\.degradeBy/)
    expect(
      sound(chain(seq(), osc(), module('delay', { mix: 0 }), module('reverb', { room: 0 }), out())),
    ).not.toMatch(/\.delay|\.room/)
    expect(sound(chain(seq(), osc(), module('vca', { level: 0.333333 }), out()))).toContain(
      '.gain(0.333)',
    )
  })

  it('does not reorder pattern transforms or repeated settings', () => {
    const a = module('code', { text: '.ply(2)' })
    const b = module('code', { text: '.degradeBy(.5)' }, 'code2')
    const first = sound(
      chain(seq(), a, b, osc(), module('vcf'), module('vcf', { cutoff: 1200 }, 'vcf2'), out()),
    )
    expect(first).toContain(
      '.ply(2)\n  .degradeBy(.5)\n  .s("sawtooth")\n  .lpf(800)\n  .lpq(1)\n  .lpf(1200)',
    )
    expect(sound(chain(seq(), b, a, osc(), out()))).toContain('.degradeBy(.5)\n  .ply(2)')
  })

  it('preserves exact CODE fragments, callbacks, comments and complete source expressions', () => {
    const fragment = '.chunk(4, x => {\n  // keep this\n  return x.hurry(2)\n}) // tail'
    expect(sound(chain(seq(), osc(), module('code', { text: fragment }), out()))).toContain(
      `${fragment}\n  .orbit(1)`,
    )
    const source = 'note("c").s("sine") // source tail'
    expect(sound(chain(module('code', { text: source }), out()))).toContain(
      `(${source}\n)\n  .orbit(1)`,
    )
  })

  it('keeps CODE-owned orbit routing and never appends an overriding orbit', () => {
    const patch = chain(seq(), osc(), module('code', { text: '.orbit(7)' }), out())
    expect(sound(patch).match(/\.orbit\(/g)).toHaveLength(1)
    expect(metadata(patch)).toMatchObject({
      scopes: [expect.anything(), expect.not.objectContaining({ routing: expect.anything() })],
    })
  })

  it('is silent for a starter, an empty patch, or chains that do not reach OUT', () => {
    expect(sound(chain(module('mix'), out()))).toBe('setcpm(120/4)')
    expect(sound({ version: 1, modules: [], cables: [], names: {} })).toBe('setcpm(120/4)')
    const patch = chain(seq(), osc())
    patch.modules.push(out(), module('env'))
    expect(sound(patch)).toBe('setcpm(120/4)')
    expect(sound(chain(module('vcf'), out()))).toBe('setcpm(120/4)')
  })
})

describe('CV routing', () => {
  it.each(['lp', 'hp', 'bp'])(
    'routes ENV into %s filter and VCA without a standalone const',
    (mode) => {
      const env = module('env', { atk: 0.03, dec: 0.4, sus: 0.7, rel: 0.6 })
      const filter = module('vcf', { mode, envAmt: 6 })
      const amp = module('vca')
      const patch = chain(seq(), osc(), filter, amp, out())
      patch.modules.push(env)
      patch.cables.push(wire(env, filter, 'cv'), wire(env, amp, 'cv'))
      expect(sound(patch)).toContain(
        `.${mode}f(800)\n  .${mode}q(1)\n  .${mode}env(6)\n  .${mode}attack(0.03)\n  .${mode}decay(0.4)\n  .${mode}sustain(0.7)\n  .${mode}release(0.6)\n  .attack(0.03)\n  .decay(0.4)\n  .sustain(0.7)\n  .release(0.6)\n  .gain(0.8)`,
      )
      expect(sound(patch)).not.toContain('const ')
      expect(metadata(patch)).toMatchObject({
        modules: expect.arrayContaining([
          expect.objectContaining({
            id: 'env1',
            bindings: expect.arrayContaining([
              expect.objectContaining({
                role: 'cv',
                target: { module: 'vcf1', jack: 'cv', control: 'cutoff' },
              }),
              expect.objectContaining({
                role: 'cv',
                target: { module: 'vca1', jack: 'cv', control: 'level' },
              }),
            ]),
          }),
        ]),
      })
    },
  )

  it.each([
    ['vcf', {}, '.lpf(sine\n  .slow(4).range(800, 2400))'],
    ['vca', {}, '.gain(sine\n  .slow(4).range(0.8, 0.3))'],
    ['vcf', { shape: 'saw', rate: 0.5, depth: -200 }, '.lpf(saw\n  .fast(2).range(800, 600))'],
    ['vca', { shape: 'tri', rate: 1, depth: -0.7 }, '.gain(tri.range(0.8, 0.1))'],
  ] satisfies [string, Record<string, ControlValue>, string][])(
    'routes LFO into %s with target units',
    (type, values, expected) => {
      const target = module(type)
      const lfo = module('lfo', values)
      const patch = chain(seq(), osc(), target, out())
      patch.modules.push(lfo)
      patch.cables.push(wire(lfo, target, 'cv'))
      expect(sound(patch)).toContain(expected)
    },
  )

  it('names shared LFO signals once and scales separately at each destination', () => {
    const filter = module('vcf')
    const amp = module('vca')
    const lfo = module('lfo')
    const patch = chain(seq(), osc(), filter, amp, out())
    patch.modules.push(lfo)
    patch.cables.push(wire(lfo, filter, 'cv'), wire(lfo, amp, 'cv'))
    patch.names['lfo1:out'] = 'wobble'
    expect(sound(patch)).toContain('const wobble = sine\n  .slow(4)')
    expect(sound(patch)).toContain('.lpf(wobble.range(800, 2400))')
    expect(sound(patch)).toContain('.gain(wobble.range(0.8, 0.3))')
  })
})

describe('mixing and fan-out', () => {
  it('orders final voices by channel, regardless of cable/module order; bypass retains orbit allocation', () => {
    const source = seq(),
      oscillator = osc(),
      delay = module('delay'),
      reverb = module('reverb'),
      mix = module('mix', { ch1: 1, ch3: 0.25 }),
      output = out()
    const patch: Patch = {
      version: 1,
      modules: [reverb, delay, source, output, mix, oscillator],
      names: { 'osc1:out': 'lead' },
      cables: [
        wire(reverb, mix, 'in3'),
        wire(delay, mix, 'in1'),
        wire(oscillator, reverb),
        wire(oscillator, delay),
        wire(source, oscillator),
        wire(mix, output),
      ],
    }
    expect(sound(patch)).toBe(`setcpm(120/4)

const lead = note("c2 eb2 g2")
  .s("sawtooth")

$: lead
  .delay(0.4)
  .delaytime(0.375)
  .delayfeedback(0.5)
  .orbit(1)

$: lead
  .room(0.5)
  .roomsize(4)
  .postgain(0.25)
  .orbit(2)`)
    delay.values['mix'] = 0
    reverb.values['room'] = 0
    expect(sound(patch).match(/\.orbit\(\d\)/g)).toEqual(['.orbit(1)', '.orbit(2)'])
    expect(metadata(patch)).toMatchObject({
      scopes: expect.arrayContaining([
        expect.objectContaining({
          anchor: 'lead',
          calls: [
            expect.objectContaining({ name: 'note' }),
            expect.objectContaining({ name: 's' }),
          ],
        }),
        expect.objectContaining({ routing: { call: 0, orbit: 1 } }),
      ]),
    })
  })

  it('orders dependent named outputs before their users, despite reverse rack order', () => {
    const source = seq(),
      oscillator = osc(),
      filter = module('vcf'),
      mix = module('mix'),
      output = out()
    const patch: Patch = {
      version: 1,
      modules: [filter, oscillator, source, mix, output],
      names: { 'seq1:note': 'notes', 'osc1:out': 'lead' },
      cables: [
        wire(source, oscillator),
        wire(source, module('osc', {}, 'osc2')),
        wire(oscillator, filter),
        wire(oscillator, mix, 'in1'),
        wire(filter, mix, 'in2'),
        wire(mix, output),
      ],
    }
    patch.modules.push(module('osc', {}, 'osc2'))
    expect(sound(patch).indexOf('const notes')).toBeLessThan(sound(patch).indexOf('const lead'))
    expect(sound(patch)).toContain('const lead = notes\n  .s("sawtooth")')
  })

  it('names each leaf of a split mixer bus without generating stack()', () => {
    const source = seq(),
      oscillator = osc(),
      bus = module('mix'),
      final = module('mix', {}, 'mix2'),
      delay = module('delay'),
      reverb = module('reverb'),
      output = out()
    const patch: Patch = {
      version: 1,
      modules: [source, oscillator, bus, delay, reverb, final, output],
      names: { 'mix1:out': 'bus' },
      cables: [
        wire(source, oscillator),
        wire(oscillator, bus, 'in1'),
        wire(oscillator, bus, 'in2'),
        wire(bus, delay),
        wire(bus, reverb),
        wire(delay, final, 'in1'),
        wire(reverb, final, 'in2'),
        wire(final, output),
      ],
    }
    const code = sound(patch)
    expect(code).toContain('const bus_1 = mb_osc1')
    expect(code).toContain('const bus_2 = mb_osc1')
    expect(code.match(/^\$:/gm)).toHaveLength(4)
    expect(code.match(/\.postgain\(0.64\)/g)).toHaveLength(4)
    expect(code.match(/\.orbit\(\d\)/g)).toEqual([
      '.orbit(1)',
      '.orbit(2)',
      '.orbit(3)',
      '.orbit(4)',
    ])
    expect(code).not.toContain('stack(')
  })

  it('expands nested mixer channels with both gains and final branch transforms', () => {
    const source = seq(),
      oscillator = osc(),
      a = module('mix', { ch1: 0.5, ch2: 1 }),
      b = module('mix', { ch3: 0.25 }, 'mix2'),
      effect = module('iter'),
      output = out()
    const patch: Patch = {
      version: 1,
      modules: [source, oscillator, a, b, effect, output],
      names: {},
      cables: [
        wire(source, oscillator),
        wire(oscillator, a, 'in2'),
        wire(oscillator, a, 'in1'),
        wire(a, b, 'in3'),
        wire(b, effect),
        wire(effect, output),
      ],
    }
    expect(sound(patch)).toContain('.iter(4)\n  .postgain(0.125)\n  .orbit(1)')
    expect(sound(patch)).toContain('$: mb_osc1\n  .iter(4)\n  .postgain(0.25)\n  .orbit(2)')
    expect(sound(patch)).not.toContain('stack(')
  })

  it('preserves source-owned orbit routing through multiple named dependencies', () => {
    const source = module('code', { text: 's("bd").orbit(7)' }),
      filter = module('vcf'),
      delay = module('delay'),
      reverb = module('reverb'),
      mix = module('mix'),
      output = out()
    const patch: Patch = {
      version: 1,
      modules: [source, filter, delay, reverb, mix, output],
      names: {},
      cables: [
        wire(source, filter),
        wire(source, mix, 'in1'),
        wire(filter, delay),
        wire(filter, reverb),
        wire(delay, mix, 'in2'),
        wire(reverb, mix, 'in3'),
        wire(mix, output),
      ],
    }
    expect(sound(patch).match(/\.orbit\(/g)).toHaveLength(1)
  })
})

describe('rack metadata and boundary checks', () => {
  it('retains layout, omitted values, disconnected state, names and semantic source bindings without mutation', () => {
    const source = seq(),
      oscillator = osc(),
      effect = module('delay', { mix: 0, time: 1.25 }),
      output = module('out', { vol: 0.2 }),
      disconnected = module('code', { text: 'unfinished(' })
    effect.row = 2
    effect.hp = 19
    effect.look = 'vintage'
    const patch = chain(source, oscillator, effect, output)
    patch.modules.push(disconnected)
    const original = structuredClone(patch)
    expect(metadata(patch)).toMatchObject({
      version: 1,
      modules: patch.modules.map((item) => ({ ...item, bindings: expect.any(Array) })),
      cables: patch.cables,
      names: {},
    })
    expect(metadata(patch)).toMatchObject({
      modules: expect.arrayContaining([
        expect.objectContaining({
          id: 'osc1',
          bindings: [expect.objectContaining({ role: 'module', calls: [1] })],
        }),
        expect.objectContaining({ id: 'delay1', bindings: [] }),
        expect.objectContaining({ id: 'code1', bindings: [] }),
      ]),
    })
    expect(patch).toEqual(original)
    expect(generate(patch)).toBe(generate(patch))
  })

  it('describes call arguments by syntax, retaining nested calls in the outer call descriptor', () => {
    const patch = chain(seq(), osc(), module('code', { text: '.chunk(4, x => x.hurry(2))' }), out())
    expect(metadata(patch)).toMatchObject({
      scopes: [
        expect.anything(),
        expect.objectContaining({
          calls: [
            expect.objectContaining({ name: 'note' }),
            expect.objectContaining({ name: 's' }),
            expect.objectContaining({ name: 'chunk', arguments: expect.stringContaining('hurry') }),
            expect.objectContaining({ name: 'orbit' }),
          ],
          routing: { call: 3, orbit: 1 },
        }),
      ],
    })
  })

  it.each(['sine', 'note', 'class', 'await', 'arguments', 'bad-name', 'x; hush()'])(
    'rejects invalid or runtime-shadowing name %s',
    (name) => {
      const patch = chain(seq(), osc(), out())
      patch.names['osc1:out'] = name
      expect(() => generate(patch)).toThrow()
    },
  )

  it('rejects duplicate names and dangling name references', () => {
    const patch = chain(seq(), osc(), out())
    patch.names = { 'seq1:note': 'lead', 'osc1:out': 'lead' }
    expect(() => generate(patch)).toThrow()
    patch.names = { 'missing:out': 'lead' }
    expect(() => generate(patch)).toThrow()
  })

  it('rejects graph cycles, duplicate IDs, occupied inputs and incompatible signals through Alien modules', () => {
    const a = module('iter'),
      b = module('jux')
    expect(() => generate(chain(a, b, a))).toThrow()
    const cycle: Patch = {
      version: 1,
      modules: [a, b, out()],
      names: {},
      cables: [wire(a, b), wire(b, a)],
    }
    expect(() => generate(cycle)).toThrow(/cycles/)
    const source = seq(),
      oscillator = osc(),
      filter = module('vcf')
    const occupied = chain(source, oscillator, filter, out())
    occupied.cables.push(wire(source, filter))
    expect(() => generate(occupied)).toThrow(/Occupied/)
    expect(() => generate(chain(source, a, filter, out()))).toThrow(/signal/)
    expect(() => generate(chain(module('env'), a))).toThrow(/ENV/)
    const invalid = chain(source, oscillator, out())
    invalid.cables.push({
      id: 'missing',
      from: { module: 'missing', jack: 'out' },
      to: { module: 'out1', jack: 'in' },
    })
    expect(() => generate(invalid)).toThrow(/endpoints/)
  })

  it.each([
    ['seq', { rate: NaN }],
    ['vcf', { cutoff: Infinity }],
    ['seq', { len: 1.5 }],
    ['osc', { wave: 'not-a-wave' }],
    ['seq', { steps: [] }],
    ['drums', { grid: [{ sample: 'bd', steps: [1] }] }],
  ] satisfies [string, Record<string, ControlValue>][])(
    'rejects invalid %s control values',
    (type, values) => {
      expect(() =>
        generate({ version: 1, modules: [module(type, values)], names: {}, cables: [] }),
      ).toThrow()
    },
  )
})

// Query the installed Strudel pattern implementation without a browser audio context.
// Direct source entrypoints avoid @strudel/core's browser-only bundle initialization.
it('evaluates generated nested mixer voices with the real Strudel event algebra', async () => {
  const controlsEntry = '@strudel/core/controls.mjs'
  const controls: Record<string, unknown> = await import(/* @vite-ignore */ controlsEntry)
  const source = module('seq', { steps: ['c3'] }),
    oscillator = osc(),
    inner = module('mix', { ch1: 0.5, ch2: 1 }),
    outer = module('mix', { ch1: 0.25 }, 'mix2'),
    output = out()
  const patch: Patch = {
    version: 1,
    modules: [source, oscillator, inner, outer, output],
    names: {},
    cables: [
      wire(source, oscillator),
      wire(oscillator, inner, 'in1'),
      wire(oscillator, inner, 'in2'),
      wire(inner, outer, 'in1'),
      wire(outer, output),
    ],
  }
  const code = generate(patch)
  const program = parse(code, { ecmaVersion: 'latest' })
  let body = code
  for (const statement of [...program.body].reverse()) {
    if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
      body =
        body.slice(0, statement.start) +
        `voices.push(${code.slice(statement.body.expression.start, statement.body.expression.end)})` +
        body.slice(statement.end)
  }
  const runtime = { ...controls, setcpm: () => {} }
  // Test-only execution of generated fixtures against Strudel; no imported user code.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(runtime),
    `const voices = [];\n${body}\nreturn voices.flatMap(voice => voice.queryArc(0,1).map(event => event.value))`,
  )
  const events: unknown = run(...Object.values(runtime))
  expect(events).toEqual([
    { note: 'c3', s: 'sawtooth', postgain: 0.125, orbit: 1 },
    { note: 'c3', s: 'sawtooth', postgain: 0.25, orbit: 2 },
  ])
})
