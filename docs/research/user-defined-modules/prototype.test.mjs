import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discover, editArgument, reopen } from './prototype.mjs'

const fixture = readFileSync('src/library/patches/switch-angel-trance-demo.strudel', 'utf8')
const forwarding = `register('forward247', (amount, pat) => { return pat.gain(amount) })\n$: s("sine").forward247(0.4)\n$: s("sine").forward247(0.8)\n`

await test('exact Switch Angel block bodies, all used helpers and independent call arguments', () => {
  const found = discover(fixture)
  assert.deepEqual(
    found.definitions.map((d) => d.name),
    ['rlpf', 'rhpf', 'o', 'trancegate'],
  )
  assert.equal(found.calls.length, 7)
  assert.ok(found.calls.every((c) => c.status === 'candidate'))
  assert.ok(found.definitions.find((d) => d.name === 'trancegate').body.includes('console.log(x);'))
  assert.equal(
    found.definitions.find((d) => d.name === 'rlpf').body,
    '{ return pat.lpf(pure(x).mul(12).pow(4)) }',
  )
  assert.equal(found.calls.filter((c) => c.name === 'rhpf').length, 0)
  assert.deepEqual(
    found.calls.filter((c) => c.name === 'trancegate').map((c) => c.arguments.map((a) => a.source)),
    [
      ['1.5', '45', '2'],
      ['1.5', '45', '2'],
    ],
  )
  assert.deepEqual(reopen(JSON.stringify(found)), found)
  const call = found.calls.find((c) => c.name === 'rlpf')
  const edited = editArgument(fixture, found, call.id, 0, '1.25', 'number')
  assert.equal(edited.source, fixture.replace('rlpf(0.539)', 'rlpf(1.25)'))
  assert.deepEqual(edited.definitions, found.definitions)
  assert.deepEqual(
    edited.calls.filter((c) => c.name === 'o').map((c) => c.source),
    ['\n  .o(2)', '\n  .o(3)', '.o(4)'],
  )
})

await test('discovery never executes setup or block bodies; no safety claim from candidate status', () => {
  globalThis.research247Executed = 0
  const source = `globalThis.research247Executed++;\nregister('side247', (x, p) => { globalThis.research247Executed++; return p.gain(x) })\n$: s('sine').side247(1)`
  assert.equal(discover(source).calls[0].status, 'candidate')
  assert.equal(globalThis.research247Executed, 0)
  delete globalThis.research247Executed
})

await test('explicit edits preserve every byte except one argument and never clamp or scalarize expressions', () => {
  const found = discover(forwarding)
  assert.equal(found.calls[0].definition, found.calls[1].definition)
  const edited = editArgument(forwarding, found, found.calls[0].id, 0, '9', 'number')
  assert.equal(edited.source, forwarding.replace('forward247(0.4)', 'forward247(9)'))
  for (const input of ['sine.range(0, 2)', 'base * 2', '"<0.2 0.8>"']) {
    const source = forwarding.replace('forward247(0.4)', `forward247(${input})`)
    const snapshot = discover(source)
    assert.equal(snapshot.calls[0].arguments[0].source, input)
    assert.throws(() => editArgument(source, snapshot, snapshot.calls[0].id, 0, '0.5', 'number'))
    assert.deepEqual(reopen(JSON.stringify(snapshot)), snapshot)
  }
  assert.throws(() => editArgument(forwarding, found, found.calls[0].id, 0, '1, 2'))
  assert.throws(() => editArgument(forwarding, found, found.calls[0].id, 0, '1) /*'))
  for (const escape of ['1)?.(2', '0.5)?.hpf(9000', '1) + (2'])
    assert.throws(() => editArgument(forwarding, found, found.calls[0].id, 0, escape))
})

await test('duplicate definitions, defaults, aliases, options and nested/shadowed registrations stay unresolved', () => {
  const duplicate = discover(forwarding + "register('forward247', (x,p) => p.pan(x))")
  assert.ok(duplicate.calls.every((c) => c.reason === 'duplicate definition'))
  for (const definition of [
    "register(['forward247','alias247'], (x,p) => p.gain(x))",
    "register('forward247', (x = 1,p) => p.gain(x))",
    "register('forward247', async (x,p) => p.gain(x))",
    "register('forward247', (x,p) => p.gain(x), false)",
    "function setup247() { register('other247', (x,p) => p.gain(x)) }",
    'const register = ignored;',
  ]) {
    const found = discover(forwarding + definition)
    assert.ok(found.calls.every((c) => c.status === 'code'))
  }
})

await test('signature/body/source edits reject stale bindings rather than attaching by name or ordinal', () => {
  const found = discover(forwarding)
  for (const source of [
    forwarding.replace('(amount, pat)', '(amount, seed, pat)'),
    forwarding.replace('pat.gain(amount)', 'pat.pan(amount)'),
    '// moved\n' + forwarding,
  ]) {
    assert.throws(() => editArgument(source, found, found.calls[0].id, 0, '0.6'), /Stale/)
  }
  const forged = structuredClone(found)
  forged.calls[0].arguments[0].start++
  assert.throws(() => reopen(JSON.stringify(forged)), /invalid/)
  forged.calls[0].arguments[0].start = 0
  forged.calls[0].arguments[0].end = 8
  assert.equal(
    editArgument(forwarding, forged, found.calls[0].id, 0, '0.6').source,
    forwarding.replace('forward247(0.4)', 'forward247(0.6)'),
  )
  assert.throws(() => reopen('{"version":2,"source":""}'), /Unsupported/)
})

await test('mutable closure fixture has two calls to one definition, never cloned state', () => {
  const source = `let shared247 = 0;\nregister('shared247helper', (x,p) => { shared247++; return p.gain(shared247 * x) })\n$: s('sine').shared247helper(1)\n$: s('sine').shared247helper(1)`
  const found = discover(source)
  assert.equal(found.calls.length, 2)
  assert.equal(found.calls[0].definition, found.calls[1].definition)
  assert.equal(found.source, source)
  assert.deepEqual(reopen(JSON.stringify(found)), found)
})
