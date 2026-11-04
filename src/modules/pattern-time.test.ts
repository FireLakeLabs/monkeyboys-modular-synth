import { parse } from 'acorn'
import { beforeAll, describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { looksFor } from './looks'
import { getModuleSpec } from './catalog'
import { read } from '../reader'
import { connect, placeModule, setLook, setValue, starterPatch } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { CHORD_SOURCE, PATTERN_CONTROLS, PATTERN_FORMS } from './pattern-time.fixtures'

let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/index.mjs']
  const loaded: Record<string, unknown>[] = await Promise.all(
    entries.map((entry) => import(/* @vite-ignore */ entry)),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})

function expression(source: string): string {
  const statement = parse(sourceBody(source), { ecmaVersion: 'latest' }).body.find(
    (node) => node.type === 'LabeledStatement',
  )
  if (statement?.type !== 'LabeledStatement' || statement.body.type !== 'ExpressionStatement')
    throw new Error('Missing voice')
  return source.slice(statement.body.expression.start, statement.body.expression.end)
}

function events(source: string) {
  // Repository-owned examples only; evaluates the actual pinned pattern engine without audio.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(runtime),
    `return (${source}).queryArc(0, 4).filter(h => h.hasOnset()).map(h => {
    const {orbit, ...value} = h.value;
    return {value, begin:h.whole.begin.toString(), end:h.whole.end.toString()}
  })`,
  )
  const result: unknown[] = run(...Object.values(runtime))
  return result.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

const noteSource =
  'note("<[c3,eb3,g3] [d3,f3,a3] [e3,g3,b3] [f3,a3,c4]> [g3,b3,d4] [a3,c4,e4] [b3,d4,f4]").s("sine")'
const forms = [
  ...PATTERN_FORMS.map((form) => ({ ...form, expression: noteSource + form.call })),
  {
    type: 'chord',
    call: '.voicing()',
    expression: CHORD_SOURCE + '.s("sine")',
    values: { chords: '<Cm7 Fm7 G7>' },
  },
]

for (const form of forms) {
  describe(`${form.type}: ${form.call}`, () => {
    it('reads controls and retains exact imported bytes', () => {
      const source = `// timing and source are distinct\n$: ${form.expression} // keep me\n`
      const document = read(source)
      expect(
        document.patch.modules.find((module) => module.type === form.type)?.values,
      ).toMatchObject(form.values)
      expect(document.patch.modules.some((module) => module.type === 'code')).toBe(false)
      expect(generate(document)).toBe(source)
    })
    it('independently saves the exact rack in every family look', () => {
      let document = saveLayout(read(`$: ${form.expression}\n`))
      const module = document.patch.modules.find((module) => module.type === form.type)
      if (!module) throw new Error('Missing subject')
      for (const look of looksFor(getModuleSpec(form.type).family)) {
        document = editDocument(document, setLook(document.patch, module.id, look))
        const reopened = read(document.source)
        expect(reopened.layout).toBe('restored')
        expect(reopened.patch).toEqual(document.patch)
        expect(sourceBody(document.source)).toBe(`$: ${form.expression}\n`)
      }
    })
    it('regenerates the same nonempty pinned-engine events', () => {
      const document = read(`$: ${form.expression}\n`)
      const before = events(form.expression)
      expect(before.length).toBeGreaterThan(0)
      const generated = generate(document.patch)
      expect(events(expression(generated))).toEqual(before)
      expect(read(generated).patch).toEqual(document.patch)
    })
  })
}

it('ships every pattern/time control with a source-bound scalar or mode example', () => {
  const examples = new Set(
    forms.flatMap((form) => Object.keys(form.values).map((id) => `${form.type}.${id}`)),
  )
  expect([...examples].sort()).toEqual([...PATTERN_CONTROLS].sort())
})

it.each(PATTERN_FORMS)(
  'preserves cable order and changes events when $call moves across a time transform',
  (form) => {
    const partner =
      form.type === 'clock' ||
      ['.press()', '.linger(0.25)', '.echo(3, 1/8, 0.5)'].includes(form.call)
        ? '.rev()'
        : '.late(1/8)'
    const before = read(`$: ${noteSource}${form.call}${partner}\n`)
    const after = read(`$: ${noteSource}${partner}${form.call}\n`)
    const first = expression(generate(before.patch))
    const second = expression(generate(after.patch))
    // The reader's cables, rather than the original strings, determine the generated order.
    expect(first).not.toBe(second)
    expect(events(first)).not.toEqual(events(second))
  },
)

