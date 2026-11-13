import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  applicationSources,
  buildRevision,
  generateLicenses,
  packageNotice,
  verifySource,
} from './licenses.mts'

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mms-license-test-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function put(root: string, path: string, text: string) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
  return file
}

await test('notices include shipped packages, embedded worklet credits, patches and complete licence text', () => {
  const notices = generateLicenses(
    [resolve('node_modules/react/index.js'), resolve('node_modules/@strudel/web/dist/index.mjs')],
    'version-under-test',
  )
  assert.match(notices, /Source revision: version-under-test/)
  assert.match(notices, /react@19\.3\.1/)
  assert.match(notices, /@kabelsalat\/core@0\.4\.0/)
  assert.match(notices, /GNU AFFERO GENERAL PUBLIC LICENSE/)
  assert.match(notices, /END OF TERMS AND CONDITIONS/)
  assert.match(notices, /Modified Strudel \/ Superdough/)
  assert.match(notices, /Black Sabbath/)
  assert.doesNotMatch(notices, /aws-cdk-lib@/)
})

await test('missing notices, unaudited embedded bundles and unknown AGPL versions fail closed', () =>
  fixture((root) => {
    const directory = join(root, 'node_modules/example')
    put(
      directory,
      'package.json',
      JSON.stringify({ name: 'example', version: '1', license: 'MIT' }),
    )
    assert.throws(() => packageNotice(directory), /Missing licence text/)
    put(directory, 'LICENSE', 'Fixture copyright and license')
    assert.match(packageNotice(directory), /Fixture copyright/)
    put(
      directory,
      'package.json',
      JSON.stringify({ name: '@strudel/web', version: '1.3.0', license: 'AGPL-3.0-or-later' }),
    )
    put(directory, 'dist/index.mjs', 'unreviewed bundle')
    assert.throws(
      () => generateLicenses([join(directory, 'dist/index.mjs')], 'test'),
      /embedded licence inventory/,
    )
    put(
      directory,
      'package.json',
      JSON.stringify({ name: '@strudel/core', version: '99.0.0', license: 'AGPL-3.0-or-later' }),
    )
    assert.throws(
      () => generateLicenses([join(directory, 'dist/index.mjs')], 'test'),
      /Missing preferred source/,
    )
  }))

await test('source archives reject corrupt or substituted downloads', () => {
  const data = Buffer.from('pinned archive')
  const source = { name: 'example', sha256: createHash('sha256').update(data).digest('hex') }
  assert.doesNotThrow(() => verifySource(data, source))
  assert.throws(() => verifySource(Buffer.from('different archive'), source), /checksum mismatch/)
})

await test('production source links require the actual clean build commit; local edits are labelled', () =>
  fixture((root) => {
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    git('init', '-q')
    put(root, 'README.md', 'fixture')
    git('add', '.')
    git(
      '-c',
      'user.name=License Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture',
    )
    const revision = git('rev-parse', 'HEAD')
    assert.deepEqual(buildRevision({ MMS_RELEASE_ID: 'test', GITHUB_SHA: revision }, root), {
      revision,
      local: false,
    })
    assert.throws(
      () => buildRevision({ MMS_RELEASE_ID: 'test', GITHUB_SHA: '0'.repeat(40) }, root),
      /clean checkout/,
    )
    put(root, 'README.md', 'changed')
    assert.equal(buildRevision({}, root).local, true)
    assert.throws(
      () => buildRevision({ MMS_RELEASE_ID: 'test', GITHUB_SHA: revision }, root),
      /clean checkout/,
    )
  }))

await test('source selection includes new implementation files and excludes credentials, symlinks and reports', () =>
  fixture((root) => {
    execFileSync('git', ['init', '-q'], { cwd: root })
    for (const file of [
      'src/new.ts',
      '.agents/skills-lock.json',
      'scripts/licenses/notice.txt',
      'package-lock.json',
      '.node-version',
      '.env',
      'scripts/.env.private',
      'src/private.key',
      'reports/run.txt',
      'docs/licensing.md',
    ])
      put(root, file, file)
    symlinkSync(join(root, '.env'), join(root, 'src/linked.ts'))
    assert.deepEqual(applicationSources(root), [
      '.agents/skills-lock.json',
      '.node-version',
      'docs/licensing.md',
      'package-lock.json',
      'scripts/licenses/notice.txt',
      'src/new.ts',
    ])
    assert.equal(readFileSync(join(root, '.env'), 'utf8'), '.env')
  }))

await test('extracted source builds retain a labelled revision without Git metadata', () =>
  fixture((root) => {
    const revision = 'a'.repeat(40)
    put(root, 'source-revision.json', JSON.stringify({ revision }))
    assert.deepEqual(buildRevision({}, root), { revision, local: true })
    assert.throws(
      () => buildRevision({ MMS_RELEASE_ID: 'production', GITHUB_SHA: revision }, root),
      /only build as local/,
    )
  }))
