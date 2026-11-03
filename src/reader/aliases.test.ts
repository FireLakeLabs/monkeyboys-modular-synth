import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { setValue } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { read } from './read'
import legacySource from './fixtures/pre-77-aliases.strudel?raw'
import legacyVoice from './fixtures/pre-77-whole-voice.strudel?raw'

it('restores a whole voice saved as CODE by the base reader, including its look and bindings', () => {
  // Captured through read/saveLayout/editDocument at base 92e40810.
  const doc = read(legacyVoice)
  expect(doc.layout).toBe('restored')
  expect(doc.patch.modules.map((m) => [m.id, m.type, m.row, m.hp, m.look])).toEqual([
    ['code1', 'code', 0, 0, 'bare'],
    ['mix1', 'mix', 1, 0, 'instrument'],
    ['out2', 'out', 1, 12, 'instrument'],
  ])
  expect(doc.patch.modules[0]?.values.text).toBe('n("0 2").s("sine").scale("G:minor")')
  expect(doc.bindings.find((b) => b.module === 'code1')?.calls).toEqual([0, 1, 2])
  expect(generate(doc)).toBe(legacyVoice)
  expect(read(saveLayout(doc).source).patch).toEqual(doc.patch)
})

it('retains the saved CODE owners from a pre-77 file when new adapters become available', () => {
  const doc = read(legacySource)
  expect(doc.layout).toBe('restored')
  expect(doc.patch.modules.map((m) => m.type)).toEqual(['seq', 'osc', 'code', 'code', 'mix', 'out'])
  expect(doc.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toEqual([
    '.scale("g:minor")',
    '.gain(1.4)',
  ])
  expect(generate(doc)).toBe(legacySource)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(doc.patch)
})

it('reprojects externally edited calls and rejects saved CODE text that disagrees with source', () => {
  const changed = read(legacySource.replace('scale("g:minor")', 'scale("c:minor")'))
  expect(changed.layout).toBe('reconciled')
  expect(changed.patch.modules.find((m) => m.type === 'quant')?.values.root).toBe('C')
  const forged = legacySource.replace('"text": ".gain(1.4)"', '"text": ".gain(0)"')
  expect(forged).not.toBe(legacySource)
  expect(read(forged).layout).toBe('invalid')
  expect(generate(read(forged))).toBe(forged)
})

let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/tonal.mjs']
  const loaded: Record<string, unknown>[] = await Promise.all(
    entries.map((entry) => import(/* @vite-ignore */ entry)),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})

function events(source: string): unknown {
  // Repository fixtures only, without browser audio or arbitrary imported code.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${source}).queryArc(0, 2).map(h => ({value:h.value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}))`,
  )(...Object.values(runtime))
}

const envelopes = [
  {
    short: 'att(.02).dec(.3).sus(.6).rel(.2)',
    long: 'attack(.02).decay(.3).sustain(.6).release(.2)',
    prefix: '',
  },
  ...['lp', 'hp', 'bp'].map((prefix) => ({
    short: `${prefix}a(.02).${prefix}d(.3).${prefix}s(.6).${prefix}r(.2)`,
    long: `${prefix}attack(.02).${prefix}decay(.3).${prefix}sustain(.6).${prefix}release(.2)`,
    prefix,
  })),
]

it.each(envelopes)(
  'reads complete $prefix envelope aliases with exact source, identity and events',
  ({ short, long, prefix }) => {
    const start = 'note("c3 e3").s("sine")'
    const before = `${start}${prefix ? `.${prefix}f(800).${prefix}env(4)` : ''}.`
    const after = prefix ? '' : '.gain(.8)'
    const expression = before + short + after
    const source = `$: ${expression}\n`
    const doc = read(source)
    const env = doc.patch.modules.find((m) => m.type === 'env')
    expect(env?.values).toEqual({ atk: 0.02, dec: 0.3, sus: 0.6, rel: 0.2 })
    expect(generate(doc)).toBe(source)
    const saved = saveLayout(doc)
    expect(read(saved.source).layout).toBe('restored')
    expect(read(saved.source).patch).toEqual(saved.patch)
    expect(events(expression)).toEqual(events(before + long + after))
    if (!env) throw new Error('Missing envelope')
    const edited = editDocument(saved, setValue(saved.patch, env.id, 'dec', 0.4))
    const expected = source.replace(
      prefix ? `${prefix}d(.3)` : 'dec(.3)',
      prefix ? `${prefix}d(0.4)` : 'dec(0.4)',
    )
    expect(sourceBody(edited.source)).toBe(expected)
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(events(sourceBody(edited.source).slice(3).trim())).toEqual(
      events((before + long + after).replace('decay(.3)', 'decay(0.4)')),
    )
  },
)

it('reads lowercase scale roots after sound selection and gain above unity', () => {
  const expression = 'n("0 2 4").s("supersaw").scale("g:minor").gain(1.4)'
  const source = `$: ${expression}\n`
  const doc = read(source)
  expect(doc.patch.modules.map((m) => m.type)).toEqual(['seq', 'osc', 'quant', 'vca', 'mix', 'out'])
  expect(doc.patch.modules.find((m) => m.type === 'quant')?.values).toEqual({
    root: 'G',
    scale: 'minor',
  })
  expect(doc.patch.modules.find((m) => m.type === 'vca')?.values.level).toBe(1.4)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).layout).toBe('restored')
  expect(read(saved.source).patch).toEqual(saved.patch)
  expect(events(expression)).toEqual(events(expression.replace('g:minor', 'G:minor')))
  const amp = saved.patch.modules.find((m) => m.type === 'vca')
  if (!amp) throw new Error('Missing amplifier')
  const edited = editDocument(saved, setValue(saved.patch, amp.id, 'level', 1.6))
  expect(sourceBody(edited.source)).toBe(source.replace('gain(1.4)', 'gain(1.6)'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  expect(events(sourceBody(edited.source).slice(3).trim())).toEqual(
    events(expression.replace('gain(1.4)', 'gain(1.6)')),
  )
})

it.each(['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'])(
  'reads supported lowercase root %s before OSC without reordering',
  (root) => {
    const source = `$: n("0 2").scale("${root}:dorian").s("sine")\n`
    const doc = read(source)
    expect(doc.patch.modules.map((m) => m.type)).toEqual(['seq', 'quant', 'osc', 'mix', 'out'])
    expect(generate(doc)).toBe(source)
    expect(events(source.slice(3).trim())).toEqual(
      events(
        source
          .slice(3)
          .trim()
          .replace(`${root}:dorian`, `${root.charAt(0).toUpperCase() + root.slice(1)}:dorian`),
      ),
    )
    const saved = saveLayout(doc)
    expect(read(saved.source).patch).toEqual(saved.patch)
  },
)

it.each([
  '.dec(.1)',
  '.att(.1).dec(.2).sus(.5)',
  '.att(foo).dec(.2).sus(.5).rel(.1).gain(.8)',
  '.o(2)',
  '.orbit(2)',
  '.gain(3)',
  '.scale("g:unknown")',
])('keeps unrepresentable or unproven %s in CODE', (suffix) => {
  const source = `$: note("c3").s("sine")${suffix}\n`
  const doc = read(source)
  expect(doc.patch.modules.some((m) => m.type === 'code')).toBe(true)
  expect(generate(doc)).toBe(source)
  const saved = saveLayout(doc)
  expect(read(saved.source).patch).toEqual(saved.patch)
})