it('CHORD feeds ARP before or after REV, with distinct events in cable order', () => {
  const before = read(`$: ${CHORD_SOURCE}.arp("0 1 2 1").rev().s("sine")\n`)
  const after = read(`$: ${CHORD_SOURCE}.rev().arp("0 1 2 1").s("sine")\n`)
  expect(events(expression(generate(before.patch)))).not.toEqual(
    events(expression(generate(after.patch))),
  )
})

it('builds each new module from the palette with saved identity and real events', () => {
  for (const type of new Set(forms.map((form) => form.type))) {
    let patch = starterPatch()
    const types = type === 'chord' ? ['chord', 'osc'] : ['seq', 'osc', type]
    for (const [row, type] of types.entries()) patch = placeModule(patch, type, row + 1)
    let from = {
      module: type === 'chord' ? 'chord1' : 'seq1',
      jack: type === 'chord' ? 'out' : 'note',
    }
    patch = connect(patch, from, { module: 'osc1', jack: 'note' })
    from = { module: 'osc1', jack: 'out' }
    if (type !== 'chord') {
      patch = connect(patch, from, { module: `${type}1`, jack: 'in' })
      from = { module: `${type}1`, jack: 'out' }
    }
    patch = connect(patch, from, { module: 'mix1', jack: 'in1' })
    const generated = generate(patch)
    expect(read(generated).patch, type).toEqual(patch)
    expect(events(expression(generated)).length, type).toBeGreaterThan(0)
  }
})

it.each([
  '.euclidRot(three, 8, 2)',
  '.euclidRot(3, 8)',
  '.ply(foo)',
  '.arp(indices)',
  '.rev(1)',
  '.shuffle(0)',
  '.zoom(0.25, end)',
  '.hurry(0)',
  '.echo(3, 1/0, .5)',
])('retains unsupported %s as exact CODE with saved ownership', (call) => {
  const source = `$: ${noteSource}${call}\n`
  const document = read(source)
  expect(
    document.patch.modules
      .filter((module) => module.type === 'code')
      .map((module) => module.values.text),
  ).toContain(call)
  expect(generate(document)).toBe(source)
  const saved = saveLayout(document)
  expect(read(saved.source).patch).toEqual(saved.patch)
})

it('edits multi-argument literals without rewriting surrounding comments or timing expressions', () => {
  const source = '$: note("c3 e3").s("sine").swingBy(1/3, /* grid */ 4).echo(3, 1/8, .5)\n'
  const original = saveLayout(read(source))
  const clock = original.patch.modules.find((module) => module.type === 'clock')
  const echo = original.patch.modules.find((module) => module.type === 'echo')
  if (!clock || !echo) throw new Error('Missing transforms')
  let document = editDocument(original, setValue(original.patch, clock.id, 'grid', 8))
  document = editDocument(document, setValue(document.patch, echo.id, 'time', 0.25))
  expect(sourceBody(document.source)).toBe(
    source.replace('/* grid */ 4', '/* grid */ 8').replace('1/8', '0.25'),
  )
  expect(read(document.source).patch).toEqual(document.patch)
  expect(events(expression(document.source))).toEqual(
    events(source.slice(3).trim().replace('/* grid */ 4', '/* grid */ 8').replace('1/8', '0.25')),
  )
})

