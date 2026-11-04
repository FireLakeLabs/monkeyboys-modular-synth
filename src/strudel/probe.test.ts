import { beforeAll, expect, it, vi } from 'vitest'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { probePlan } from './probePlan'
import { probe } from './engine'
import { generate } from '../codegen/generate'
import { editDocument, saveLayout } from '../workspace/document'
import { setLook, setValue } from '../rack/model'

vi.mock('@strudel/web', async () => {
  const loaded = await Promise.all(
    ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/index.mjs'].map(
      (path) => import(/* @vite-ignore */ path),
    ),
  )
  return Object.assign({}, ...loaded, {
    initAudio: vi.fn(),
    initStrudel: vi.fn(),
    evaluate: vi.fn(),
    hush: vi.fn(),
    samples: vi.fn(),
  })
})
let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = await import('@strudel/web')
})
function cableAfter(source: string, type: string) {
  const document = read(source)
  const module = document.patch.modules.find((m) => m.type === type)
  const cable = document.patch.cables.find((c) => c.from.module === module?.id)
  if (!cable) throw new Error(`No cable after ${type}`)
  return { document, cable: cable.id }
}

it('queries the events scheduled at the chosen prefix, before downstream time/sound transforms', async () => {
  const source = '$: note("c3 e3 g3 b3").rev().fast(2).s("sine")\n'
  const { document, cable } = cableAfter(source, 'rev')
  const result = await probe(document, cable, 2)
  // Independent scheduler input: this prefix, not the final fast(2) voice.
  // oxlint-disable-next-line typescript/no-implied-eval
  const expected: unknown = new Function(
    ...Object.keys(runtime),
    `return note("c3 e3 g3 b3").rev().queryArc(2,6).filter(h=>h.hasOnset()).map(h=>({begin:Number(h.whole.begin),end:Number(h.whole.end),value:h.value}))`,
  )(...Object.values(runtime))
  expect(result).toEqual({ kind: 'events', begin: 2, end: 6, events: expected })
  if (result.kind !== 'events') throw new Error('No events')
  expect(result.events).toHaveLength(16)
  expect([...result.events].sort((a, b) => a.begin - b.begin).slice(0, 2)).toEqual([
    { begin: 2, end: 2.25, value: { note: 'b3' } },
    { begin: 2.25, end: 2.5, value: { note: 'g3' } },
  ])
  expect(runtime['evaluate']).not.toHaveBeenCalled()
  expect(runtime['initAudio']).not.toHaveBeenCalled()
  expect(runtime['initStrudel']).not.toHaveBeenCalled()
})

it.each([
  '$: note("c3 e3").custom(() => {globalThis.probeExecuted = true}).rev().s("sine")',
  '$: note("c3 e3").off(.25, x => x.custom(() => {globalThis.probeExecuted = true})).rev().s("sine")',
  'globalThis.probeExecuted = true;\n$: note("c3 e3").rev().s("sine")',
  'samples(() => {globalThis.probeExecuted = true});\n$: note("c3 e3").rev().s("sine")',
  'samples("https://example.com/strudel.json");\n$: note("c3 e3").rev().s("sine")',
  'const helper = (() => {globalThis.probeExecuted = true; return 1})();\n$: note("c3 e3").rev().s("sine")',
])('never evaluates CODE or opaque setup: %s', async (source) => {
  const { document, cable } = cableAfter(source, 'rev')
  expect(await probe(document, cable)).toMatchObject({ kind: 'unavailable' })
  expect('probeExecuted' in globalThis).toBe(false)
  expect(generate(document)).toBe(source)
})

it('permits a prefix before downstream CODE and expands shared declarations without executing their suffixes', async () => {
  const source =
    'const melody = note("c3 e3").rev();\n$: melody.custom(() => {globalThis.probeExecuted = true}).s("sine");\n$: melody.s("triangle");'
  const { document, cable } = cableAfter(source, 'rev')
  const result = await probe(document, cable)
  expect(result.kind).toBe('events')
  if (result.kind === 'events') expect(result.events).toHaveLength(8)
  expect('probeExecuted' in globalThis).toBe(false)
})

it('refuses stale/invalid graphs and nonpattern taps without evaluating', () => {
  const { document, cable } = cableAfter('$: note("c3").s("sine").gain(.2)', 'osc')
  expect(probePlan(document, cable)).toMatchObject({ kind: 'unavailable' })
  expect(probePlan({ ...document, patchRevision: 'stale' }, cable)).toMatchObject({
    kind: 'unavailable',
  })
})

