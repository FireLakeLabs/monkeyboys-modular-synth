import { beforeAll, expect, it } from 'vitest'
import { parseSource, chain } from '../reader/syntax'
import { read } from '../reader/read'
import { generate } from './generate'
import {
  sourceBody,
  applyRackEdit,
  saveLayout,
  fromPatch,
  makeRackEditable,
} from '../workspace/document'
import { connect, placeModule, setValue, starterPatch, renameOutput } from '../rack/model'
import { createDocumentHistory } from '../workspace/history'

let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs'].map((entry) => import(/* @vite-ignore */ entry)),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini')
  runtime.miniAllStrings()
})

interface Event {
  begin: string
  end: string
  value: Record<string, unknown>
}
/** Only the original repository-owned literal fixtures below reach evaluation. */
function events(source: string, cycles = 64, routes = false): Event[] {
  const parsed = parseSource(sourceBody(source))
  const declarations = parsed.program.body
    .filter((s) => s.type === 'VariableDeclaration')
    .map((s) => source.slice(s.start, s.end))
    .join('\n')
  const voices = parsed.scopes
    .filter((s) => s.kind === 'voice')
    .map((s) => source.slice(s.start, s.end))
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `${declarations}\nreturn [${voices.join(',')}].flatMap(p=>p.queryArc(0,${cycles}).filter(h=>h.hasOnset()).map(h=>({begin:h.whole.begin.toFraction(),end:h.whole.end.toFraction(),value:Object.fromEntries(Object.entries(h.value).filter(([k])=>${routes ? 'true' : "k !== 'orbit'"}))}))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))`,
  )(...Object.values(runtime))
}

const twoSections = '$: arrange([1,note("c3").s("sine")],[1,note("e3").s("sine")])\n'
const stackedSection =
  '$: arrange([1,stack(note("c3").s("sine"),note("e3").s("sine"))],[1,note("g3").s("sine")])\n'
it.each([
  {
    name: 'first tuple',
    source: twoSections,
    pitch: 'c3',
    target: 'sections',
    socket: 'in1',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'last tuple',
    source: twoSections,
    pitch: 'e3',
    target: 'sections',
    socket: 'in2',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'first nested Stack arm',
    source: stackedSection,
    pitch: 'c3',
    target: 'stack',
    socket: 'in1',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'last nested Stack arm',
    source: stackedSection,
    pitch: 'e3',
    target: 'stack',
    socket: 'in2',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'nested Voices arms',
    source: stackedSection,
    pitch: 'c3',
    target: 'voices',
    socket: 'in1',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'inline FX arm',
    source: '$: arrange([1,note("c3").s("sine").FX(lpf(800).lpq(1))],[1,note("e3").s("sine")])\n',
    pitch: 'c3',
    target: 'sections',
    socket: 'in1',
    cycles: 4,
    tuples: 2,
  },
  {
    name: 'NEXT last tuple',
    source:
      '$: arrange([1,note("c3").s("sine")],[1,note("d3").s("sine")],[1,note("e3").s("sine")],[1,note("f3").s("sine")],[1,note("g3").s("sine")])\n',
    pitch: 'g3',
    target: 'next',
    socket: 'in1',
    cycles: 10,
    tuples: 5,
  },
])('terminal CODE comment retains music and source arguments in $name', (item) => {
  let patch = read(item.source).patch
  const candidates = patch.modules.filter((m) =>
    item.target === 'stack' || item.target === 'voices'
      ? m.type === 'mix' && m.values.mode === 'Stack'
      : m.type === 'sections',
  )
  const target = item.target === 'next' ? candidates[1] : candidates[0]
  if (!target) throw new Error('Missing intended combiner')
  if (item.target === 'voices') {
    patch = setValue(patch, target.id, 'mode', 'Voices')
    patch = setValue(patch, target.id, 'ch1', 1)
    patch = setValue(patch, target.id, 'ch2', 1)
  }
  const input = patch.cables.find((c) => c.to.module === target.id && c.to.jack === item.socket)
  if (!input) throw new Error('Missing intended arm')
  patch = placeModule(patch, 'code', 7)
  patch = setValue(patch, 'code1', 'text', '.gain(.5) // tail')
  patch = connect(patch, input.from, { module: 'code1', jack: 'in' })
  patch = connect(
    patch,
    { module: 'code1', jack: 'out' },
    { module: target.id, jack: item.socket },
    true,
  )
  const source = generate(patch),
    body = sourceBody(source)
  let expected = item.source
  const needle = `note("${item.pitch}").s("sine")`
  if (item.name === 'inline FX arm')
    expected = expected.replace('.FX(lpf(800).lpq(1))', '.FX(lpf(800).lpq(1)).gain(.5)')
  else expected = expected.replace(needle, `${needle}.gain(.5)`)
  // Full saved identity alone passed even while a comment swallowed a section.
  expect(read(source).patch).toEqual(patch)
  expect(events(source, item.cycles)).toEqual(events(expected, item.cycles))
  const voice = parseSource(body).scopes.find((s) => s.kind === 'voice')
  const arrange = voice?.calls.find((c) => c.name === 'arrange')
  expect(arrange?.args).toHaveLength(item.tuples)
  if (item.target === 'stack' || item.target === 'voices') {
    const tuple = arrange?.args[0]
    const expression = tuple?.type === 'ArrayExpression' ? tuple.elements[1] : undefined
    if (!expression || expression.type === 'SpreadElement')
      throw new Error('Missing first section expression')
    expect(chain(expression).calls.find((c) => c.name === 'stack')?.args).toHaveLength(2)
  }
  if (item.name === 'first tuple') {
    expect(events(source, 4).map((e) => [e.begin, e.value.note])).toEqual([
      ['0', 'c3'],
      ['1', 'e3'],
      ['2', 'c3'],
      ['3', 'e3'],
    ])
  }
  const edited = read(source.replace('arrange([1,', 'arrange([2,'))
  expect(
    edited.patch.modules.some((m) => m.type === 'code' && m.values.text === '.gain(.5) // tail'),
  ).toBe(true)
  expect(read(saveLayout(edited).source).patch).toEqual(edited.patch)
})

