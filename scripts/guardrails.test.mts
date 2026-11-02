import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkRuntime } from './check-runtime.mts'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

function fixture(t: TestContext, project = 'tsconfig.app.json') {
  const root = mkdtempSync(join(tmpdir(), 'synth-guardrails-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'src/modules'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'junction')
  cpSync(join(repoRoot, '.oxlintrc.json'), join(root, '.oxlintrc.json'))
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      extends: join(repoRoot, project),
      compilerOptions: { tsBuildInfoFile: join(root, 'build.tsbuildinfo') },
      include: ['src'],
    }),
  )
  return root
}

function run(root: string, tool: 'typescript' | 'oxlint', args: string[]) {
  const binary = tool === 'typescript' ? 'tsc' : 'oxlint'
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, `node_modules/${tool}/bin/${binary}`), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    },
  )
  assert.ifError(result.error)
  assert.equal(result.signal, null, `${binary} terminated by signal`)
  return { status: result.status, output: result.stdout + result.stderr }
}

await test('runtime accepts the pinned version and rejects a different one', () => {
  const expected = readFileSync(join(repoRoot, '.node-version'), 'utf8').trim()
  assert.equal(checkRuntime(expected), undefined)
  // Intentionally unsupported input: this proves the runtime gate rejects it.
  const unsupportedNodeVersion = '22.0.0'
  assert.match(checkRuntime(unsupportedNodeVersion) ?? '', /Use Node/)
})

for (const project of ['tsconfig.app.json', 'tsconfig.node.json']) {
  await test(`${project} rejects unsafe states and accepts corrected counterparts`, (t) => {
    const root = fixture(t, project)
    const source = join(root, 'src/probe.ts')
    writeFileSync(
      source,
      `
export const required: string = undefined
export const indexed: string = ([] as string[])[0]
export const optional: { value?: string } = { value: undefined }
export function incomplete(flag: boolean) { if (flag) return 1 }
`,
    )
    const rejected = run(root, 'typescript', ['--project', 'tsconfig.json'])
    assert.notEqual(rejected.status, 0, rejected.output)
    for (const code of ['TS2322', 'TS2375', 'TS7030'])
      assert.ok(rejected.output.includes(code), rejected.output)
    assert.match(rejected.output, /probe.ts\(3,/, rejected.output)
    writeFileSync(
      source,
      `
export const required: string = 'present'
export const indexed: string | undefined = ([] as string[])[0]
export const optional: { value?: string } = {}
export function complete(flag: boolean) { return flag ? 1 : 0 }
`,
    )
    const accepted = run(root, 'typescript', ['--project', 'tsconfig.json'])
    assert.equal(accepted.status, 0, accepted.output)
  })
}

await test('lint rejects unchecked values, floating promises, invalid hooks, and inaccessible JSX', (t) => {
  const root = fixture(t)
  const source = join(root, 'src/Probe.tsx')
  writeFileSync(
    source,
    `
import { useEffect } from 'react'
export const unsafe: any = 1
const root = document.getElementById('root')!
Promise.resolve(1)
void Promise.resolve(2)
export function Probe({ value }: { value: string }) {
  useEffect(() => { document.title = value }, [])
  return <img data-mounted={root !== null} src="photo.png" />
}
`,
  )
  const args = ['--config', '.oxlintrc.json', '--no-ignore', '--deny-warnings', 'src']
  const rejected = run(root, 'oxlint', args)
  assert.notEqual(rejected.status, 0, rejected.output)
  for (const rule of [
    'no-explicit-any',
    'no-non-null-assertion',
    'no-floating-promises',
    'exhaustive-deps',
    'alt-text',
  ]) {
    assert.ok(rejected.output.includes(rule), rejected.output)
  }
  assert.equal((rejected.output.match(/no-floating-promises/g) ?? []).length, 2, rejected.output)
  writeFileSync(
    source,
    `
import { useEffect } from 'react'
export const safe: number = 1
const root = document.getElementById('root')
Promise.resolve(1).catch((error: unknown) => { console.error(error) })
export function Probe({ value }: { value: string }) {
  useEffect(() => { document.title = value }, [value])
  return <img data-mounted={root !== null} src="photo.png" alt="Synthesizer" />
}
`,
  )
  const accepted = run(root, 'oxlint', args)
  assert.equal(accepted.status, 0, accepted.output)
})

await test('domain modules cannot import the React framework', (t) => {
  const root = fixture(t)
  const source = join(root, 'src/modules/probe.ts')
  writeFileSync(source, "import { useState } from 'react'\nexport const hook = useState\n")
  const args = ['--config', '.oxlintrc.json', '--no-ignore', '--deny-warnings', 'src']
  const rejected = run(root, 'oxlint', args)
  assert.notEqual(rejected.status, 0, rejected.output)
  assert.ok(rejected.output.includes('no-restricted-imports'), rejected.output)
  writeFileSync(source, 'export const value = 1\n')
  const accepted = run(root, 'oxlint', args)
  assert.equal(accepted.status, 0, accepted.output)
})

await test('adapted TypeScript examples compile with project strictness', (t) => {
  const root = fixture(t)
  const markdown = readFileSync(
    join(repoRoot, '.agents/skills/typescript-best-practices/references/patterns.md'),
    'utf8',
  )
  const examples = Array.from(markdown.matchAll(/```ts\n([\s\S]*?)\n```/g), (match) => match[1])
  assert.ok(examples.length > 0)
  writeFileSync(join(root, 'src/examples.ts'), examples.join('\n\n'))
  const result = run(root, 'typescript', ['--project', 'tsconfig.json'])
  assert.equal(result.status, 0, result.output)
})
