import { panelCases } from '../testing/panelCases'
import { parse } from 'acorn'
import { beforeAll, describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { RACK_MARKER } from '../codegen/layout'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { looksFor } from '../modules/looks'
import { SOUND_CONTROLS } from '../modules/sound-effects.fixtures'

import { FUNCTION_CONTROLS } from '../modules/function-loops.fixtures'
import { PATTERN_CONTROLS } from '../modules/pattern-time.fixtures'
import { drumView, stepView } from '../patch/notation'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'
import { editDocument, saveLayout } from '../workspace/document'
import { read } from './read'

interface EditCase {
  control: string
  before: ControlValue
  after: ControlValue
  token: string
  replacement: string
}

// Explicit examples are the oracle, rather than asking the generator what to edit.
// Enumeration below fails when a catalog control has no example or stated exception.
const edits: Record<string, readonly EditCase[]> = {
  seq: [
    {
      control: 'steps',
      before: 'c2 e2 g2',
      after: 'd2 e2 g2',
      token: '"c2 e2 g2"',
      replacement: '"d2 e2 g2"',
    },
    { control: 'mode', before: 'note', after: 'degree', token: 'note(', replacement: 'n(' },
    { control: 'rate', before: 2, after: 3, token: '.fast(2)', replacement: '.fast(3)' },
  ],
  drums: [
    {
      control: 'grid',
      before: 'bd ~ sd ~',
      after: 'bd ~ hh ~',
      token: '"bd ~ sd ~"',
      replacement: '"bd ~ hh ~"',
    },
    {
      control: 'drop',
      before: 0.1,
      after: 0.9,
      token: '.degradeBy(0.1)',
      replacement: '.degradeBy(0.9)',
    },
  ],
  quant: [
    { control: 'root', before: 'C', after: 'D', token: '"C:minor"', replacement: '"D:minor"' },
    {
      control: 'scale',
      before: 'minor',
      after: 'major',
      token: '"C:minor"',
      replacement: '"C:major"',
    },
  ],
  osc: [
    {
      control: 'wave',
      before: 'sawtooth',
      after: 'square',
      token: '.s("sawtooth")',
      replacement: '.s("square")',
    },
    { control: 'tune', before: 1, after: 2, token: '.transpose(1)', replacement: '.transpose(2)' },
  ],
  smpl: [
    {
      control: 'bank',
      before: 'RolandTR909',
      after: 'RolandTR808',
      token: '.bank("RolandTR909")',
      replacement: '.bank("RolandTR808")',
    },
    {
      control: 'speed',
      before: 0.5,
      after: 0.75,
      token: '.speed(0.5)',
      replacement: '.speed(0.75)',
    },
  ],
  vcf: [
    {
      control: 'mode',
      before: 'lp',
      after: 'hp',
      token: '.lpf(800)\n  .lpq(1)',
      replacement: '.hpf(800)\n  .hpq(1)',
    },
    { control: 'cutoff', before: 800, after: 900, token: '.lpf(800)', replacement: '.lpf(900)' },
    { control: 'res', before: 1, after: 8, token: '.lpq(1)', replacement: '.lpq(8)' },
    { control: 'envAmt', before: 4, after: 5, token: '.lpenv(4)', replacement: '.lpenv(5)' },
  ],
  vca: [
    { control: 'level', before: 0.8, after: 0.7, token: '.gain(0.8)', replacement: '.gain(0.7)' },
  ],
  env: [
    {
      control: 'atk',
      before: 0.01,
      after: 0.02,
      token: 'attack(0.01)',
      replacement: 'attack(0.02)',
    },
    { control: 'dec', before: 0.2, after: 0.3, token: 'decay(0.2)', replacement: 'decay(0.3)' },
    { control: 'sus', before: 0.5, after: 0.6, token: 'sustain(0.5)', replacement: 'sustain(0.6)' },
    { control: 'rel', before: 0.1, after: 0.2, token: 'release(0.1)', replacement: 'release(0.2)' },
  ],
  lfo: [
    { control: 'shape', before: 'sine', after: 'tri', token: 'sine', replacement: 'tri' },
    { control: 'rate', before: 4, after: 6, token: '.slow(4)', replacement: '.slow(6)' },
    {
      control: 'depth',
      before: 0.1,
      after: 0.2,
      token: '.range(0.8, 0.9)',
      replacement: '.range(0.8, 1)',
    },
  ],
  delay: [
    { control: 'mix', before: 0.4, after: 0.5, token: '.delay(0.4)', replacement: '.delay(0.5)' },
    {
      control: 'time',
      before: 0.375,
      after: 0.5,
      token: '.delaytime(0.375)',
      replacement: '.delaytime(0.5)',
    },
    {
      control: 'fdbk',
      before: 0.5,
      after: 0.6,
      token: '.delayfeedback(0.5)',
      replacement: '.delayfeedback(0.6)',
    },
  ],
  reverb: [
    { control: 'room', before: 0.5, after: 0.6, token: '.room(0.5)', replacement: '.room(0.6)' },
    { control: 'size', before: 4, after: 5, token: '.roomsize(4)', replacement: '.roomsize(5)' },
  ],
  mix: [1, 2, 3, 4].map((channel) => ({
    control: `ch${channel}`,
    before: 0.8,
    after: 0.7,
    token: '.postgain(0.8)',
    replacement: '.postgain(0.7)',
  })),
  out: [
    {
      control: 'bpm',
      before: 120,
      after: 130,
      token: 'setcpm(120/4)',
      replacement: 'setcpm(130/4)',
    },
  ],
  iter: [{ control: 'steps', before: 4, after: 5, token: '.iter(4)', replacement: '.iter(5)' }],
  jux: [
    {
      control: 'right',
      before: 'rev',
      after: 'press',
      token: '.jux(rev)',
      replacement: '.jux(press)',
    },
  ],
  code: [
    {
      control: 'text',
      before: '.chunkBack(4, x => x.hurry(2))',
      after: '.chunkBack(3, x => x.hurry(2))',
      token: '.chunkBack(4,',
      replacement: '.chunkBack(3,',
    },
  ],
}

const nonLiteral = ['seq.len', 'out.vol']

function module(type: string, values: Record<string, ControlValue> = {}): PlacedModule {
  const spec = getModuleSpec(type)
  const look = looksFor(spec.family)[1]
  if (!look) throw new Error(`No alternate look for ${type}`)
  return { id: `${type}1`, type, row: 0, hp: 0, look, values }
}

function wire(from: PlacedModule, to: PlacedModule, input?: string): Cable {
  const output = getModuleSpec(from.type).jacks.find((jack) => jack.direction === 'out')
  const jack =
    input ??
    getModuleSpec(to.type).jacks.find((jack) => jack.direction === 'in' && !jack.cvTarget)?.id
  if (!output || !jack) throw new Error('Invalid fixture cable')
  return {
    id: `${from.id}-${to.id}-${jack}`,
    from: { module: from.id, jack: output.id },
    to: { module: to.id, jack },
  }
}

function fixture(type: string, edit: EditCase, target: 'vcf' | 'vca' = 'vca'): Patch {
  const source = module(
    type === 'drums' || type === 'smpl' ? 'drums' : 'seq',
    type === 'quant' || (type === 'seq' && edit.control === 'mode')
      ? { steps: '0 2 4', mode: type === 'quant' ? 'degree' : 'note' }
      : {
          [type === 'drums' || type === 'smpl' ? 'grid' : 'steps']:
            type === 'drums' || type === 'smpl' ? 'bd ~ sd ~' : 'c2 e2 g2',
        },
  )
  const sound = module(source.type === 'drums' ? 'smpl' : 'osc')
  const mix = module('mix', { ch1: 0.8, ch2: 1, ch3: 1, ch4: 1 })
  const out = module('out')
  const middle: PlacedModule[] = []
  const mods: PlacedModule[] = []
  const cables: Cable[] = []
  let subject = [source, sound, mix, out].find((item) => item.type === type)
  if (!subject) {
    subject = module(type)
    if (type === 'env' || type === 'lfo') {
      const destination = module(target)
      middle.push(destination)
      if (type === 'lfo') subject.values['depth'] = target === 'vcf' ? 1600 : -0.5
      mods.push(subject)
      cables.push(wire(subject, destination, 'cv'))
    } else middle.push(subject)
  }
  subject.values[edit.control] = edit.before
  if (type === 'vcf' && edit.control === 'envAmt') {
    const env = module('env')
    mods.push(env)
    cables.push(wire(env, subject, 'cv'))
  }
  const path =
    type === 'quant' ? [source, ...middle, sound, mix, out] : [source, sound, ...middle, mix, out]
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index],
      to = path[index + 1]
    if (from && to)
      cables.push(
        wire(
          from,
          to,
          to.type === 'mix' ? `in${type === 'mix' ? edit.control.slice(2) : '1'}` : undefined,
        ),
      )
  }
  // Non-default positions/looks and a retained declaration make identity loss observable.
  const modules = [...path, ...mods].map((item, row) => ({
    ...item,
    row: item.type === 'out' ? 0 : row + 1,
    hp: item.type === 'out' ? 0 : 3,
  }))
  return {
    version: 1,
    modules,
    cables,
    names: { [`${source.id}:${source.type === 'seq' ? 'note' : 'out'}`]: 'phrase' },
  }
}

