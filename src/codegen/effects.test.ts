import { beforeAll, expect, it } from 'vitest'
import { generate } from './generate'
import { read } from '../reader'
import { connect, effectNotes, placeModule, setValue, starterPatch } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { parseSource } from '../reader/syntax'

function fixture(types: string[]) {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', ...types]) patch = placeModule(patch, type, 1)
  const chain = patch.modules.filter((m) => !['mix', 'out'].includes(m.type))
  for (let i = 0; i < chain.length; i++) {
    const from = chain[i],
      to = chain[i + 1]
    if (!from) continue
    patch = connect(
      patch,
      { module: from.id, jack: from.type === 'seq' ? 'note' : 'out' },
      { module: to?.id ?? 'mix1', jack: to?.type === 'osc' ? 'note' : to ? 'in' : 'in1' },
    )
  }
  return patch
}
let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/index.mjs']
  runtime = Object.assign(
    {},
    ...(await Promise.all(entries.map((entry) => import(/* @vite-ignore */ entry)))),
  )
})
function events(source: string) {
  const voice = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!voice) throw new Error('Missing voice')
  // Only committed fixtures run in this pinned-engine check.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${source.slice(voice.start, voice.end)}).queryArc(0,1).map(h => h.value)`,
  )(...Object.values(runtime))
}

it('keeps matching chains native and gives reversed sends inline stages', () => {
  const native = generate(fixture(['vcf', 'delay', 'reverb']))
  expect(sourceBody(native)).not.toContain('.FX(')
  const patch = fixture(['reverb', 'delay', 'vcf'])
  const generated = generate(patch)
  expect(sourceBody(generated)).toContain('.FX(room(0.5).roomsize(4))')
  expect(sourceBody(generated)).toContain('.FX(delay(0.4).delaytime(0.375).delayfeedback(0.5))')
  expect(sourceBody(generated)).toContain('.FX(lpf(800).lpq(1))')
  expect(read(generated).patch).toEqual(patch)
  expect(effectNotes(patch)[0]).toContain('REVERB (reverb1) → DELAY (delay1) → VCF (vcf1)')
  expect(events(native)[0]).toMatchObject({ cutoff: 800, delay: 0.4, room: 0.5, orbit: 1 })
  expect(events(generated)[0]).toMatchObject({
    FX: [
      { room: 0.5, roomsize: 4 },
      { delay: 0.4, delaytime: 0.375, delayfeedback: 0.5 },
      { cutoff: 800, resonance: 1 },
    ],
    orbit: 1,
  })
})
it('repeated filters become independent audible stages and restore the exact rack', () => {
  let patch = fixture(['vcf', 'vcf'])
  patch = setValue(patch, 'vcf2', 'cutoff', 1200)
  const code = generate(patch)
  expect(events(code)[0]).toMatchObject({
    FX: [
      { cutoff: 800, resonance: 1 },
      { cutoff: 1200, resonance: 1 },
    ],
  })
  expect(read(code).patch).toEqual(patch)
})
it.each([
  'lpf(500).lpq(1), lpf(1200).lpq(1)',
  'room(.5).roomsize(4), delay(.4).delaytime(.375).delayfeedback(.5)',
  'lpf(500).lpq(2).lpenv(4).lpattack(.01).lpdecay(.2).lpsustain(.5).lprelease(.3), lpf(1200).lpq(1)',
  'lpf(500).lpq(1).lfo({c:"lpf",sync:1,depthabs:400,shape:"sine",dc:0,skew:.5}), lpf(1200).lpq(1)',
])('preserves FX source, saves repeated owners and keeps events: %s', (args) => {
  const source = `// keep formatting\n$: note("c3").s("sine").FX( ${args} ).orbit(1) // tail\n`
  const original = read(source)
  expect(original.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toEqual(
    ['.orbit(1)'],
  )
  expect(generate(original)).toBe(source)
  const saved = saveLayout(original)
  expect(sourceBody(saved.source)).toBe(source)
  expect(read(saved.source).patch).toEqual(saved.patch)
  expect(events(generate(saved.patch))).toEqual(events(source.replace(' // tail', '')))
})
it('edits only the selected FX argument literal and retains repeated identities', () => {
  const source = '$: note("c3").s("sine").FX(lpf(500), /* second */ lpf(1200))\n'
  const document = saveLayout(read(source))
  const second = document.patch.modules.filter((m) => m.type === 'vcf')[1]
  if (!second) throw new Error('Missing second filter')
  const edited = editDocument(document, setValue(document.patch, second.id, 'cutoff', 900))
  expect(sourceBody(edited.source)).toBe(source.replace('1200', '900'))
  expect(read(edited.source).patch).toEqual(edited.patch)
})
it.each([
  'helper()',
  'lpf(foo)',
  '...effects',
  'lpf(500).rev()',
  'room(.5).lpf(500)',
  'lpf(500).lpf(1000)',
  'djf(.5)',
])('retains unreadable FX atomically as CODE: %s', (argument) => {
  const source = `$: note("c3").s("sine").FX(${argument}, lpf(1200))\n`
  const document = read(source)
  expect(document.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toEqual(
    [`.FX(${argument}, lpf(1200))`],
  )
  expect(document.patch.modules.some((m) => m.type === 'vcf')).toBe(false)
  expect(generate(document)).toBe(source)
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})
it('preserves reversed native setters as fixed-order sends on import', () => {
  const source =
    '$: note("c3").s("sine").room(.5).roomsize(4).delay(.4).delaytime(.375).delayfeedback(.5).orbit(1)\n'
  const document = read(source)
  expect(sourceBody(generate(document.patch))).not.toContain('.FX(')
  expect(events(generate(document.patch))).toEqual(events(source))
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})
it('keeps FX before outer native settings and never moves custom orbit routing', () => {
  const source = '$: note("c3").s("sine").lpf(800).lpq(1).FX(lpf(500).lpq(1)).orbit(7)\n'
  const document = read(source)
  expect(events(generate(document.patch))).toEqual(events(source))
  expect(sourceBody(generate(document.patch))).not.toContain('.orbit(1)')
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})
it('retains separate final orbits across fan-out and shared FX declarations', () => {
  let patch = fixture(['vcf', 'vcf'])
  patch = connect(patch, { module: 'vcf2', jack: 'out' }, { module: 'mix1', jack: 'in2' })
  const code = generate(patch)
  expect(code).toContain('const mb_vcf2 =')
  expect(code).toContain('.orbit(1)')
  expect(code).toContain('.orbit(2)')
  expect(read(code).layout).toBe('restored')
  expect(read(code).patch.cables).toEqual(patch.cables)
})

it('keeps unsupported stage-global filters conservative and supports local ladder stages', () => {
  const patch = fixture(['vcf', 'vcf'])
  expect(() => setValue(patch, 'vcf1', 'type', '24db')).toThrow('cannot isolate 24db')
  const ladder = setValue(patch, 'vcf1', 'type', 'ladder')
  expect(read(generate(ladder)).patch).toEqual(ladder)
  const document = read('$: note("c3").s("sine").FX(lpf(500).ftype("24db"))')
  expect(document.patch.modules.some((m) => m.type === 'code')).toBe(true)
})
it('retains native import semantics across named declarations and overlapping branches', () => {
  const source =
    'const wet = note("c3").s("sine").room(.5).roomsize(4);\n$: wet.delay(.4).delaytime(.375).delayfeedback(.5).orbit(7)\n$: wet.orbit(8)\n'
  const document = read(source)
  expect(sourceBody(generate(document.patch))).not.toContain('.FX(')
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})
it('retains prior CODE ownership for FX until explicit conversion', () => {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', 'code']) patch = placeModule(patch, type, 1)
  patch = setValue(patch, 'code1', 'text', '.FX(lpf(500), lpf(1200))')
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'code1', jack: 'in' })
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  expect(read(saveLayout(read(generate(patch))).source).patch).toEqual(patch)
})