it.each([
  '$: arrange([4,note("<c2 eb2 g2>")],[2,note("<d3 f3 a3>")]).s("sine")\n',
  'const a=note("<c2 eb2 g2>").s("sawtooth"); const b=s("bd hh");\n$: arrange([4,b],[4,stack(a,b)],[8,a])\n',
  'const a=arrange([.5,note("<c3 e3 g3>")],[1.25,note("<d3 f3 a3>")]);\n$: stack(a,a.rev()).s("sine")\n',
  '$: arrange([1,note("<c3 e3 g3>")],[2,note("<d3 f3 a3>")],[.5,note("e3")],[1.25,note("f3")],[3,arrange([1,note("<g3 a3 b3>")],[2,note("c4")])],[.75,note("<d4 e4 f4>")]).slow(2).s("sine").postgain(.3)\n',
  '$: arrange([.123456789012345,note("<c3 e3 g3>")],[1.000000000000001,note("d3")]).s("sine")\n',
  '$: arrange([4,note("<c3 e3 g3>").s("sine").orbit(7)],[2,note("d3").s("sine").orbit(8)]).mask("<1 0>").postgain(.3).channels("3:4")\n',
  '$: arrange([.5,note("<c3 e3 g3>")],[1,note("d3")],[1.25,note("e3")],[.75,note("f3")],[2,note("<g3 a3 b3>")],[1,note("a3")],[.5,note("b3")],[1.5,note("c4")],[.5,note("<d4 e4 f4>")]).s("sine").rev()\n',
  '$: arrange([2,note("c3").superimpose(x=>stack(x.fast(2),x.rev())).s("sine")],[3,note("d3").s("square")]).rev()\n',
])(
  'preserves original pinned values/times across at least two complete arrangements: %s',
  (source) => {
    const generated = sourceBody(generate(read(source).patch))
    expect(events(generated)).toEqual(events(source))
    expect(events(source).length).toBeGreaterThan(0)
  },
)

it('proves native local phase independently of mask song time and repeats it on pass two', () => {
  const sections =
    '$: arrange([4,note("<c2 eb2 g2>")],[4,note("<c2 eb2 g2>")],[8,note("<c2 eb2 g2>")]).s("sine")\n'
  const masked = '$: note("<c2 eb2 g2>").s("sine").mask("<1!16>")\n'
  const at = (source: string, begin: string) =>
    events(source, 32).find((e) => e.begin === begin)?.value.note
  expect(at(sections, '8')).toBe('c2')
  expect(at(masked, '8')).toBe('g2')
  expect(at(sections, '24')).toBe('g2')
  expect(at(masked, '24')).toBe('c2')
  expect(at(sections, '16')).toBe('eb2')
  expect(at(masked, '16')).toBe('eb2')
  expect(events(generate(read(sections).patch), 32)).toEqual(events(sections, 32))
})

