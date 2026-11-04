import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { SOUND_FORMS } from './sound-effects.fixtures'
let runtime: Record<string, unknown>
beforeAll(async () => {
  const loaded = await Promise.all(
    ['@strudel/core', '@strudel/mini/mini.mjs'].map((p) => import(/* @vite-ignore */ p)),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing parser')
  runtime.miniAllStrings()
})
function events(expression: string) {
  // Only repository-owned fixtures enter this pinned-engine query.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0,4).filter(h=>h.hasOnset()).map(h=>{const {orbit,...value}=h.value;return {value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}})`,
  )(...Object.values(runtime))
}
function voice(source: string) {
  const scope = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  return source.slice(scope.start, scope.end)
}
it.each(SOUND_FORMS)('$type reads $expression, retains source, saved rack and events', (form) => {
  const source = `// source remains exact\n$: ${form.expression} // retain me\n`
  const doc = read(source)
  expect(doc.patch.modules.find((m) => m.type === form.type)?.values).toMatchObject(form.values)
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toHaveLength(0)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
  const generated = generate(doc.patch)
  expect(read(generated).patch).toEqual(doc.patch)
  expect(events(voice(generated))).toEqual(events(form.expression))
  expect(events(form.expression).length).toBeGreaterThan(0)
})
it.each([
  [
    'harmonic',
    'partials',
    [1, 0.2, 0, 0.7],
    '.s("user").partials([1, 0.5, 0, 0.3])',
    '.s("user").partials([1,0.2,0,0.7])',
  ],
  ['noise', 'density', 0.3, '.s("crackle").density(0.1)', '.s("crackle").density(0.3)'],
  ['fmop', 'index', 3, '.s("sine").fm(2).fmh(1.5)', '.s("sine").fm(3).fmh(1.5)'],
  ['folder', 'amount', 0.8, '.s("sine").fold(0.6)', '.s("sine").fold(0.8)'],
  ['lofi', 'bits', 8, '.s("sine").crush(6).coarse(4)', '.s("sine").crush(8).coarse(4)'],
  ['formant', 'vowel', 'a', '.s("sine").vowel("<a e i o>")', '.s("sine").vowel("a")'],
  ['comp', 'transient', 0.7, '.s("sine").transient(0.5)', '.s("sine").transient(0.7)'],
  ['phaser', 'rate', 3, '.s("sine").phaser(2)', '.s("sine").phaser(3)'],
  ['pan', 'pan', 0.7, '.s("sine").pan(0.3)', '.s("sine").pan(0.7)'],
  ['shift', 'shift', -1, '.s("sine").stretch(1.5)', '.s("sine").stretch(-1)'],
] as const)(
  'edits %s.%s with exact surrounding source and saved identity',
  (type, id, value, before, after) => {
    const source = `// retained\n$: note("c3 e3")${before}\n`
    const doc = saveLayout(read(source))
    const module = doc.patch.modules.find((m) => m.type === type)
    if (!module) throw new Error('Missing panel')
    const edited = editDocument(doc, setValue(doc.patch, module.id, id, value))
    expect(sourceBody(edited.source)).toBe(source.replace(before, after))
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(events(voice(edited.source))).toEqual(events('note("c3 e3")' + after))
  },
)
it('patches FM OP only to OSC FM and PAN to real CV', () => {
  let patch = starterPatch()
  for (const [i, type] of ['seq', 'osc', 'fmop', 'pan', 'lfo'].entries())
    patch = placeModule(patch, type, i + 1)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'fmop1', jack: 'out' }, { module: 'osc1', jack: 'fm' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'pan1', jack: 'in' })
  patch = connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'pan1', jack: 'cv' })
  patch = connect(patch, { module: 'pan1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  expect(read(generate(patch)).patch).toEqual(patch)
  expect(generate(patch)).toContain('.lfo({ c: "pan"')
  expect(() =>
    connect(patch, { module: 'fmop1', jack: 'out' }, { module: 'osc1', jack: 'tune' }),
  ).toThrow('FM OP')
})
it.each([
  '.partials([1, foo])',
  '.partials([2, 0.5])',
  '.fold(foo)',
  '.coarse(0)',
  '.stretch(Infinity)',
])('keeps unsupported %s exact CODE', (call) => {
  const source = `$: note("c3").s("sine")${call}\n`
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(generate(doc)).toBe(source)
  expect(read(saveLayout(doc).source).patch).toEqual(saveLayout(doc).patch)
})

