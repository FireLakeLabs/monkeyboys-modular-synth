import { runnerImport } from 'vite'
import { format, resolveConfig } from 'prettier'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const { module: runtime } = await runnerImport(`${root}docs/research/module-contexts-cases.mjs`, {
  configFile: false,
  resolve: {
    alias: [
      {
        find: /^@strudel\/core$/,
        replacement: `${root}src/reader/fixtures/strudel-kernel.mjs`,
      },
    ],
    noExternal: [/^@strudel\//],
  },
})

const hash = (value) => createHash('sha256').update(value).digest('hex')
const annotations = JSON.parse(
  await readFile(`${root}docs/research/module-contexts-annotations.json`, 'utf8'),
)
if (annotations.version !== 1 || !Array.isArray(annotations.modules))
  throw new Error('Invalid annotations')
const annotationIds = annotations.modules.map((row) => row.moduleId)
if (
  new Set(annotationIds).size !== annotationIds.length ||
  !isDeepStrictEqual(
    [...annotationIds].sort((a, b) => a.localeCompare(b)),
    runtime.CATALOG.map((spec) => spec.id).sort((a, b) => a.localeCompare(b)),
  )
)
  throw new Error('Annotations must cover each catalog module exactly once')
const failures = []
const observations = []
for (const [id, label, left, right, equal] of runtime.comparisons) {
  try {
    const a = runtime.events(left),
      b = runtime.events(right)
    const actual = isDeepStrictEqual(a, b)
    if (actual !== equal)
      failures.push(`${id} ${label}: event equality ${actual}, expected ${equal}`)
    observations.push({
      id,
      label,
      left,
      right,
      expectedEqual: equal,
      equal: actual,
      arc: [0, 4],
      leftCount: a.length,
      rightCount: b.length,
      leftHash: hash(JSON.stringify(a)),
      rightHash: hash(JSON.stringify(b)),
      leftSample: a.slice(0, 2),
      rightSample: b.slice(0, 2),
    })
  } catch (error) {
    failures.push(`${id} ${label}: ${String(error)}`)
  }
}
const reader = []
for (const [id, label, expression, required, codeFragments] of runtime.readerCases) {
  const source = `$: ${expression}\n`
  try {
    const document = runtime.read(source)
    const modules = document.patch.modules.map((m) => m.type)
    const code = document.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)
    for (const type of required)
      if (!modules.includes(type)) failures.push(`${id} ${label}: missing ${type}`)
    for (const fragment of codeFragments)
      if (!code.some((text) => text.includes(fragment)))
        failures.push(`${id} ${label}: missing CODE ${fragment}; got ${JSON.stringify(code)}`)
    const exact = runtime.generate(document) === source
    const saved = runtime.saveLayout(document)
    const reopened = runtime.read(saved.source)
    const identity = isDeepStrictEqual(reopened.patch, saved.patch)
    const savedSourceExact = runtime.sourceBody(saved.source) === source
    if (!exact || !identity || !savedSourceExact)
      failures.push(`${id} ${label}: source/save proof failed`)
    reader.push({
      id,
      label,
      source,
      modules,
      code,
      sourceExact: exact,
      savedSourceExact,
      savedIdentity: identity,
      layout: reopened.layout,
    })
  } catch (error) {
    failures.push(`${id} ${label}: ${String(error)}`)
  }
}
for (const [id, label, source] of runtime.documentCases) {
  const document = runtime.read(source)
  const saved = runtime.saveLayout(document)
  const exact = runtime.generate(document) === source && runtime.sourceBody(saved.source) === source
  const identity = isDeepStrictEqual(runtime.read(saved.source).patch, saved.patch)
  const notExecuted = !Object.hasOwn(globalThis, '__moduleContextResearchExecuted')
  if (!exact || !identity || !notExecuted)
    failures.push(`${id} ${label}: document preservation/execution failed`)
  reader.push({
    id,
    label,
    source,
    modules: document.patch.modules.map((m) => m.type),
    sourceExact: exact,
    savedIdentity: identity,
    notExecuted,
  })
}
const reportSource = await readFile(`${root}docs/research/module-contexts.md`, 'utf8')
const examples = []
for (const [index, match] of [...reportSource.matchAll(/```js\n([\s\S]*?)```/g)].entries()) {
  const source = match[1]
  const document = runtime.read(source)
  const saved = runtime.saveLayout(document)
  const exact = runtime.generate(document) === source && runtime.sourceBody(saved.source) === source
  const identity = isDeepStrictEqual(runtime.read(saved.source).patch, saved.patch)
  const events = runtime.reportEvents(source)
  if (!exact || !identity || !events.length) failures.push(`Report example ${index + 1} failed`)
  examples.push({
    number: index + 1,
    source,
    sourceExact: exact,
    savedIdentity: identity,
    eventCount: events.length,
    eventHash: hash(JSON.stringify(events)),
  })
}
const caseIds = new Set([...observations, ...reader].map((item) => item.id))
const matrix = []
for (const spec of runtime.CATALOG) {
  const annotation = annotations.modules.find((row) => row.moduleId === spec.id)
  for (const id of annotation.caseIds.split(','))
    if (!caseIds.has(id)) failures.push(`Missing case ${id}`)
  const path = `src/library/patches/modules/${spec.id}.strudel`
  const source = await readFile(`${root}${path}`, 'utf8')
  const document = runtime.read(source)
  const saved = runtime.saveLayout(document)
  const reopened = runtime.read(saved.source)
  const proof = {
    path,
    sha256: hash(source),
    ownerPresent: document.patch.modules.some((m) => m.type === spec.id),
    sourceExact: runtime.generate(document) === source,
    savedIdentity: isDeepStrictEqual(saved.patch, reopened.patch),
  }
  if (Object.values(proof).some((value) => value === false))
    failures.push(`Exercise ${spec.id} proof failed`)
  matrix.push({
    ...annotation,
    caseIds: annotation.caseIds.split(','),
    name: spec.name,
    hp: spec.hp,
    functions: spec.strudel,
    aliases: spec.strudelAliases ?? {},
    source: spec.source ?? null,
    soundSource: spec.soundSource ?? null,
    functionLoop: spec.functionLoop ?? null,
    controls: spec.controls,
    jacks: spec.jacks,
    exercise: proof,
    audioEvidence: 'not measured by this study; see report/backend source',
  })
}
const packages = {}
for (const name of [
  '@strudel/web',
  '@strudel/core',
  '@strudel/mini',
  '@strudel/tonal',
  '@strudel/transpiler',
  'superdough',
]) {
  const source = await readFile(`${root}node_modules/${name}/package.json`, 'utf8')
  const pkg = JSON.parse(source)
  packages[name] = { version: pkg.version, gitHead: pkg.gitHead ?? null }
}
const files = [
  'package-lock.json',
  'src/modules/catalog.ts',
  'src/reader/read.ts',
  'src/codegen/graph.ts',
  'src/codegen/generate.ts',
  'src/codegen/effects.ts',
  'src/strudel/engine.ts',
  'node_modules/@strudel/core/pattern.mjs',
  'node_modules/@strudel/core/controls.mjs',
  'node_modules/@strudel/core/signal.mjs',
  'node_modules/@strudel/tonal/tonal.mjs',
  'node_modules/@strudel/tonal/voicings.mjs',
  'node_modules/superdough/synth.mjs',
  'node_modules/superdough/sampler.mjs',
  'node_modules/superdough/helpers.mjs',
  'node_modules/superdough/superdough.mjs',
]
const hashes = Object.fromEntries(
  await Promise.all(files.map(async (path) => [path, hash(await readFile(`${root}${path}`))])),
)
const report = {
  version: 1,
  applicationRevision: execFileSync(
    'git',
    ['log', '-1', '--format=%H', '--', 'src', 'package-lock.json'],
    { cwd: root, encoding: 'utf8' },
  ).trim(),
  node: process.version,
  packages,
  hashes,
  claims: {
    reader: 'production read/generate/save/reopen',
    events: 'real pure pinned kernel; repository-owned fixtures only; [0,4) arcs',
    audio: 'none; no browser or listening',
  },
  moduleCount: matrix.length,
  comparisonCount: observations.length,
  readerCaseCount: reader.length,
  failures,
  matrix,
  comparisons: observations,
  reader,
  examples,
}
const table = [
  '# Current module context matrix',
  '',
  'Generated by `node scripts/module-contexts.mjs`; annotations are research judgments, catalog data is authoritative. Every row has an exercised catalog owner and exact source/save identity proof in [evidence](module-contexts-evidence.json). Bounds, modes, omissions, CV jacks and all call bindings are included there. See [report](module-contexts.md) for source anchors, cross-cutting constraints and recommendation examples.',
  '',
  '| Module | Owned names (aliases in parentheses) | Actual role | Engine context | Reader / graph restriction | Verdict / cases |',
  '| --- | --- | --- | --- | --- | --- |',
  ...matrix.map(
    (row) =>
      `| ${row.name} | ${[...row.functions, ...Object.keys(row.aliases).map((name) => `(${name})`)].join(', ') || 'Structural / contextual; see bindings'} | ${row.role} | ${row.engineContext} | ${row.readerContext} | ${row.verdict}; ${row.caseIds.join(', ')} |`,
  ),
  '',
  'Names on controls (notably shared s, n, velocity and argument add) may have contextual ownership beyond the explicit strudel list. The JSON includes complete control bindings and the inventory join; this table does not redefine aliases or count missing features.',
  '',
]
const prettier = await resolveConfig(`${root}.prettierrc.json`)
await writeFile(
  `${root}docs/research/module-contexts-matrix.md`,
  await format(table.join('\n'), { ...prettier, parser: 'markdown' }),
)
await writeFile(
  `${root}docs/research/module-contexts-evidence.json`,
  await format(JSON.stringify(report), { ...prettier, parser: 'json' }),
)
process.stdout.write(
  `RESULT module-contexts modules=${matrix.length} comparisons=${observations.length} reader=${reader.length} examples=${examples.length} failures=${failures.length}\n`,
)
for (const failure of failures) console.error(failure)
if (failures.length) process.exitCode = 1
