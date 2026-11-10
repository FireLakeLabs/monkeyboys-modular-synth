import { FUNCTION_FORMS, FUNCTION_EDITS } from './function-loops.fixtures'
import { RACK_MARKER } from '../codegen/layout'
import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { editDocument, saveLayout, sourceBody, fromPatch } from '../workspace/document'
import {
  connect,
  setValue,
  placeModule,
  starterPatch,
  cableSignal,
  effectNotes,
  removeCable,
  removeModule,
} from '../rack/model'
import type { Patch } from '../patch/types'

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
const base = 'note("c3 e3 g3 b3").s("sine")'
function voice(source: string) {
  const scope = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  return source.slice(scope.start, scope.end)
}
function events(expression: string) {
  // Committed fixtures only, using the actual pinned engine.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0,8).filter(h=>h.hasOnset()).map(h=>{const {orbit,...value}=h.value;return {value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}})`,
  )
  const result: unknown[] = run(...Object.values(runtime))
  return result.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
it.each(FUNCTION_FORMS)(
  '%s reads %s with independent exact source, saved identity and events',
  (type, tail) => {
    const source = `// keep this\n$: ${base}${tail} // and this\n`
    const document = read(source)
    expect(document.patch.modules.some((m) => m.type === type)).toBe(true)
    expect(document.patch.modules.filter((m) => m.type === 'code')).toEqual([])
    expect(generate(document)).toBe(source)
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(source)
    expect(read(saved.source).patch).toEqual(saved.patch)
    const generated = generate(saved.patch)
    expect(read(generated).patch).toEqual(saved.patch)
    const expected = events(base + tail)
    expect(expected.length).toBeGreaterThan(0)
    expect(events(voice(generated))).toEqual(expected)
  },
)
it('edits inner and outer literals without touching comments or lambda identifiers', () => {
  const source = `$: ${base}.chunk(4, p => p.ply("2") /* between */ .off(1/8, q => q.iter(3).rev()))\n`
  let doc = saveLayout(read(source))
  const iter = doc.patch.modules.find((m) => m.type === 'iter')
  const chunk = doc.patch.modules.find((m) => m.type === 'chunk')
  if (!iter || !chunk) throw new Error('Missing loops')
  doc = editDocument(doc, setValue(doc.patch, iter.id, 'steps', 5))
  doc = editDocument(doc, setValue(doc.patch, chunk.id, 'chunks', 3))
  expect(sourceBody(doc.source)).toBe(
    source.replace('.iter(3)', '.iter(5)').replace('.chunk(4', '.chunk(3'),
  )
  expect(read(doc.source).patch).toEqual(doc.patch)
  expect(events(voice(generate(doc.patch)))).toEqual(events(voice(doc.source)))
})
it.each(['.chunk(4, p => p.ply(2).add(p))', '.off(.25, p => p.custom(7).rev())'])(
  'keeps the complete unreadable body as CODE inside %s',
  (tail) => {
    const source = `$: ${base}${tail}\n`
    const doc = saveLayout(read(source))
    const code = doc.patch.modules.find((m) => m.type === 'code')
    expect(code).toBeDefined()
    expect(doc.patch.cables).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({ jack: 'send' }),
        to: { module: code?.id, jack: 'in' },
      }),
    )
    expect(generate(doc)).toBe(doc.source)
    expect(sourceBody(doc.source)).toBe(source)
    expect(read(doc.source).patch).toEqual(doc.patch)
    expect(voice(generate(doc.patch))).toContain('p => p')
  },
)
it.each(['rev', 'press', 'x => x.fast(2)', 'x => x.iter(4)'])(
  'retains existing JUX preset %s without loop modules',
  (preset) => {
    const source = `$: ${base}.jux(${preset})\n`
    const doc = saveLayout(read(source))
    expect(doc.patch.cables.some((c) => c.from.jack === 'send')).toBe(false)
    expect(sourceBody(doc.source)).toBe(source)
    expect(read(doc.source).patch).toEqual(doc.patch)
  },
)
function rack() {
  let patch = starterPatch()
  for (const [i, type] of ['seq', 'osc', 'chunk', 'ratchet', 'rev', 'off', 'iter'].entries())
    patch = placeModule(patch, type, i + 1)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'chunk1', jack: 'in' })
  patch = connect(patch, { module: 'chunk1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  return patch
}
function wire(patch: Patch, from: string, out: string, to: string, input: string) {
  return connect(patch, { module: from, jack: out }, { module: to, jack: input })
}
it('builds and repatches nested loops in the rack, using presets until RETURN closes', () => {
  let patch = rack()
  expect(voice(generate(patch))).toContain('.chunk(4, rev)')
  patch = setValue(patch, 'ratchet1', 'repeats', '2')
  patch = wire(patch, 'chunk1', 'send', 'ratchet1', 'in')
  expect(voice(generate(patch))).toContain('.chunk(4, rev)')
  patch = wire(patch, 'ratchet1', 'out', 'off1', 'in')
  patch = wire(patch, 'off1', 'send', 'iter1', 'in')
  patch = wire(patch, 'iter1', 'out', 'off1', 'return')
  patch = wire(patch, 'off1', 'out', 'rev1', 'in')
  patch = wire(patch, 'rev1', 'out', 'chunk1', 'return')
  expect(voice(generate(patch))).toContain('x => x.ply("2").off(0.125, x => x.iter(4)).rev()')
  expect(fromPatch(patch).patch).toEqual(patch)
  expect(cableSignal(patch, { module: 'off1', jack: 'out' })).toBe('function')
  const returned = patch.cables.find((c) => c.to.module === 'chunk1' && c.to.jack === 'return')
  if (!returned) throw new Error('Missing return')
  expect(voice(generate(removeCable(patch, returned.id)))).toContain('.chunk(4, rev)')
})
it.each(['seq', 'osc', 'mix', 'out', 'lfo', 'cvseq', 'chord'])(
  'blocks source/bus %s from a function loop',
  (type) => {
    let patch = rack()
    if (!patch.modules.some((m) => m.type === type)) patch = placeModule(patch, type, 9)
    const module = patch.modules.find((m) => m.type === type)
    if (!module) throw new Error('Missing module')
    expect(() =>
      wire(
        patch,
        'chunk1',
        'send',
        module.id,
        type === 'mix' ? 'in2' : type === 'osc' ? 'note' : 'in',
      ),
    ).toThrow()
  },
)
it('rejects cross-loop returns and recursive containment while retaining incomplete fan-out', () => {
  let patch = wire(rack(), 'chunk1', 'send', 'rev1', 'in')
  expect(() => wire(patch, 'rev1', 'out', 'off1', 'return')).toThrow('own SEND')
  patch = wire(patch, 'rev1', 'out', 'chunk1', 'return')
  const branched = wire(patch, 'rev1', 'out', 'iter1', 'in')
  expect(read(generate(branched)).patch).toEqual(branched)
  patch = wire(rack(), 'chunk1', 'send', 'off1', 'in')
  expect(() => wire(patch, 'off1', 'send', 'chunk1', 'in')).toThrow()
})

it.each(FUNCTION_EDITS)(
  'edits %s.%s and preserves exact source, saved identity and events',
  (type, control, value, before, after) => {
    const source = `$: ${base}${before} // keep\n`
    const original = saveLayout(read(source))
    const module = original.patch.modules.find((m) => m.type === type)
    if (!module) throw new Error('Missing function module')
    const edited = editDocument(original, setValue(original.patch, module.id, control, value))
    expect(sourceBody(edited.source)).toBe(source.replace(before, after))
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(events(voice(edited.source))).toEqual(events(base + after))
  },
)
it.each([
  ['every', 'last', '.lastOf(4, rev)'],
  ['sometimes', 'cycles', '.someCyclesBy(0.5, rev)'],
  ['sometimes', 'often', '.often(rev)'],
  ['sometimes', 'rarely', '.rarely(rev)'],
] as const)('generates %s mode %s from the panel and restores it', (type, mode, call) => {
  const doc = read(`$: ${base}${type === 'every' ? '.firstOf(4, rev)' : '.sometimesBy(.5, rev)'}\n`)
  const module = doc.patch.modules.find((m) => m.type === type)
  if (!module) throw new Error('Missing function module')
  const patch = setValue(doc.patch, module.id, 'mode', mode)
  const generated = generate(patch)
  expect(voice(generated)).toContain(call)
  expect(read(generated).patch).toEqual(patch)
  expect(events(voice(generated)).length).toBeGreaterThan(0)
})
it('retains a nested CODE fallback, its parameter references and trailing comments', () => {
  const source = `$: ${base}.chunk(4, p => p.off(.25, q => q.color("red").rev() // keep\n).iter(3))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.some((m) => m.type === 'off')).toBe(true)
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toHaveLength(1)
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
  expect(events(voice(generate(doc.patch)))).toEqual(events(voice(source)))
})
it('allows deleting a loop module without reconnecting its neighbors and restores the preset', () => {
  const doc = read(`$: ${base}.chunk(4, x => x.iter(3).rev())\n`)
  const iter = doc.patch.modules.find((m) => m.type === 'iter')
  if (!iter) throw new Error('Missing iter')
  const patch = removeModule(doc.patch, iter.id)
  expect(voice(generate(patch))).toContain('.chunk(4, rev)')
  expect(read(generate(patch)).patch).toEqual(patch)
})

it.each([
  '.within(.25,.75)',
  '.chunk(4, async x => x.rev())',
  '.chunk(4, x => { return x.rev() })',
  '.chunk(4, x => (x).rev())',
  '.chunk(4, x => foo(x))',
  '.superimpose(x=>x.rev(), x=>x.iter(2))',
])('keeps unsupported function shapes/arity as whole-call CODE: %s', (tail) => {
  const source = `$: ${base}${tail}\n`
  const document = saveLayout(read(source))
  expect(document.patch.modules.find((m) => m.type === 'code')?.values.text).toBe(tail)
  expect(document.patch.cables.some((c) => c.from.jack === 'send')).toBe(false)
  expect(sourceBody(document.source)).toBe(source)
  expect(read(document.source).patch).toEqual(document.patch)
})
it.each(['SMOOTH', 'STEP', 'ENV', 'CV SEQ'])(
  'round-trips %s CV on a transform inside nested functions',
  (mode) => {
    let patch = read(`$: ${base}.chunk(4,x=>x.off(.25,y=>y.gain(.4)))\n`).patch
    const vca = patch.modules.find((m) => m.type === 'vca')
    if (!vca) throw new Error('Missing inner VCA')
    const type = mode === 'ENV' ? 'env' : mode === 'CV SEQ' ? 'cvseq' : 'lfo'
    patch = placeModule(patch, type, 9)
    if (type === 'lfo') patch = setValue(patch, 'lfo1', 'mode', mode)
    patch = connect(patch, { module: `${type}1`, jack: 'out' }, { module: vca.id, jack: 'cv' })
    const source = generate(patch)
    expect(read(source).patch).toEqual(patch)
    const imported = saveLayout(read(sourceBody(source)))
    expect(read(imported.source).patch).toEqual(imported.patch)
    expect(events(voice(generate(imported.patch)))).toEqual(events(voice(source)))
  },
)

it('rejects a forged nested ownership path without replacing source', () => {
  const doc = saveLayout(read(`$: ${base}.chunk(4, x => x.iter(3).rev())\n`))
  const start = doc.source.indexOf(RACK_MARKER)
  const lines = doc.source
    .slice(start)
    .split('\n')
    .slice(1)
    .filter((l) => l.startsWith('// '))
  const raw: unknown = JSON.parse(lines.map((l) => l.slice(3)).join('\n'))
  if (!raw || typeof raw !== 'object' || !('modules' in raw) || !Array.isArray(raw.modules))
    throw new Error('Missing saved modules')
  const module: unknown = raw.modules.find(
    (m: unknown) => m && typeof m === 'object' && 'type' in m && m.type === 'iter',
  )
  if (
    !module ||
    typeof module !== 'object' ||
    !('bindings' in module) ||
    !Array.isArray(module.bindings)
  )
    throw new Error('Missing bindings')
  const binding: unknown = module.bindings[0]
  if (!binding || typeof binding !== 'object' || !('loop' in binding))
    throw new Error('Missing loop')
  binding.loop = [999]
  const source =
    doc.source.slice(0, start) +
    RACK_MARKER +
    '\n' +
    JSON.stringify(raw, null, 2)
      .split('\n')
      .map((l) => '// ' + l)
      .join('\n') +
    '\n'
  const reopened = read(source)
  expect(reopened.layout).toBe('invalid')
  expect(generate(reopened)).toBe(source)
})

it('does not mistake a callback parameter for a same-named global CV declaration', () => {
  const source = `const p = sine;\n$: ${base}.chunk(4,p=>p.lpf(p))\n`
  const doc = saveLayout(read(source))
  expect(doc.patch.modules.find((m) => m.type === 'code')?.values.text).toBe('.lpf(p)')
  expect(doc.patch.modules.some((m) => m.type === 'vcf')).toBe(false)
  expect(sourceBody(doc.source)).toBe(source)
  expect(read(doc.source).patch).toEqual(doc.patch)
})

it('keeps a closed bypassed chain as identity rather than silently using the REV preset', () => {
  const document = read(`$: ${base}.chunk(4,x=>x.delay(.4))\n`)
  const delay = document.patch.modules.find((m) => m.type === 'delay')
  if (!delay) throw new Error('Missing loop delay')
  const patch = setValue(document.patch, delay.id, 'mix', 0)
  const source = generate(patch)
  expect(voice(source)).toContain('.chunk(4, x => x)')
  expect(events(voice(source))).toEqual(events(base))
  expect(read(source).patch).toEqual(patch)
})

it('keeps nested calls whose local index matches top-level routing after an external edit (S1)', () => {
  const tail = '.chunk(4,x=>x.iter(3).rev().ply("2").iter(5).rev())'
  const serialized = generate(read(`$: ${base}${tail}\n`).patch)
  const changed = read(serialized.replace('.iter(3)', '.iter(4)'))
  expect(changed.patch.modules.filter((m) => m.type === 'iter').map((m) => m.values.steps)).toEqual(
    [4, 5],
  )
  expect(events(voice(generate(changed.patch)))).toEqual(
    events(base + tail.replace('iter(3)', 'iter(4)')),
  )
  expect(read(saveLayout(changed).source).patch).toEqual(changed.patch)
})
it.each([
  ['.gain(sine.range(.1,.5))', 'lfo'],
  ['.gain(.4).lfo({c:"gain",sync:.25,depthabs:.2,dc:0,shape:"sine",skew:.5})', 'lfo'],
  ['.attack(.01).decay(.2).sustain(.5).release(.1).gain(.4)', 'env'],
  ['.gain("<.2 .6>")', 'cvseq'],
])('projects readable CV dependencies inside a loop: %s (S2)', (body, type) => {
  const source = `$: ${base}.chunk(4,x=>x${body})\n`
  const document = read(source)
  expect(document.patch.modules.some((m) => m.type === 'vca')).toBe(true)
  expect(document.patch.modules.some((m) => m.type === type)).toBe(true)
  expect(document.patch.modules.some((m) => m.type === 'code')).toBe(false)
  expect(sourceBody(saveLayout(document).source)).toBe(source)
  expect(events(voice(generate(document.patch)))).toEqual(events(voice(source)))
})
it('retains saved nested CODE when an edit makes its body readable (S3)', () => {
  const source = `$: ${base}.chunk(4,x=>x.color("red"))\n`
  const document = saveLayout(read(source))
  const code = document.patch.modules.find((m) => m.type === 'code')
  if (!code) throw new Error('Missing nested CODE')
  const edited = editDocument(document, setValue(document.patch, code.id, 'text', '.rev()'))
  expect(sourceBody(edited.source)).toBe(source.replace('.color("red")', '.rev()'))
  expect(edited.patch.modules.find((m) => m.id === code.id)?.values.text).toBe('.rev()')
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(voice(generate(edited.patch)))).toEqual(events(base + '.chunk(4,x=>x.rev())'))
})
it('keeps CV signals and function styling on a RETURN-side partial chain (S4)', () => {
  const document = read(`$: ${base}.chunk(4,x=>x.gain(.4))\n`)
  const vca = document.patch.modules.find((m) => m.type === 'vca')
  const send = document.patch.cables.find((c) => c.from.jack === 'send')
  if (!vca || !send) throw new Error('Missing loop')
  expect(cableSignal(document.patch, { module: vca.id, jack: 'cv' })).toBe('mod')
  const partial = removeCable(document.patch, send.id)
  expect(cableSignal(partial, { module: vca.id, jack: 'out' })).toBe('function')
  expect(cableSignal(partial, { module: vca.id, jack: 'cv' })).toBe('mod')
  expect(read(generate(partial)).patch).toEqual(partial)
})

it('keeps ordered FX argument ownership inside a function during literal edits and reopen', () => {
  const source = `$: ${base}.chunk(4,x=>x.FX(lpf(/* first */800).lpq(1), lpf(/* second */1200).lpq(1)).rev())\n`
  const document = saveLayout(read(source))
  expect(document.patch.modules.some((m) => m.type === 'code')).toBe(false)
  const filters = document.patch.modules.filter((m) => m.type === 'vcf')
  const second = filters[1]
  if (!second) throw new Error('Missing nested FX filters')
  expect(filters.map((m) => m.fx)).toEqual([true, true])
  const edited = editDocument(document, setValue(document.patch, second.id, 'cutoff', 1400))
  expect(sourceBody(edited.source)).toBe(source.replace('/* second */1200', '/* second */1400'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(voice(generate(edited.patch)))).toEqual(events(voice(edited.source)))
})
it('plans effect order independently in the main voice and nested function paths', () => {
  const imported = read(
    `$: ${base}.room(.4).chunk(4,x=>x.room(.5).roomsize(4).delay(.4).delayfeedback(.5)).rev()\n`,
  )
  const patch = {
    ...imported.patch,
    modules: imported.patch.modules.map((module) => {
      const { fx: _fx, ...rackModule } = module
      return rackModule
    }),
  }
  const generated = generate(patch)
  expect(voice(generated)).toContain('.room(0.4)')
  expect(voice(generated)).not.toContain('.FX(room(0.4)')
  expect(voice(generated)).toContain('x => x.FX(room(0.5)')
  expect(voice(generated)).toContain('.FX(delay(0.4)')
  expect(read(generated).patch).toEqual(patch)
  expect(events(voice(generated)).length).toBeGreaterThan(0)
})
it('preserves native imported effects within a loop instead of silently normalizing audio order', () => {
  const source = `$: ${base}.chunk(4,x=>x.room(.5).roomsize(4).delay(.4).delayfeedback(.5)).rev()\n`
  const document = saveLayout(read(source))
  expect(sourceBody(document.source)).toBe(source)
  expect(read(document.source).patch).toEqual(document.patch)
  expect(voice(generate(document.patch))).not.toContain('.FX(')
  expect(events(voice(generate(document.patch)))).toEqual(events(voice(source)))
})

it('omits unsounded loop effects from the audible chain note while SEND is disconnected', () => {
  const document = read(`$: ${base}.chunk(4,x=>x.FX(lpf(800).lpq(1)).FX(lpf(1200).lpq(1)))\n`)
  const send = document.patch.cables.find((c) => c.from.jack === 'send')
  if (!send) throw new Error('Missing SEND')
  const partial = removeCable(document.patch, send.id)
  expect(effectNotes(partial)).toEqual([])
  expect(voice(generate(partial))).toContain('.chunk(4, rev)')
})

it.each(['noise', 'harmonic'])('rejects the new %s sound source on a loop RETURN', (type) => {
  let patch = rack()
  patch = placeModule(patch, type, 9)
  expect(() => wire(patch, `${type}1`, 'out', 'chunk1', 'return')).toThrow('excluding sources')
})

it('preserves #147 backticks and CRLF during an enclosing loop edit', () => {
  const source = '$: ' + base + '.chunk(4,p=>p.ply(`<1 2>`).rev())\r\n'
  const document = saveLayout(read(source))
  const ratchet = document.patch.modules.find((m) => m.type === 'ratchet')
  if (!ratchet) throw new Error('Missing loop RATCHET')
  const chunk = document.patch.modules.find((m) => m.type === 'chunk')
  if (!chunk) throw new Error('Missing CHUNK')
  const edited = editDocument(document, setValue(document.patch, chunk.id, 'chunks', 3))
  expect(sourceBody(edited.source)).toBe(source.replace('.chunk(4,', '.chunk(3,'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(voice(generate(edited.patch)))).toEqual(events(voice(edited.source)))
})
it('preserves multiline CV SEQ literal bytes inside a loop during an edit', () => {
  const source = '$: ' + base + '.chunk(4,x=>x.gain(`<.2\r\n.6>`))\r\n'
  const document = saveLayout(read(source))
  const cvseq = document.patch.modules.find((m) => m.type === 'cvseq')
  if (!cvseq) throw new Error('Missing loop CV SEQ')
  const edited = editDocument(document, setValue(document.patch, cvseq.id, 'steps', '<.3\n.6>'))
  expect(sourceBody(edited.source)).toBe(source.replace('<.2', '<.3'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(voice(generate(edited.patch)))).toEqual(events(voice(edited.source)))
})
