import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  editNumber,
  readSource,
  restoreIds,
  type Document,
  type SavedVoice,
} from './source-spike.mts'

function read(source: string): Document {
  const result = readSource(source)
  assert.equal(result.kind, 'parsed')
  if (result.kind !== 'parsed') throw new Error('Invalid fixture')
  return result.document
}
function save(source: string): SavedVoice[] {
  return read(source).voices.map((voice, v) => ({
    voice,
    ids: voice.calls.filter((call) => call.name !== 'orbit').map((_, c) => `v${v}m${c}`),
  }))
}

const fixtures = [
  'setcpm(120/4)\n$: note("c2 eb2 g2")\n  .s("sawtooth")\n  .lpf(800)\n  .delay(.4)\n',
  'const lead = note(\'c2 eb2 g2\').s("sawtooth")\n$: lead.delay(.4)\n$: lead.jux(rev)\n',
  '$: note("c e g").lpf(sine.range(800, 2400).slow(4))\n',
  '$: s("bd hh").jux(rev) /* unknown */ .chunk(4, x => x.hurry(2))\n',
  'stack(note("c").s("sine"), s("bd").gain(.5))\n',
  '// 🐒 untouched\r\n$: note(`c e`).lpf(/* cutoff */ 800 /* Hz */) // tail\r\n',
  'const helper = x => x.hurry(2);\n$: helper(note("c"))\n// ── @monkeyboy rack v1 ──\n// arbitrary saved metadata\n',
]
for (const [index, source] of fixtures.entries()) {
  await test(`untouched translation fixture ${index + 1} returns exact source`, () => {
    assert.equal(read(source).source, source)
  })
}

await test('rack edit changes only the numeric token, retaining CRLF, comments, quotes, CODE and layout', () => {
  const source =
    "// 🐒\r\n$: note('c e').lpf(/* cutoff */ 800 /* Hz */).chunk(4, x => x.hurry(2))\r\n// ── @monkeyboy rack v1 ──\r\n"
  const result = editNumber(read(source), source, 0, 1, 1200)
  assert.equal(result.kind, 'parsed')
  if (result.kind !== 'parsed') return
  assert.equal(result.document.source, source.replace('800', '1200'))
  const again = editNumber(result.document, result.document.source, 0, 1, -20)
  assert.equal(again.kind, 'parsed')
  if (again.kind === 'parsed') assert.equal(again.document.source, source.replace('800', '-20'))
})

await test('AST ranges expose exact unknown call text, without treating its callback as outer modules', () => {
  const document = read(fixtures[3] ?? '')
  const calls = document.voices[0]?.calls ?? []
  assert.deepEqual(
    calls.map((call) => call.name),
    ['s', 'jux', 'chunk'],
  )
  const call = calls[2]
  assert.ok(call)
  assert.equal(
    document.source.slice(call.span.start, call.span.end),
    ' /* unknown */ .chunk(4, x => x.hurry(2))',
  )
})

await test('stale source and nonliteral controls cannot be overwritten', () => {
  const source = '$: note("c").lpf(sine.range(800, 2400))'
  const document = read(source)
  assert.throws(() => editNumber(document, `${source} `, 0, 1, 1200), /Stale/)
  assert.throws(() => editNumber(document, source, 0, 1, 1200), /literal/)
})

await test('half-typed code returns original draft and Acorn UTF-16 diagnostic, no partial document', () => {
  const source = '// 🐒\r\n$: note("c").lpf('
  assert.deepEqual(readSource(source), {
    kind: 'invalid',
    source,
    offset: source.length,
    line: 2,
    column: 17,
  })
  const inline = '// 🐒\n$: note("c").lpf(😀)'
  const result = readSource(inline)
  assert.equal(result.kind, 'invalid')
  if (result.kind === 'invalid') assert.equal(result.offset, inline.indexOf('😀'))
})

await test('inserting/deleting a call does not shift later module IDs', () => {
  const original = '$: note("c").s("sawtooth").lpf(800).delay(.4)'
  const saved = save(original)
  assert.deepEqual(restoreIds(saved, read(original.replace('.lpf', '.gain(.5).lpf')).voices), [
    ['v0m0', 'v0m1', undefined, 'v0m2', 'v0m3'],
  ])
  assert.deepEqual(restoreIds(saved, read(original.replace('.lpf(800)', '')).voices), [
    ['v0m0', 'v0m1', 'v0m3'],
  ])
})

await test('formatting and a unique control edit keep IDs on a named chain', () => {
  assert.deepEqual(
    restoreIds(
      save('const lead = note("c").lpf(800)'),
      read("const lead=note('c') /* hi */ .lpf(1200)").voices,
    ),
    [['v0m0', 'v0m1']],
  )
})

