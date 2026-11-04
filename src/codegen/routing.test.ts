import { parse } from 'acorn'
import { beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generate'
import { graph } from './graph'
import { routingPlan } from './routing'
import { routingFixture, ROUTING_KINDS } from '../testing/routingCases'
import { read } from '../reader'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { setValue, removeCable, cableKind, connect } from '../rack/model'

let runtime: Record<string, unknown>
let compile: (source: string) => string
beforeAll(async () => {
  runtime = Object.assign(
    { setcpm: () => {} },
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs'].map(
        (p) => import(/* @vite-ignore */ p),
      ),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
  const entry = '@strudel/transpiler/transpiler.mjs'
  const loaded: Record<string, unknown> = await import(/* @vite-ignore */ entry)
  if (typeof loaded.transpiler !== 'function') throw new Error('Missing transpiler')
  const transpile = loaded.transpiler
  compile = (source) => {
    const result: unknown = transpile(source, { emitMiniLocations: false, emitWidgets: false })
    if (
      !result ||
      typeof result !== 'object' ||
      !('output' in result) ||
      typeof result.output !== 'string'
    )
      throw new Error('Invalid transpiler')
    return result.output
  }
})
function events(source: string, end = 4): Record<string, unknown>[] {
  // Only trusted test fixtures run through the pinned REPL compiler and core.
  let body = sourceBody(source)
  for (const statement of parse(body, { ecmaVersion: 'latest' }).body.reverse()) {
    if (statement.type !== 'LabeledStatement' || statement.body.type !== 'ExpressionStatement')
      continue
    body =
      body.slice(0, statement.start) +
      `voices.push(${body.slice(statement.body.expression.start, statement.body.expression.end)})` +
      body.slice(statement.end)
  }
  // oxlint-disable-next-line typescript/no-implied-eval
  const result: unknown = new Function(
    ...Object.keys(runtime),
    compile(`const voices = []; ${body}; stack(...voices)`),
  )(...Object.values(runtime))
  if (
    !result ||
    typeof result !== 'object' ||
    !('queryArc' in result) ||
    typeof result.queryArc !== 'function'
  )
    throw new Error('Missing pattern')
  const haps: unknown = result.queryArc(0, end)
  if (!Array.isArray(haps)) throw new Error('Missing events')
  return haps
    .sort((a, b) => Number(a.whole.begin) - Number(b.whole.begin))
    .filter((h) => h.hasOnset())
    .map((h) => ({ begin: String(h.whole.begin), end: String(h.whole.end), ...h.value }))
}
for (const kind of ROUTING_KINDS)
  describe(kind, () => {
    it('retains exact source independently of complete saved-rack identity', () => {
      const patch = routingFixture(kind),
        source = generate(patch),
        doc = read(source)
      expect(doc.layout, doc.diagnostics.join('; ')).toBe('restored')
      expect(generate(doc)).toBe(source)
      expect(doc.patch).toEqual(patch)
      const saved = saveLayout(doc)
      expect(read(saved.source).patch).toEqual(patch)
    })
    it('retains pinned-engine events on save/reopen and regenerated rack', () => {
      const patch = routingFixture(kind),
        source = generate(patch)
      const expected = events(source)
      expect(expected.length).toBeGreaterThan(0)
      expect(events(generate(read(source).patch))).toEqual(expected)
      expect(events(saveLayout(read(source)).source)).toEqual(expected)
    })
    it('keeps unproven imported routing source-owned, including after save', () => {
      const source = `// keep exact routing 🐒\r\n${sourceBody(generate(routingFixture(kind)))}`
      const doc = read(source)
      expect(generate(doc)).toBe(source)
      const saved = saveLayout(doc)
      expect(sourceBody(saved.source)).toBe(source)
      expect(read(saved.source).patch).toEqual(doc.patch)
      expect(events(saved.source)).toEqual(events(source))
      if (['aux', 'duck', 'audio-mod'].includes(kind))
        expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
    })
  })
it('GATES supplies rhythm while SEQ supplies pitch', () => {
  const haps = events(generate(routingFixture('gates')), 1)
  expect(haps.map((h) => h.begin)).toEqual(['0', '0.25', '0.375', '0.625', '0.875'])
  expect(haps.map((h) => h.note)).toEqual(['c2', 'c2', 'eb2', 'eb2', 'g2'])
})
it('SWITCH picks one of four inputs per cycle, with repeated selections', () => {
  const haps = events(generate(routingFixture('switch')), 5)
  expect(haps.map((h) => h.note)).toEqual(['c3', 'c3', 'd3', 'e3', 'c3'])
})
it('AUX shares one bus for both silent senders and its processed return', () => {
  const haps = events(generate(routingFixture('aux')), 1)
  expect(haps.filter((h) => h.bus === 1)).toHaveLength(8)
  expect(haps.filter((h) => h.bus === 1).every((h) => h.dry === 0)).toBe(true)
  expect(haps.find((h) => h.s === 'bus')).toMatchObject({ n: 1, cutoff: 900, postgain: 0.15 })
})
it('DUCK resolves and retargets the final channel orbit when channels renumber', () => {
  const patch = routingFixture('duck')
  expect(
    events(generate(patch), 1)
      .filter((h) => h.duckorbit !== undefined)
      .map((h) => h.duckorbit),
  ).toEqual([2, 2, 2, 2])
  const dry = patch.cables.find((c) => c.to.module === 'mix1' && c.to.jack === 'in1')
  if (!dry) throw new Error('Missing dry channel')
  const next = removeCable(patch, dry.id)
  expect(events(generate(next), 1).find((h) => h.duckorbit !== undefined)).toMatchObject({
    duckorbit: 1,
    duckattack: 0.2,
    duckdepth: 0.8,
    dry: 0,
  })
})
it('audio into CV emits a silent bus voice and a real bmod event; MIX adds audible output', () => {
  let patch = routingFixture('audio-mod')
  const cable = patch.cables.find((c) => c.to.jack === 'cv')
  if (!cable) throw new Error('Missing modulation cable')
  expect(cableKind(patch, cable)).toBe('audio-mod')
  const haps = events(generate(patch), 1)
  expect(haps.find((h) => h.bus !== undefined)).toMatchObject({ bus: 1, dry: 0, freq: 40 })
  expect(haps.find((h) => h.bmod)).toMatchObject({ bmod: { 0: { bus: 1, control: 'cutoff' } } })
  patch = connect(patch, cable.from, { module: 'mix1', jack: 'in2' })
  expect(events(generate(patch), 1).filter((h) => h.freq === 40 && h.dry !== 0)).toHaveLength(1)
})
it('bus allocation stays stable across knob edits and reserves source-owned addresses', () => {
  const patch = routingFixture('audio-mod')
  const plan = (p: typeof patch) => [...routingPlan(graph(p), p).buses]
  expect(plan(setValue(patch, 'vcf1', 'cutoff', 800))).toEqual(plan(patch))
  const reserved = { ...patch, prelude: 'const custom = s("sine").bus(1)' }
  expect(plan(reserved)).toEqual([['audio:osc1:out', 2]])
})
it('routing edits remain rack-editable and preserve all saved fields', () => {
  const patch = routingFixture('gates'),
    doc = read(generate(patch))
  const next = setValue(doc.patch, 'gates1', 'steps', 'x*4')
  const edited = editDocument(doc, next)
  expect(read(edited.source).patch).toEqual(next)
  expect(events(edited.source, 1)).toHaveLength(4)
})
it('rejects feedback and non-GATES sources at the gate boundary', () => {
  const patch = routingFixture('audio-mod')
  expect(() =>
    connect(patch, { module: 'vcf1', jack: 'out' }, { module: 'osc2', jack: 'tune' }),
  ).toThrow(/cycles/)
  expect(() =>
    connect(patch, { module: 'seq1', jack: 'note' }, { module: 'seq1', jack: 'gate' }),
  ).toThrow(/GATES/)
})

it.each([
  ['gates', 'gates1', 'steps', 'x*4'],
  ['switch', 'switch1', 'steps', '<3 2 1 0>'],
  ['duck', 'duck1', 'attack', 0.4],
  ['duck', 'duck1', 'depth', 0.3],
] as const)(
  '%s.%s.%s changes engine events and retains the saved rack',
  (kind, id, control, value) => {
    const doc = read(generate(routingFixture(kind)))
    const next = setValue(doc.patch, id, control, value)
    const edited = editDocument(doc, next)
    expect(read(edited.source).patch).toEqual(next)
    expect(events(edited.source)).not.toEqual(events(doc.source))
  },
)
it('does not trust edited bus addresses or an invented saved cable as routing provenance', () => {
  const source = generate(routingFixture('audio-mod'))
  const changed = source.replace('.bus(1)', '.bus(8)')
  const doc = read(changed)
  expect(doc.layout).not.toBe('restored')
  expect(generate(doc)).toBe(changed)
  expect(
    doc.patch.modules.some(
      (m) =>
        m.type === 'code' && typeof m.values.text === 'string' && m.values.text.includes('.bus(8)'),
    ),
  ).toBe(true)
  expect(read(source.replace('"jack": "cv"', '"jack": "in"')).layout).toBe('invalid')
})
it('preserves post-struct timing instead of moving it before the gate rhythm', () => {
  const source = '$: note("c2 eb2 g2").struct("x ~ x").fast(2).s("sine").orbit(7)\n'
  const doc = read(source)
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
})
it('a named GATES fan-out is one shared pattern reused by both sequences', () => {
  const patch = routingFixture('gates')
  const copy = structuredClone(patch)
  copy.modules.push(
    { id: 'seq2', type: 'seq', row: 3, hp: 0, look: 'instrument', values: { steps: 'f3' } },
    { id: 'osc2', type: 'osc', row: 3, hp: 10, look: 'instrument', values: { wave: 'sine' } },
  )
  copy.cables.push(
    { id: 'extra1', from: { module: 'gates1', jack: 'out' }, to: { module: 'seq2', jack: 'gate' } },
    { id: 'extra2', from: { module: 'seq2', jack: 'note' }, to: { module: 'osc2', jack: 'note' } },
    { id: 'extra3', from: { module: 'osc2', jack: 'out' }, to: { module: 'mix1', jack: 'in2' } },
  )
  copy.names['gates1:out'] = 'rhythm'
  const source = generate(copy)
  expect(sourceBody(source)).toContain("const rhythm = mini('x ~ x x ~ x ~ x')")
  expect(sourceBody(source).match(/\.struct\(rhythm\)/g)).toHaveLength(2)
  expect(read(source).patch).toEqual(copy)
  expect(events(source, 1)).toHaveLength(10)
})
it.each([
  ['osc2', 'tune', 'freq'],
  ['vcf1', 'cv', 'cutoff'],
  ['vca1', 'cv', 'gain'],
  ['pan1', 'cv', 'pan'],
  ['mix1', 'cv1', 'postgain'],
])('audio modulation reaches %s:%s through the catalog control', (module, jack, control) => {
  const copy = structuredClone(routingFixture('audio-mod'))
  copy.cables = copy.cables.filter((c) => c.to.module !== 'vcf1' || c.to.jack !== 'cv')
  if (module === 'vca1' || module === 'pan1') {
    copy.modules.push({
      id: module,
      type: module === 'vca1' ? 'vca' : 'pan',
      row: 3,
      hp: 0,
      look: 'instrument',
      values: {},
    })
    copy.cables = copy.cables.filter((c) => c.to.module !== 'mix1' || c.to.jack !== 'in1')
    copy.cables.push(
      { id: 'targetIn', from: { module: 'vcf1', jack: 'out' }, to: { module, jack: 'in' } },
      { id: 'targetOut', from: { module, jack: 'out' }, to: { module: 'mix1', jack: 'in1' } },
    )
  }
  copy.cables.push({ id: 'audioCV', from: { module: 'osc1', jack: 'out' }, to: { module, jack } })
  const source = generate(copy)
  expect(read(source).patch).toEqual(copy)
  expect(events(source, 1).find((h) => h.bmod)).toMatchObject({ bmod: { 0: { bus: 1, control } } })
})
it('a source fanned to two CV targets shares one bus and emits one private sender', () => {
  const patch = connect(
    routingFixture('audio-mod'),
    { module: 'osc1', jack: 'out' },
    { module: 'mix1', jack: 'cv1' },
  )
  const haps = events(generate(patch), 1)
  expect(haps.filter((h) => h.bus === 1)).toHaveLength(1)
  expect(haps.find((h) => h.bmod)).toMatchObject({
    bmod: { 0: { bus: 1, control: 'cutoff' }, 1: { bus: 1, control: 'postgain' } },
  })
})
it('source-owned routing comments survive generation, save and real engine events', () => {
  const source = '// keep 🐒\n$: note("c3").s("sine") /* route */ .bus(1).orbit(7)\n'
  const doc = read(source)
  expect(generate(doc)).toBe(source)
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
})
it('reserves literal computed bus methods just like ordinary source-owned sends', () => {
  const patch = { ...routingFixture('audio-mod'), prelude: 'const custom = s("sine")["bus"](1)' }
  expect([...routingPlan(graph(patch), patch).buses.values()]).toEqual([2])
})
it('refuses an active DUCK with only a pre-orbit bus destination', () => {
  const patch = routingFixture('duck')
  patch.modules.push({ id: 'aux1', type: 'aux', row: 3, hp: 0, look: 'instrument', values: {} })
  patch.cables = patch.cables.filter((c) => c.from.module !== 'duck1')
  patch.cables.push(
    {
      id: 'auxSend',
      from: { module: 'duck1', jack: 'out' },
      to: { module: 'aux1', jack: 'send1' },
    },
    { id: 'auxReturn', from: { module: 'aux1', jack: 'out' }, to: { module: 'mix1', jack: 'in2' } },
  )
  expect(() => generate(patch)).toThrow(/DUCK.*audible channel/)
})
it('DUCK targets the actual final channel when its trigger reserves an opaque orbit', () => {
  const patch = routingFixture('duck')
  patch.modules.push({
    id: 'code1',
    type: 'code',
    row: 3,
    hp: 0,
    look: 'terminal',
    values: { text: '.orbit(1)' },
  })
  patch.cables = patch.cables.filter((c) => c.to.module !== 'duck1' || c.to.jack !== 'side')
  patch.cables.push(
    { id: 'customIn', from: { module: 'osc1', jack: 'out' }, to: { module: 'code1', jack: 'in' } },
    {
      id: 'customSide',
      from: { module: 'code1', jack: 'out' },
      to: { module: 'duck1', jack: 'side' },
    },
  )
  const haps = events(generate(patch), 1)
  const target = haps.find((h) => h.note === 'c3')
  expect(target?.orbit).toBe(3)
  expect(haps.find((h) => h.duckorbit !== undefined)).toMatchObject({ duckorbit: 3, orbit: 1 })
})
it.each(['.velocity("1 .2")', '.velocity("<1 .2>").fast(2)'])(
  'preserves SEQ accent/time controls before struct: %s',
  (setting) => {
    const source = `$: note("c2 eb2 g2")${setting}.struct("x*5").s("sine").orbit(7)\n`
    const doc = read(source)
    expect(events(generate(doc.patch))).toEqual(events(source))
    expect(sourceBody(saveLayout(doc).source)).toBe(source)
  },
)