function body(code: string): string {
  return code.split(RACK_MARKER)[0] ?? ''
}

function edited(patch: Patch, edit: EditCase): string {
  const code = generate(patch)
  const executable = body(code)
  expect(executable.split(edit.token)).toHaveLength(2)
  const offset = executable.indexOf(edit.token)
  return code.slice(0, offset) + edit.replacement + code.slice(offset + edit.token.length)
}

function changed(patch: Patch, type: string, edit: EditCase): Patch {
  const result = structuredClone(patch)
  const subject = result.modules.find((item) => item.type === type)
  if (!subject) throw new Error(`Missing ${type}`)
  subject.values[edit.control] = edit.after
  return result
}

let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs']
  const loaded: Record<string, unknown>[] = await Promise.all(
    entries.map((entry) => import(/* @vite-ignore */ entry)),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime['miniAllStrings'] !== 'function')
    throw new Error('Missing mini notation parser')
  runtime['miniAllStrings']()
})

function events(code: string): unknown {
  let executable = body(code)
  const program = parse(executable, { ecmaVersion: 'latest' })
  for (const statement of [...program.body].reverse()) {
    if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
      executable =
        executable.slice(0, statement.start) +
        `voices.push(${executable.slice(statement.body.expression.start, statement.body.expression.end)})` +
        executable.slice(statement.end)
  }
  // Repository-owned fixtures only; this never executes user input or browser audio.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(runtime),
    `const voices = []; let tempo; const setcpm = value => { tempo = value }; \n${executable}\nreturn {tempo, voices: voices.map(voice => voice.queryArc(0,4).sort((a,b) => a.whole.begin.valueOf() - b.whole.begin.valueOf()).map(event => ({value: event.value, begin: event.whole.begin.toString(), end: event.whole.end.toString()})))};`,
  )
  return run(...Object.values(runtime))
}

