import { expect, it } from 'vitest'
import { read } from './read'
import { generate } from '../codegen/generate'
import { editDocument, saveLayout, sourceBody, applyRackEdit } from '../workspace/document'
import { setValue, placeModule, connect, starterPatch } from '../rack/model'
import legacyCode from '../../docs/evidence/section-sequencing/pre-244-code.strudel?raw'

it('retains legacy opaque sections and all file bytes without claiming obsolete saved routing restores', () => {
  const doc = read(legacyCode)
  expect(generate(doc)).toBe(legacyCode)
  expect(doc.layout).toBe('invalid')
  expect(doc.diagnostics).toEqual(['Layout not restored: Unverifiable rack bindings or metadata'])
  expect(doc.patch.modules.some((m) => m.type === 'sections')).toBe(false)
  expect(
    doc.patch.modules.some(
      (m) =>
        m.type === 'code' &&
        typeof m.values.text === 'string' &&
        m.values.text.includes('arrange('),
    ),
  ).toBe(true)
  expect(doc.patch.modules.some((m) => m.type === 'vcf')).toBe(false)
  expect(doc.patch.modules.find((m) => m.type === 'out')?.values.vol).not.toBe(0.23)
  expect(legacyCode).toContain('"vol": 0.23')
  expect(legacyCode).toContain('"cutoff": 1450')
})

it.each([1, 2, 3, 4])('edits the exact duration of socket %s without rounding', (slot) => {
  const source =
    '$: arrange([1,note("c3")],[2,note("d3")],[3,note("e3")],[4,note("f3")]).s("sine")\n'
  const doc = read(source),
    sections = doc.patch.modules.find((m) => m.type === 'sections')
  if (!sections) throw new Error('Missing section module')
  const edited = editDocument(
    doc,
    setValue(doc.patch, sections.id, `cycles${slot}`, '0.123456789012345'),
  )
  expect(sourceBody(edited.source)).toBe(source.replace(`[${slot},`, `[0.123456789012345,`))
  expect(read(edited.source).patch).toEqual(edited.patch)
})

it('splices the physical socket duration after saved ORDER and source trivia edits', () => {
  const imported = read('$: arrange([1,note("c3")],[2,note("d3")]).s("sine")\n')
  const section = imported.patch.modules.find((m) => m.type === 'sections')
  if (!section) throw new Error('Missing section')
  const reordered = applyRackEdit(
    imported,
    setValue(imported.patch, section.id, 'order', '2 1 3 4'),
  ).document
  const source = reordered.source.replace('arrange(', 'arrange(/* retained */ ')
  const doc = read(source)
  expect(doc.layout).toBe('restored')
  const edited = editDocument(doc, setValue(doc.patch, section.id, 'cycles1', '0.875'))
  expect(sourceBody(edited.source)).toBe(sourceBody(source).replace('[1,', '[0.875,'))
  expect(read(edited.source).patch).toEqual(edited.patch)
})

it.each([
  { module: 'sections1', control: 'cycles3', before: '1.125' },
  { module: 'sections2', control: 'cycles4', before: '0.75' },
  { module: 'sections2', control: 'cycles2', before: '2.25' },
])('splices $module / $control across a sparse saved NEXT chain after trivia edits', (item) => {
  let patch = placeModule(starterPatch(104), 'sections', 1)
  patch = placeModule(patch, 'sections', 2)
  for (let i = 1; i <= 3; i++) patch = placeModule(patch, 'seq', i + 2)
  patch = placeModule(patch, 'osc', 6)
  patch = setValue(patch, 'sections1', 'cycles3', '1.125')
  patch = setValue(patch, 'sections2', 'cycles4', '0.75')
  patch = setValue(patch, 'sections2', 'cycles2', '2.25')
  patch = setValue(patch, 'sections2', 'order', '4 3 2 1')
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'sections1', jack: 'in3' })
  patch = connect(patch, { module: 'seq2', jack: 'note' }, { module: 'sections2', jack: 'in2' })
  patch = connect(patch, { module: 'seq3', jack: 'note' }, { module: 'sections2', jack: 'in4' })
  patch = connect(
    patch,
    { module: 'sections2', jack: 'out' },
    { module: 'sections1', jack: 'next' },
  )
  patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const source = generate(patch).replace('arrange(', 'arrange(/*x*/ '),
    doc = read(source)
  expect(doc.layout).toBe('restored')
  expect(doc.patch).toEqual(patch)
  const next = setValue(doc.patch, item.module, item.control, '3.875'),
    edited = editDocument(doc, next)
  expect(sourceBody(edited.source)).toBe(sourceBody(source).replace(`[${item.before},`, '[3.875,'))
  expect(read(edited.source).patch).toEqual(next)
  const applied = applyRackEdit(doc, next)
  expect(applied.converted).toBe(false)
  expect(applied.document).toEqual(edited)
  if (item.module === 'sections1') {
    const saved = saveLayout(doc).source,
      forged = saved.replace('"part": 1', '"part": 0')
    expect(forged).not.toBe(saved)
    expect(read(forged).layout).toBe('invalid')
    expect(generate(read(forged))).toBe(forged)
  }
})

