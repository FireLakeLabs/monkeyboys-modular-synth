import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { connect, placeModule, setValue, starterPatch, cableWarnings } from '../rack/model'
import { EXTRA_FORMS, EXTRA_EDITS } from './extras.fixtures'
import { BYTEBEAT_PRESETS, bytebeatSyntax } from './bytebeat'

let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs'].map((p) => import(/* @vite-ignore */ p)),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(expression: string) {
  // Only committed fixtures enter this pinned-runtime query, never user input.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0,4).filter(h=>h.hasOnset()).map(h=>({value:h.value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}))`,
  )(...Object.values(runtime))
}
function voice(source: string) {
  const scope = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!scope) throw new Error('Missing generated voice')
  return source.slice(scope.start, scope.end)
}
it.each(EXTRA_FORMS)('$type retains exact source and complete saved rack: $expression', (form) => {
  const source = `// keep comments and spacing\n$: ${form.expression} // unchanged\n`
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === form.type)).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
  const generated = generate(doc.patch)
  expect(read(generated).patch).toEqual(doc.patch)
})
it.each(EXTRA_FORMS.filter((form) => form.type !== 'speak'))(
  '$type retains pinned engine events: $expression',
  (form) => {
    expect(events(voice(generate(read(`$: ${form.expression}\n`).patch)))).toEqual(
      events(`(${form.expression}).orbit(1)`),
    )
    expect(events(form.expression).length).toBeGreaterThan(0)
  },
)
it.each([
  's("bytebeat").bbexpr(formula)',
  's("bytebeat").bbexpr("t +")',
  's("bytebeat").bbexpr("")',
  's("z_square").zzfx([1,0,220])',
])('retains unsupported formula/array as exact CODE: %s', (expression) => {
  const source = `$: ${expression}\n`,
    doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
})
it('validates formulas without executing them, and retains every built-in', () => {
  expect(BYTEBEAT_PRESETS).toHaveLength(15)
  expect(BYTEBEAT_PRESETS.every(bytebeatSyntax)).toBe(true)
  expect(bytebeatSyntax('globalThis.shouldNeverRun()')).toBe(true)
  expect(bytebeatSyntax('t +')).toBe(false)
  const patch = placeModule(starterPatch(), 'bytebeat', 1)
  expect(() => setValue(patch, 'bytebeat1', 'formula', 't +')).toThrow(/Invalid control/)
  expect(
    setValue(patch, 'bytebeat1', 'formula', 't*(t>>8)').modules.find((m) => m.type === 'bytebeat')
      ?.values.formula,
  ).toBe('t*(t>>8)')
})
it.each([`t + 'a'.length`, String.raw`t + "a\\b".length`, 't +\n 2'])(
  'keeps trusted formula bytes through generation and a source edit: %s',
  (formula) => {
    let patch = placeModule(starterPatch(), 'bytebeat', 1)
    patch = setValue(patch, 'bytebeat1', 'formula', formula)
    patch = connect(patch, { module: 'bytebeat1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const generated = generate(patch)
    expect(read(generated).patch).toEqual(patch)
    expect(events(voice(generated))).toEqual(
      events(`s("bytebeat").n(0).bbexpr(pure(${JSON.stringify(formula)})).postgain(.8).orbit(1)`),
    )
  },
)
it('clears a custom formula without changing surrounding imported source or saved rack', () => {
  const source = `// retained\n$: s("bytebeat").bbexpr(pure('t>>1')).gain(.1)\n`
  const doc = saveLayout(read(source)),
    module = doc.patch.modules.find((m) => m.type === 'bytebeat')
  if (!module) throw Error('Missing BYTEBEAT')
  const edited = editDocument(doc, setValue(doc.patch, module.id, 'formula', ''))
  expect(sourceBody(edited.source)).toBe(`// retained\n$: s("bytebeat").gain(.1)\n`)
  expect(read(edited.source).patch).toEqual(edited.patch)
})
it.each(['bytebeat', 'chip', 'speak'])(
  'reopens all saved state for a palette %s, including disconnected controls',
  (type) => {
    let patch = placeModule(starterPatch(), type, 1)
    if (type === 'speak') {
      patch = placeModule(patch, 'code', 2)
      patch = setValue(patch, 'code1', 'text', '"hello"')
      patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'speak1', jack: 'in' })
    }
    patch = connect(patch, { module: `${type}1`, jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const generated = generate(patch)
    expect(read(generated).patch).toEqual(patch)
    if (type === 'speak')
      expect(
        cableWarnings(
          patch,
          patch.cables[patch.cables.length - 1] ??
            (() => {
              throw Error('Missing cable')
            })(),
        ),
      ).toContain(
        'Speech bypasses effects, MIX level and OUT volume. This cable carries speech events, not WebAudio.',
      )
  },
)
it.each(EXTRA_EDITS)(
  'splices %s.%s without rewriting its source or saved identity',
  (type, id, value, before, after) => {
    const source = `// preserved\n$: ${before}\n`,
      doc = saveLayout(read(source))
    const module = doc.patch.modules.find((m) => m.type === type)
    if (!module) throw Error('Missing panel')
    const edited = editDocument(doc, setValue(doc.patch, module.id, id, value))
    expect(sourceBody(edited.source)).toBe(source.replace(before, after))
    expect(read(edited.source).patch).toEqual(edited.patch)
  },
)
it('keeps optional preset and start-time presence distinct from their numeric values', () => {
  let patch = placeModule(starterPatch(), 'bytebeat', 1)
  patch = connect(patch, { module: 'bytebeat1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  expect(generate(patch)).toContain('.n(0)')
  patch = setValue(patch, 'bytebeat1', 'presetMode', 'pattern')
  expect(generate(patch)).not.toContain('.n(')
  expect(generate(patch)).not.toContain('.bbst(')
  patch = setValue(patch, 'bytebeat1', 'timeMode', 'offset')
  expect(generate(patch)).toContain('.bbst(0)')
  expect(read(generate(patch)).patch).toEqual(patch)
})

it.each([
  'const pure = x => x;',
  'let pure = x => x;',
  'function pure(x) { return x; }',
  'pure = x => x;',
])('keeps locally owned formula constructors in CODE: %s', (setup) => {
  const source = `${setup}\n$: s("bytebeat").bbexpr(pure('t>>1'))\n`
  const doc = read(source)
  expect(doc.patch.modules.find((m) => m.type === 'bytebeat')?.values.formula).toBeUndefined()
  expect(
    doc.patch.modules.some((m) => m.type === 'code' && String(m.values.text).includes('bbexpr')),
  ).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
})
