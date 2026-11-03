import { parseSource } from '../reader/syntax'
import { describe, expect, it } from 'vitest'
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