it('SCOPE independently retains exact imported source, saved rack identity and analyser event values', async () => {
  const source = '// @title Scope test\r\n$: note("c3 e3").s("sine").analyze(3) // tap\r\n'
  let document = saveLayout(read(source))
  const scope = document.patch.modules.find((m) => m.type === 'scope')
  if (!scope) throw new Error('Missing SCOPE')
  expect(generate(read(source))).toBe(source)
  document = editDocument(document, setLook(document.patch, scope.id, 'vintage'))
  document = editDocument(document, setValue(document.patch, scope.id, 'mode', 'spectrum'))
  expect(read(document.source).patch).toEqual(document.patch)
  expect(document.source.startsWith(source)).toBe(true)
  document = editDocument(document, setValue(document.patch, scope.id, 'id', 5))
  expect(document.source.startsWith(source.replace('analyze(3)', 'analyze(5)'))).toBe(true)
  expect(read(document.source).patch).toEqual(document.patch)
  function eventValues(source: string): unknown {
    const voice = parseSource(source).scopes.find((s) => s.kind === 'voice')
    if (!voice) throw new Error('No voice')
    // oxlint-disable-next-line typescript/no-implied-eval
    return new Function(
      ...Object.keys(runtime),
      `return (${source.slice(voice.start, voice.end)}).queryArc(0,1).map(h=>{const {orbit,...value}=h.value;return value})`,
    )(...Object.values(runtime))
  }
  const values = eventValues(document.source)
  expect(eventValues(generate(document.patch))).toEqual(values)
  expect(values).toEqual([
    { note: 'c3', s: 'sine', analyze: 5 },
    { note: 'e3', s: 'sine', analyze: 5 },
  ])
})

it('queries the accepted BPM without relying on a running engine', () => {
  const { document, cable } = cableAfter('setcpm(60/4)\n$: note("c3 e3").rev().s("sine")', 'rev')
  expect(probePlan(document, cable)).toMatchObject({ kind: 'readable', cps: 0.25 })
})

it('retains a previously saved explicit CODE analyser owner exactly', () => {
  const document = read('$: note("c3").s("sine").analyze(3)')
  const legacy = {
    ...document.patch,
    modules: document.patch.modules.map((module) =>
      module.type === 'scope'
        ? { ...module, type: 'code', look: 'terminal' as const, values: { text: '.analyze(3)' } }
        : module,
    ),
  }
  const source = generate(legacy)
  const reopened = read(source)
  expect(reopened.layout).toBe('restored')
  expect(reopened.patch).toEqual(legacy)
  expect(generate(reopened)).toBe(source)
})

it('matches a fractional imported SEQ rate at a distant cycle without precision drift', async () => {
  const { document, cable } = cableAfter('$: note("c3 e3").fast(2/3).rev().s("sine")', 'rev')
  const result = await probe(document, cable, 1000)
  // Independent source prefix, evaluated only as this repository-owned fixture.
  // oxlint-disable-next-line typescript/no-implied-eval
  const expected: unknown = new Function(
    ...Object.keys(runtime),
    'return note("c3 e3").fast(2/3).rev().queryArc(1000,1004).filter(h=>h.hasOnset()).map(h=>({begin:Number(h.whole.begin),end:Number(h.whole.end),value:h.value}))',
  )(...Object.values(runtime))
  expect(result).toEqual({ kind: 'events', begin: 1000, end: 1004, events: expected })
})

it('queries readable prefixes with proven cartridge setup without executing sample registration', async () => {
  const { seatPack } = await import('../workspace/cartridges')
  const { document, cable } = cableAfter('$: note("c3 e3").rev().s("sine")', 'rev')
  const seated = seatPack(document, { source: 'github:someone/drums/dev' })
  const result = await probe(seated, cable)
  expect(result.kind).toBe('events')
  if (result.kind === 'events') expect(result.events).toHaveLength(8)
  expect(runtime['samples']).not.toHaveBeenCalled()
  expect(runtime['evaluate']).not.toHaveBeenCalled()
  expect(runtime['initAudio']).not.toHaveBeenCalled()
})

it.each(['gates', 'switch'] as const)(
  'probes the readable %s multi-input prefix before its sound selector',
  async (kind) => {
    const { routingFixture } = await import('../testing/routingCases')
    const document = read(generate(routingFixture(kind)))
    const type = kind === 'gates' ? 'seq' : 'switch'
    const module = document.patch.modules.find((m) => m.type === type)
    const cable = document.patch.cables.find((c) => c.from.module === module?.id)
    if (!cable) throw new Error('Missing routing prefix')
    const result = await probe(document, cable.id)
    expect(result.kind).toBe('events')
    if (result.kind !== 'events') throw new Error('No routing events')
    if (kind === 'gates') {
      expect(result.events).toHaveLength(20)
      const first = result.events
        .filter((event) => event.begin < 1)
        .sort((a, b) => a.begin - b.begin)
      expect(first.map((event) => event.begin)).toEqual([0, 0.25, 0.375, 0.625, 0.875])
      expect(first.map((event) => event.value)).toEqual([
        { note: 'c2' },
        { note: 'c2' },
        { note: 'eb2' },
        { note: 'eb2' },
        { note: 'g2' },
      ])
    } else {
      expect(result.events.map((event) => event.value)).toEqual([
        { note: 'c3' },
        { note: 'c3' },
        { note: 'd3' },
        { note: 'e3' },
      ])
    }
  },
)