it.each(['empty-head', 'empty-middle'])(
  'splices across a saved NEXT chain with %s after trivia edits',
  (kind) => {
    let patch = starterPatch(104)
    for (let i = 1; i <= 3; i++) patch = placeModule(patch, 'sections', i)
    patch = placeModule(patch, 'seq', 4)
    patch = placeModule(patch, 'osc', 5)
    for (let i = 2; i <= 3; i++)
      patch = connect(
        patch,
        { module: `sections${i}`, jack: 'out' },
        { module: `sections${i - 1}`, jack: 'next' },
      )
    patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'sections3', jack: 'in4' })
    if (kind === 'empty-middle')
      patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'sections1', jack: 'in2' })
    if (kind === 'empty-middle') patch.names['seq1:note'] = 'shared'
    patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const source = generate(patch).replace('arrange(', 'arrange(/*empty panel retained*/ '),
      doc = read(source)
    expect(doc.layout).toBe('restored')
    expect(doc.patch).toEqual(patch)
    const edited = editDocument(
      doc,
      setValue(doc.patch, 'sections3', 'cycles4', '0.987654321098765'),
    )
    const before = sourceBody(source),
      last = before.lastIndexOf('[4,')
    expect(sourceBody(edited.source)).toBe(
      before.slice(0, last) + before.slice(last).replace('[4,', '[0.987654321098765,'),
    )
    expect(read(edited.source).patch).toEqual(edited.patch)
  },
)

it.each([
  '$: arrange([4,note("<c2 eb2 g2>")],[2,note("d3")]).s("sine")\n',
  'const drums=s("bd hh"); const bass=note("<c2 eb2 g2>").s("sawtooth");\n$: arrange([4,drums],[4,stack(drums,bass)],[8,bass])\n',
  'const a=arrange([.5,note("c3")],[1.25,note("d3")]);\n$: stack(a,a.rev()).s("sine")\n',
  '$: arrange([1,note("c3")],[2,note("d3")],[.5,note("e3")],[1.25,note("f3")],[3,arrange([1,note("<g3 a3 b3>")],[2,note("c4")])]).slow(2).s("sine")\n',
])(
  'projects static section structure with separate exact source and saved identity: %s',
  (source) => {
    const doc = read(source)
    expect(doc.patch.modules.some((m) => m.type === 'sections')).toBe(true)
    expect(doc.patch.modules.filter((m) => m.type === 'code')).toEqual([])
    expect(generate(doc)).toBe(source)
    const saved = saveLayout(doc)
    expect(sourceBody(saved.source)).toBe(source)
    expect(read(saved.source).layout).toBe('restored')
    expect(read(saved.source).patch).toEqual(doc.patch)
    expect(read(generate(doc.patch)).patch).toEqual(doc.patch)
  },
)

