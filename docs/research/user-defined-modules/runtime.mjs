import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const base = process.argv[2] ?? 'http://127.0.0.1:5187'
const output = process.argv[3] ?? '/tmp/user-defined-modules-runtime.json'
const fixture = readFileSync('src/library/patches/switch-angel-trance-demo.strudel', 'utf8')
const experiment = readFileSync(new URL('./runtime.strudel', import.meta.url), 'utf8')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage()
  await page.goto(base)
  await page.waitForSelector('.topbar .play')
  // This is a controlled adapter experiment, not a test of panel interaction.
  const report = await page.evaluate(
    async ({ experiment, fixture }) => {
      const engine = await import('/src/strudel/engine.ts')
      await engine.play(experiment, { volume: 0 })
      await engine.stop()
      const report = globalThis.__registerResearch247
      const { read } = await import('/src/reader/index.ts')
      const { generate } = await import('/src/codegen/generate.ts')
      const { saveLayout, sourceBody } = await import('/src/workspace/document.ts')
      const document = read(fixture)
      const saved = saveLayout(document)
      const reopened = read(saved.source)
      report.existingRack = {
        exactSource: generate(document) === fixture && sourceBody(saved.source) === fixture,
        layout: reopened.layout,
        saved: saved.patch,
        reopened: reopened.patch,
      }
      // Definitions removed from submitted code still exist in the page's Pattern prototype.
      await engine.play(
        "globalThis.__registerResearch247Persistent = s('sine').duplicate247(0.2).queryArc(0,1).map(h=>h.value);\n$: silence",
        { volume: 0 },
      )
      await engine.stop()
      report.persistentAfterReplacement = globalThis.__registerResearch247Persistent
      // Keep EXACT fixture setup, including both block bodies. Query all four exact
      // voice expressions through the engine evaluator, without scheduling their audio.
      const { parseSource } = await import('/src/reader/syntax.ts')
      async function inspectFixture(source) {
        const voices = parseSource(source).scopes.filter((s) => s.kind === 'voice')
        const setup = source.slice(0, source.indexOf('$:'))
        const queries = voices.map(
          (s) =>
            `(${source.slice(s.start, s.end)}).queryArc(0,4).filter(h=>h.hasOnset()).map(h=>({begin:h.whole.begin.toString(),end:h.whole.end.toString(),value:h.value}))`,
        )
        const queryCode =
          setup +
          '\nglobalThis.__registerResearch247Fixture = [' +
          queries.join(',\n') +
          '];\n$: silence'
        await engine.play(queryCode, { volume: 0 })
        await engine.stop()
        return globalThis.__registerResearch247Fixture
      }
      report.fixture = await inspectFixture(fixture)
      report.fixtureEdited = await inspectFixture(fixture.replace('rlpf(0.539)', 'rlpf(1.25)'))
      report.clockAfterStop = engine.getClock()
      return report
    },
    { experiment, fixture },
  )
  const gains = (haps) => haps.map((h) => h.value.gain)
  assert.deepEqual(gains(report.forward), [0.4])
  assert.deepEqual(gains(report.pattern), [0.25, 0.75])
  assert.deepEqual(gains(report.computed), [0.5])
  assert.deepEqual(gains(report.sequenceArguments), [0.2, 0.8])
  assert.deepEqual(report.aliases[0], report.aliases[1])
  assert.match(report.defaultArityError, /expects -1 inputs but got 1/)
  assert.match(report.arityError, /expects 2 inputs but got 1/)
  assert.deepEqual(report.rawInput, { type: 'object', pure: 0.6 })
  assert.deepEqual(report.shared.map(gains), [[1], [2], [1]])
  assert.equal(report.sharedCount, 2)
  assert.deepEqual(report.queried.map(gains), [
    [1, 2],
    [3, 4],
  ])
  assert.equal(report.queriedCount, 4)
  assert.deepEqual(report.redefinition.map(gains), [[0.2], [0.4], [0.2]])
  assert.deepEqual(
    report.persistentAfterReplacement.map((h) => h.gain),
    [0.4],
  )
  assert.equal(report.sourceLike[0].value.s, 'triangle')
  assert.deepEqual(report.callback, report.callbackNative)
  assert.deepEqual(report.macro, report.registerCompound)
  assert.deepEqual(report.factory.map(gains), [[1], [1]])
  assert.equal(report.fixture.length, 4)
  assert.ok(report.fixture.every((haps) => haps.length > 0))
  assert.deepEqual(
    report.fixture.map((haps) => [
      ...new Set(haps.map((h) => h.value.orbit).filter((v) => v !== undefined)),
    ]),
    [[], [2], [3], [4]],
  )
  assert.ok(report.fixture[1].every((h) => Math.abs(h.value.cutoff - (12 * 0.539) ** 4) < 1e-8))
  assert.ok(report.fixture[2].every((h) => Math.abs(h.value.cutoff - (12 * 0.925) ** 4) < 1e-8))
  const expectedEdited = structuredClone(report.fixture)
  for (const hap of expectedEdited[1]) hap.value.cutoff = (12 * 1.25) ** 4
  assert.deepEqual(report.fixtureEdited, expectedEdited)
  report.argumentEdit = {
    oldCutoff: report.fixture[1][0].value.cutoff,
    newCutoff: report.fixtureEdited[1][0].value.cutoff,
    allOtherEventFieldsEqual: true,
  }
  delete report.fixtureEdited
  assert.equal(report.clockAfterStop.running, false)
  assert.equal(report.existingRack.exactSource, true)
  assert.equal(report.existingRack.layout, 'restored')
  assert.deepEqual(report.existingRack.reopened, report.existingRack.saved)
  report.existingRack = {
    exactSource: true,
    completeSavedRackIdentity: true,
    modules: report.existingRack.saved.modules.length,
    layout: 'restored',
  }
  // A new JS realm clears these custom registrations; Stop alone did not.
  await page.reload()
  const absentAfterReload = await page.evaluate(async () => {
    const engine = await import('/src/strudel/engine.ts')
    await engine.play(
      "globalThis.__registerResearch247Absent = typeof s('sine').duplicate247;\n$: silence",
      { volume: 0 },
    )
    await engine.stop()
    return globalThis.__registerResearch247Absent
  })
  assert.equal(absentAfterReload, 'undefined')
  const packages = Object.fromEntries(
    [
      '@strudel/web',
      '@strudel/core',
      '@strudel/mini',
      '@strudel/tonal',
      '@strudel/transpiler',
      'superdough',
      'acorn',
      'playwright',
    ].map((name) => [
      name,
      JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version,
    ]),
  )
  const evidence = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runtimeSourceSha256: hash(experiment),
    runnerSourceSha256: hash(readFileSync(new URL('./runtime.mjs', import.meta.url))),
    prototypeSourceSha256: hash(readFileSync(new URL('./prototype.mjs', import.meta.url))),
    registerImplementationSha256: hash(readFileSync('node_modules/@strudel/core/pattern.mjs')),
    fixtureSha256: hash(fixture),
    lockfileSha256: hash(readFileSync('package-lock.json')),
    node: process.version,
    chromium: browser.version(),
    packages,
    absentAfterReload,
    report,
    limits:
      'Real pinned-engine query events through engine.play. Silence scheduled, volume zero. No PCM, physical listening, custom panel UI, or arbitrary-import safety claim.',
  }
  writeFileSync(
    output,
    JSON.stringify(
      evidence,
      (_key, value) => (typeof value === 'bigint' ? { bigint: String(value) } : value),
      2,
    ) + '\n',
  )
  process.stdout.write(
    `RESULT register-research passed=1 failed=0; fixture onset counts=${report.fixture.map((h) => h.length)}; ${output}\n`,
  )
} finally {
  await browser.close()
}
