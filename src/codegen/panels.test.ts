import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { panelCases, panelFixture as fixture } from '../testing/panelCases'
import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { read } from '../reader'
import { generate } from './generate'
import type { ControlValue } from '../patch/types'

let runtime: Record<string, unknown>
beforeAll(async () => {
  const loaded = await Promise.all(
    ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs'].map(
      async (entry) => import(/* @vite-ignore */ entry),
    ),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(source: string): unknown {
  let body = sourceBody(source)
  const statements = parse(body, { ecmaVersion: 'latest' }).body
  for (const statement of [...statements].reverse()) {
    if (statement.type !== 'LabeledStatement' || statement.body.type !== 'ExpressionStatement')
      continue
    body =
      body.slice(0, statement.start) +
      `voices.push(${body.slice(statement.body.expression.start, statement.body.expression.end)})` +
      body.slice(statement.end)
  }
  // Repository-owned fixtures only. Actual label mute/solo behavior is checked in the browser REPL.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `const voices = []; const setcpm = () => {}; ${body}; return voices.map(voice => voice.queryArc(0,4).map(h => ({ value: h.value, begin: h.whole.begin.toString(), end: h.whole.end.toString() })))`,
  )(...Object.values(runtime))
}

for (const example of panelCases)
  describe(`${example.type}.${example.control}`, () => {
    const channel = example.type === 'mix' ? Number(example.control.slice(-1)) : 1
    const patch = fixture(
      example.type,
      { ...example.settings, [example.control]: example.value },
      channel,
    )
    const source = generate(patch)
    it('writes the requested engine call or label', () =>
      expect(sourceBody(source)).toContain(example.call))
    it('retains exact source independently of saved rack recovery', () => {
      expect(generate(read(source))).toBe(source)
      expect(read(source).layout).toBe('restored')
      expect(read(source).patch).toEqual(patch)
    })
    it('reads plain code, saves exact bytes and restores the projected rack', () => {
      const plain = sourceBody(source)
      const doc = read(plain)
      expect(
        doc.patch.modules.filter(
          (module) =>
            module.type === 'code' &&
            !(
              typeof module.values.text === 'string' && /^\.orbit\(/.test(module.values.text.trim())
            ),
        ),
      ).toEqual([])
      expect(generate(doc)).toBe(plain)
      const saved = saveLayout(doc)
      expect(sourceBody(saved.source)).toBe(plain)
      expect(read(saved.source).layout).toBe('restored')
      expect(read(saved.source).patch).toEqual(doc.patch)
    })
    it('preserves real pinned-engine events after reader projection', () => {
      const plain = sourceBody(source)
      expect(events(generate(read(plain).patch))).toEqual(events(plain))
    })
  })

it('writes multi-word scales and shifts diatonically through the pinned tonal engine', () => {
  const patch = fixture('quant', { scale: 'minor pentatonic', shift: 2 })
  const source = generate(patch)
  expect(source).toContain('.scale("C:minor:pentatonic")')
  const doc = read(sourceBody(source))
  expect(doc.patch.modules.find((module) => module.type === 'quant')?.values.scale).toBe(
    'minor pentatonic',
  )
  expect(events(generate(doc.patch))).toEqual(events(source))
})

it('omits new engine defaults and inactive mode controls while retaining their saved values', () => {
  for (const type of ['osc', 'vcf', 'vca', 'smpl', 'delay', 'reverb']) {
    const source = sourceBody(generate(fixture(type)))
    for (const name of [
      'pw',
      'unison',
      'detune',
      'spread',
      'noise',
      'octave',
      'freq',
      'ftype',
      'drive',
      'fanchor',
      'velocity',
      'begin',
      'end',
      'loop',
      'cut',
      'delaysync',
      'roomfade',
      'roomlp',
      'roomdim',
    ])
      expect(source).not.toContain(`.${name}(`)
  }
  for (const [type, values, absent] of [
    [
      'osc',
      { wave: 'sine', pw: 0.3, voices: 7, detune: 0.3, spread: 0.8 },
      ['pw', 'unison', 'detune', 'spread'],
    ],
    ['vcf', { type: '12db', drive: 0.8 }, ['drive']],
    ['vcf', { mode: 'dj', type: 'ladder', drive: 0.8, dj: 0.3 }, ['lpf', 'lpq', 'ftype', 'drive']],
    [
      'delay',
      { mix: 0, mode: 'sync', sync: 0.25 },
      ['delay', 'delaytime', 'delaysync', 'delayfeedback'],
    ],
    [
      'reverb',
      { room: 0, fade: 2, lp: 4000, dim: 8000 },
      ['room', 'roomsize', 'roomfade', 'roomlp', 'roomdim'],
    ],
  ] satisfies [string, Record<string, ControlValue>, string[]][]) {
    const patch = fixture(type, values)
    const source = generate(patch)
    for (const name of absent) expect(sourceBody(source)).not.toContain(`.${name}(`)
    expect(read(source).patch).toEqual(patch)
  }
})

it('creates a drone with an unpatched Hz oscillator and recovers its frequency mode', () => {
  let patch = placeModule(starterPatch(), 'osc', 1)
  patch = setValue(patch, 'osc1', 'mode', 'freq')
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const source = generate(patch)
  expect(source).toContain('$: freq(110)')
  const doc = read(sourceBody(source))
  expect(doc.patch.modules.find((module) => module.type === 'osc')?.values.mode).toBe('freq')
  expect(
    doc.patch.modules.filter(
      (module) =>
        module.type === 'code' &&
        !(typeof module.values.text === 'string' && /^\.orbit\(/.test(module.values.text.trim())),
    ),
  ).toEqual([])
  expect(events(generate(doc.patch))).toEqual(events(source))
})

it('keeps label edits and all orbit allocations on external code changes', () => {
  const patch = fixture('mix', { name1: 'bass' })
  const source = generate(patch)
  const doc = read(source.replace('bass: ', '_bass: '))
  expect(doc.patch.modules.find((module) => module.type === 'mix')?.values.mute1).toBe('on')
  expect(generate(doc.patch)).toContain('_bass: ')
  expect(generate(doc.patch)).toContain('.orbit(1)')
})

it('accepts STEP LFOs on all four mixer levels and folds nested levels into one final gain', () => {
  for (const channel of [1, 2, 3, 4]) {
    let patch = placeModule(fixture('mix', { [`ch${channel}`]: 0.2 }, channel), 'lfo', 5)
    patch = connect(
      patch,
      { module: 'lfo1', jack: 'out' },
      { module: 'mix1', jack: `cv${channel}` },
    )
    patch = setValue(patch, 'lfo1', 'depth', 0.6)
    const source = generate(patch)
    expect(source).toContain('.postgain(sine.slow(4).range(0.2, 0.8))')
    expect(read(source).patch).toEqual(patch)
    const plain = read(sourceBody(source))
    expect(plain.patch.modules.some((module) => module.type === 'lfo')).toBe(true)
    expect(events(generate(plain.patch))).toEqual(events(source))
    const saved = saveLayout(plain)
    expect(read(saved.source).layout).toBe('restored')
    expect(read(saved.source).patch).toEqual(plain.patch)
    patch = placeModule(patch, 'mix', 6)
    patch = setValue(patch, 'mix2', 'ch1', 0.5)
    patch = connect(patch, { module: 'mix1', jack: 'out' }, { module: 'mix2', jack: 'in1' })
    patch = connect(patch, { module: 'mix2', jack: 'out' }, { module: 'out1', jack: 'in' }, true)
    const nested = generate(patch)
    expect(sourceBody(nested).match(/\.postgain\(/g)).toHaveLength(1)
    expect(nested).toContain('.range(0.2, 0.8).mul(0.5)')
    expect(read(nested).patch).toEqual(patch)
    expect(events(nested)).not.toEqual(events(source))
  }
})

it('source-preserving edits of new imported numeric controls retain comments and identity', () => {
  const original = '$: note("c3").s("pulse").pw(/* shape */ .3)\n'
  const doc = read(original)
  const osc = doc.patch.modules.find((module) => module.type === 'osc')
  if (!osc) throw new Error('Missing oscillator')
  const edited = editDocument(doc, setValue(doc.patch, osc.id, 'pw', 0.4))
  expect(sourceBody(edited.source)).toBe(original.replace('.3)', '0.4)'))
  expect(read(edited.source).patch).toEqual(edited.patch)
})

it('retains simultaneous filter and DJ settings as separate VCFs', () => {
  const source = '$: note("c3").s("sine").lpf(800).djf(.3)\n'
  const doc = read(source)
  expect(doc.patch.modules.filter((module) => module.type === 'vcf')).toHaveLength(2)
  expect(events(generate(doc.patch))).toEqual(
    events(source.replace('djf(.3)', 'djf(.3).lpq(1).orbit(1)')),
  )
})

it('keeps an omitted sync default tempo-relative and preserves exact cycle fractions', () => {
  const patch = fixture('delay', { mode: 'sync', sync: 0.1875 })
  const source = sourceBody(generate(patch))
  expect(source).not.toContain('.delaytime(')
  expect(source).not.toContain('.delaysync(')
  expect(sourceBody(generate(read(source).patch))).not.toContain('.delaytime(')
  expect(generate(fixture('delay', { mode: 'sync', sync: 0.015625 }))).toContain(
    '.delaysync(0.015625)',
  )
})

it('preserves an older source-owned rack whose delay had no MODE control', async () => {
  const { readLayout } = await import('../reader/layout')
  const { writeLayout } = await import('./layout')
  const source = '$: note("c3").s("sine").delay(.4)\n'
  const doc = saveLayout(read(source))
  const saved = readLayout(doc.source)
  if (saved.kind !== 'valid') throw new Error('Missing fixture layout')
  const delay = saved.layout.modules.find((module) => module.type === 'delay')
  if (!delay) throw new Error('Missing fixture delay')
  // The pre-129 writer saved this same source without the new mode value.
  delete delay.values.mode
  const legacy = sourceBody(doc.source) + writeLayout(saved.layout)
  const restored = read(legacy)
  expect(restored.layout).toBe('restored')
  expect(restored.patch.modules.find((module) => module.id === delay.id)?.values).toEqual(
    delay.values,
  )
  expect(generate(restored)).toBe(legacy)
  expect(read(saveLayout(restored).source).patch).toEqual(restored.patch)
})

it.each([0.8, 1])('keeps imported repeated postgain setters at their final value %s', (final) => {
  const source = `$: note("c3").s("sine").postgain(.5).postgain(${final}).orbit(3)\n`
  const doc = read(source)
  expect(doc.patch.modules.filter((module) => module.type === 'mix')).toHaveLength(1)
  expect(
    doc.patch.modules
      .filter((module) => module.type === 'code')
      .map((module) => module.values.text),
  ).toContain('.postgain(.5)')
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(doc.patch)
})

it.each([
  ['_$', 'on', 'off', ''],
  ['S$', 'off', 'on', ''],
  ['bass', 'off', 'off', 'bass'],
] as const)(
  'retains the enclosing %s label on imported stack voices',
  (label, mute, solo, name) => {
    const source = `${label}: stack(note("c3").s("sine"),note("e3").s("sine"))\n`
    const doc = read(source)
    const mixer = doc.patch.modules.find((module) => module.type === 'mix')
    expect(mixer?.values).toMatchObject({
      mute1: mute,
      mute2: mute,
      solo1: solo,
      solo2: solo,
      name1: name,
      name2: name,
    })
    const regenerated = sourceBody(generate(doc.patch))
    if (label === 'bass') {
      expect(regenerated).toContain('bass: ')
      expect(regenerated).toContain('bass2: ')
    } else
      expect(regenerated.match(new RegExp(`^${label.replace('$', '\\$')}: `, 'gm'))).toHaveLength(2)
    expect(generate(doc)).toBe(source)
    const saved = saveLayout(doc)
    expect(read(saved.source).patch).toEqual(doc.patch)
  },
)

it('retains final setters over a shared declaration with an earlier postgain', () => {
  const source =
    'const panelVoice = note("c3").s("sine").postgain(.5)\n$: panelVoice.postgain(1).orbit(3)\n$: panelVoice.postgain(.8).orbit(4)\n'
  const doc = read(source)
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(doc.patch)
})

it.each([
  '.gain(.4).lpf(800).lpq(1).velocity(.6)',
  '.roomfade(2)',
  '.roomlp(4000)',
  '.roomdim(8000)',
  '.ftype("ladder")',
  '.drive(.8)',
  '.fanchor(.5)',
  '.pw(.3)',
  '.unison(7)',
  '.detune(.3)',
  '.spread(.8)',
  '.delaysync(.25)',
])('preserves companion settings without inventing an active owner: %s', (suffix) => {
  const sound = suffix.startsWith('.gain') ? '.s("sine")' : '.s("sine").iter(2)'
  const source = `$: note("c3")${sound}${suffix}.orbit(3)\n`
  const doc = read(source)
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(doc.patch)
})

it('preserves an implicit oscillator sound for a bare frequency source', () => {
  const source = '$: freq(110).orbit(3)\n'
  expect(events(generate(read(source).patch))).toEqual(events(source))
})

it('preserves an explicit default channel override after an earlier output pair', () => {
  const source = '$: note("c3").s("sine").channels("3:4").channels("1:2").orbit(3)\n'
  const doc = read(source)
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(generate(doc)).toBe(source)
  expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
})

it.each(['.delaytime(.3).delaysync(.25)', '.delaysync(.25).delaytime(.3)'])(
  'keeps explicit delay time authoritative for mixed TIME/SYNC settings: %s',
  (settings) => {
    const source = `$: note("c3").s("sine").delay(.4).delayfeedback(.5)${settings}.orbit(3)\n`
    const doc = read(source)
    expect(events(generate(doc.patch))).toEqual(events(source))
    expect(generate(doc)).toBe(source)
    expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
  },
)

it('retains an explicit neutral DJ override after an active setting', () => {
  const source = '$: note("c3").s("sine").djf(.3).djf(.5).orbit(3)\n'
  expect(events(generate(read(source).patch))).toEqual(events(source))
})

it('preserves saved delaytime ownership beside an existing CODE delaysync call', () => {
  let patch = placeModule(fixture('delay', { time: 0.3 }), 'code', 5)
  patch = setValue(patch, 'code1', 'text', '.delaysync(.25)')
  patch = connect(patch, { module: 'delay1', jack: 'out' }, { module: 'code1', jack: 'in' })
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' }, true)
  const doc = read(generate(patch))
  const saved = saveLayout(doc)
  expect(saved.patch).toEqual(patch)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(patch)
  expect(events(saved.source)).toEqual(events(generate(patch)))
})
