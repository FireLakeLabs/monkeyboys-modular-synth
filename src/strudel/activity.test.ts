import { parseSource } from '../reader/syntax'
import { beforeAll, describe, expect, it } from 'vitest'
import { read } from '../reader'
import { activityPlan } from './activity'

const shared = `const lead = note('c3 e3').s('sine');\n$: lead.iter(4)\n$: lead.jux(rev)\n`
describe('event attribution', () => {
  it('maps final events to revision-owned modules across fan-out, without lighting the other branch', () => {
    const document = read(shared)
    const plan = activityPlan(document)
    const map = plan.modules
    const id = (type: string) => document.patch.modules.find((m) => m.type === type)?.id
    expect(map({ context: { __monkeyboyActivity: 2 } })).toEqual(
      expect.arrayContaining([id('seq'), id('osc'), id('iter'), id('mix'), id('out')]),
    )
    expect(map({ context: { __monkeyboyActivity: 2 } })).not.toContain(id('jux'))
    expect(map({ context: { __monkeyboyActivity: 3 } })).toContain(id('jux'))
    expect(map({ context: { __monkeyboyActivity: 3 } })).not.toContain(id('iter'))
    expect(map({ context: { __monkeyboyActivity: 'missing' } })).toEqual([])
  })
  it('leaves opaque, side-effecting and unmapped events unattributed', () => {
    for (const source of [
      `$: note('c3').s('sine').chunk(4, x => x.rev())`,
      `all(x => x.rev());\n$: note('c3').s('sine')`,
      `const unused = all(x => x.rev());\n$: note('c3').s('sine')`,
    ]) {
      const plan = activityPlan(read(source))
      expect(plan.code).toBe(source)
      expect(plan.modules({ context: { __monkeyboyActivity: 1 } })).toEqual([])
      expect(plan.modules({ context: { __monkeyboyActivity: 2 } })).toEqual([])
    }
    const map = activityPlan(read(shared)).modules
    for (const hap of [null, {}, { value: { id: 4 } }, { value: {} }]) expect(map(hap)).toEqual([])
  })
  it('decorates stack branches independently without changing retained source or opaque code', () => {
    const source = `stack(note("c3").s("sine").iter(4), note("e3").s("sine").jux(rev))`
    const document = read(source)
    const plan = activityPlan(document)
    expect(document.source).toBe(source)
    expect(plan.code.match(/withContext/g)).toHaveLength(2)
    const iter = document.patch.modules.find((m) => m.type === 'iter')?.id
    expect(plan.modules({ context: { __monkeyboyActivity: 1 } })).toContain(iter)
    expect(plan.modules({ context: { __monkeyboyActivity: 2 } })).not.toContain(iter)
    const opaque = `note('c3').chunk(4, x => x.rev())`
    expect(activityPlan(read(opaque)).code).toBe(opaque)
  })
})

it('uses numeric context attribution so Strudel cannot turn it into mini-notation', () => {
  const plan = activityPlan(read(`note("c3 e3").s("sine").iter(4)`))
  const compiled = parseSource(plan.code)
  const call = compiled.scopes[0]?.calls.at(-1)
  const callback = call?.args[0]
  if (callback?.type !== 'ArrowFunctionExpression' || callback.body.type !== 'ObjectExpression')
    throw new Error('Missing context callback')
  const property = callback.body.properties.find(
    (p) =>
      p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === '__monkeyboyActivity',
  )
  if (property?.type !== 'Property' || property.value.type !== 'Literal')
    throw new Error('Missing numeric context attribution')
  expect(plan.modules({ context: { __monkeyboyActivity: property.value.value } })).toEqual(
    expect.arrayContaining(['seq1', 'osc1', 'iter1']),
  )
})

it.each([
  `setcpm(30)\nnote('c3').s('sine').iter(4)`,
  `const lead = note('c3').s('sine')\nlead.iter(4)`,
])('preserves semicolon-free statement boundaries: %s', (source) => {
  const plan = activityPlan(read(source))
  const statements = (code: string) =>
    parseSource(code)
      .program.body.filter((statement) => statement.type !== 'EmptyStatement')
      .map((statement) => statement.type)
  expect(statements(plan.code)).toEqual(statements(source))
})

let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs']
  const loaded: Record<string, unknown>[] = await Promise.all(
    entries.map((entry) => import(/* @vite-ignore */ entry)),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})

function query(source: string): unknown[] {
  // Repository-owned expressions only; no user code or browser audio runs here.
  // oxlint-disable-next-line typescript/no-implied-eval
  const result: unknown = new Function(
    ...Object.keys(runtime),
    `return (${source}).queryArc(0, 2).sort((a,b) => a.whole.begin.compare(b.whole.begin))`,
  )(...Object.values(runtime))
  if (!Array.isArray(result)) throw new Error('Missing events')
  return result
}

it.each([
  ['note("c3 ~ e3 g3").fast(2).s("sine")', [0, 2, 3, 0, 2, 3, 0, 2, 3, 0, 2, 3]],
  ['note("c3 <e3 f3> g3 a3").slow(2).s("sine")', [0, 1, 2, 3]],
  ['note("c3 e3 g3 a3").s("sine").jux(rev)', [0, 3, 1, 2, 2, 1, 3, 0, 0, 3, 1, 2, 2, 1, 3, 0]],
  ['s("[bd ~]*4, hh*8")', [0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7]],
])('maps sounding events to original grid cells through transforms: %s', (source, indices) => {
  const document = read(source)
  const plan = activityPlan(document)
  const haps = query(plan.code)
  const module = document.patch.modules.find((m) => ['seq', 'drums'].includes(m.type))
  expect(haps.map((hap) => plan.steps(hap))).toEqual(
    indices.map((index) => [{ module: module?.id, index }]),
  )
  const sound = (haps: unknown[]) =>
    JSON.stringify(haps, (key, value: unknown) =>
      key === 'context' ? undefined : typeof value === 'bigint' ? String(value) : value,
    )
  expect(sound(haps)).toBe(sound(query(source)))
  expect(document.source).toBe(source)
})

it('does not invent grid positions for text notation, opaque code, or invalid event context', () => {
  for (const source of [
    'note("c3 [e3 g3]*2").s("sine")',
    's("[bd ~]*3")',
    'note("c3 e3").chunk(4, x => x.rev())',
  ]) {
    const plan = activityPlan(read(source))
    expect(query(plan.code).flatMap((hap) => plan.steps(hap))).toEqual([])
  }
  const plan = activityPlan(read('note("c3 e3").s("sine")'))
  for (const context of [
    null,
    {},
    { __monkeyboyStep: [0, -1] },
    { __monkeyboyStep: [0, 99] },
    { __monkeyboyStep: ['0', 1] },
  ])
    expect(plan.steps({ context })).toEqual([])
})
