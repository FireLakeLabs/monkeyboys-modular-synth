import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({
  options: {
    wild: { type: 'boolean', default: false },
    'update-baseline': { type: 'boolean', default: false },
    output: { type: 'string' },
  },
})
if (values.wild && values['update-baseline']) throw new Error('Wild corpus is report-only')
const tier = values.wild ? 'wild' : 'committed'
const manifest = JSON.parse(await readFile(resolve(root, `corpus/reader/${tier}.json`), 'utf8'))
if (!Array.isArray(manifest) || !manifest.length)
  throw new Error('Corpus manifest must be nonempty')
const ids = new Set()
for (const entry of manifest) {
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    !/^[a-z0-9][a-z0-9-]*$/.test(entry.id) ||
    ids.has(entry.id) ||
    typeof entry.license !== 'string' ||
    !entry.license.trim() ||
    typeof entry.provenance !== 'string' ||
    !entry.provenance.trim()
  )
    throw new Error('Each corpus entry needs a unique id, license/permission and provenance')
  ids.add(entry.id)
  if (values.wild) {
    if (
      typeof entry.url !== 'string' ||
      !/^https:\/\/(raw\.githubusercontent\.com\/[^/]+\/[^/]+|gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[a-f0-9]{40}\/.+/.test(
        entry.url,
      )
    )
      throw new Error(`${entry.id}: wild URL must pin a full commit/revision`)
  } else if (
    typeof entry.path !== 'string' ||
    !/^(src\/library\/patches|corpus\/reader\/patches)\/[a-z0-9-]+\.strudel$/.test(entry.path)
  )
    throw new Error(`${entry.id}: invalid committed path`)
}
if (!values.wild) {
  const files = globSync(['src/library/patches/*.strudel', 'corpus/reader/patches/*.strudel'], {
    cwd: root,
  })
  const paths = manifest.map((entry) => entry.path)
  if (new Set(paths).size !== paths.length || files.some((path) => !paths.includes(path)))
    throw new Error(
      'Record every library/corpus patch exactly once in corpus/reader/committed.json',
    )
}
const {
  module: { measurePatch, summarize, baselineFor, regressions },
} = await runnerImport(resolve(root, 'src/reader/coverage.ts'), { configFile: false })
const patches = []
for (const entry of manifest.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
  let source
  if (values.wild) {
    try {
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      source = await response.text()
    } catch (error) {
      // Do not silently improve the percentages by dropping unavailable sources.
      patches.push({ id: entry.id, fetchFailure: String(error), provenance: entry })
      continue
    }
  } else source = await readFile(resolve(root, entry.path), 'utf8')
  patches.push({
    ...measurePatch(entry.id, source),
    sha256: createHash('sha256').update(source).digest('hex'),
    provenance: entry,
  })
}
const measured = patches.filter((patch) => !('fetchFailure' in patch))
const summary = summarize(measured)
const generatedAt = new Date().toISOString()
const report = {
  version: 1,
  tier,
  generatedAt,
  ...summary,
  fetchFailures: patches.length - measured.length,
  patches,
}
const output = resolve(
  root,
  values.output ?? `reports/reader/${tier}-${generatedAt.replaceAll(':', '-')}.json`,
)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
const { totals, shares } = summary
const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`)
process.stdout.write(
  `${tier}: ${measured.length}/${manifest.length} patches measured\n` +
    `Mapped calls: ${totals.mappedCalls}/${totals.calls} (${percent(shares.mappedCalls)})\n` +
    `Fully readable voices: ${totals.readableVoices}/${totals.voices} (${percent(shares.readableVoices)})\n` +
    `Patches without CODE: ${totals.patchesWithoutCode}/${totals.patches} (${percent(shares.patchesWithoutCode)})\n` +
    `Parse failures: ${totals.parseFailures}; fetch failures: ${report.fetchFailures}; CODE blocks: ${totals.codeBlocks}\n` +
    `Unmapped calls (occurrences; alphabetical ties):\n${summary.unmapped.map(({ name, count }) => `  ${name}: ${count}`).join('\n')}\nReport: ${output}\n`,
)
if (!values.wild) {
  const baselinePath = resolve(root, 'corpus/reader/baseline.json')
  if (values['update-baseline']) {
    await writeFile(baselinePath, JSON.stringify(baselineFor(measured), null, 2) + '\n')
    process.stdout.write('Updated corpus/reader/baseline.json; review the baseline diff.\n')
  } else {
    const failures = regressions(measured, JSON.parse(await readFile(baselinePath, 'utf8')))
    if (failures.length) {
      process.stderr.write(
        `Reader coverage regressed:\n${failures.join('\n')}\nIf intentional, run npm run coverage:reader -- --update-baseline and review/commit corpus/reader/baseline.json.\n`,
      )
      process.exitCode = 1
    }
  }
}
