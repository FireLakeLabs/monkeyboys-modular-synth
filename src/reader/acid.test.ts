import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { setValue } from '../rack/model'
import { codeConversions } from '../workspace/codeConversion'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import legacy from './fixtures/pre-238-acid.strudel?raw'
import legacyOwners from './fixtures/pre-238-owner-compat.strudel?raw'
import { readLayout } from './layout'
import { parseSource } from './syntax'
import { read } from './read'

const offsets = '[0, 0, 12, 0, 3, 0, 5, 0, 0, 12, 0, 7, 0, 3, 0, 12]'
const acid = `$: note("c2*16").add("${offsets}").s("saw")\n  .cutoff(perlin.range(200, 1500).slow(4)).resonance(25).gain(0.6).room(0.15)\n`
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
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
  const entry = '@strudel/transpiler/transpiler.mjs'
  const transpiler: Record<string, unknown> = await import(/* @vite-ignore */ entry)
  if (typeof transpiler.transpiler !== 'function') throw new Error('Missing pinned transpiler')
  const run = transpiler.transpiler
  compile = (source) => {
    const result: unknown = run(source, { emitMiniLocations: false, emitWidgets: false })
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

function events(source: string): unknown {
  const scope = parseSource(source).scopes.find((s) => s.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  const expression = source.slice(scope.start, scope.end)
  // Repository-owned expressions only. Ignore generator-owned unity mix/routing;
  // the engine registers saw and sawtooth as the same oscillator (browser proof too).
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    compile(
      `(${expression}).queryArc(0, 4).map(h => ({value:Object.fromEntries(Object.entries(h.value).filter(([k]) => !['postgain','orbit'].includes(k)).map(([k,v]) => [k,k === 's' && v === 'saw' ? 'sawtooth' : v])),begin:h.whole.begin.toString(),end:h.whole.end.toString()}))`,
    ),
  )(...Object.values(runtime))
}

it('projects the acid expressions without CODE and preserves exact source, saved identity and events', () => {
  const doc = read(acid)
  expect(doc.patch.modules.map((m) => m.type)).toEqual([
    'seq',
    'add',
    'osc',
    'vcf',
    'lfo',
    'vca',
    'reverb',
    'mix',
    'out',
  ])
  expect(doc.patch.modules.find((m) => m.type === 'add')?.values).toEqual({ value: offsets })
  expect(doc.patch.modules.find((m) => m.type === 'osc')?.values.wave).toBe('sawtooth')
  expect(doc.patch.modules.find((m) => m.type === 'vcf')?.values).toMatchObject({
    cutoff: 200,
    res: 25,
  })
  expect(doc.patch.modules.find((m) => m.type === 'lfo')?.values).toMatchObject({
    shape: 'perlin',
    rate: 4,
    depth: 1300,
  })
  expect(generate(doc)).toBe(acid)
  const saved = saveLayout(doc)
  expect(sourceBody(saved.source)).toBe(acid)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(saved.patch)
  // Reverb's existing absent-roomsize representation is outside this import fix.
  // Compare the changed arithmetic/filter path without the unchanged reverb suffix.
  const dry = read(acid.replace('.room(0.15)', ''))
  expect(events(generate(dry.patch))).toEqual(events(dry.source))
  const add = doc.patch.modules.find((m) => m.type === 'add')
  if (!add) throw new Error('Missing ADD')
  const edited = editDocument(doc, setValue(doc.patch, add.id, 'value', '<0 7>'))
  expect(sourceBody(edited.source)).toBe(acid.replace(offsets, '<0 7>'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  const dryEdited = read(sourceBody(edited.source).replace('.room(0.15)', ''))
  expect(events(generate(dryEdited.patch))).toEqual(events(dryEdited.source))
})

it.each([0, 25, 50])(
  'imports, edits and regenerates resonance %s without changing events',
  (res) => {
    const source = `$: note("c2").s("sawtooth").cutoff(800).resonance(${res})\n`
    const doc = read(source)
    const filter = doc.patch.modules.find((m) => m.type === 'vcf')
    expect(filter?.values.res).toBe(res)
    expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(false)
    expect(generate(doc)).toBe(source)
    expect(events(generate(doc.patch))).toEqual(events(source))
    if (!filter) throw new Error('Missing VCF')
    const edited = editDocument(doc, setValue(doc.patch, filter.id, 'res', 50))
    expect(sourceBody(edited.source)).toBe(source.replace(`resonance(${res})`, 'resonance(50)'))
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(() => setValue(doc.patch, filter.id, 'res', 51)).toThrow()
    expect(() => setValue(doc.patch, filter.id, 'res', -1)).toThrow()
  },
)

it.each([-1, 51])('retains out-of-range resonance %s as CODE', (res) => {
  const source = `$: note("c2").s("sawtooth").lpf(800).resonance(${res})\n`
  const doc = read(source)
  expect(doc.patch.modules.find((m) => m.type === 'code')?.values.text).toBe(`.resonance(${res})`)
  expect(generate(doc)).toBe(source)
})

it('checks the actual arithmetic semantics rather than inventing a pitch transposition', () => {
  expect(events('$: note("c2").add("12")')).toEqual(
    Array.from({ length: 4 }, (_, i) => ({
      value: { note: 'c2' },
      begin: String(i),
      end: String(i + 1),
    })),
  )
  for (const argument of ['12', 'offsets', 'note("0 12")', '"0", "12"']) {
    const source = `$: note("c2").add(${argument}).s("sawtooth")\n`
    const doc = read(source)
    expect(doc.patch.modules.find((m) => m.type === 'code')?.values.text).toBe(`.add(${argument})`)
    expect(generate(doc)).toBe(source)
  }
})

it('retains saved CODE and offers the independent ADD conversion without changing the program', () => {
  const doc = read(legacy)
  expect(doc.layout).toBe('restored')
  expect(doc.patch.modules.filter((m) => m.type === 'code')).toHaveLength(3)
  expect(generate(doc)).toBe(legacy)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
  const offer = codeConversions(doc).find((o) => o.type === 'add')
  if (!offer) throw new Error('Missing explicit ADD conversion')
  expect(sourceBody(offer.document.source)).toBe(sourceBody(legacy))
  expect(read(offer.document.source).patch).toEqual(offer.document.patch)
  expect(events(offer.document.source)).toEqual(events(legacy))
})

it('keeps saw source spelling through unrelated edits and changes WAVE only on request', () => {
  const doc = read('$: note("c2").s("saw").lpf(800)\n')
  const osc = doc.patch.modules.find((m) => m.type === 'osc')
  const filter = doc.patch.modules.find((m) => m.type === 'vcf')
  if (!osc || !filter) throw new Error('Missing OSC/VCF')
  const edited = editDocument(doc, setValue(doc.patch, filter.id, 'cutoff', 900))
  expect(sourceBody(edited.source)).toBe('$: note("c2").s("saw").lpf(900)\n')
  const wave = editDocument(edited, setValue(edited.patch, osc.id, 'wave', 'square'))
  expect(sourceBody(wave.source)).toBe('$: note("c2").s("square").lpf(900)\n')
  expect(read(wave.source).patch).toEqual(wave.patch)
})

it('edits plain-value addition before the note wrapper as actual numeric pitch offsets', () => {
  const source = '$: "48".add("<0 12>").note().s("sawtooth")\n'
  const doc = read(source)
  const add = doc.patch.modules.find((m) => m.type === 'add')
  if (!add) throw new Error('Missing ADD')
  expect(events(generate(doc.patch))).toEqual(events(source))
  expect(events(source)).toEqual(
    Array.from({ length: 4 }, (_, i) => ({
      value: { note: i % 2 ? 60 : 48, s: 'sawtooth' },
      begin: String(i),
      end: String(i + 1),
    })),
  )
  const edited = editDocument(doc, setValue(doc.patch, add.id, 'value', '<0 7>'))
  expect(sourceBody(edited.source)).toBe(source.replace('<0 12>', '<0 7>'))
  expect(events(edited.source)).toEqual(
    Array.from({ length: 4 }, (_, i) => ({
      value: { note: i % 2 ? 55 : 48, s: 'sawtooth' },
      begin: String(i),
      end: String(i + 1),
    })),
  )
})

it.each(['.resonance(25)', '.cutoff(400 + 600).resonance(25)'])(
  'does not invent a default cutoff for an unowned resonance setter: %s',
  (suffix) => {
    const source = `$: note("c2").s("sawtooth")${suffix}\n`
    const doc = read(source)
    expect(doc.patch.modules.some((m) => m.type === 'vcf')).toBe(false)
    expect(generate(doc)).toBe(source)
    expect(events(generate(doc.patch))).toEqual(events(source))
  },
)

it('retains pre-238 standalone/separated lpq and root saw DRUMS/sampler owners', () => {
  const stored = readLayout(legacyOwners)
  if (stored.kind !== 'valid') throw new Error('Invalid baseline fixture')
  const doc = read(legacyOwners)
  expect(doc.layout).toBe('restored')
  expect(doc.patch).toEqual(stored.patch)
  expect(generate(doc)).toBe(legacyOwners)
  const saved = saveLayout(doc)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(doc.patch)
})