it('splices one exact duration and one nested argument independently', () => {
  const source =
    '$: arrange([/* cycles */ .5, note("c3").fast(2)], [2, /* duplicate */ note("c3").fast(2)]).s("sine")\n'
  const doc = read(source)
  const sections = doc.patch.modules.find((m) => m.type === 'sections')
  const seq = doc.patch.modules.filter((m) => m.type === 'seq')[1]
  if (!sections || !seq) throw new Error('Missing section structure')
  const duration = editDocument(doc, setValue(doc.patch, sections.id, 'cycles1', '1.25'))
  expect(sourceBody(duration.source)).toBe(source.replace('/* cycles */ .5', '/* cycles */ 1.25'))
  const argument = editDocument(duration, setValue(duration.patch, seq.id, 'rate', 3))
  expect(sourceBody(argument.source)).toBe(
    sourceBody(duration.source).replace(
      '/* duplicate */ note("c3").fast(2)',
      '/* duplicate */ note("c3").fast(3)',
    ),
  )
  expect(read(argument.source).patch).toEqual(argument.patch)
})

it('keeps explicit saved arrange CODE after unrelated external edits and conversion', () => {
  let patch = placeModule(starterPatch(104), 'code', 1)
  patch = setValue(patch, 'code1', 'text', 'arrange([1,note("c3")],[2,note("d3")]).s("sine")')
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  patch = placeModule(patch, 'osc', 2)
  patch = setValue(patch, 'osc1', 'mode', 'freq')
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in2' })
  const source = generate(patch),
    edited = source.replace('freq(110)', 'freq(220)')
  expect(edited).not.toBe(source)
  const doc = read(edited)
  expect(doc.patch.modules.filter((m) => m.type === 'sections')).toEqual([])
  // Parenthesized opaque source can conservatively coalesce with its suffix on
  // external reconciliation; it must retain the entire exact fragment as CODE.
  expect(
    doc.patch.modules.some(
      (m) =>
        m.type === 'code' &&
        typeof m.values.text === 'string' &&
        m.values.text.includes('arrange([1,note("c3")],[2,note("d3")]).s("sine")'),
    ),
  ).toBe(true)
  expect(generate(doc)).toBe(edited)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
})

it.each(['note("c3 e3")', '/* keep */ note("c3 e3")', 'note("c3 e3") // keep'])(
  'retains an explicitly saved CODE tuple input after an external duration edit: %s',
  (text) => {
    let patch = placeModule(starterPatch(104), 'sections', 1)
    patch = placeModule(patch, 'code', 2)
    patch = setValue(patch, 'code1', 'text', text)
    patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'sections1', jack: 'in1' })
    patch = placeModule(patch, 'osc', 3)
    patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const source = generate(patch),
      edited = source.replace('arrange([4,', 'arrange([2,')
    expect(edited).not.toBe(source)
    expect(read(source).patch).toEqual(patch)
    const doc = read(edited)
    expect(doc.patch.modules.filter((m) => m.type === 'seq')).toEqual([])
    expect(doc.patch.modules.some((m) => m.type === 'code' && m.values.text === text)).toBe(true)
    expect(generate(doc)).toBe(edited)
    const saved = saveLayout(doc)
    expect(read(saved.source).patch).toEqual(saved.patch)
  },
)

it.each([
  '$: arrange([duration,note("c3")],[2,note("d3")])\n',
  '$: arrange(...sections)\n',
  '$: arrange([1+1,note("c3")])\n',
  '$: arrange([0,note("c3")])\n',
  '$: arrange([-1,note("c3")])\n',
  '$: arrange([Infinity,note("c3")])\n',
  '$: arrange([1,note("c3"),extra])\n',
  'const arrange = replacement;\n$: arrange([1,note("c3")])\n',
  'register(name, fn);\n$: arrange([1,note("c3")])\n',
  '$: note("c3").superimpose(x=>arrange([1,x],[2,x.rev()])).s("sine")\n',
])('retains unsupported/shadowed sections as exact CODE without execution: %s', (source) => {
  const doc = read(source)
  expect(doc.patch.modules.filter((m) => m.type === 'sections')).toEqual([])
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(generate(doc)).toBe(source)
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
})