function rack() {
  let patch = starterPatch(104)
  patch = placeModule(patch, 'sections', 1)
  for (let i = 1; i <= 2; i++) {
    patch = placeModule(patch, 'seq', i + 1)
    patch = setValue(patch, `seq${i}`, 'steps', i === 1 ? '<c3 e3 g3>' : 'd3')
    patch = connect(
      patch,
      { module: `seq${i}`, jack: 'note' },
      { module: 'sections1', jack: `in${i}` },
    )
  }
  patch = placeModule(patch, 'osc', 4)
  patch = setValue(patch, 'osc1', 'wave', 'sine')
  patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
  return connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
}
it('creates, reorders, edits and reconnects with full accepted-document Undo/Redo', () => {
  const before = fromPatch(rack()),
    history = createDocumentHistory(before)
  const next = applyRackEdit(
    before,
    setValue(before.patch, 'sections1', 'order', '2 1 3 4'),
  ).document
  expect(sourceBody(next.source).indexOf('d3')).toBeLessThan(sourceBody(next.source).indexOf('c3'))
  history.accept(next)
  expect(history.step('undo')).toEqual(before)
  expect(history.step('redo')).toEqual(next)
  const exact = applyRackEdit(
    next,
    setValue(next.patch, 'sections1', 'cycles2', '0.123456789012345'),
  ).document
  expect(sourceBody(exact.source)).toContain('[0.123456789012345,')
  expect(read(exact.source).patch).toEqual(exact.patch)
})
it.each(['0', '-1', 'Infinity', 'NaN', '1+1', '1/2', '1e309', ''])(
  'refuses invalid literal cycles atomically: %s',
  (cycles) => {
    const patch = rack(),
      snapshot = JSON.stringify(patch)
    expect(() => setValue(patch, 'sections1', 'cycles1', cycles)).toThrow(/CYCLES/)
    expect(JSON.stringify(patch)).toBe(snapshot)
  },
)

it.each(['1.000000000000001', '1e-7', '1.', '0.1234567890123456789', '1e+20'])(
  'retains exact positive numeric field state and unrounded numeric source: %s',
  (cycles) => {
    const patch = setValue(rack(), 'sections1', 'cycles1', cycles),
      source = generate(patch)
    expect(sourceBody(source)).toContain(`[${String(Number(cycles))},`)
    expect(read(source).patch).toEqual(patch)
  },
)
it('retains complete sparse/disconnected state and empty sections', () => {
  let patch = placeModule(starterPatch(104), 'sections', 1)
  patch = setValue(patch, 'sections1', 'cycles4', '1.123456789012345')
  patch = setValue(patch, 'out1', 'vol', 0.2)
  expect(read(generate(patch)).patch).toEqual(patch)
})

it.each(['empty-tail', 'empty-head', 'all-empty'])('saves incomplete NEXT state: %s', (kind) => {
  let patch = placeModule(starterPatch(104), 'sections', 1)
  patch = placeModule(patch, 'sections', 2)
  patch = placeModule(patch, 'osc', 3)
  patch = connect(
    patch,
    { module: 'sections2', jack: 'out' },
    { module: 'sections1', jack: 'next' },
  )
  if (kind !== 'all-empty') {
    patch = placeModule(patch, 'seq', 4)
    patch = connect(
      patch,
      { module: 'seq1', jack: 'note' },
      { module: kind === 'empty-tail' ? 'sections1' : 'sections2', jack: 'in4' },
    )
  }
  patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  expect(read(generate(patch)).patch).toEqual(patch)
})

it('keeps outer Voices flags and song-time masks on the complete sequence', () => {
  let patch = rack()
  patch = setValue(patch, 'mix1', 'arr1', '<1 0>')
  patch = setValue(patch, 'mix1', 'name1', 'form')
  patch = setValue(patch, 'mix1', 'channels1', '3:4')
  expect(sourceBody(generate(patch))).toContain('form: arrange(')
  expect(sourceBody(generate(patch))).toContain('.mask("<1 0>")')
  expect(sourceBody(generate(patch))).toContain('.channels("3:4")')
  const reference =
    '$: arrange([4,note("<c3 e3 g3>")],[4,note("d3")]).s("sine").mask("<1 0>").postgain(.8).channels("3:4").orbit(1)\n'
  expect(events(generate(patch), 32, true)).toEqual(events(reference, 32, true))
  patch = setValue(patch, 'mix1', 'mute1', 'on')
  expect(sourceBody(generate(patch))).toContain('_form: arrange(')
  patch = setValue(setValue(patch, 'mix1', 'mute1', 'off'), 'mix1', 'solo1', 'on')
  expect(sourceBody(generate(patch))).toContain('Sform: arrange(')
  expect(read(generate(patch)).patch).toEqual(patch)
})

