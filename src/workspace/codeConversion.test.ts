import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { setValue, starterPatch } from '../rack/model'
import legacy from '../reader/fixtures/pre-77-aliases.strudel?raw'
import { codeConversions } from './codeConversion'
import { editDocument, fromPatch, sourceBody } from './document'

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
  // Repository-owned fixtures only; this does not execute arbitrary imported files.
  const body = sourceBody(source)
  const scope = parseSource(body).scopes.find((item) => item.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  const expression = body.slice(scope.start, scope.end)
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0, 2).map(h => ({value:h.value,begin:h.whole.begin.toString(),end:h.whole.end.toString()}))`,
  )(...Object.values(runtime))
}

it('offers individual legacy CODE conversions without changing source, events or other owners', () => {
  const document = read(legacy)
  const offers = codeConversions(document)
  expect(offers.map(({ module, type }) => [module, type])).toEqual([
    ['code1', 'quant'],
    ['code2', 'vca'],
  ])
  for (const offer of offers) {
    const converted = offer.document
    expect(sourceBody(converted.source)).toBe(sourceBody(legacy))
    expect(generate(converted)).toBe(converted.source)
    expect(events(converted.source)).toEqual(events(legacy))
    expect(read(converted.source).layout).toBe('restored')
    expect(read(converted.source).patch).toEqual(converted.patch)
    expect(converted.patch.modules.filter((module) => module.type === 'code')).toHaveLength(1)
    for (const module of document.patch.modules.filter((module) => module.id !== offer.module))
      expect(converted.patch.modules.find((item) => item.id === module.id)).toEqual(module)
    expect(codeConversions(document).map((item) => item.type)).toEqual(['quant', 'vca'])
  }
  const first = offers[0]?.document
  if (!first) throw new Error('Missing QUANT offer')
  const second = codeConversions(first)[0]?.document
  if (!second) throw new Error('Missing VCA offer')
  expect(second.patch.modules.some((module) => module.type === 'code')).toBe(false)
  expect(sourceBody(second.source)).toBe(sourceBody(legacy))
  const amp = second.patch.modules.find((module) => module.type === 'vca')
  if (!amp) throw new Error('Missing VCA')
  const edited = editDocument(second, setValue(second.patch, amp.id, 'level', 1.6))
  expect(sourceBody(edited.source)).toBe(sourceBody(legacy).replace('gain(1.4)', 'gain(1.6)'))
})

function savedCode(text: string) {
  const patch = starterPatch()
  patch.modules.unshift(
    { id: 'seq1', type: 'seq', row: 1, hp: 0, look: 'instrument', values: {} },
    { id: 'osc1', type: 'osc', row: 1, hp: 16, look: 'instrument', values: {} },
    { id: 'code1', type: 'code', row: 1, hp: 24, look: 'bare', values: { text } },
    { id: 'vcf1', type: 'vcf', row: 2, hp: 0, look: 'learner', values: { cutoff: 900 } },
  )
  patch.cables.push(
    { id: 'c2', from: { module: 'seq1', jack: 'note' }, to: { module: 'osc1', jack: 'note' } },
    { id: 'c3', from: { module: 'osc1', jack: 'out' }, to: { module: 'code1', jack: 'in' } },
    { id: 'c4', from: { module: 'code1', jack: 'out' }, to: { module: 'mix1', jack: 'in1' } },
  )
  patch.rows = 4
  return fromPatch(patch)
}

it.each([
  ['.iter(4)', 'iter'],
  ['.gain(1.4)', 'vca'],
  ['.scale("g:minor")', 'quant'],
  ['.delay(0.4).delaytime(0.375).delayfeedback(0.5)', 'delay'],
])('converts a saved %s block while keeping disconnected state and saved rails', (text, type) => {
  const document = savedCode(text)
  const offer = codeConversions(document)[0]
  expect(offer?.type).toBe(type)
  if (!offer) throw new Error('Missing conversion')
  expect(sourceBody(offer.document.source)).toBe(sourceBody(document.source))
  expect(events(offer.document.source)).toEqual(events(document.source))
  expect(offer.document.patch.rows).toBe(4)
  expect(offer.document.patch.modules.find((module) => module.id === 'vcf1')).toEqual(
    document.patch.modules.find((module) => module.id === 'vcf1'),
  )
  expect(read(offer.document.source).patch).toEqual(offer.document.patch)
})

it.each(['.dec(.1)', '.o(2)', '.gain(3)', '.chunk(4, x => x.hurry(2))', '.gain(.8).iter(4)'])(
  'leaves incomplete, unsupported and multiple-module %s blocks alone',
  (text) => {
    const document = savedCode(text)
    expect(codeConversions(document)).toEqual([])
    expect(generate(document)).toBe(document.source)
  },
)

it('does not offer conversions from stale graphs or invalid metadata', () => {
  const document = read(legacy)
  const module = document.patch.modules[0]
  if (!module) throw new Error('Missing SEQ')
  module.values.steps = '1'
  expect(codeConversions(document)).toEqual([])
  expect(codeConversions({ ...read(legacy), layout: 'invalid' })).toEqual([])
})

it('preserves comment and CRLF bytes through an explicit conversion', () => {
  const source = legacy
    .replace('$: ', '// keep 🐒\r\n$: ')
    .replace('.scale(', ' /* scale */ .scale(')
  const document = read(source)
  const offer = codeConversions(document)[0]
  expect(offer?.type).toBe('quant')
  expect(offer && sourceBody(offer.document.source)).toBe(sourceBody(source))
})

it('keeps generated routing proven after lowercase-scale conversion without trusting an altered orbit', () => {
  const offer = codeConversions(savedCode('.scale("g:minor")'))[0]
  if (!offer) throw new Error('Missing conversion')
  expect(offer.document.patch.modules.some((module) => module.type === 'code')).toBe(false)
  const forged = offer.document.source.replaceAll('.orbit(1)', '.orbit(2)')
  expect(forged).not.toBe(offer.document.source)
  expect(read(forged).layout).toBe('invalid')
})
