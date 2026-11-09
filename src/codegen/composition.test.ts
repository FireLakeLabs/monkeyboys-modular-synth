import { starterPatch, placeModule, setValue, connect } from '../rack/model'
import previousExercise from '../reader/fixtures/pre-242-mix.strudel?raw'
import mixExercise from '../library/patches/modules/mix.strudel?raw'
import { beforeAll, expect, it } from 'vitest'
import { parseSource } from '../reader/syntax'
import { read } from '../reader/read'
import { generate } from './generate'
import { sourceBody, makeRackEditable } from '../workspace/document'

let runtime: Record<string, unknown>
let compile: (source: string) => string
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs'].map(
        (entry) => import(/* @vite-ignore */ entry),
      ),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini')
  runtime.miniAllStrings()
  const entry = '@strudel/transpiler/transpiler.mjs'
  const module: Record<string, unknown> = await import(/* @vite-ignore */ entry)
  const fn = module.transpiler
  if (typeof fn !== 'function') throw new Error('Missing transpiler')
  compile = (source) => {
    const result: unknown = fn(source, { emitMiniLocations: false, emitWidgets: false })
    if (
      !result ||
      typeof result !== 'object' ||
      !('output' in result) ||
      typeof result.output !== 'string'
    )
      throw new Error('Invalid compile')
    return result.output
  }
})
function events(source: string, omitGeneratedRouting: boolean) {
  const parsed = parseSource(source)
  const declarations = parsed.program.body
    .filter((s) => s.type === 'VariableDeclaration')
    .map((s) => source.slice(s.start, s.end))
    .join('\n')
  const voices = parsed.scopes
    .filter((s) => s.kind === 'voice')
    .map((s) => source.slice(s.start, s.end))
  // Only literal repository-owned test programs reach evaluation.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    compile(
      `(()=>{${declarations}\nreturn [${voices.join(',')}].flatMap(p=>p.queryArc(0,4).filter(h=>h.hasOnset()).map(h=>({begin:h.whole.begin.toString(),end:h.whole.end.toString(),value:Object.fromEntries(Object.entries(h.value).filter(([k])=>${omitGeneratedRouting ? "k!=='orbit'" : 'true'}))})))})()`,
    ),
  )(...Object.values(runtime))
}
it.each([
  '$: stack(note("c3"),s("sine")).s("square")\n',
  '$: stack(note("c3 e3"),note("g3 b3")).s("sine").slow(2)\n',
  '$: note("c3").stack(note("g3")).fast(2).s("sine")\n',
  '$: stack(stack(note("c3"),note("e3")),note("g3")).s("sine").rev()\n',
  'const phrase=stack(note("c3"),note("g3")).fast(2);\n$: phrase.s("sine")\n$: phrase.s("square")\n',
  '$: stack(note("c3").s("sine").postgain(.3),note("e3").s("sine").postgain(.7)).postgain(.5)\n',
  '$: stack(note("c3").s("sine").postgain(.3).mask("<1 0>").channels("3:4"),note("e3").s("sine")).postgain(1).mask("<1!3 0>").channels("1:2")\n',
  '$: stack(note("c3").s("sine").delay(.2).delaytime(.25).delayfeedback(.3),note("e3").s("sine").room(.2).roomsize(2)).lpf(900).lpq(1)\n',
  '$: stack(note("c3").s("sine").FX(lpf(800).lpq(1)),note("e3").s("sine").FX(lpf(1200).lpq(1)))\n',
  '$: stack().s("sine")\n',
  '$: stack(note("c3")).s("sine")\n',
  '$: stack(note("c3"),note("d3"),note("e3"),note("f3"),note("g3")).s("sine")\n',
])('retains pinned events and setter scope: %s', (source) => {
  const original = events(source, true)
  const generated = events(sourceBody(generate(read(source).patch)), true)
  expect(generated).toEqual(original)
})
it('retains explicit inner orbit routing without any outer override', () => {
  const source = '$: stack(note("c3").s("sine").orbit(7),note("e3").s("sine").orbit(8)).fast(2)\n'
  const regenerated = sourceBody(generate(read(source).patch))
  expect(regenerated.match(/\.orbit\(/g)).toHaveLength(2)
  expect(events(regenerated, false)).toEqual(events(source, false))
})

it('the rebuilt MIX exercise preserves the original music and outer levels', () => {
  const original =
    'setcpm(120/4)\n$: note("c3 e3 g3 b3").s("sine").gain(.15).postgain(.8).orbit(1)\n$: note("c2*4").s("triangle").gain(.1).postgain(.6).orbit(2)\n'
  const sort = (items: unknown) => {
    if (!Array.isArray(items)) throw new Error('Missing events')
    return items.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  expect(sort(events(mixExercise, false))).toEqual(sort(events(original, false)))
})

it('rebuilds MIX from complete saved state, retaining every original module except the intentional melody split', () => {
  const before = read(previousExercise).patch,
    after = read(mixExercise).patch
  for (const module of before.modules) {
    const current = after.modules.find((m) => m.id === module.id)
    expect(current).toEqual(
      module.id === 'seq1'
        ? { ...module, values: { ...module.values, steps: 'c3 ~ g3 ~' } }
        : module,
    )
  }
  for (const cable of before.cables.filter((c) => c.from.module !== 'seq1'))
    expect(after.cables).toContainEqual(cable)
  expect(after.railHp).toBe(before.railHp)
  expect(after.names).toEqual(before.names)
})

function nestedVoices() {
  let patch = starterPatch()
  for (let i = 1; i <= 2; i++) {
    patch = placeModule(patch, 'osc', i)
    patch = setValue(patch, `osc${i}`, 'mode', 'freq')
    patch = setValue(patch, `osc${i}`, 'freq', 110 * i)
    patch = setValue(patch, `osc${i}`, 'wave', 'sine')
    patch = connect(patch, { module: `osc${i}`, jack: 'out' }, { module: 'mix1', jack: `in${i}` })
  }
  patch = setValue(patch, 'mix1', 'ch1', 0.4)
  patch = setValue(patch, 'mix1', 'ch2', 0.6)
  patch = placeModule(patch, 'mix', 3)
  patch = setValue(patch, 'mix2', 'mode', 'Stack')
  patch = connect(patch, { module: 'mix1', jack: 'out' }, { module: 'mix2', jack: 'in3' })
  patch = connect(patch, { module: 'mix2', jack: 'out' }, { module: 'out1', jack: 'in' }, true)
  return patch
}
it('materializes nested Voices levels/CV/masks/output inside Stack before downstream setters', () => {
  let patch = nestedVoices()
  patch = placeModule(patch, 'lfo', 4)
  patch = setValue(patch, 'lfo1', 'mode', 'STEP')
  patch = setValue(patch, 'lfo1', 'shape', 'sine')
  patch = setValue(patch, 'lfo1', 'rate', 2)
  patch = connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'mix1', jack: 'cv1' })
  patch = setValue(patch, 'lfo1', 'depth', 0.2)
  patch = setValue(patch, 'mix1', 'arr1', '<1 0>')
  patch = setValue(patch, 'mix1', 'channels1', '3:4')
  const generated = generate(patch)
  expect(events(generated, false)).toEqual(
    events(
      '$: stack(freq(110).s("sine").mask("<1 0>").postgain(sine.range(.4,.6).slow(2)).channels("3:4"),freq(220).s("sine").postgain(.6)).orbit(1)\n',
      false,
    ),
  )
  expect(read(generated).patch).toEqual(patch)
})
it.each(['name1', 'mute1', 'solo1'])(
  'refuses active nested Voices labels in Stack: %s',
  (control) => {
    const patch = nestedVoices(),
      before = JSON.stringify(patch)
    expect(() => setValue(patch, 'mix1', control, control === 'name1' ? 'bass' : 'on')).toThrow(
      /labelled/,
    )
    expect(JSON.stringify(patch)).toBe(before)
  },
)