it('materializes nested Voices inside a section and refuses its independent flags', () => {
  let patch = starterPatch(104)
  for (let i = 1; i <= 2; i++) {
    patch = placeModule(patch, 'osc', i)
    patch = setValue(patch, `osc${i}`, 'mode', 'freq')
    patch = setValue(patch, `osc${i}`, 'wave', 'sine')
    patch = connect(patch, { module: `osc${i}`, jack: 'out' }, { module: 'mix1', jack: `in${i}` })
  }
  patch = setValue(patch, 'mix1', 'ch1', 0.3)
  patch = setValue(patch, 'mix1', 'ch2', 0.7)
  patch = setValue(patch, 'mix1', 'arr1', '<1 0>')
  patch = setValue(patch, 'mix1', 'channels1', '3:4')
  patch = placeModule(patch, 'sections', 3)
  patch = connect(patch, { module: 'mix1', jack: 'out' }, { module: 'sections1', jack: 'in1' })
  patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'out1', jack: 'in' }, true)
  const expected =
    '$: arrange([4,stack(freq(110).s("sine").mask("<1 0>").postgain(.3).channels("3:4"),freq(110).s("sine").postgain(.7))]).orbit(1)\n'
  expect(events(generate(patch), 16, true)).toEqual(events(expected, 16, true))
  expect(read(generate(patch)).patch).toEqual(patch)
  for (const id of ['name1', 'mute1', 'solo1']) {
    const snapshot = JSON.stringify(patch)
    expect(() => setValue(patch, 'mix1', id, id === 'name1' ? 'bass' : 'on')).toThrow(/labelled/)
    expect(JSON.stringify(patch)).toBe(snapshot)
  }
})
it('refuses ambiguous NEXT fan-out/naming while ordinary section fan-out stays reusable', () => {
  let patch = placeModule(rack(), 'sections', 5)
  patch = connect(
    patch,
    { module: 'sections2', jack: 'out' },
    { module: 'sections1', jack: 'next' },
  )
  expect(() => renameOutput(patch, 'sections2:out', 'tail')).toThrow(/exclusive/)
  expect(() =>
    connect(patch, { module: 'sections2', jack: 'out' }, { module: 'sections1', jack: 'in3' }),
  ).toThrow(/exclusive/)
  let shared = rack()
  shared = placeModule(shared, 'osc', 5)
  shared = connect(shared, { module: 'sections1', jack: 'out' }, { module: 'osc2', jack: 'note' })
  shared = connect(shared, { module: 'osc2', jack: 'out' }, { module: 'mix1', jack: 'in2' })
  shared = renameOutput(shared, 'sections1:out', 'form')
  expect(sourceBody(generate(shared)).match(/arrange\(/g)).toHaveLength(1)
  expect(read(generate(shared)).patch).toEqual(shared)
})
it('rejects forged and stale tuple paths without trusting saved wiring', () => {
  const doc = saveLayout(read('$: arrange([1,note("c3")],[2,note("d3")]).s("sine")\n'))
  expect(doc.source).toContain('"element": 1')
  const forged = doc.source.replace('"element": 1', '"element": 0')
  expect(read(forged).layout).toBe('invalid')
  expect(generate(read(forged))).toBe(forged)
  const stale = doc.source.replace('[1,note("c3")]', '[1,helper]')
  expect(read(stale).layout).not.toBe('restored')
  expect(generate(read(stale))).toBe(stale)
})

it('retains explicit routes, outer lane/output settings and opaque spread ownership', () => {
  const source =
    'const a=note("<c3 e3 g3>").s("sine").orbit(7); const b=note("d3").s("sine").orbit(8);\n$: arrange([4,a],[2,stack(a,b)]).mask("<1 0>").postgain(.3).channels("3:4")\n'
  const generated = generate(read(source).patch)
  expect(events(generated, 32, true)).toEqual(events(source, 32, true))
  expect(sourceBody(generated).match(/\.orbit\(/g)).toHaveLength(2)
  const spread =
    'const parts=[[1,note("c3").s("sine").orbit(7)],[2,note("d3").s("sine").orbit(8)]];\n$: arrange(...parts)\n'
  const converted = makeRackEditable(read(spread)).source
  expect(sourceBody(converted).match(/\.orbit\(/g)).toHaveLength(2)
  expect(events(converted, 12, true)).toEqual(events(spread, 12, true))
})

it('treats externally edited tuples as authoritative after a saved reorder', () => {
  const doc = fromPatch(rack()),
    reordered = applyRackEdit(doc, setValue(doc.patch, 'sections1', 'order', '2 1 3 4')).document
  const source = reordered.source.replace('[4, note("<c3 e3 g3>")]', '[3.5, note("<c3 e3 g3>")]')
  expect(source).not.toBe(reordered.source)
  const reconciled = read(source)
  expect(generate(reconciled)).toBe(source)
  expect(events(generate(reconciled.patch), 32)).toEqual(events(source, 32))
})