it('accounts for every catalog module/control without silently skipping new controls', () => {
  expect(
    [
      ...Object.entries(edits).flatMap(([type, cases]) =>
        cases.map((edit) => `${type}.${edit.control}`),
      ),
      ...nonLiteral,
      ...PATTERN_CONTROLS,
      ...SOUND_CONTROLS,

      ...FUNCTION_CONTROLS,
      // Coupled modulation expressions have their own independent source/rack/event matrix.
      // See modulation.test.ts; these are not independent scalar call arguments.
      'lfo.mode',
      'lfo.skew',
      'env.depth',
      'samplehold.rate',
      'attenuverter.amount',
      'attenuverter.min',
      'attenuverter.max',
      'attenuverter.scale',
      'cvseq.steps',
      ...panelCases.map((example) => `${example.type}.${example.control}`),
    ].sort(),
  ).toEqual(
    CATALOG.flatMap((spec) => spec.controls.map((control) => `${spec.id}.${control.id}`)).sort(),
  )
})

function effectiveValues(item: PlacedModule): Record<string, ControlValue> {
  return Object.fromEntries(
    getModuleSpec(item.type).controls.map((control) => {
      const value = item.values[control.id] ?? control.default
      return [
        control.id,
        typeof value === 'number'
          ? Number(value.toFixed(3))
          : item.type === 'code' && typeof value === 'string'
            ? value.trim()
            : value,
      ]
    }),
  )
}

