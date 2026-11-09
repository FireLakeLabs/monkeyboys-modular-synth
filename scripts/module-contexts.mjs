import { runnerImport } from 'vite'
import { format, resolveConfig } from 'prettier'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({ options: { 'inventory-ref': { type: 'string' } } })
const inventoryRef = values['inventory-ref']
if (inventoryRef && !/^[a-f0-9]{40}$/.test(inventoryRef))
  throw new Error('inventory-ref must be a full commit SHA')
const inventoryPath = 'docs/research/strudel-api-coverage/inventory.json'
const inventoryText = inventoryRef
  ? execFileSync('git', ['show', `${inventoryRef}:${inventoryPath}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  : await readFile(`${root}${inventoryPath}`, 'utf8')
const inventory = JSON.parse(inventoryText)
if (
  inventory.version !== 1 ||
  !Array.isArray(inventory.families) ||
  !Array.isArray(inventory.aliasCollisions) ||
  !inventory.aliasToFamily ||
  typeof inventory.aliasToFamily !== 'object' ||
  Array.isArray(inventory.aliasToFamily)
)
  throw new Error('Expected #245 inventory schema v1 alias contract')
const families = new Set(inventory.families.map((family) => family.id))
const collisions = new Set(inventory.aliasCollisions.map((collision) => collision.name))
for (const family of Object.values(inventory.aliasToFamily))
  if (typeof family !== 'string' || !families.has(family))
    throw new Error('Invalid inventory family reference')
function joinNames(names) {
  return [...new Set(names)]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      familyId: collisions.has(name) ? null : (inventory.aliasToFamily[name] ?? null),
      state: collisions.has(name)
        ? 'unresolved-alias-collision'
        : inventory.aliasToFamily[name]
          ? 'joined'
          : 'unresolved-no-inventory-family',
    }))
}
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
  const counterSource =
    annotation.counterexampleKind === 'opaque-setup'
      ? annotation.counterexample + '\n'
      : `$: ${annotation.counterexample}\n`
  const counter = runtime.read(counterSource)
  const counterSaved = runtime.saveLayout(counter)
  const code = counter.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)
  const fallback = {
    source: counterSource,
    code,
    sourceExact:
      runtime.generate(counter) === counterSource &&
      runtime.sourceBody(counterSaved.source) === counterSource,
    savedIdentity: isDeepStrictEqual(counterSaved.patch, runtime.read(counterSaved.source).patch),
    fallbackObserved:
      annotation.counterexampleKind === 'opaque-setup'
        ? !counter.bindings.some((binding) => Object.hasOwn(binding.controls, 'bpm'))
        : code.length > 0,
  }
  if (Object.values(fallback).some((value) => value === false))
    failures.push(`Counterexample ${spec.id} proof failed: ${JSON.stringify(fallback)}`)
  matrix.push({
    ...annotation,
    caseIds: annotation.caseIds.split(','),
    name: spec.name,
    hp: spec.hp,
    functions: spec.strudel,
    aliases: spec.strudelAliases ?? {},
    inventoryFamilies: joinNames([
      ...spec.strudel,
      ...Object.keys(spec.strudelAliases ?? {}),
      ...spec.controls.flatMap((control) =>
        control.call
          ? typeof control.call.method === 'string'
            ? [control.call.method]
            : Object.values(control.call.method.names)
          : [],
      ),
      ...(spec.soundSource ? ['s'] : []),
      ...(spec.id === 'modmix' ? ['add'] : []),
    ]),
    source: spec.source ?? null,
    soundSource: spec.soundSource ?? null,
    functionLoop: spec.functionLoop ?? null,
    controls: spec.controls,
    jacks: spec.jacks,
    exercise: proof,
    fallback,
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
  'node_modules/@strudel/web/dist/index.mjs',
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
for (const input of inventory.provenance.inputs) {
  if (hashes[input.path] && hashes[input.path] !== input.sha256)
    throw new Error(`Inventory input drift: ${input.path}`)
}
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
  inventory: {
    path: inventoryPath,
    sourceRevision:
      inventoryRef ??
      execFileSync('git', ['log', '-1', '--format=%H', '--', inventoryPath], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
    sha256: hash(inventoryText),
    schemaVersion: inventory.version,
    candidateCount: inventory.counts.families,
    aliasCollisions: inventory.aliasCollisions,
    priorities: inventory.priorities.map(({ rank, id, owners, corpus }) => ({
      rank,
      id,
      owners,
      corpus,
    })),
    selectedCandidates: joinNames([
      'sound',
      'chunkBack',
      'fastChunk',
      'slowChunk',
      'every',
      'dict',
      'anchor',
      'mode',
      'offset',
      'inside',
      'outside',
      'layer',
      'echoWith',
      'chunkInto',
      'sine2',
      'rand2',
      'irand',
      'steady',
      'fmi1',
      'fmh1',
      'register',
      'arrange',
    ]),
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
  '## Per-module boundary fixtures',
  '',
  'Every row also checks a concrete fallback separately from its supported exercise. These examples document reader/UI boundaries, not universal engine-invalid inputs. Exact CODE text, source bytes and saved identity are recorded in JSON. OUT preserves opaque setup rather than inventing a tempo binding.',
  '',
  '| Module | Counterexample expression / setup | Observed preservation |',
  '| --- | --- | --- |',
  ...matrix.map(
    (row) =>
      `| ${row.name} | ${'`'}${row.counterexample.replaceAll('\n', ' ')}${'`'} | ${row.counterexampleKind}; source and saved identity pass |`,
  ),
  '',
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
  `RESULT module-contexts modules=${matrix.length} comparisons=${observations.length} reader=${reader.length} fallbacks=${matrix.length} examples=${examples.length} failures=${failures.length}\n`,
)
for (const failure of failures) console.error(failure)
if (failures.length) process.exitCode = 1
