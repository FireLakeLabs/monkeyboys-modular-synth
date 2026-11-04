import { sourceLocations } from '../strudel/sourceLocations'
import { beforeAll, expect, it } from 'vitest'
import { idioms } from '../patch/mini.fixtures'
import { buildTree, walkCells, type Cell } from '../patch/mini'
import { applyMiniEdit, miniGesture, replaceCell } from '../patch/miniEdits'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { generate } from '../codegen/generate'
import { read } from './read'
import { activityPlan } from '../strudel/activity'

let runtime: Record<string, unknown>
let compile: (source: string) => string
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/index.mjs'].map(
        (entry) => import(/* @vite-ignore */ entry),
      ),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
  const entry = '@strudel/transpiler/transpiler.mjs'
  const transpiler: Record<string, unknown> = await import(/* @vite-ignore */ entry)
  if (typeof transpiler.transpiler !== 'function') throw new Error('Missing transpiler')
  const fn = transpiler.transpiler
  compile = (source) => {
    const result: unknown = fn(source, { emitMiniLocations: false, emitWidgets: false })
    if (
      !result ||
      typeof result !== 'object' ||
      !('output' in result) ||
      typeof result.output !== 'string'
    )
      throw new Error('Invalid transpiler output')
    return result.output
  }
})
function query(source: string): unknown[] {
  // Only repository-owned fixtures; real mini parser and pinned REPL, no audio backend.
  // oxlint-disable-next-line typescript/no-implied-eval
  const result: unknown = new Function(...Object.keys(runtime), compile(source))(
    ...Object.values(runtime),
  )
  if (
    !result ||
    typeof result !== 'object' ||
    !('queryArc' in result) ||
    typeof result.queryArc !== 'function'
  )
    throw new Error('Missing pattern')
  const haps: unknown = result.queryArc(0, 8)
  if (!Array.isArray(haps)) throw new Error('Missing events')
  return haps
}
const sound = (haps: unknown[]) =>
  JSON.stringify(haps, (key, value: unknown) =>
    key === 'context' ? undefined : typeof value === 'bigint' ? String(value) : value,
  )
function cell(text: string, token?: string): Cell {
  let found: Cell | undefined
  walkCells(buildTree(text), (c) => {
    if (!found && (token ? c.text === token : true)) found = c
  })
  if (!found) throw new Error('Missing cell')
  return found
}

it.each(idioms)('source and saved rack identity are independent of the drawn form: %s', (text) => {
  const source = `// preserve 🐒\r\n$: note(\`${text}\`).s('sine') /* tail */\r\n`
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'seq')).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(sourceBody(saved.source)).toBe(source)
  expect(read(saved.source).patch).toEqual(doc.patch)
})
it.each(['"', "'", '`'])(
  'splices nested literal ranges and retains %s delimiters, trivia and rack identity',
  (quote) => {
    const text = quote === '`' ? ' c3\n [e3\t g3]@2  a3 ' : ' c3  [e3\t g3]@2  a3 '
    const source = `// preserve\r\n$: note(${quote}${text}${quote}).s('sine') // tail\r\n`
    const doc = saveLayout(read(source))
    const seq = doc.patch.modules.find((m) => m.type === 'seq')
    if (!seq) throw new Error('Missing SEQ')
    const next = structuredClone(doc.patch)
    const changed = next.modules.find((m) => m.id === seq.id)
    if (!changed) throw new Error('Missing changed SEQ')
    changed.values['steps'] = applyMiniEdit(text, replaceCell(cell(text, 'e3'), 'f3'))
    const edited = editDocument(doc, next)
    expect(sourceBody(edited.source)).toBe(source.replace('e3', 'f3'))
    expect(read(edited.source).patch).toEqual(next)
    expect(sound(query(sourceBody(edited.source).replace('$:', '')))).toBe(
      sound(query(source.replace('e3', 'f3').replace('$:', ''))),
    )
    expect(sound(query(source.replace('$:', '')))).not.toBe(
      sound(query(sourceBody(edited.source).replace('$:', ''))),
    )
  },
)
it.each([
  ['seq', 'steps', 'note', 'c3 [e3 g3]'],
  ['drums', 'grid', 's', 'bd [sd hh]'],
  ['chord', 'chords', 'chord', 'Cm7 [Fm7 G7]'],
])(
  'edits %s backticks and retains downstream code and saved identity',
  (type, control, method, text) => {
    const source = `${method}(\`${text}\`)${type === 'chord' ? '.voicing()' : ''}${type === 'drums' ? '' : ".s('sine')"}\n`
    const doc = read(source)
    const module = doc.patch.modules.find((m) => m.type === type)
    if (!module) throw new Error(`Missing ${type}`)
    const next = structuredClone(doc.patch)
    const changed = next.modules.find((m) => m.id === module.id)
    if (!changed) throw new Error('Missing module')
    changed.values[control ?? ''] = applyMiniEdit(
      text ?? '',
      miniGesture(text ?? '', cell(text ?? ''), '*', 'c3'),
    )
    const edited = editDocument(doc, next)
    expect(sourceBody(edited.source)).toBe(
      source.replace(text ?? '', `${text?.split(' ')[0]}*2 ${text?.split(' ').slice(1).join(' ')}`),
    )
    expect(read(saveLayout(edited).source).patch).toEqual(next)
    expect(
      sound(
        query(
          source.replace(
            text ?? '',
            `${text?.split(' ')[0]}*2 ${text?.split(' ').slice(1).join(' ')}`,
          ),
        ),
      ),
    ).toBe(sound(query(sourceBody(edited.source))))
  },
)
it('keeps interpolated templates as CODE', () => {
  const source = 'const pitch = 3; note(`c${pitch} e3`).s("sine")'
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'seq')).toBe(false)
  expect(generate(doc)).toBe(source)
})

