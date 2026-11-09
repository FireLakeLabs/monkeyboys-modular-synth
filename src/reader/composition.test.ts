import { expect, it } from 'vitest'
import { read } from './read'
import { generate, generateDocument } from '../codegen/generate'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { setValue } from '../rack/model'

it.each([
  '$: stack(note("c3 e3"), note("g3 b3")).s("sawtooth")\n',
  '$: note("c3").stack(note("g3")).fast(2).s("sine")\n',
  '$: stack(stack(note("c3"),note("e3")),note("g3")).s("sine")\n',
  'const phrase = stack(note("c3"), note("g3")).fast(2)\n$: phrase.s("sine")\n$: phrase.s("square")\n',
])('retains static groups, exact source and complete saved identity: %s', (source) => {
  const doc = read(source)
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toEqual([])
  expect(doc.patch.modules.some((m) => m.type === 'mix' && m.values.mode === 'Stack')).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(sourceBody(saved.source)).toBe(source)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(saved.patch)
  expect(read(generate(doc.patch)).patch).toEqual(doc.patch)
})

it('splices only the proven literal in one of two identical nested input chains', () => {
  const source = '$: stack(note("c3").fast(2), /* same */ note("c3").fast(2)).s("sine")\n'
  const doc = read(source)
  const seq = doc.patch.modules.filter((m) => m.type === 'seq')[1]
  if (!seq) throw new Error('Missing second input')
  const edited = editDocument(doc, setValue(doc.patch, seq.id, 'rate', 3))
  expect(sourceBody(edited.source)).toBe(
    source.replace('/* same */ note("c3").fast(2)', '/* same */ note("c3").fast(3)'),
  )
  expect(read(edited.source).patch).toEqual(edited.patch)
})

it('keeps inner postgain setters within their Stack rather than folding them into Voices', () => {
  const source =
    '$: stack(note("c3").s("sine").postgain(.3), note("e3").s("sine").postgain(.7)).postgain(.5)\n'
  const doc = read(source)
  const body = sourceBody(generateDocument(doc.patch).code)
  expect(body).toContain('.postgain(.3)')
  expect(body).toContain('.postgain(.7)')
  expect(body).toContain('.postgain(0.5)')
  expect(body).not.toContain('0.15')
})

it.each([
  'stack()',
  'stack(note("c3"))',
  'stack(note("c3"),note("d3"),note("e3"),note("f3"),note("g3"),note("a3"),note("b3"))',
])('retains empty, single and continuation groups: %s', (expression) => {
  const doc = read(`$: ${expression}.s("sine")\n`)
  expect(doc.patch.modules.filter((m) => m.type === 'seq')).toHaveLength(
    (expression.match(/note\(/g) ?? []).length,
  )
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(false)
  const saved = saveLayout(doc)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(doc.patch)
})

it.each([
  '$: stack(...parts).s("sine")\n',
  'const stack = (a,b) => a;\n$: stack(note("c3"), note("g3")).s("sine")\n',
  'register("stack", (a,p) => p);\n$: note("c3").stack(note("g3")).s("sine")\n',
])('keeps unsupported or shadowed composition source exact: %s', (source) => {
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(doc.patch.modules.some((m) => m.type === 'mix' && m.values.mode === 'Stack')).toBe(false)
  expect(generate(doc)).toBe(source)
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
})

it('switches modes at unity without losing inactive settings, and refuses connected CV atomically', async () => {
  const { starterPatch, placeModule, connect } = await import('../rack/model')
  const { fromPatch } = await import('../workspace/document')
  const { createDocumentHistory } = await import('../workspace/history')
  let patch = starterPatch()
  patch = placeModule(patch, 'osc', 0)
  patch = setValue(patch, 'osc1', 'mode', 'freq')
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in3' })
  patch = setValue(patch, 'mix1', 'ch3', 0.35)
  const before = fromPatch(patch)
  const switched = editDocument(before, setValue(before.patch, 'mix1', 'mode', 'Stack'))
  expect(sourceBody(switched.source)).toContain('stack(')
  expect(sourceBody(switched.source)).not.toContain('postgain')
  expect(switched.patch.modules.find((m) => m.id === 'mix1')?.values.ch3).toBe(0.35)
  expect(read(switched.source).patch).toEqual(switched.patch)
  const history = createDocumentHistory(before)
  history.accept(switched)
  expect(history.step('undo')).toEqual(before)
  expect(history.step('redo')).toEqual(switched)
  const restored = editDocument(switched, setValue(switched.patch, 'mix1', 'mode', 'Voices'))
  expect(sourceBody(restored.source)).toContain('.postgain(0.35)')
  patch = placeModule(patch, 'lfo', 0)
  patch = connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'mix1', jack: 'cv3' })
  const snapshot = JSON.stringify(patch)
  expect(() => setValue(patch, 'mix1', 'mode', 'Stack')).toThrow(/CV/)
  expect(JSON.stringify(patch)).toBe(snapshot)
})

