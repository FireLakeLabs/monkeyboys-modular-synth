import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { fromPatch, saveLayout, sourceBody } from '../workspace/document'
import { connect, placeModule, removeCable, removeModule, setValue } from '../rack/model'
import type { Patch } from '../patch/types'

const base = 'note("c3 e3").s("sine")'
let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs'].map((name) => import(/* @vite-ignore */ name)),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(source: string) {
  const scope = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  const expression = source.slice(scope.start, scope.end)
  // Committed fixtures only; production discovery never executes imported source.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0,8).filter(h=>h.hasOnset()).map(h=>{const {orbit,...value}=h.value;return {value,begin:String(h.whole.begin),end:String(h.whole.end)}})`,
  )(...Object.values(runtime))
}
const BRANCH_FORMS = [
  '.jux(x => stack(x, x.rev()))',
  '.superimpose(p => stack(p.fast(2), p.rev()))',
  '.jux(p => stack(p.rev(), p.off(.25, q => stack(q.fast(2), q.rev()))))',
  '.jux(p => p.stack(p.rev()).fast(2))',
  '.jux(p => (shared => stack(shared,shared.off(.25,q=>(inner=>stack(inner,inner.rev()))(q.fast(2)))))(p.iter(3)))',
  '.jux(p => stack(p, p, p.rev(), p.fast(2), p.iter(3)))',
]
it.each(BRANCH_FORMS)(
  'projects local branches with exact source, full save and independent events: %s',
  (tail) => {
    const source = `$: ${base}${tail}\n`
    const doc = saveLayout(read(source))
    expect(doc.patch.modules.filter((m) => m.type === 'code')).toEqual([])
    expect(doc.patch.modules.some((m) => m.type === 'mix' && m.values.mode === 'Stack')).toBe(true)
    expect(sourceBody(doc.source)).toBe(source)
    expect(generate(read(source))).toBe(source)
    expect(read(doc.source).patch).toEqual(doc.patch)
    const generated = generate(doc.patch)
    expect(read(generated).patch).toEqual(doc.patch)
    expect(events(sourceBody(generated))).toEqual(events(source.trim()))
  },
)
function wire(p: Patch, from: string, jack: string, to: string, input: string) {
  return connect(p, { module: from, jack }, { module: to, jack: input })
}
it('shares a local transform once without a global declaration and preserves nested sharing', () => {
  let p = read(`$: ${base}.jux(x => stack(x.fast(2), x.rev()))\n`).patch
  const clock = p.modules.find((m) => m.type === 'clock'),
    rev = p.modules.find((m) => m.type === 'rev')
  if (!clock || !rev) throw new Error('Missing branch modules')
  p = connect(p, { module: clock.id, jack: 'out' }, { module: rev.id, jack: 'in' }, true)
  const generated = generate(p)
  expect(sourceBody(generated).match(/\.fast\(2\)/g)).toHaveLength(1)
  expect(sourceBody(generated)).not.toMatch(/const .*fast/)
  expect(read(generated).patch).toEqual(p)
  expect(events(sourceBody(generated))).toEqual(
    events(`$: ${base}.jux(x => (shared => stack(shared, shared.rev()))(x.fast(2)))`),
  )
})
it('rejects unsafe local edges atomically while allowing SEND fan-out', () => {
  let p = read(`$: ${base}.jux(x => stack(x, x.rev()))\n`).patch
  const jux = p.modules.find((m) => m.type === 'jux'),
    stack = p.modules.find((m) => m.type === 'mix' && m.values.mode === 'Stack'),
    rev = p.modules.find((m) => m.type === 'rev')
  if (!jux || !stack || !rev) throw new Error('Missing local graph')
  const before = structuredClone(p)
  expect(() => setValue(p, stack.id, 'mode', 'Voices')).toThrow()
  expect(() => wire(p, rev.id, 'out', 'out1', 'in')).toThrow()
  expect(() =>
    connect(p, { module: stack.id, jack: 'out' }, { module: rev.id, jack: 'in' }, true),
  ).toThrow()
  p = placeModule(p, 'off', 8)
  expect(() => wire(p, rev.id, 'out', 'off1', 'return')).toThrow()
  expect(() => wire(p, 'osc1', 'out', stack.id, 'in4')).toThrow()
  expect(before).toEqual(read(`$: ${base}.jux(x => stack(x, x.rev()))\n`).patch)
  const returned = p.cables.find((c) => c.to.module === jux.id && c.to.jack === 'return')
  if (!returned) throw new Error('Missing RETURN')
  expect(sourceBody(generate(removeCable(p, returned.id)))).toContain('.jux(rev)')
  expect(read(generate(removeModule(p, rev.id))).patch).toEqual(removeModule(p, rev.id))
  expect(fromPatch(p).patch).toEqual(p)
})
it.each([
  '.jux(x => stack(x, globalPattern))',
  '.jux(x => stack(x, note("c4")))',
  '.jux(x => stack(...parts))',
  '.jux(x => stack())',
  '.jux(x => stack(x,stack()))',
  '.jux(p => (a => (b => stack(a,b))(a))(p.fast(2)))',
  '.jux(p => (π => stack(π,π.rev()))(p.fast(2)))',
  '.jux(x => x.off(.25, y => stack(x,y)))',
  '.jux(async x => stack(x,x.rev()))',
  '.jux((x,y) => stack(x,y))',
  '.jux(x => { return stack(x,x.rev()) })',
])('keeps unsupported capture/shape exact CODE: %s', (tail) => {
  const source = `const globalPattern = note("g3");\n$: ${base}${tail}\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
})

it('keeps superimpose original plus both additional branches over eight cycles', () => {
  const original = events(`$: ${base}`)
  const branched = events(`$: ${base}.superimpose(x => stack(x.fast(2), x.rev()))`)
  expect(original).toHaveLength(16)
  expect(branched).toHaveLength(64)
})
it('edits only the nested branch literal, retains identifiers and accepts source parameter renames', async () => {
  const { editDocument } = await import('../workspace/document')
  const { createDocumentHistory } = await import('../workspace/history')
  const source = `$: ${base}.jux(p => stack(p.iter(3), /* inner */ p.off(.25, q => stack(q.iter(3),q.rev()))))\n`
  const before = saveLayout(read(source))
  const inner = before.patch.modules.filter((m) => m.type === 'iter')[1]
  if (!inner) throw new Error('Missing nested ITER')
  const edited = editDocument(before, setValue(before.patch, inner.id, 'steps', 5))
  expect(sourceBody(edited.source)).toBe(source.replace('q.iter(3)', 'q.iter(5)'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  const history = createDocumentHistory(before)
  history.accept(edited)
  expect(history.step('undo')).toEqual(before)
  expect(history.step('redo')).toEqual(edited)
  const renamed = saveLayout(
    read(source.replaceAll('p =>', 'phrase =>').replaceAll('p.', 'phrase.')),
  )
  expect(renamed.patch.modules.find((m) => m.type === 'jux')?.functionParameter).toBe('phrase')
  expect(events(sourceBody(generate(renamed.patch)))).toEqual(events(source.trim()))
  expect(read(renamed.source).patch).toEqual(renamed.patch)
})
it('keeps identical local binding names independent in separate callback scopes', () => {
  const source = `$: ${base}.jux(x => (shared => stack(shared,shared.rev()))(x.fast(2))).off(.25,y => (shared => stack(shared,shared.rev()))(y.iter(3)))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toEqual([])
  expect(Object.values(doc.patch.names).filter((n) => n === 'shared')).toHaveLength(2)
  expect(read(doc.source).patch).toEqual(doc.patch)
  expect(events(sourceBody(generate(doc.patch)))).toEqual(events(source.trim()))
})
it('preserves unsupported suffixes, custom routes, and parameter o without inventing orbit ownership', () => {
  const source = `$: ${base}.jux(o => stack(o.color("red"),o.rev())).off(.25,p=>stack(p.customRoute(7),p.rev()))\n`
  const doc = saveLayout(read(source))
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
  expect(sourceBody(generate(doc.patch))).toMatch(/o => stack\(o\s*\.color\("red"\)/)
  expect(sourceBody(generate(doc.patch))).not.toContain('.orbit(')
})
it('retains saved CODE for a newly supported callback until explicit conversion', () => {
  let p = read(`$: ${base}\n`).patch
  p = placeModule(p, 'code', 2)
  p = setValue(p, 'code1', 'text', '.jux(p => stack(p,p.rev()))')
  p = connect(p, { module: 'osc1', jack: 'out' }, { module: 'code1', jack: 'in' })
  const bus = p.modules.find((m) => m.type === 'mix')
  if (!bus) throw new Error('Missing bus')
  p = connect(p, { module: 'code1', jack: 'out' }, { module: bus.id, jack: 'in1' }, true)
  const source = generate(p)
  expect(read(source).patch).toEqual(p)
  expect(read(saveLayout(read(source)).source).patch).toEqual(p)
})
it('preserves a shared opaque transform construction exactly once inside its owner', () => {
  const source = `$: ${base}.jux(p => (shared => stack(shared,shared.rev()))(p.color("red")))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toHaveLength(1)
  expect(sourceBody(generate(doc.patch)).match(/\.color\(/g)).toHaveLength(1)
  expect(read(doc.source).patch).toEqual(doc.patch)
  expect(events(sourceBody(generate(doc.patch)))).toEqual(events(source.trim()))
})
it('keeps branch CV outside the function signal path and plans local ordered effects', async () => {
  const { effectNotes } = await import('../rack/model')
  let p = read(`$: ${base}.jux(x=>stack(x.gain(.4).room(.3).delay(.2),x.rev()))\n`).patch
  const vca = p.modules.find((m) => m.type === 'vca'),
    reverb = p.modules.find((m) => m.type === 'reverb'),
    delay = p.modules.find((m) => m.type === 'delay')
  if (!vca || !reverb || !delay) throw new Error('Missing local effects')
  p = placeModule(p, 'lfo', 5)
  p = wire(p, 'lfo1', 'out', vca.id, 'cv')
  expect(read(generate(p)).patch).toEqual(p)
  expect(effectNotes(p).join(' ')).toContain('REVERB')
})

it('refuses local output renames that would leave opaque identifier references stale', async () => {
  const { renameOutput } = await import('../rack/model')
  const doc = read(`$: ${base}.jux(p => (shared => stack(shared,shared.add(shared)))(p.fast(2)))\n`)
  const output = Object.keys(doc.patch.names).find((key) => doc.patch.names[key] === 'shared')
  if (!output) throw new Error('Missing local shared binding')
  expect(() => renameOutput(doc.patch, output, 'renamed')).toThrow(/CODE/)
})
it('allocates shared names without capturing identifiers in a nested opaque suffix', () => {
  let p = read(`$: ${base}.jux(p => stack(p.iter(3),p.off(.25,q=>q.color(mb_iter1))))\n`).patch
  const iter = p.modules.find((m) => m.type === 'iter'),
    off = p.modules.find((m) => m.type === 'off')
  if (!iter || !off) throw new Error('Missing local transforms')
  p = connect(p, { module: iter.id, jack: 'out' }, { module: off.id, jack: 'in' }, true)
  expect(sourceBody(generate(p))).not.toContain('(mb_iter1 =>')
  expect(sourceBody(generate(p))).toContain('.color(mb_iter1)')
})
it('rolls back captured CV resolution before falling back an unsupported branch', () => {
  const source = `const motion=sine;\n$: ${base}.jux(x=>stack(x.gain(motion.range(.2,.5)),outside))\n$: ${base}.gain(motion.range(.2,.5))\n`
  const doc = saveLayout(read(source))
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
  const lfo = doc.patch.modules.find((m) => m.type === 'lfo')
  expect(lfo).toBeDefined()
  expect(doc.patch.cables.some((c) => c.from.module === lfo?.id && c.to.jack === 'cv')).toBe(true)
})
it('keeps callback-local CV arguments opaque even when their name is a built-in signal', () => {
  const source = `$: ${base}.jux(sine => stack(sine.gain(sine.range(.2,.5)),sine.rev()))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.filter((m) => m.type === 'lfo')).toEqual([])
  expect(
    doc.patch.modules.some(
      (m) =>
        m.type === 'code' &&
        typeof m.values.text === 'string' &&
        m.values.text.includes('sine.range'),
    ),
  ).toBe(true)
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
})
it('keeps an original local binding that shadows an unrelated global pattern name', () => {
  const source = `const shared=note("c4");\n$: shared.s("sine")\n$: ${base}.jux(p=>(shared=>stack(shared,shared.rev()))(p.fast(2)))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toEqual([])
  expect(Object.values(doc.patch.names).filter((name) => name === 'shared')).toHaveLength(2)
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
})
it('retains a saved local CODE Stack suffix after an unrelated outer source edit', () => {
  let p = read(`$: ${base}.jux(x=>x.rev())\n`).patch
  p = removeModule(p, 'rev1')
  p = placeModule(p, 'code', 3)
  p = setValue(p, 'code1', 'text', '.stack(x.rev())')
  p = wire(p, 'jux1', 'send', 'code1', 'in')
  p = wire(p, 'code1', 'out', 'jux1', 'return')
  const source = generate(p).replace('.s("sine")', '.s("triangle")')
  const doc = read(source)
  expect(
    doc.patch.modules
      .filter((m) => m.type === 'code')
      .map((m) => (typeof m.values.text === 'string' ? m.values.text.trimStart() : m.values.text)),
  ).toEqual(['.stack(x.rev())'])
  expect(doc.patch.modules.some((m) => m.type === 'mix' && m.values.mode === 'Stack')).toBe(false)
  const saved = saveLayout(doc)
  expect(sourceBody(saved.source)).toBe(sourceBody(source))
  expect(read(saved.source).patch).toEqual(saved.patch)
})
it.each([
  ['jux', 's("bd")', '.jux(x => stack(x, x.rev()))'],
  ['layer', base, '.superimpose(x => stack(x.fast(2), x.rev()))'],
])(
  'builds %s branches through normal placement and individual cable operations',
  (type, input, tail) => {
    let p = read(`$: ${input}\n`).patch
    const bus = p.modules.find((m) => m.type === 'mix')
    const upstream = p.cables.find((c) => c.to.module === bus?.id && c.to.jack === 'in1')?.from
    if (!bus || !upstream) throw new Error('Missing initial voice')
    for (const [i, kind] of [type, 'rev', 'mix', ...(type === 'layer' ? ['clock'] : [])].entries())
      p = placeModule(p, kind, i + 1)
    p = setValue(p, 'mix2', 'mode', 'Stack')
    p = connect(p, upstream, { module: `${type}1`, jack: 'in' })
    p = connect(p, { module: `${type}1`, jack: 'out' }, { module: bus.id, jack: 'in1' }, true)
    const send = { module: `${type}1`, jack: 'send' }
    if (type === 'layer') {
      p = setValue(p, 'clock1', 'speed', 'Multiply')
      p = setValue(p, 'clock1', 'swingMode', 'off')
      p = setValue(p, 'clock1', 'offset', 0)
      p = connect(p, send, { module: 'clock1', jack: 'in' })
      p = wire(p, 'clock1', 'out', 'mix2', 'in1')
    } else p = connect(p, send, { module: 'mix2', jack: 'in1' })
    p = connect(p, send, { module: 'rev1', jack: 'in' })
    p = wire(p, 'rev1', 'out', 'mix2', 'in2')
    p = wire(p, 'mix2', 'out', `${type}1`, 'return')
    const generated = generate(p)
    expect(read(generated).patch).toEqual(p)
    expect(events(sourceBody(generated))).toEqual(events(`$: ${input}${tail}`))
  },
)
it.each([
  '.jux(x => (a => x.off(.25, y => stack(y, a)))(x.fast(2)))',
  '.jux(x => (a => x.add(a))(x.fast(2)))',
])('retains an opaque-only local binding through explicit conversion: %s', async (tail) => {
  const { makeRackEditable } = await import('../workspace/document')
  const source = `$: ${base}${tail}\n`
  const doc = saveLayout(read(source))
  const converted = makeRackEditable(doc)
  expect(sourceBody(converted.source)).toContain(tail)
  expect(events(sourceBody(converted.source))).toEqual(events(source))
  expect(read(converted.source).patch).toEqual(converted.patch)
})
it('clears exited local names on owner deletion/unplug and restores them with Undo', async () => {
  const { createDocumentHistory } = await import('../workspace/history')
  const source = `const shared=note("c4").s("sine");\n$: shared\n$: ${base}.jux(p=>(shared=>stack(shared,shared.rev()))(p.fast(2)))\n`
  const before = saveLayout(read(source))
  const local = Object.keys(before.patch.names).find((key) => key.startsWith('clock'))
  if (!local) throw new Error('Missing local binding')
  const deleted = removeModule(before.patch, 'jux1')
  expect(deleted.names[local]).toBeUndefined()
  expect(read(generate(deleted)).patch).toEqual(deleted)
  let unplugged = before.patch
  for (const c of before.patch.cables.filter(
    (c) =>
      (c.from.module === 'jux1' && c.from.jack === 'send') ||
      (c.to.module === 'jux1' && c.to.jack === 'return'),
  ))
    unplugged = removeCable(unplugged, c.id)
  expect(unplugged.names[local]).toBeUndefined()
  expect(read(generate(unplugged)).patch).toEqual(unplugged)
  const history = createDocumentHistory(before)
  history.accept(fromPatch(deleted))
  expect(history.step('undo')).toEqual(before)
})
it('keeps explicit local names distinct from later generated shared names', async () => {
  const { renameOutput } = await import('../rack/model')
  let p = read(`$: ${base}.jux(x=>stack(x.fast(2),x.rev(),x.iter(3)))\n`).patch
  p = connect(p, { module: 'clock1', jack: 'out' }, { module: 'rev1', jack: 'in' }, true)
  p = connect(p, { module: 'rev1', jack: 'out' }, { module: 'iter1', jack: 'in' }, true)
  p = renameOutput(p, 'rev1:out', 'mb_clock1')
  const source = sourceBody(generate(p))
  expect(events(source)).toEqual(
    events(`$: ${base}.jux(x=>(fast=>stack(fast,fast.rev(),fast.rev().iter(3)))(x.fast(2)))`),
  )
  expect(read(generate(p)).patch).toEqual(p)
})
it('refuses deletion that would strand an opaque reference to a local binding', () => {
  const source = `$: ${base}.jux(x=>(a=>stack(a.rev(),x.add(a)))(x.fast(2)))\n`
  const doc = saveLayout(read(source))
  const before = structuredClone(doc.patch)
  expect(() => removeModule(doc.patch, 'rev1')).toThrow(/CODE/)
  expect(() => removeModule(doc.patch, 'clock1')).toThrow(/CODE/)
  expect(doc.patch).toEqual(before)
  const code = doc.patch.modules.find((m) => m.type === 'code')
  if (!code) throw new Error('Missing opaque reference')
  const safe = setValue(doc.patch, code.id, 'text', '.add(1)')
  expect(read(generate(removeModule(safe, 'rev1'))).patch).toEqual(removeModule(safe, 'rev1'))
})