await test('voice reordering follows unique roots, never anonymous voice ordinals', () => {
  const a = '$: note("c").lpf(800)'
  const b = '$: s("bd").gain(.5)'
  assert.deepEqual(restoreIds(save(`${a}\n${b}`), read(`${b}\n${a}`).voices), [
    ['v1m0', 'v1m1'],
    ['v0m0', 'v0m1'],
  ])
})

await test('ambiguous repeated calls/voices reset instead of stealing layout', () => {
  const source = 'const lead=note("c").lpf(800).lpf(800).delay(.4)'
  assert.deepEqual(
    restoreIds(save(source), read(source.replace('.delay', '.gain(.5).delay')).voices),
    [['v0m0', undefined, undefined, undefined, 'v0m3']],
  )
  const voice = '$: note("c").lpf(800)'
  assert.deepEqual(restoreIds(save(`${voice}\n${voice}`), read(`${voice}\n${voice}`).voices), [
    [undefined, undefined],
    [undefined, undefined],
  ])
})

await test('unchanged repeated chain and distinct repeated calls restore safely', () => {
  const source = 'const lead=note("c").lpf(800).lpf(1200)'
  assert.deepEqual(restoreIds(save(source), read(`${source}.gain(.5)`).voices), [
    ['v0m0', 'v0m1', 'v0m2', undefined],
  ])
  const repeated = source.replace('1200', '800')
  assert.deepEqual(restoreIds(save(repeated), read(repeated).voices), [['v0m0', 'v0m1', 'v0m2']])
})

await test('final voice orbit calls do not consume module IDs or alter shared const identity', () => {
  const source = 'const lead=note("c").s("sine")\n$: lead.delay(.4)\n$: lead.gain(.5)'
  const next = source
    .replace('lead.delay(.4)', 'lead.delay(.4).orbit(1)')
    .replace('lead.gain(.5)', 'lead.gain(.5).orbit(2)')
  assert.deepEqual(restoreIds(save(source), read(next).voices, true), [
    ['v0m0', 'v0m1'],
    ['v1m0'],
    ['v2m0'],
  ])
  assert.equal(read(next).source, next)
})

await test('spread arguments and arbitrary imported orbit expressions stay untouched', () => {
  const source = '$: s(...samples, 800).orbit(route())'
  const document = read(source)
  assert.throws(() => editNumber(document, source, 0, 0, 1200), /literal/)
  assert.equal(document.source, source)
  const voice = document.voices[0]
  assert.ok(voice)
  assert.deepEqual(restoreIds([{ voice, ids: ['sample', 'code'] }], document.voices), [
    ['sample', 'code'],
  ])
})

await test('restored IDs carry saved rack positions and looks past inserted calls', () => {
  const source = '$: note("c").s("sine").lpf(800)'
  const layout = new Map([
    ['v0m0', { row: 1, hp: 0, look: 'instrument' }],
    ['v0m1', { row: 1, hp: 11, look: 'powder' }],
    ['v0m2', { row: 2, hp: 20, look: 'vintage' }],
  ])
  const ids = restoreIds(save(source), read(source.replace('.lpf', '.gain(.5).lpf')).voices)
  assert.deepEqual(
    ids[0]?.map((id) => (id === undefined ? undefined : layout.get(id))),
    [
      { row: 1, hp: 0, look: 'instrument' },
      { row: 1, hp: 11, look: 'powder' },
      undefined,
      { row: 2, hp: 20, look: 'vintage' },
    ],
  )
})

await test('dollar-prefixed declaration names remain named anchors', () => {
  assert.deepEqual(
    restoreIds(
      save('const $lead=note("c").lpf(800)'),
      read('const $lead=note("d").lpf(1200)').voices,
    ),
    [['v0m0', 'v0m1']],
  )
})

await test('fan-out receiver identity survives control edits but never transfers to another receiver', () => {
  const saved = save('$: lead.delay(.4)')
  assert.deepEqual(restoreIds(saved, read('$: bass.delay(.4)').voices), [[undefined]])
  assert.deepEqual(restoreIds(saved, read('$: lead.delay(.5)').voices), [['v0m0']])
  assert.deepEqual(
    restoreIds(
      save('$: lead.delay(.4)\n$: bass.delay(.4)'),
      read('$: bass.delay(.4)\n$: lead.delay(.4)').voices,
    ),
    [['v1m0'], ['v0m0']],
  )
})

await test('comment-bearing signed literals reject edits instead of losing comments', () => {
  const source = '$: s("bd").gain(- /* keep this */ 0.5)'
  assert.throws(() => editNumber(read(source), source, 0, 1, 0.75), /comment/)
})