it.each(idioms.filter((t) => !/Cm|Fm|G7|C\^|F#m|Bb/.test(t)))(
  'real mini events retain one leaf match through reverse: %s',
  (text) => {
    const source = `note(\`${text}\`).s('sine').rev()`
    const doc = read(source)
    const plan = activityPlan(doc)
    const original = query(source),
      decorated = query(plan.code)
    expect(sound(decorated)).toBe(sound(original))
    const cells: Cell[] = []
    walkCells(buildTree(text), (c) => {
      if (!c.layers && c.shape !== 'rest') cells.push(c)
    })
    for (const hap of decorated) {
      const steps = plan.steps(hap)
      expect(steps).toHaveLength(1)
      expect(
        cells.some((c) => c.body.start === steps[0]?.start && c.body.end === steps[0]?.end),
      ).toBe(true)
    }
  },
)
it.each(['"', "'", '`'])(
  'source capture maps %s literals before reverse, including copy position',
  (quote) => {
    const source = `note(${quote}c3!3 e3${quote}).rev().s('sine')`
    const plan = activityPlan(read(source))
    const steps = query(plan.code).flatMap((h) => plan.steps(h))
    expect(steps.slice(0, 4).map((s) => [s.start, s.position])).toEqual([
      [0, 0],
      [0, 0.25],
      [0, 0.5],
      [5, 0.75],
    ])
  },
)
it('maps both note and CV SEQ literals without changing real events', () => {
  const source = 'note("c3 e3").s("sine").lpf("400 [800 1200]").rev()'
  const plan = activityPlan(read(source))
  const haps = query(plan.code)
  expect(sound(haps)).toBe(sound(query(source)))
  expect(haps.flatMap((h) => plan.steps(h)).map((s) => s.module)).toContain('cvseq1')
  expect(haps.every((h) => plan.steps(h).some((s) => s.module === 'seq1'))).toBe(true)
})
it('voiced chord events still name their chord cell', () => {
  const source = 'chord(`<Cm7 Fm7 G7>`).voicing().s("sine")'
  const plan = activityPlan(read(source))
  const haps = query(plan.code)
  expect(sound(haps)).toBe(sound(query(source)))
  expect(
    haps.every((h) => plan.steps(h).length === 1 && plan.steps(h)[0]?.module === 'chord1'),
  ).toBe(true)
})

it.each(['"', "'", '`'])(
  'edits an imported CV SEQ %s literal with independent source, rack and event proof',
  (quote) => {
    const source = `// keep\n$: note('c3 e3').s('sine').lpf(${quote}400 [800 1200]${quote}).rev() // tail\n`
    const doc = saveLayout(read(source))
    const cv = doc.patch.modules.find((m) => m.type === 'cvseq')
    if (!cv) throw new Error('Missing CV SEQ')
    const next = structuredClone(doc.patch)
    const changed = next.modules.find((m) => m.id === cv.id)
    if (!changed) throw new Error('Missing changed CV SEQ')
    changed.values['steps'] = '400 [900 1200]'
    const edited = editDocument(doc, next)
    expect(sourceBody(edited.source)).toBe(source.replace('800', '900'))
    expect(read(edited.source).patch).toEqual(next)
    expect(sound(query(sourceBody(edited.source).replace('$:', '')))).toBe(
      sound(query(source.replace('800', '900').replace('$:', ''))),
    )
    expect(sound(query(source.replace('$:', '')))).not.toBe(
      sound(query(sourceBody(edited.source).replace('$:', ''))),
    )
  },
)
it('maps a nested explicit mini CV SEQ at its own source before utilities', () => {
  const source = `note("c3 e3").s("sine").lpf(sine.segment(8).mul(1).range(400, 800).add(mini('0 [100 200]'))).rev()`
  const plan = activityPlan(read(source))
  const haps = query(plan.code)
  expect(sound(haps)).toBe(sound(query(source)))
  expect(haps.some((h) => plan.steps(h).some((s) => s.module === 'cvseq1'))).toBe(true)
})

it('draws Euclidean onsets from the same Bjorklund grouping and rotation as real mini events', async () => {
  const { euclidean } = await import('../patch/euclidean')
  for (let steps = 1; steps <= 16; steps++)
    for (let pulses = 0; pulses <= steps; pulses++)
      for (const rotation of [-2, 0, 2]) {
        const source = `s("bd(${pulses},${steps},${rotation})")`
        const haps = query(source)
        const expected = euclidean(pulses, steps, rotation).flatMap((hit, index) =>
          hit ? [index / steps] : [],
        )
        const positions = haps
          .flatMap((h) => {
            if (
              !h ||
              typeof h !== 'object' ||
              !('whole' in h) ||
              !h.whole ||
              typeof h.whole !== 'object' ||
              !('begin' in h.whole)
            )
              throw new Error('Missing onset')
            const n = Number(h.whole.begin)
            return n < 1 ? [n] : []
          })
          .sort((a, b) => a - b)
        expect(positions).toEqual(expected)
      }
})

it.each([
  ['[', 'c3', '[c3 c3]'],
  [']', '[c3 e3]', 'c3'],
  ['*', 'c3', 'c3*2'],
  ['/', 'c3', 'c3/2'],
  ['!', 'c3', 'c3!2'],
  ['@', 'c3', 'c3@2'],
  ['?', 'c3', 'c3?'],
  ['<', 'c3', '<c3 g3>'],
  [',', 'c3', '[c3, g3]'],
  ['|', 'c3', '[c3| g3]'],
  ['(', 'c3', 'c3(3,8)'],
  ['~', 'c3', '~'],
  ['+', 'c3', 'c3 ~'],
  ['Backspace', 'c3*2', 'c3'],
] as const)(
  'gesture %s keeps real edited events, every other source byte and saved rack identity',
  (key, before, after) => {
    const text = `${before}  a3`
    const source = `// keep\n$: note('${text}').s('sine').rev() // tail\n`
    const doc = read(source)
    const next = structuredClone(doc.patch)
    const module = next.modules.find((m) => m.type === 'seq')
    if (!module) throw new Error('Missing SEQ')
    module.values['steps'] = applyMiniEdit(text, miniGesture(text, cell(text), key, 'g3'))
    const edited = editDocument(doc, next)
    const expected = source.replace(text, `${after}  a3`)
    expect(sourceBody(edited.source)).toBe(expected)
    expect(read(edited.source).patch).toEqual(next)
    expect(sound(query(sourceBody(edited.source).replace('$:', '')))).toBe(
      sound(query(expected.replace('$:', ''))),
    )
  },
)

it('trims multiline/tab locations after non-BMP source and ignores modifier arguments', () => {
  const source = '// 🐒\nnote(`c3\n [e3\tg3]*2`).s("sine").rev()'
  const plan = activityPlan(read(source))
  const haps = query(plan.code)
  expect(sound(haps)).toBe(sound(query(source)))
  expect(haps.every((h) => plan.steps(h).length === 1)).toBe(true)
  expect(new Set(haps.flatMap((h) => plan.steps(h)).map((s) => s.start))).toEqual(
    new Set([0, 5, 8]),
  )
})

it.each(["mini('400 [800 1200]')", '"400 [800 1200]"'])(
  'shared named CV SEQ %s keeps source, rack identity and event attribution',
  (expression) => {
    const source = `const cv = ${expression};\nnote("c3 e3").s("sine").lpf(cv).rev()\n`
    const doc = read(source)
    const next = structuredClone(doc.patch)
    const cv = next.modules.find((m) => m.type === 'cvseq')
    if (!cv) throw new Error('Missing CV SEQ')
    cv.values['steps'] = '400 [900 1200]'
    const edited = editDocument(doc, next)
    expect(sourceBody(edited.source)).toBe(source.replace('800', '900'))
    expect(read(edited.source).patch).toEqual(next)
    expect(sound(query(sourceBody(edited.source)))).toBe(sound(query(source.replace('800', '900'))))
    const plan = activityPlan(edited)
    const haps = query(plan.code)
    expect(sound(haps)).toBe(sound(query(sourceBody(edited.source))))
    expect(haps.some((h) => plan.steps(h).some((s) => s.module === cv.id))).toBe(true)
  },
)

it('preserves raw CRLF backticks while editing cooked mini ranges and attributing real events', () => {
  const source = '// keep\r\nnote(`c3\r\n  e3`).s("sine")\r\n'
  const doc = read(source)
  const next = structuredClone(doc.patch)
  const seq = next.modules.find((m) => m.type === 'seq')
  if (!seq) throw new Error('Missing SEQ')
  expect(seq.values['steps']).toBe('c3\n  e3')
  seq.values['steps'] = 'c3\n  f3'
  const edited = editDocument(doc, next)
  expect(sourceBody(edited.source)).toBe(source.replace('e3', 'f3'))
  expect(read(edited.source).patch).toEqual(next)
  const plan = activityPlan(edited)
  const haps = query(plan.code)
  expect(sound(haps)).toBe(sound(query(source.replace('e3', 'f3'))))
  expect(haps.every((h) => plan.steps(h).length === 1)).toBe(true)
  expect(
    haps
      .flatMap((h) => sourceLocations(h, edited.source.length, plan.sourceOffset))
      .some((span) => edited.source.slice(span.start, span.end) === 'f3'),
  ).toBe(true)
})

it.each([
  [
    'bd . hh!2',
    [
      [0, 0, 0.5],
      [5, 0.5, 0.75],
      [5, 0.75, 1],
    ],
  ],
  [
    '[bd . hh]!2',
    [
      [1, 0, 0.25],
      [6, 0.25, 0.5],
      [1, 0.5, 0.75],
      [6, 0.75, 1],
    ],
  ],
] as const)(
  'maps real dot-group events into one correct visual copy: %s',
  async (text, expected) => {
    const { layoutMini } = await import('../patch/miniLayout')
    const plan = activityPlan(read(`s("${text}")`))
    const pieces = layoutMini(buildTree(text), { drum: true }).pieces.filter((p) => !p.cell.layers)
    const hits = query(plan.code)
      .flatMap((h) => plan.steps(h))
      .filter((s) => s.cycle === 0)
      .sort((a, b) => a.position - b.position)
    expect(
      hits.map((s) =>
        pieces
          .filter(
            (p) =>
              p.cell.body.start === s.start &&
              s.position >= p.start - 1e-8 &&
              s.position < p.end - 1e-8,
          )
          .map((p) => [s.start, p.start, p.end]),
      ),
    ).toEqual(expected.map((e) => [e]))
  },
)