it('migrates a proven pre-134 generated file without changing native audio or layout', async () => {
  const { generateDocument } = await import('./generate')
  const patch = fixture(['reverb', 'delay'])
  const old = generateDocument(patch, { nativeEffects: true }).code
  const document = read(old)
  expect(document.layout).toBe('restored')
  expect(generate(document)).toBe(old)
  expect(document.patch.modules.map(({ fx: _fx, ...m }) => m)).toEqual(patch.modules)
  expect(document.patch.cables).toEqual(patch.cables)
  expect(sourceBody(generate(document.patch))).not.toContain('.FX(')
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})

it('does not turn a native delay into an inline effect when an earlier reverb is bypassed', () => {
  const patch = setValue(fixture(['reverb', 'delay']), 'reverb1', 'room', 0)
  expect(sourceBody(generate(patch))).not.toContain('.FX(')
})

it('retains named CV sources when an FX argument is opaque', () => {
  const source =
    'const wobble=sine;\n$: note("c3").s("sine").FX(lpf(wobble.range(500,900)),helper()).lpf(wobble.range(500,900)).lpq(1)\n'
  const document = read(source)
  expect(generate(document)).toBe(source)
  expect(document.patch.modules.some((m) => m.type === 'vcf')).toBe(true)
  expect(read(saveLayout(document).source).patch).toEqual(document.patch)
})

it('migrates native execution in a proven pre-134 source snapshot', () => {
  const original = saveLayout(read('$: note("c3").s("sine").room(.5).delay(.4)\n'))
  const marker = '// ── @monkeyboy rack v1 ──'
  const [body, block] = original.source.split(marker)
  if (!body || !block) throw new Error('Missing metadata')
  const raw = JSON.parse(
    block
      .trim()
      .split('\n')
      .map((l) => l.slice(3))
      .join('\n'),
  )
  for (const module of raw.modules) delete module.fx
  const source =
    body +
    marker +
    '\n' +
    JSON.stringify(raw, null, 2)
      .split('\n')
      .map((l) => '// ' + l)
      .join('\n') +
    '\n'
  const reopened = read(source)
  expect(reopened.layout).toBe('restored')
  expect(generate(reopened)).toBe(source)
  expect(sourceBody(generate(reopened.patch))).not.toContain('.FX(')
  expect(read(saveLayout(reopened).source).patch).toEqual(reopened.patch)
})

it('follows unambiguous FX arguments across external reordering without stealing identities', () => {
  const document = saveLayout(read('$: note("c3").s("sine").FX(lpf(500),lpf(1200))\n'))
  const before = document.patch.modules.filter((m) => m.type === 'vcf')
  const body = sourceBody(document.source)
  const reordered = read(
    body.replace('lpf(500),lpf(1200)', 'lpf(1200),lpf(500)') + document.source.slice(body.length),
  )
  expect(reordered.patch.modules.find((m) => m.values.cutoff === 500)?.id).toBe(before[0]?.id)
  expect(reordered.patch.modules.find((m) => m.values.cutoff === 1200)?.id).toBe(before[1]?.id)
  const changed = read(body.replace('lpf(1200)', 'lpf(900)') + document.source.slice(body.length))
  expect(changed.patch.modules.find((m) => m.values.cutoff === 500)?.id).toBe(before[0]?.id)
  expect(changed.patch.modules.find((m) => m.values.cutoff === 900)?.id).not.toBe(before[1]?.id)
})