interface Scenario {
  name: string
  type: string
  edit: EditCase
  patch: Patch
}

const scenarios: Scenario[] = CATALOG.flatMap((spec) =>
  (edits[spec.id] ?? []).map((edit) => ({
    name: `${spec.id}.${edit.control}`,
    type: spec.id,
    edit,
    patch: fixture(spec.id, edit),
  })),
)

for (const type of ['env', 'lfo']) {
  for (const original of edits[type] ?? []) {
    const edit =
      type === 'lfo' && original.control === 'depth'
        ? {
            ...original,
            before: 100,
            after: 200,
            token: '.range(800, 900)',
            replacement: '.range(800, 1000)',
          }
        : original
    scenarios.push({
      name: `${type}.${edit.control} into VCF`,
      type,
      edit,
      patch: fixture(type, edit, 'vcf'),
    })
  }
}

for (const modType of ['env', 'lfo']) {
  const edit = edits['vcf']?.find((edit) => edit.control === 'res')
  if (!edit) throw new Error('Missing VCF resistance edit')
  const patch = fixture('vcf', edit)
  const filter = patch.modules.find((item) => item.type === 'vcf')
  const mix = patch.modules.find((item) => item.type === 'mix')
  if (!filter || !mix) throw new Error('Missing fan-out modules')
  const amp = { ...module('vca'), row: 8, hp: 3 }
  const mod = { ...module(modType), row: 9, hp: 3 }
  patch.modules.push(amp, mod)
  patch.cables = patch.cables.filter((cable) => cable.from.module !== filter.id)
  patch.cables.push(
    wire(filter, amp),
    wire(amp, mix, 'in1'),
    wire(filter, mix, 'in2'),
    wire(mod, filter, 'cv'),
    wire(mod, amp, 'cv'),
  )
  patch.names[`${filter.id}:out`] = 'lead'
  if (modType === 'lfo') patch.names[`${mod.id}:out`] = 'wobble'
  scenarios.push({
    name: `VCF literal with named audio fan-out and ${modType.toUpperCase()} into VCF/VCA`,
    type: 'vcf',
    edit,
    patch,
  })
}