it('reserves literal inner o addresses without granting ownership or overriding them', () => {
  const source =
    '$: stack(note("c3").s("sine").o(2),note("e3").s("sine").o(3))\n$: note("g3").s("sine")\n$: note("b3").s("sine")\n'
  const generated = sourceBody(generate(read(source).patch))
  expect(generated.match(/\.o\([23]\)/g)).toHaveLength(2)
  expect(generated).toContain('.orbit(4)')
  expect(generated).toContain('.orbit(5)')
  expect(generated).not.toContain('.orbit(2)')
  expect(generated).not.toContain('.orbit(3)')
})

it('retains hidden routes in unsupported spread Stack CODE during rack conversion', () => {
  const source =
    'const parts = [note("c3").s("sine").orbit(7),note("e3").s("sine").orbit(8)];\n$: stack(...parts)\n'
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  const converted = makeRackEditable(doc)
  expect(events(converted.source, false)).toEqual(events(source, false))
})

it('retains owned Stack routing when only the following CODE suffix is opaque', () => {
  const source = '$: stack(s("bd"),s("hh")).foo(1).room(.5)\n$: note("c3").s("sine").delay(.3)\n'
  const generated = sourceBody(generate(read(source).patch))
  expect(generated.match(/\.orbit\(/g)).toHaveLength(2)
  expect(generated).toContain('.orbit(1)')
  expect(generated).toContain('.orbit(2)')
})
it.each([
  '$: stack(s("bd"),s("hh").foo(2)).room(.5)\n$: note("c3").s("sine").delay(.3)\n',
  '$: stack(s("bd").orbit(7),s("hh").postgain(.5)).room(.5)\n$: note("c3").s("sine").delay(.3)\n',
])('reserves the default route of an opaque Stack before allocating another voice', (source) => {
  const generated = sourceBody(generate(read(source).patch))
  expect(generated).toContain('.orbit(2)')
  expect(generated).not.toContain('.orbit(1)')
})
it('does not mistake a native callback parameter named o for routing', () => {
  const source =
    '$: note("c3").superimpose(o=>o.fast(2)).s("sine").room(.4)\n$: s("bd").delay(.3)\n'
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(false)
  const generated = sourceBody(generate(doc.patch))
  expect(generated).toContain('o => o.fast(2)')
  expect(generated.match(/\.orbit\(/g)).toHaveLength(2)
  expect(generated).toContain('.orbit(1)')
  expect(generated).toContain('.orbit(2)')
})
