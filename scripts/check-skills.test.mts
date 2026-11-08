import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import lock from '../.agents/skills-lock.json' with { type: 'json' }
import { checkSkills } from './check-skills.mts'

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'synth-skills-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(new URL('../.agents', import.meta.url), join(root, '.agents'), { recursive: true })
  cpSync(new URL('../docs', import.meta.url), join(root, 'docs'), { recursive: true })
  return root
}

await test('the complete installation verifies', (t) => {
  assert.deepEqual(checkSkills(fixture(t)), [])
})

await test('unreviewed skill edits are rejected', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, '.agents/skills/tdd/SKILL.md'), 'changed')
  assert.ok(checkSkills(root).some((error) => error.includes('Content drift')))
})

await test('a removed registered skill dependency is rejected', (t) => {
  const root = fixture(t)
  const manifest = structuredClone(lock)
  manifest.skills = manifest.skills.filter(
    (skill) => skill.name !== 'principle-boundary-discipline',
  )
  rmSync(join(root, '.agents/skills/principle-boundary-discipline'), { recursive: true })
  assert.ok(
    checkSkills(root, manifest).some((error) =>
      error.includes('missing dependency principle-boundary-discipline'),
    ),
  )
})

await test('unregistered support files are rejected', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, '.agents/skills/tdd/unreviewed.sh'), 'exit 0\n')
  assert.ok(checkSkills(root).some((error) => error.includes('Unregistered file')))
})

await test('a missing license is rejected', (t) => {
  const root = fixture(t)
  rmSync(join(root, '.agents/PSTACK-LICENSE'))
  assert.ok(checkSkills(root).some((error) => error.includes('Missing or changed license')))
})

await test('a recorded edit cannot conceal a broken local link', (t) => {
  const root = fixture(t)
  const manifest = structuredClone(lock)
  const file = manifest.skills.find((skill) => skill.name === 'tdd')?.files[0]
  assert.ok(file)
  const path = join(root, file.path)
  writeFileSync(path, `${readFileSync(path, 'utf8')}\n[missing](missing.md)\n`)
  file.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.ok(checkSkills(root, manifest).some((error) => error.includes('Broken local link')))
})

await test('unmodified vendor content must still match upstream', (t) => {
  const root = fixture(t)
  const manifest = structuredClone(lock)
  const file = manifest.skills.find((skill) => skill.name === 'council')?.files[0]
  assert.ok(file)
  const path = join(root, file.path)
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nChanged policy.\n`)
  file.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.ok(checkSkills(root, manifest).some((error) => error.includes('differs from upstream')))
})

await test('a repo-owned skill can change without recorded hashes', (t) => {
  const root = fixture(t)
  const path = join(root, '.agents/skills/orchestrate/SKILL.md')
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nChanged policy.\n`)
  assert.deepEqual(checkSkills(root), [])
})

await test('a repo-owned skill still needs working links and its identity', (t) => {
  const root = fixture(t)
  const path = join(root, '.agents/skills/orchestrate/SKILL.md')
  const text = readFileSync(path, 'utf8')
  writeFileSync(path, `${text.replace('name: orchestrate', 'name: other')}\n[gone](gone.md)\n`)
  const errors = checkSkills(root)
  assert.ok(errors.some((error) => error.includes('Broken local link')))
  assert.ok(errors.some((error) => error.includes('Invalid skill identity')))
})

await test('a repo-owned skill must declare dependencies that exist', (t) => {
  const manifest = structuredClone(lock)
  const skill = manifest.repoSkills.find((skill) => skill.name === 'orchestrate')
  assert.ok(skill)
  skill.dependencies.push('missing-skill')
  assert.ok(
    checkSkills(fixture(t), manifest).some((error) =>
      error.includes('orchestrate: missing dependency missing-skill'),
    ),
  )
})

await test('a repo-owned skill registers its support files', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, '.agents/skills/orchestrate/unreviewed.sh'), 'exit 0\n')
  assert.ok(checkSkills(root).some((error) => error.includes('Unregistered file')))
})

await test('a repo-owned skill cannot reuse a vendored name', (t) => {
  const manifest = structuredClone(lock)
  const skill = manifest.repoSkills[0]
  assert.ok(skill)
  skill.name = 'tdd'
  assert.ok(checkSkills(fixture(t), manifest).some((error) => error === 'Duplicate skill name'))
})

await test(
  'executable helpers retain executable mode',
  { skip: process.platform === 'win32' },
  (t) => {
    const root = fixture(t)
    chmodSync(join(root, '.agents/skills/babysit-pr/scripts/pr-wait'), 0o644)
    assert.ok(checkSkills(root).some((error) => error.includes('Executable mode drift')))
  },
)