function rack(patch: Patch): unknown {
  return {
    modules: patch.modules
      .map((item) => ({ ...item, values: effectiveValues(item) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    // Cable IDs are regenerated on external import. Saved identity is asserted exactly above;
    // here the claim is the user's wiring, with directions and named jack endpoints intact.
    cables: patch.cables
      .map(({ from, to }) => ({ from, to }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    names: patch.names,
  }
}

for (const { name, type, edit, patch } of scenarios) {
  describe(`${name}: one control edit`, () => {
    const expected = changed(patch, type, edit)
    let code: string
    beforeAll(() => {
      code = edited(patch, edit)
      // Setup/parsing errors must fail even when a specific invariant is an expected failure.
      expect(read(code).kind).toBe('source')
    })

    it('keeps the edited source and stale rack block byte-for-byte', () => {
      expect(generate(read(code))).toBe(code)
      expect(code.slice(code.indexOf(RACK_MARKER))).toBe(
        generate(patch).slice(generate(patch).indexOf(RACK_MARKER)),
      )
    })
    it('restores independently generated saved rack identity exactly', () => {
      expect(read(generate(patch)).patch).toEqual(patch)
      expect(read(generate(expected)).patch).toEqual(expected)
    })
    it('saves and reopens the accepted projection with exact rack identity', () => {
      const accepted = read(code)
      const saved = saveLayout(accepted)
      expect(read(saved.source).patch).toEqual(accepted.patch)
      expect(body(saved.source)).toBe(body(code))
    })
    it('reads the changed control', () => {
      const subject = read(code).patch.modules.find((item) => item.type === type)
      const actual = subject?.values[edit.control]
      if (typeof edit.after === 'number') expect(actual).toBeCloseTo(edit.after, 10)
      else expect(typeof actual === 'string' ? actual.trim() : actual).toEqual(edit.after)
    })
    it('keeps modules, wiring, looks, names and all other values', () => {
      expect(rack(read(code).patch)).toEqual(rack(expected))
    })
    it('retains positions, looks and IDs of existing modules', () => {
      const actual = read(code).patch
      for (const old of expected.modules) {
        const current = actual.modules.find((item) => item.type === old.type)
        expect(
          current && {
            id: current.id,
            type: current.type,
            row: current.row,
            hp: current.hp,
            look: current.look,
          },
        ).toEqual({ id: old.id, type: old.type, row: old.row, hp: old.hp, look: old.look })
      }
    })
    it('changes no other effective control value', () => {
      const actual = read(code).patch
      for (const old of expected.modules) {
        const current = actual.modules.find((item) => item.type === old.type)
        expect(current && effectiveValues(current)).toEqual(effectiveValues(old))
      }
    })
    it('retains output names', () => {
      expect(read(code).patch.names).toEqual(expected.names)
    })
    it('preserves Strudel events through source and independently regenerated projection', () => {
      const document = read(code)
      const expectedEvents = events(generate(expected))
      expect(expectedEvents).not.toEqual(events(generate(patch)))
      expect(events(code)).toEqual(expectedEvents)
      expect(events(generate(document))).toEqual(expectedEvents)
      expect(events(generate(document.patch))).toEqual(expectedEvents)
    })
  })
}

describe('#99 conservative reconciliation boundaries', () => {
  it.each(['seq', 'vcf'])('retains a unique anonymous %s mode switch', (type) => {
    const edit = edits[type]?.find((edit) => edit.control === 'mode')
    if (!edit) throw new Error('Missing mode fixture')
    const patch = fixture(type, edit)
    patch.names = {}
    const source = edited(patch, edit)
    expect(rack(read(source).patch)).toEqual(rack(changed(patch, type, edit)))
    expect(generate(read(source))).toBe(source)
  })

  it('does not assign repeated filters by their position after an ambiguous mode switch', () => {
    const edit = edits['vcf']?.find((edit) => edit.control === 'mode')
    if (!edit) throw new Error('Missing mode fixture')
    const patch = fixture('vcf', edit)
    const filter = patch.modules.find((item) => item.type === 'vcf')
    const mix = patch.modules.find((item) => item.type === 'mix')
    if (!filter || !mix) throw new Error('Missing filter or mixer')
    const second = { ...module('vcf', { mode: 'hp' }), id: 'vcf2', row: 10 }
    patch.modules.push(second)
    patch.cables = patch.cables.filter((cable) => cable.from.module !== filter.id)
    patch.cables.push(wire(filter, second), wire(second, mix, 'in1'))
    const source = edited(patch, edit)
    const document = read(source)
    expect(document.patch.modules.filter((item) => item.type === 'vcf')).toHaveLength(2)
    expect(document.patch.modules.some((item) => ['vcf1', 'vcf2'].includes(item.id))).toBe(false)
    expect(generate(document)).toBe(source)
    expect(events(generate(document.patch))).toEqual(events(source))
  })

  it('keeps divergent uses of a previously shared ENV separate', () => {
    const scenario = scenarios.find((item) => item.name.endsWith('ENV into VCF/VCA'))
    if (!scenario) throw new Error('Missing shared ENV fixture')
    const patch = scenario.patch
    const source = generate(patch).replace('.attack(0.01)', '.attack(0.02)')
    const document = read(source)
    const envelopes = document.patch.modules.filter((item) => item.type === 'env')
    expect(envelopes).toHaveLength(2)
    expect(
      envelopes.map((item) => item.values['atk']).sort((a, b) => Number(a) - Number(b)),
    ).toEqual([0.01, 0.02])
    expect(generate(document)).toBe(source)
    expect(events(generate(document.patch))).toEqual(events(source))
    const saved = saveLayout(document)
    expect(read(saved.source).patch).toEqual(document.patch)
  })

  it('does not merge equal envelopes with independent saved identities', () => {
    const scenario = scenarios.find((item) => item.name.endsWith('ENV into VCF/VCA'))
    if (!scenario) throw new Error('Missing shared ENV fixture')
    const patch = structuredClone(scenario.patch)
    const env = patch.modules.find((item) => item.type === 'env')
    if (!env) throw new Error('Missing envelope')
    patch.modules.push({ ...structuredClone(env), id: 'env2', row: 12 })
    for (const cable of patch.cables)
      if (cable.from.module === env.id && cable.to.module === 'vca1') cable.from.module = 'env2'
    const document = read(edited(patch, scenario.edit))
    expect(rack(document.patch)).toEqual(rack(changed(patch, 'vcf', scenario.edit)))
  })

  it('does not guess anonymous SEQ identity when a mode switch makes the roots ambiguous', () => {
    const edit = edits['seq']?.find((edit) => edit.control === 'mode')
    if (!edit) throw new Error('Missing SEQ mode fixture')
    const patch = fixture('seq', edit)
    patch.names = {}
    const second = { ...module('seq', { steps: '0 2 4', mode: 'degree' }), id: 'seq2', row: 10 }
    const sound = { ...module('osc', { wave: 'triangle' }), id: 'osc2', row: 11 }
    const mix = patch.modules.find((item) => item.type === 'mix')
    if (!mix) throw new Error('Missing mixer')
    mix.values['ch2'] = 0.8
    patch.modules.push(second, sound)
    patch.cables.push(wire(second, sound), wire(sound, mix, 'in2'))
    const source = edited(patch, edit)
    const document = read(source)
    expect(document.patch.modules.some((item) => item.id === 'seq1')).toBe(false)
    expect(document.patch.modules.find((item) => item.id === 'seq2')).toMatchObject(second)
    expect(generate(document)).toBe(source)
    expect(events(generate(document.patch))).toEqual(events(source))
  })

  it('preserves two occupied sparse mixer channels and their subsequent rack control edits', () => {
    const scenario = scenarios.find((item) => item.name.endsWith('LFO into VCF/VCA'))
    if (!scenario) throw new Error('Missing split voice fixture')
    const patch = structuredClone(scenario.patch)
    const mix = patch.modules.find((item) => item.type === 'mix')
    if (!mix) throw new Error('Missing mixer')
    mix.values = { ch1: 0.3, ch2: 0.8, ch3: 0.4, ch4: 0.6 }
    for (const cable of patch.cables)
      if (cable.to.module === mix.id && cable.to.jack === 'in1') cable.to.jack = 'in4'
    const source = generate(patch).replace('.postgain(0.6)', '.postgain(0.7)')
    const expected = structuredClone(patch)
    const expectedMix = expected.modules.find((item) => item.id === mix.id)
    if (!expectedMix) throw new Error('Missing expected mixer')
    expectedMix.values['ch4'] = 0.7
    const document = read(source)
    expect(rack(document.patch)).toEqual(rack(expected))
    expect(generate(document)).toBe(source)
    expect(events(generate(document.patch))).toEqual(events(generate(expected)))
    const next = structuredClone(document.patch)
    const nextMix = next.modules.find((item) => item.id === mix.id)
    if (!nextMix) throw new Error('Missing next mixer')
    nextMix.values['ch2'] = 0.5
    const updated = editDocument(document, next)
    expect(body(updated.source)).toBe(body(source).replace('.postgain(0.8)', '.postgain(0.5)'))
    expect(read(updated.source).patch).toEqual(next)
  })
})

it('uses real mini-notation, timing and tempo in the event oracle', () => {
  expect(events('setcpm(30); $: note("c3 e3").s("sine")')).toEqual({
    tempo: 30,
    voices: [
      Array.from({ length: 8 }, (_, index) => ({
        value: { note: index % 2 === 0 ? 'c3' : 'e3', s: 'sine' },
        begin: String(index / 2),
        end: String((index + 1) / 2),
      })),
    ],
  })
})

it.each(nonLiteral)(
  '%s has no independent code literal: saves and reopens its changed state',
  (key) => {
    const [type, control] = key.split('.')
    if (!type || !control) throw new Error('Invalid control key')
    const edit: EditCase = {
      control,
      before: type === 'seq' ? 8 : 0.8,
      after: type === 'seq' ? 7 : 0.7,
      token: '',
      replacement: '',
    }
    const patch = fixture(type, edit)
    if (type === 'seq') {
      const seq = patch.modules.find((item) => item.type === 'seq')
      if (!seq) throw new Error('Missing SEQ')
      seq.values['steps'] = ['c2', 'd2', 'e2', 'f2', 'g2', 'a2', 'b2', 'c3']
    }
    const next = changed(patch, type, edit)
    expect(read(generate(next)).patch).toEqual(next)
    expect(generate(read(generate(next)))).toBe(generate(next))
    if (type === 'out') expect(body(generate(next))).toBe(body(generate(patch)))
    else expect(body(generate(next))).toContain('note("c2 d2 e2 f2 g2 a2 b2")')
  },
)

describe.each(['seq', 'drums'])('%s grid representation', (type) => {
  let before: ControlValue
  let actual: ControlValue | undefined
  beforeAll(() => {
    const edit = edits[type]?.find((edit) => edit.control === (type === 'seq' ? 'rate' : 'drop'))
    if (!edit) throw new Error('Missing grid sibling edit')
    const patch = fixture(type, edit)
    const source = patch.modules.find((item) => item.type === type)
    if (!source) throw new Error('Missing source')
    const control = type === 'seq' ? 'steps' : 'grid'
    const spec = getModuleSpec(type).controls.find((item) => item.id === control)
    if (!spec) throw new Error('Missing grid control')
    before = spec.default
    source.values[control] = before
    const value = read(edited(patch, edit)).patch.modules.find((item) => item.id === source.id)
      ?.values[control]
    if (typeof value !== 'string') throw new Error('Expected retained notation')
    const view =
      spec.kind === 'steps'
        ? stepView(value, spec)
        : spec.kind === 'grid'
          ? drumView(value, spec)
          : undefined
    actual = view?.kind === 'grid' ? view.value : undefined
  })
  it('retains its grid view after a sibling literal edit (#66)', () => {
    expect(actual).toEqual(before)
  })
})

describe('exact reported six-module LFO/VCF patch (#65)', () => {
  let patch: Patch
  let code: string
  let expected: Patch
  beforeAll(() => {
    const edit = edits['vcf']?.find((edit) => edit.control === 'res')
    if (!edit) throw new Error('Missing resonance edit')
    patch = fixture('vcf', edit)
    patch.names = {}
    const seq = patch.modules.find((item) => item.type === 'seq')
    const filter = patch.modules.find((item) => item.type === 'vcf')
    if (!seq || !filter) throw new Error('Missing reported modules')
    delete seq.values['steps']
    const lfo = { ...module('lfo', { depth: 1600 }), row: 7, hp: 3 }
    patch.modules.push(lfo)
    patch.cables.push(wire(lfo, filter, 'cv'))
    expect(patch.modules).toHaveLength(6)
    expect(patch.cables).toHaveLength(5)
    code = edited(patch, edit)
    expected = changed(patch, 'vcf', edit)
    expect(read(code).kind).toBe('source')
  })
  it('preserves source, exact unedited saved state and real events separately', () => {
    expect(generate(read(code))).toBe(code)
    expect(read(generate(patch)).patch).toEqual(patch)
    expect(events(generate(read(code).patch))).toEqual(events(generate(expected)))
  })
  it('keeps six modules and the same five connections (#65)', () => {
    const actual = read(code).patch
    expect(actual.modules.map((item) => item.id).sort()).toEqual(
      patch.modules.map((item) => item.id).sort(),
    )
    const endpoints = (value: Patch) =>
      value.cables
        .map(({ from, to }) => ({ from, to }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    expect(endpoints(actual)).toEqual(endpoints(patch))
  })
})

// Anonymous source literals change the root fingerprint, independently of #99's
// module/layout matching contract. Routing must still stay out of CODE.
it.each(scenarios)(
  '$name retains routing after an anonymous literal edit (#65)',
  ({ patch, edit }) => {
    const anonymous = { ...patch, names: {} }
    const code = edited(anonymous, edit)
    const document = read(code)
    expect(
      document.patch.modules
        .filter((item) => item.type === 'code')
        .map((item) => item.values['text']),
    ).not.toEqual(expect.arrayContaining([expect.stringContaining('.orbit(')]))
    expect(generate(document)).toBe(code)
    const saved = saveLayout(document)
    expect(read(saved.source).patch).toEqual(document.patch)
    expect(body(saved.source)).toBe(body(code))
  },
)