it('refuses a pattern Stack to Voices switch with its accepted source and downstream cables intact', () => {
  const doc = saveLayout(read('$: stack(note("c3"),note("e3")).s("sine")\n'))
  const stack = doc.patch.modules.find((m) => m.type === 'mix' && m.values.mode === 'Stack')
  if (!stack) throw new Error('Missing stack')
  const original = JSON.stringify(doc)
  expect(() => setValue(doc.patch, stack.id, 'mode', 'Voices')).toThrow()
  expect(JSON.stringify(doc)).toBe(original)
})

it('retains sparse socket identity and complete disconnected state after generated export', async () => {
  const { starterPatch, placeModule, connect } = await import('../rack/model')
  let patch = setValue(starterPatch(), 'mix1', 'mode', 'Stack')
  patch = placeModule(patch, 'osc', 0)
  patch = setValue(patch, 'osc1', 'mode', 'freq')
  patch = placeModule(patch, 'code', 1)
  patch = setValue(patch, 'code1', 'text', 'opaque /* disconnected draft */')
  patch = setValue(patch, 'out1', 'vol', 0.25)
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in4' })
  const exported = generate(patch)
  expect(sourceBody(exported)).toContain('stack(freq(')
  expect(read(exported).patch).toEqual(patch)
  expect(read(saveLayout(read(exported)).source).patch).toEqual(patch)
})

it('preserves one named opaque helper call without evaluating or duplicating it', () => {
  const source =
    'let counter = 0;\nconst helper = () => { counter++; return note("c3") };\nconst phrase = helper();\n$: stack(phrase,phrase).s("sine")\n'
  const doc = read(source)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(sourceBody(saved.source)).toBe(source)
  expect(read(saved.source).patch).toEqual(doc.patch)
  const definitions = sourceBody(generate(doc.patch))
  expect(definitions.match(/helper\(\)/g)).toHaveLength(1)
  expect(definitions).toContain('stack(phrase, phrase)')
})

it('rejects forged nested source paths without replacing executable source', () => {
  const doc = saveLayout(read('$: stack(note("c3"),note("e3")).s("sine")\n'))
  const forged = doc.source.replace('"argument": 1', '"argument": 999')
  expect(forged).not.toBe(doc.source)
  const reopened = read(forged)
  expect(reopened.layout).toBe('invalid')
  expect(generate(reopened)).toBe(forged)
})

it.each([
  'Pattern.prototype.stack = replacement;\n$: note("c3").stack(note("e3")).s("sine")\n',
  'Pattern.prototype["stack"] = replacement;\n$: stack(note("c3"),note("e3")).s("sine")\n',
  '$: mystery.stack(note("c3"))\n',
  '$: custom().stack(note("c3")).s("sine")\n',
  'const r = register(["stack","custom"], (a,p)=>p);\n$: stack(note("c3"),note("e3")).s("sine")\n',
  'register(name, (a,p)=>p);\n$: stack(note("c3"),note("e3")).s("sine")\n',
])('declines ambiguous receiver or constructor registration: %s', (source) => {
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(doc.patch.modules.some((m) => m.values.mode === 'Stack')).toBe(false)
  expect(generate(doc)).toBe(source)
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
})

it('retains a previously saved whole-expression CODE owner for a newly supported Stack', async () => {
  const { starterPatch, placeModule, connect } = await import('../rack/model')
  let patch = placeModule(starterPatch(), 'code', 0)
  patch = setValue(patch, 'code1', 'text', 'stack(note("c3"),note("e3")).s("sine")')
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const saved = generate(patch)
  expect(read(saved).patch).toEqual(patch)
  expect(read(saved).patch.modules.filter((m) => m.type === 'seq')).toEqual([])
  expect(read(saveLayout(read(saved)).source).patch).toEqual(patch)
})

it('does not append overriding routing over opaque helpers inside a supported callback input', () => {
  const source =
    '$: stack(note("c3").s("sine").off(.25,x=>x.customRoute(7)),note("e3").s("sine"))\n'
  const doc = read(source)
  const regenerated = sourceBody(generate(doc.patch))
  expect(regenerated).toContain('.customRoute(7)')
  expect(regenerated).not.toContain('.orbit(')
  expect(sourceBody(saveLayout(doc).source)).toBe(source)
  expect(read(generate(doc.patch)).patch).toEqual(doc.patch)
})
