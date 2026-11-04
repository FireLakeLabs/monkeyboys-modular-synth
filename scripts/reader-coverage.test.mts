import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Exercise the actual command/gate in an isolated fixture so proof cannot alter the real baseline.
for (const withPermittedFixture of [false, true]) {
  await test(`reader coverage CLI reports and gates the ${withPermittedFixture ? 'extended' : 'built-in'} corpus`, () => {
    const root = mkdtempSync(resolve(tmpdir(), 'reader-coverage-'))
    try {
      for (const path of ['src', 'corpus/reader', 'scripts/reader-coverage.mjs', 'package.json'])
        cpSync(resolve(path), resolve(root, path), { recursive: true })
      symlinkSync(resolve('node_modules'), resolve(root, 'node_modules'), 'dir')
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ['scripts/reader-coverage.mjs', ...args], {
          cwd: root,
          encoding: 'utf8',
        })
      if (withPermittedFixture) {
        mkdirSync(resolve(root, 'corpus/reader/patches'), { recursive: true })
        writeFileSync(resolve(root, 'corpus/reader/patches/permitted.strudel'), '$: s("hh")')
        const manifestPath = resolve(root, 'corpus/reader/committed.json')
        const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
        assert.ok(Array.isArray(manifest))
        manifest.push({
          id: 'permitted',
          path: 'corpus/reader/patches/permitted.strudel',
          license: 'MIT',
          provenance: 'Original test fixture',
        })
        writeFileSync(manifestPath, JSON.stringify(manifest))
        const accepted = run('--update-baseline', '--output', 'accepted.json')
        assert.equal(accepted.status, 0, accepted.stderr)
      }
      const first = run()
      assert.equal(first.status, 0, first.stderr)
      const second = run()
      assert.equal(second.status, 0, second.stderr)
      const reports = readdirSync(resolve(root, 'reports/reader'))
      assert.equal(reports.length, 2)
      const readReport = (name: string): Record<string, unknown> =>
        JSON.parse(readFileSync(resolve(root, 'reports/reader', name), 'utf8'))
      const before = readReport(reports[0] ?? ''),
        after = readReport(reports[1] ?? '')
      delete before.generatedAt
      delete after.generatedAt
      assert.deepEqual(before, after)
      const patch = resolve(root, 'src/library/patches/first-sounds.strudel')
      writeFileSync(patch, '$: s("bd").notMapped()\n')
      const failed = run()
      assert.equal(failed.status, 1)
      assert.match(failed.stderr, /Reader coverage regressed/)
      assert.match(failed.stderr, /--update-baseline/)
      const update = run('--update-baseline')
      assert.equal(update.status, 0, update.stderr)
      assert.equal(run().status, 0)
      // Adding unrecorded library content cannot silently shrink or bypass the licensed corpus.
      writeFileSync(resolve(root, 'src/library/patches/unrecorded.strudel'), '$: s("hh")')
      assert.match(run().stderr, /Record every library\/corpus patch/)
      rmSync(resolve(root, 'src/library/patches/unrecorded.strudel'))
      mkdirSync(resolve(root, 'corpus/reader/patches'), { recursive: true })
      writeFileSync(resolve(root, 'corpus/reader/patches/unrecorded.strudel'), '$: s("hh")')
      assert.match(run().stderr, /Record every library\/corpus patch/)
      assert.match(run('--wild', '--update-baseline').stderr, /report-only/)
      const wild = resolve(root, 'corpus/reader/wild.json')
      writeFileSync(
        wild,
        JSON.stringify([
          {
            id: 'floating',
            url: 'https://raw.githubusercontent.com/a/b/main/tune.js',
            license: 'unknown',
            provenance: 'test',
          },
        ]),
      )
      assert.match(run('--wild').stderr, /pin a full commit/)
      const manifest = resolve(root, 'corpus/reader/committed.json')
      writeFileSync(
        manifest,
        JSON.stringify([{ id: 'unlicensed', path: 'src/library/patches/first-sounds.strudel' }]),
      )
      assert.match(run().stderr, /license\/permission and provenance/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
