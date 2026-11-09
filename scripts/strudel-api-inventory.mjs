import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { runnerImport } from 'vite'
import { scan, callsIn } from './strudel-api-inventory-scan.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    wild: { type: 'boolean', default: false },
    scan: { type: 'string' },
  },
})
if (values.scan) {
  process.stdout.write(
    JSON.stringify(scan(await readFile(values.scan, 'utf8'), 'fixture.mjs')) + '\n',
  )
} else await inventory()

async function inventory() {
  const bytes = (path) => readFile(resolve(root, path), 'utf8')
  const json = async (path) => JSON.parse(await bytes(path))
  const sha = (text) => createHash('sha256').update(text).digest('hex')
  const hash = async (path) => ({ path, sha256: sha(await bytes(path)) })
  const lock = await json('package-lock.json')
  const packageNames = [
    '@strudel/web',
    '@strudel/core',
    '@strudel/mini',
    '@strudel/tonal',
    '@strudel/transpiler',
    '@strudel/webaudio',
    '@strudel/draw',
    'superdough',
    'supradough',
  ]
  const packages = []
  const scans = []
  for (const name of packageNames) {
    const base = `node_modules/${name}`
    const info = await json(`${base}/package.json`)
    if (info.version !== lock.packages[base]?.version)
      throw new Error(`Installed version differs from lock: ${name}`)
    const files = globSync(`${base}/*.mjs`, { cwd: root }).sort((a, b) => a.localeCompare(b))
    const sources = []
    for (const path of files) {
      sources.push(await hash(path))
      scans.push({ package: name, path, ...scan(await bytes(path), path) })
    }
    const entry = `${base}/${info.module ?? info.main}`
    sources.push(await hash(entry))
    packages.push({
      name,
      version: info.version,
      lockVersion: lock.packages[base]?.version,
      integrity: lock.packages[base]?.integrity ?? null,
      license: info.license ?? null,
      entry,
      sources,
    })
  }
  const web = packages.find((p) => p.name === '@strudel/web')
  const bundle = scan(await bytes(web.entry), web.entry)
  const evalScopeNames = new Set(
    bundle.evalScopes
      .filter((scope) => scope.references.length)
      .flatMap((scope) => [
        ...scope.direct,
        ...scope.references.flatMap(
          (name) =>
            bundle.namespaces.find((n) => n.local === name)?.members.map((m) => m.name) ?? [],
        ),
      ]),
  )
  const exportNames = new Set(bundle.exports.map((x) => x.name))
  const exportedLocal = new Map(bundle.exports.map((x) => [x.local, x.name]))
  for (const wrapper of bundle.wrappers)
    if (exportedLocal.has(wrapper.name) && bundle.methods.some((m) => m.owner === wrapper.target))
      exportedLocal.set(wrapper.target, exportedLocal.get(wrapper.name))
  const patternLocal = bundle.exports.find((x) => x.name === 'Pattern')?.local
  const bundleMethods = bundle.methods.filter((x) => x.owner === patternLocal && !x.static)
  const allMethods = bundle.methods.map((x) => ({
    ...x,
    owner: exportedLocal.get(x.owner) ?? x.owner,
    visibility: exportedLocal.has(x.owner) ? 'exported-class' : 'internal-or-unresolved',
  }))
  const {
    module: { CATALOG },
  } = await runnerImport(resolve(root, 'src/modules/catalog.ts'), { configFile: false })
  const {
    module: { read },
  } = await runnerImport(resolve(root, 'src/reader/read.ts'), { configFile: false })
  const {
    module: { generate },
  } = await runnerImport(resolve(root, 'src/codegen/generate.ts'), { configFile: false })
  const {
    module: { saveLayout },
  } = await runnerImport(resolve(root, 'src/workspace/document.ts'), { configFile: false })
  const {
    module: { measurePatch, summarize },
  } = await runnerImport(resolve(root, 'src/reader/coverage.ts'), { configFile: false })
  const owners = new Map()
  for (const spec of CATALOG) {
    for (const name of [...spec.strudel, ...Object.keys(spec.strudelAliases ?? {})]) {
      if (!owners.has(name)) owners.set(name, [])
      owners.get(name).push(spec.id)
    }
  }
  const families = new Map()
  const byName = new Map()
  const aliasCollisions = []
  function family(name) {
    if (byName.has(name)) return byName.get(name)
    const f = {
      id: `api:${name}`,
      canonical: name,
      names: [name],
      evidence: [],
      availability: [],
      catalog: [],
      controls: [],
      reader: {
        state: 'unknown',
        reason: 'No curated reader observation; metadata does not prove supported forms',
        examples: [],
      },
      generator: { state: 'unknown', reason: 'No audited writer/adapter role established' },
      backend: { state: 'unknown', reason: 'No event/PCM/audio claim established for this family' },
      corpus: { committed: 0, wild: values.wild ? 0 : null },
    }
    families.set(f.id, f)
    byName.set(name, f)
    return f
  }
  function addNames(f, names) {
    for (const name of names) {
      const old = byName.get(name)
      if (old && old !== f)
        aliasCollisions.push({
          name,
          previous: old.id,
          candidate: f.id,
          resolution:
            'Overlapping definitions retained; effective alias ownership unresolved without runtime evidence',
        })
      f.names.push(name)
      byName.set(name, f)
    }
    f.names = [...new Set(f.names)].sort((a, b) => a.localeCompare(b))
  }
  // Core first: first registration spelling is stable across source/bundle minification.
  const ordered = scans.toSorted(
    (a, b) =>
      Number(b.package === '@strudel/core') - Number(a.package === '@strudel/core') ||
      a.path.localeCompare(b.path),
  )
  for (const s of ordered)
    for (const r of s.registrations) {
      const f =
        families.get(`api:${r.canonical}`) ??
        (() => {
          const previous = byName.get(r.canonical)
          byName.delete(r.canonical)
          const created = family(r.canonical)
          if (previous)
            aliasCollisions.push({
              name: r.canonical,
              previous: previous.id,
              candidate: created.id,
              resolution:
                'Overlapping canonical/alias definitions; check bundled registration evidence before relying on ownership',
            })
          return created
        })()
      addNames(f, r.names)
      f.evidence.push({ ...r, package: s.package })
    }
  for (const s of ordered)
    for (const alias of s.aliases) {
      if (
        !s.exports.some((e) => e.name === alias.name) ||
        !s.exports.some((e) => e.name === alias.target)
      )
        continue
      const f = family(alias.target)
      addNames(f, [alias.name])
      f.evidence.push({ ...alias, kind: 'export-alias' })
    }
  for (const r of bundle.factories) {
    const f = family(r.canonical)
    f.availability.push('bundle-composer-factory')
    f.evidence.push(r)
  }
  for (const r of bundle.registrations) {
    // Expanded setters are installed on Pattern even when an individual alias is not exported.
    const f = families.get(`api:${r.canonical}`) ?? family(r.canonical)
    for (const name of r.names) {
      byName.set(name, f)
      f.availability.push('bundle-registration-prototype')
    }
  }
  const replScopes = bundle.evalScopes.filter((scope) => !scope.references.length)
  for (const scope of replScopes) {
    const groups = Map.groupBy(scope.members, (member) => member.local ?? member.name)
    for (const members of groups.values()) {
      const names = members.map((m) => m.name)
      const canonical = names.includes('setcpm')
        ? 'setcpm'
        : names.includes('setcps')
          ? 'setcps'
          : names[0]
      const f = family(canonical)
      addNames(f, names)
      f.availability.push('repl-evaluation-scope')
      f.evidence.push({
        path: scope.path,
        line: scope.line,
        kind: 'REPL direct evalScope injection',
        names,
      })
    }
  }
  for (const e of bundle.exports) {
    const f = family(e.name)
    f.availability.push('bundle-export')
    if (evalScopeNames.has(e.name)) f.availability.push('initStrudel-evalScope')
    f.evidence.push({ path: web.entry, kind: 'export', local: e.local, name: e.name })
  }
  for (const m of bundle.methods.filter((x) => exportedLocal.has(x.owner))) {
    const owner = exportedLocal.get(m.owner)
    const f = family(m.owner === patternLocal ? m.name : `${owner}.${m.name}`)
    f.availability.push(m.static ? 'bundle-class-static' : 'bundle-class-prototype')
    f.evidence.push(m)
  }
  for (const name of ['speak', 'samples']) {
    const f = family(name)
    f.availability.push('app-adapter')
    f.evidence.push({ path: 'src/strudel/engine.ts', kind: 'evalScope override', name })
  }
  const coreRegistrations = scans
    .filter((s) => s.package === '@strudel/core')
    .flatMap((s) => s.registrations)
  const coreLiteral = [
    ...new Map(
      coreRegistrations
        .filter((r) => !r.expansion && r.kind !== 'createParam')
        .map((r) => [`${r.path}:${r.line}`, r]),
    ).values(),
  ]
  // The preliminary literal-only scan counts multi-control declarations once, before expansion.

  const examples = []
  const cases = await json('docs/research/strudel-api-coverage/examples.json')
  for (const item of cases) {
    const document = read(item.source)
    const saved = saveLayout(document)
    const restored = read(saved.source)
    const observation = {
      ...item,
      moduleTypes: document.patch.modules.map((m) => m.type),
      values: document.patch.modules
        .filter((m) => !['mix', 'out'].includes(m.type))
        .map((m) => ({ type: m.type, values: m.values })),
      code: document.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text),
      exactSource: generate(document) === item.source,
      savedIdentity: isDeepStrictEqual(restored.patch, saved.patch),
      coverage: measurePatch(item.id, item.source),
    }
    if (!observation.exactSource || !observation.savedIdentity)
      throw new Error(`Preservation failed: ${item.id}`)
    const hasCode = observation.code.length > 0
    if (hasCode !== item.expectCode) throw new Error(`Reader classification changed: ${item.id}`)
    examples.push(observation)
    for (const name of item.names) {
      const f = family(name)
      f.reader.state = 'observed-contexts-only'
      f.reader.examples.push(item.id)
    }
  }
  const corpora = []
  for (const tier of values.wild ? ['committed', 'wild'] : ['committed']) {
    const patches = []
    const manifest = await json(`corpus/reader/${tier}.json`)
    for (const entry of manifest.toSorted((a, b) => a.id.localeCompare(b.id))) {
      if (
        tier === 'wild' &&
        !/^https:\/\/(raw\.githubusercontent\.com\/[^/]+\/[^/]+|gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[a-f0-9]{40}\/.+/.test(
          entry.url,
        )
      )
        throw new Error('Wild source must pin a full revision')
      let source
      try {
        if (tier === 'wild') {
          const response = await fetch(entry.url, { signal: AbortSignal.timeout(30_000) })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          source = await response.text()
        } else source = await bytes(entry.path)
      } catch (error) {
        if (tier !== 'wild') throw error
        patches.push({ provenance: entry, fetchFailure: String(error) })
        continue
      }
      const measured = measurePatch(entry.id, source)
      const calls = measured.parseFailures
        ? { counts: {}, customRegistrations: [] }
        : callsIn(source)
      const customNames = new Set(calls.customRegistrations.flatMap((r) => r.names ?? []))
      for (const [name, count] of Object.entries(calls.counts)) {
        const f = byName.get(name)
        if (f && !customNames.has(name)) f.corpus[tier] += count
      }
      patches.push({ provenance: entry, sha256: sha(source), reader: measured, ...calls })
    }
    const measured = patches.filter((p) => p.reader).map((p) => p.reader)
    corpora.push({
      tier,
      manifest: await hash(`corpus/reader/${tier}.json`),
      fetchFailures: patches.length - measured.length,
      ...summarize(measured),
      patches,
    })
  }
  if (!values.wild) {
    const recorded = await json('docs/research/strudel-api-coverage/wild-observation.json')
    if (
      recorded.tier !== 'wild' ||
      recorded.manifest.sha256 !== sha(await bytes('corpus/reader/wild.json')) ||
      !Array.isArray(recorded.patches)
    )
      throw new Error('Recorded wild evidence must match pinned manifest')
    corpora.push(recorded)
    for (const p of recorded.patches)
      for (const [name, count] of Object.entries(p.counts ?? {})) {
        const f = byName.get(name)
        const customNames = new Set((p.customRegistrations ?? []).flatMap((r) => r.names ?? []))
        if (f && !customNames.has(name)) f.corpus.wild = (f.corpus.wild ?? 0) + count
      }
    for (const f of families.values()) if (f.corpus.wild === null) f.corpus.wild = 0
  }
  for (const corpus of corpora)
    for (const patch of corpus.patches) {
      const customNames = new Set((patch.customRegistrations ?? []).flatMap((r) => r.names ?? []))
      patch.callDispositions = Object.fromEntries(
        Object.keys(patch.counts ?? {}).map((name) => [
          name,
          customNames.has(name)
            ? 'declared-custom-or-shadowed'
            : byName.has(name)
              ? 'pinned-name-syntax-only'
              : 'unknown-or-external',
        ]),
      )
    }
  const priorities = (await json('docs/research/strudel-api-coverage/priorities.json')).map(
    (group) => ({
      ...group,
      corpus: Object.fromEntries(
        corpora.map((corpus) => [
          corpus.tier,
          {
            syntacticCalls: corpus.patches.reduce(
              (sum, p) => sum + group.names.reduce((n, name) => n + (p.counts?.[name] ?? 0), 0),
              0,
            ),
            unmappedOuterCalls: corpus.unmapped
              .filter((u) => group.names.includes(u.name))
              .reduce((sum, u) => sum + u.count, 0),
          },
        ]),
      ),
    }),
  )
  const dispositions = await json('docs/research/strudel-api-coverage/dispositions.json')
  for (const f of families.values()) {
    f.availability = [...new Set(f.availability)].sort((a, b) => a.localeCompare(b))
    if (!f.availability.length) f.availability = ['source-only-candidate']
    f.catalog = f.names.flatMap((name) =>
      byName.get(name) === f ? (owners.get(name) ?? []).map((module) => ({ name, module })) : [],
    )
    f.controls = CATALOG.flatMap((spec) =>
      spec.controls
        .filter(
          (c) =>
            c.call &&
            (typeof c.call.method === 'string'
              ? [c.call.method]
              : Object.values(c.call.method.names)
            ).some((name) => f.names.includes(name) && byName.get(name) === f),
        )
        .map((c) => ({
          module: spec.id,
          control: c.id,
          definition: c,
        })),
    )
    if (f.catalog.length)
      f.generator = {
        state: 'catalog-declared',
        evidence: 'src/modules/catalog.ts; src/codegen/generate.ts',
        restriction:
          'Declaration alone does not prove every form or context; see examples and #246 overlay',
      }
    const disposition =
      dispositions[f.canonical] ?? f.names.map((name) => dispositions[name]).find(Boolean)
    if (disposition) Object.assign(f, disposition)
  }
  const sourcePaths = [
    'src/modules/catalog.ts',
    ...globSync('src/reader/*.ts', { cwd: root }),
    ...globSync('src/codegen/*.ts', { cwd: root }),
    'src/strudel/engine.ts',
    'src/patch/types.ts',
    'src/workspace/document.ts',
    'package-lock.json',
    'scripts/strudel-api-inventory.mjs',
    'scripts/strudel-api-inventory-scan.mjs',
    'docs/research/strudel-api-coverage/examples.json',
    'docs/research/strudel-api-coverage/dispositions.json',
    'docs/research/strudel-api-coverage/wild-observation.json',
    'docs/research/strudel-api-coverage/priorities.json',
  ].sort((a, b) => a.localeCompare(b))
  const report = {
    version: 1,
    provenance: {
      node: process.version,
      lock: await hash('package-lock.json'),
      inputs: await Promise.all(sourcePaths.map(hash)),
      counting:
        'Registration aliases grouped; packed fields excluded; numbered controls expanded; source candidates retained with unknown availability. Corpus calls count all syntactic CallExpressions, separately from production-reader metrics.',
      exclusions:
        'No dependency tests/bench/docs/dist duplicates except actual web ESM entry; no arbitrary factory execution, browser initialization, network samples or untrusted corpus evaluation.',
    },
    packages,
    counts: {
      catalogModules: CATALOG.length,
      catalogOwnedNames: owners.size,
      catalogStrudelNames: new Set(CATALOG.flatMap((m) => m.strudel)).size,
      coreLiteralRegistrationGroups: coreLiteral.length,
      coreLiteralGroupsWithoutOwnership: coreLiteral.filter(
        (r) =>
          !coreRegistrations
            .filter((x) => x.path === r.path && x.line === r.line)
            .some((x) => x.names.some((name) => owners.has(name))),
      ).length,
      families: families.size,
      bundleExports: exportNames.size,
      initStrudelScopeNames: evalScopeNames.size,
      replEvaluationScopeNames: new Set(replScopes.flatMap((scope) => scope.direct)).size,
      bundleDirectPatternMethods: bundleMethods.length,
      unresolvedSites:
        scans.reduce((sum, s) => sum + s.unresolved.length, 0) + bundle.unresolved.length,
    },
    surfaces: {
      bundleExports: bundle.exports,
      initializationScopes: bundle.evalScopes,
      constructorWrappers: bundle.wrappers.filter((w) => exportedLocal.has(w.target)),
      namespaces: bundle.namespaces.filter((n) =>
        bundle.evalScopes.some((s) => s.references.includes(n.local)),
      ),
      bundleClassAndPrototypeMethods: allMethods,
      sourceExports: scans.map((s) => ({ package: s.package, path: s.path, exports: s.exports })),
      sourceDefinitions: scans.flatMap((s) =>
        s.definitions.map((d) => ({ ...d, package: s.package })),
      ),
    },
    families: [...families.values()].sort((a, b) => a.id.localeCompare(b.id)),
    unresolvedSites: [
      ...scans.flatMap((s) => s.unresolved.map((r) => ({ ...r, package: s.package }))),
      ...bundle.unresolved.map((r) => ({ ...r, package: '@strudel/web', bundled: true })),
    ],
    priorities,
    aliasToFamily: Object.fromEntries(
      [...byName.entries()].map(([name, f]) => [name, f.id]).sort(([a], [b]) => a.localeCompare(b)),
    ),
    aliasCollisions,
    examples,
    corpus: corpora,
  }
  const output = resolve(root, values.output ?? 'docs/research/strudel-api-coverage/inventory.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report.counts) + `\nInventory: ${output}\n`)
}