it.each(['.fm(2).fmattack(0.001)', '.fm(2).fmdecay(0.05)', '.fm(2)', '.fmh(1.5)'])(
  'retains FM envelope presence for %s',
  (call) => {
    const source = `note("c3").s("sine")${call}`
    const doc = read(`$: ${source}\n`)
    expect(events(voice(generate(doc.patch)))).toEqual(events(source))
    expect(read(saveLayout(doc).source).patch).toEqual(saveLayout(doc).patch)
  },
)

it.each([...new Set(SOUND_FORMS.map((form) => form.type))])(
  'builds %s from the palette and reopens its complete rack',
  (type) => {
    let patch = starterPatch()
    const types = ['noise', 'harmonic'].includes(type)
      ? ['seq', type]
      : ['seq', 'osc', ...(type === 'fmop' ? [] : [type])]
    for (const [row, kind] of types.entries()) patch = placeModule(patch, kind, row + 1)
    patch = connect(
      patch,
      { module: 'seq1', jack: 'note' },
      { module: `${types[1]}1`, jack: 'note' },
    )
    let from = { module: `${types[1]}1`, jack: 'out' }
    if (type === 'fmop') {
      patch = placeModule(patch, 'fmop', 4)
      patch = connect(patch, { module: 'fmop1', jack: 'out' }, { module: 'osc1', jack: 'fm' })
    } else if (types.length === 3) {
      patch = connect(patch, from, { module: `${type}1`, jack: 'in' })
      from = { module: `${type}1`, jack: 'out' }
    }
    patch = connect(patch, from, { module: 'mix1', jack: 'in1' })
    const generated = generate(patch)
    expect(read(generated).patch).toEqual(patch)
    expect(events(voice(generated)).length).toBeGreaterThan(0)
  },
)

it('retains previously saved whole-voice and suffix CODE ownership', () => {
  for (const whole of [false, true]) {
    let patch = starterPatch()
    for (const [i, type] of (whole ? ['code'] : ['seq', 'osc', 'code']).entries())
      patch = placeModule(patch, type, i + 1)
    patch = setValue(
      patch,
      'code1',
      'text',
      whole ? 's("user").partials([1, 0.5, 0, 0.3])' : '.soft(0.5)',
    )
    if (!whole) {
      patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
      patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'code1', jack: 'in' })
    }
    patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const source = generate(patch)
    expect(read(source).patch).toEqual(patch)
    expect(generate(read(source))).toBe(source)
    const saved = saveLayout(read(source))
    expect(read(saved.source).patch).toEqual(patch)
  }
})

it('shows the fixed engine order on reversed new-effect cables and warns about shared distortion stages', async () => {
  const { cableWarnings } = await import('../rack/model')
  for (const [call, warning] of [
    ['.pan(0.3).stretch(1.5)', 'SHIFT → PAN'],
    ['.soft(0.5).vowel("a")', 'FORMANT → waveshaper'],
    ['.soft(0.5).fold(0.6)', 'last setter wins'],
  ]) {
    const source = `note("c3").s("sine")${call}`
    const doc = read(`$: ${source}\n`)
    expect(
      doc.patch.cables
        .flatMap((c) => cableWarnings(doc.patch, c))
        .some((w) => w.includes(warning ?? '')),
    ).toBe(true)
    expect(events(voice(generate(doc.patch)))).toEqual(events(source))
  }
})

it('keeps downstream placement when an unsupported argument falls back to CODE', () => {
  const a = read('$: note("c3").s("sine").pan(rand).gain(0.2)\n')
  const b = read('$: note("c3").s("sine").unmapped(rand).gain(0.2)\n')
  const positions = (p: typeof a.patch) =>
    p.modules.map(({ id, type, row, hp }) => ({ id, type, row, hp }))
  expect(positions(a.patch)).toEqual(positions(b.patch))
})

it.each([
  's("crackle").density(0)',
  'note("c3").s("sine").crush(16)',
  'note("c3").s("sine").coarse(4)',
  'note("c3").s("sine").phaserdepth(0.5)',
])('preserves explicit neutral and absent settings: %s', (source) => {
  const doc = read(`$: ${source}\n`)
  expect(events(voice(generate(doc.patch)))).toEqual(events(source))
  expect(read(saveLayout(doc).source).patch).toEqual(saveLayout(doc).patch)
})

