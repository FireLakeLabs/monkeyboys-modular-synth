import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const cli = resolve('scripts/strudel-api-inventory.mjs')
function run(args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result
}

await test('inventory parses names, packed controls, aliases, prototype/class methods and bounded factories without execution', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'strudel-api-scan-'))
  try {
    const fixture = resolve(dir, 'fixture.mjs')
    const sentinel = resolve(dir, 'executed')
    writeFileSync(
      fixture,
      `
      import {writeFileSync} from 'node:fs';
      writeFileSync(${JSON.stringify(sentinel)}, 'unsafe');
      // register('commentIsNotAPI', f)
      const text = "register('stringIsNotAPI', f)";
      export const {s,sound} = registerControl(['s','n','gain'],'sound');
      export const times = register(['times','repeat'], f);
      export const fm = registerMultiControl(['fmi','fmh'], 2, 'fm');
      export class Pattern { queryArc() {} static factory() {} }
      Pattern.prototype.extra = function() {};
      for(let i=0;i<=1;i++) for(let j=0;j<=1;j++) registerControl(\`fmi\${i}\${j}\`,\`fm\${i}\${j}\`);
      register(computed(), f);
    `,
    )
    const result: unknown = JSON.parse(run(['--scan', fixture]).stdout)
    assert.ok(
      result &&
        typeof result === 'object' &&
        'registrations' in result &&
        Array.isArray(result.registrations),
    )
    const registrations: unknown[] = result.registrations
    const sound = registrations.find(
      (r) => r && typeof r === 'object' && 'canonical' in r && r.canonical === 's',
    )
    assert.ok(sound && typeof sound === 'object' && 'names' in sound && 'fields' in sound)
    assert.deepEqual(sound.names, ['s', 'sound'])
    assert.deepEqual(sound.fields, ['s', 'n', 'gain'])
    const encoded = JSON.stringify(registrations)
    assert.doesNotMatch(encoded, /commentIsNotAPI|stringIsNotAPI/)
    assert.match(encoded, /fmi11/)
    assert.match(encoded, /fm2/)
    assert.ok('methods' in result && Array.isArray(result.methods))
    assert.match(JSON.stringify(result.methods), /queryArc/)
    assert.match(JSON.stringify(result.methods), /extra/)
    assert.ok('unresolved' in result && Array.isArray(result.unresolved))
    assert.match(JSON.stringify(result.unresolved), /computed registration/)
    assert.throws(() => readFileSync(sentinel), { code: 'ENOENT' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await test('inventory reproduces byte-identical evidence with real reader observations and separate wild provenance', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'strudel-api-report-'))
  try {
    const first = resolve(dir, 'first.json'),
      second = resolve(dir, 'second.json')
    run(['--output', first])
    run(['--output', second])
    assert.equal(readFileSync(first, 'utf8'), readFileSync(second, 'utf8'))
    const report: unknown = JSON.parse(readFileSync(first, 'utf8'))
    assert.ok(report && typeof report === 'object' && 'version' in report)
    assert.equal(report.version, 1)
    assert.ok('examples' in report && Array.isArray(report.examples))
    const examples: unknown[] = report.examples
    const get = (id: string): Record<string, unknown> => {
      const example: unknown = examples.find(
        (e: unknown) => e && typeof e === 'object' && 'id' in e && e.id === id,
      )
      assert.ok(example && typeof example === 'object')
      return Object.fromEntries(Object.entries(example))
    }
    assert.deepEqual(get('filter-alias').code, [])
    assert.deepEqual(get('filter-range').code, ['.resonance(51)'])
    assert.equal(get('filter-range').exactSource, true)
    assert.equal(get('filter-range').savedIdentity, true)
    assert.ok('families' in report && Array.isArray(report.families))
    const families: unknown[] = report.families
    const ids = families.map((f) => (f && typeof f === 'object' && 'id' in f ? f.id : null))
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.includes('api:fmi88'))
    assert.ok(ids.includes('api:register'))
    assert.ok('corpus' in report && Array.isArray(report.corpus))
    assert.equal(report.corpus.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