// Explicit edit oracles cover every scalar argument independently of call generation.
it.each([
  [
    'clock',
    'division',
    3,
    '.slow(2).swingBy(1/3, 4).late(1/8)',
    '.slow(3).swingBy(1/3, 4).late(1/8)',
  ],
  ['clock', 'swing', 0.5, '.swingBy(1/3, 4)', '.swingBy(0.5, 4)'],
  ['clock', 'grid', 8, '.swingBy(1/3, 4)', '.swingBy(1/3, 8)'],
  ['clock', 'offset', 0.25, '.late(1/8)', '.late(0.25)'],
  ['euclid', 'pulses', 5, '.euclidRot(3, 8, 2)', '.euclidRot(5, 8, 2)'],
  ['euclid', 'steps', 12, '.euclidRot(3, 8, 2)', '.euclidRot(3, 12, 2)'],
  ['euclid', 'rotation', 1, '.euclidRot(3, 8, 2)', '.euclidRot(3, 8, 1)'],
  ['ratchet', 'repeats', '<2 3>', '.ply("<1 2 4>")', '.ply("<2 3>")'],
  ['chance', 'drop', 0.7, '.degradeBy(0.3).seed(45)', '.degradeBy(0.7).seed(45)'],
  ['chance', 'seed', 46, '.degradeBy(0.3).seed(45)', '.degradeBy(0.3).seed(46)'],
  ['arp', 'indices', '2 1 0', '.arp("0 1 2 1")', '.arp("2 1 0")'],
  ['shuffle', 'slices', 4, '.shuffle(8)', '.shuffle(4)'],
  ['ribbon', 'offset', 46, '.rib(45, 2)', '.rib(46, 2)'],
  ['ribbon', 'cycles', 3, '.rib(45, 2)', '.rib(45, 3)'],
  ['time-lens', 'start', 0.1, '.zoom(0.25, 0.75)', '.zoom(0.1, 0.75)'],
  ['time-lens', 'end', 0.9, '.zoom(0.25, 0.75)', '.zoom(0.25, 0.9)'],
  ['time-lens', 'length', 0.5, '.linger(0.25)', '.linger(0.5)'],
  ['warp', 'rate', 3, '.hurry(2)', '.hurry(3)'],
  ['echo', 'times', 4, '.echo(3, 1/8, 0.5)', '.echo(4, 1/8, 0.5)'],
  ['echo', 'time', 0.25, '.echo(3, 1/8, 0.5)', '.echo(3, 0.25, 0.5)'],
  ['echo', 'feedback', 0.75, '.echo(3, 1/8, 0.5)', '.echo(3, 1/8, 0.75)'],
] satisfies readonly [string, string, number | string, string, string][])(
  'edits %s.%s while retaining exact source, saved identity and events',
  (type, id, value, before, after) => {
    const source = `// preserve this\n$: ${noteSource}${before} // and this\n`
    const document = saveLayout(read(source))
    const module = document.patch.modules.find((m) => m.type === type)
    if (!module) throw new Error('Missing edited module')
    const edited = editDocument(document, setValue(document.patch, module.id, id, value))
    expect(sourceBody(edited.source)).toBe(source.replace(before, after))
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(events(expression(edited.source))).toEqual(events(noteSource + after))
  },
)

it('edits the CHORD literal while preserving voicing, comments, rack identity and events', () => {
  const source = `// chord source\n$: ${CHORD_SOURCE}.s("sine")\n`
  const original = saveLayout(read(source))
  const chord = original.patch.modules.find((m) => m.type === 'chord')
  if (!chord) throw new Error('Missing CHORD')
  const edited = editDocument(original, setValue(original.patch, chord.id, 'chords', '<Dm7 G7 C>'))
  expect(sourceBody(edited.source)).toBe(source.replace('<Cm7 Fm7 G7>', '<Dm7 G7 C>'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(expression(edited.source))).toEqual(
    events('chord("<Dm7 G7 C>").voicing().s("sine")'),
  )
})

it.each(['zoom', 'compress'])(
  'refuses an empty or reversed %s span at mutation and generation boundaries',
  (mode) => {
    const original = read(`$: ${noteSource}.${mode}(0.25, 0.75)\n`).patch
    const lens = original.modules.find((m) => m.type === 'time-lens')
    if (!lens) throw new Error('Missing lens')
    expect(() => setValue(original, lens.id, 'start', 0.75)).toThrow('must be less')
    const forged = structuredClone(original)
    const changed = forged.modules.find((m) => m.id === lens.id)
    if (!changed) throw new Error('Missing forged lens')
    changed.values.end = 0.1
    expect(() => generate(forged)).toThrow('must be less')
    const source = `$: ${noteSource}.${mode}(0.75, 0.25)\n`
    expect(generate(read(source))).toBe(source)
    expect(read(source).patch.modules.some((m) => m.type === 'code')).toBe(true)
  },
)

it('keeps repeated clock/gate settings in cable order instead of merging overwrites', () => {
  for (const call of [
    '.swingBy(.2,4).swingBy(.4,8)',
    '.late(.1).late(.2)',
    '.late(1/8).swingBy(1/3,4)',
    '.degradeBy(.3).seed(2).seed(3)',
  ]) {
    const before = read(`$: ${noteSource}${call}\n`)
    const generated = generate(before.patch)
    expect(events(expression(generated)), call).toEqual(events(noteSource + call))
    expect(read(generated).patch).toEqual(before.patch)
  }
})

it('retains seed zero when it isolates degradation from an outer random context', () => {
  const source = `$: ${noteSource}.degradeBy(.3).seed(0).shuffle(8).seed(2)\n`
  const doc = read(source)
  expect(events(expression(generate(doc.patch)))).toEqual(events(source.slice(3).trim()))
})

it('keeps a late call before swing as two ordered CLOCK nodes', () => {
  const source = `$: ${noteSource}.late(1/8).swingBy(1/3, 4)\n`
  const doc = read(source)
  expect(doc.patch.modules.filter((m) => m.type === 'clock')).toHaveLength(2)
  const generated = generate(doc.patch)
  expect(expression(generated).indexOf('.late(')).toBeLessThan(
    expression(generated).indexOf('.swingBy('),
  )
  expect(events(expression(generated))).toEqual(events(source.slice(3).trim()))
})