it.each(['SMOOTH', 'STEP', 'ENV', 'CV SEQ'])(
  'keeps PAN %s depth in panel units and round-trips real events',
  (mode) => {
    let patch = starterPatch()
    for (const [i, type] of [
      'seq',
      'osc',
      'pan',
      mode === 'ENV' ? 'env' : mode === 'CV SEQ' ? 'cvseq' : 'lfo',
    ].entries())
      patch = placeModule(patch, type, i + 1)
    patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'pan1', jack: 'in' })
    patch = connect(patch, { module: 'pan1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const source = mode === 'ENV' ? 'env1' : mode === 'CV SEQ' ? 'cvseq1' : 'lfo1'
    if (source === 'lfo1') patch = setValue(patch, source, 'mode', mode)
    if (mode !== 'CV SEQ') patch = setValue(patch, source, 'depth', 0.25)
    patch = connect(patch, { module: source, jack: 'out' }, { module: 'pan1', jack: 'cv' })
    // Connect initializes per-target defaults, so set the explicit value afterwards.
    if (mode !== 'CV SEQ') patch = setValue(patch, source, 'depth', 0.25)
    const code = generate(patch)
    expect(read(code).patch).toEqual(patch)
    if (mode === 'SMOOTH' || mode === 'ENV') expect(code).toContain('depthabs: 0.5')
    const doc = read(`$: ${voice(code)}\n`)
    expect(events(voice(generate(doc.patch)))).toEqual(events(voice(code)))
  },
)

it('distinguishes separate filter stages and skips inert nullary distortion warnings', async () => {
  const { cableWarnings } = await import('../rack/model')
  for (const calls of ['.lpf(800).hpf(200)', '.soft().vowel("a")']) {
    const doc = read(`$: note("c3").s("sine")${calls}\n`)
    expect(doc.patch.cables.flatMap((c) => cableWarnings(doc.patch, c))).toEqual([])
  }
})

it.each([
  '.coarse(4).coarse(1)',
  '.transient(.5).transient(0)',
  '.phaserdepth(.3).phaserdepth(.75)',
])('retains explicit reset setters: %s', (calls) => {
  const expression = `note("c3").s("sine")${calls}`
  const source = `// keep resets\n$: ${expression}\n`
  const doc = read(source)
  expect(generate(doc)).toBe(source)
  expect(events(voice(generate(doc.patch)))).toEqual(events(expression))
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
})

it.each(['soft', 'hard', 'cubic', 'diode', 'asym', 'sinefold', 'chebyshev', 'shape'])(
  'imports nullary %s after samples through SMPL',
  (method) => {
    const expression = `s("bd").${method}()`
    const source = `$: ${expression}\n`
    const doc = read(source)
    expect(doc.patch.modules.map((m) => m.type).sort()).toEqual(
      ['drums', 'drive', 'smpl', 'mix', 'out'].sort(),
    )
    expect(
      doc.patch.cables.some(
        (c) =>
          doc.patch.modules.find((m) => m.id === c.from.module)?.type === 'smpl' &&
          doc.patch.modules.find((m) => m.id === c.to.module)?.type === 'drive',
      ),
    ).toBe(true)
    expect(generate(doc)).toBe(source)
    expect(events(voice(generate(doc.patch)))).toEqual(events(expression))
    const saved = saveLayout(doc)
    expect(read(saved.source).patch).toEqual(saved.patch)
  },
)

it('preserves shared FM OP ownership after source comments and a look edit', async () => {
  const { setLook } = await import('../rack/model')
  let patch = starterPatch()
  for (const [i, type] of ['seq', 'osc', 'seq', 'osc', 'fmop'].entries())
    patch = placeModule(patch, type, i + 1)
  for (const channel of [1, 2]) {
    patch = connect(
      patch,
      { module: `seq${channel}`, jack: 'note' },
      { module: `osc${channel}`, jack: 'note' },
    )
    patch = connect(
      patch,
      { module: 'fmop1', jack: 'out' },
      { module: `osc${channel}`, jack: 'fm' },
    )
    patch = connect(
      patch,
      { module: `osc${channel}`, jack: 'out' },
      { module: 'mix1', jack: `in${channel}` },
    )
  }
  const original = generate(patch)
  const doc = read(`// retain shared operator\n${original}`)
  expect(doc.patch.modules.filter((m) => m.type === 'fmop')).toHaveLength(1)
  const next = setLook(doc.patch, 'osc1', 'vintage')
  const edited = editDocument(doc, next)
  expect(sourceBody(edited.source)).toBe(`// retain shared operator\n${sourceBody(original)}`)
  expect(read(edited.source).patch).toEqual(next)
  const expected = parseSource(original)
    .scopes.filter((s) => s.kind === 'voice')
    .map((s) => events(original.slice(s.start, s.end)))
  expect(
    parseSource(edited.source)
      .scopes.filter((s) => s.kind === 'voice')
      .map((s) => events(edited.source.slice(s.start, s.end))),
  ).toEqual(expected)
})
