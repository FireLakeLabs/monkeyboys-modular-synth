import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const read = (file: string) => readFileSync(file, 'utf8')
const legal = (name: string) => read(resolve('scripts/licenses', name))
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const modificationHeader = legal('modification-header.txt')

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a package metadata object')
  return value as Record<string, unknown>
}
const metadata = (directory: string) => record(JSON.parse(read(join(directory, 'package.json'))))

export function buildRevision(env: NodeJS.ProcessEnv = process.env, root = process.cwd()) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const snapshot = join(root, 'source-revision.json')
  if (existsSync(snapshot)) {
    const value = record(JSON.parse(read(snapshot)))
    if (
      env['MMS_RELEASE_ID'] ||
      typeof value['revision'] !== 'string' ||
      !/^[a-f\d]{40}$/.test(value['revision'])
    )
      throw Error('Source downloads may only build as local checkouts')
    return { revision: value['revision'], local: true }
  }
  const revision = git(['rev-parse', 'HEAD'])
  if (!/^[a-f\d]{40}$/.test(revision)) throw Error('Missing source revision')
  const dirty = !!git(['status', '--porcelain', '--untracked-files=normal'])
  if (env['MMS_RELEASE_ID'] && (env['GITHUB_SHA'] !== revision || dirty))
    throw Error('Production requires a clean checkout matching GITHUB_SHA')
  return { revision, local: dirty || !env['MMS_RELEASE_ID'] }
}

export function packageNotice(directory: string) {
  const meta = metadata(directory)
  const files = readdirSync(directory).filter(
    (name) =>
      /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name) &&
      statSync(join(directory, name)).isFile(),
  )
  if (!files.length && meta['name'] === '@tonaljs/progression' && meta['version'] === '4.9.4')
    return `${meta['name']}@${meta['version']} — MIT\n${legal('tonal-MIT.txt')}`
  if (!files.length && meta['name'] === 'chord-voicings' && meta['version'] === '0.0.1')
    return legal('chord-voicings-ISC.txt')
  if (typeof meta['license'] !== 'string' || !files.length)
    throw Error(`Missing licence text: ${String(meta['name'])}`)
  return `${String(meta['name'])}@${String(meta['version'])} — ${meta['license']}\n${files
    .sort()
    .map((file) => `${file}\n${read(join(directory, file))}`)
    .join('\n')}`
}

// Audits are tied to consumed artifacts, including our verified local modifications.
const embedded = [
  {
    name: '@strudel/web',
    version: '1.3.0',
    digest: '310ef9c1172ad3ecb4f7981a2743164f01cd42015a3207fce541366b7839bef5',
  },
  {
    name: 'superdough',
    version: '1.3.0',
    digest: '6ce4e2a270f3156f499072129e437233fa6ece7d5e5ff31c8687909d3d776faa',
  },
  {
    name: '@kabelsalat/web',
    version: '0.4.1',
    digest: '35b145b9dec4243d80ebcb2dbc3ad002cffac418709f7d3d3edbbadfb65fe09c',
  },
] as const

export function generateLicenses(moduleIds: Iterable<string>, revision: string) {
  const directories = new Set<string>()
  for (const id of moduleIds) {
    if (!id.includes('/node_modules/')) continue
    let directory = dirname(id.replace(/^\0/, '').split('?')[0] ?? id)
    while (directory.includes('/node_modules/')) {
      if (existsSync(join(directory, 'package.json')) && metadata(directory)['name']) {
        directories.add(directory)
        break
      }
      directory = dirname(directory)
    }
  }
  const covered = new Map(upstreamSources().flatMap((source) => Object.entries(source.packages)))
  for (const directory of directories) {
    const meta = metadata(directory)
    if (
      typeof meta['license'] === 'string' &&
      /AGPL/.test(meta['license']) &&
      (typeof meta['name'] !== 'string' || covered.get(meta['name']) !== meta['version'])
    )
      throw Error(`Missing preferred source for ${String(meta['name'])}@${String(meta['version'])}`)
  }
  const notices = [...directories].map(packageNotice)
  for (const directory of directories) {
    const meta = metadata(directory)
    const audit = embedded.find((item) => item.name === meta['name'])
    if (!audit) continue
    const artifact = read(join(directory, 'dist/index.mjs')).replace(modificationHeader, '')
    if (meta['version'] !== audit.version || hash(artifact) !== audit.digest)
      throw Error(`Review embedded licence inventory: ${audit.name}`)
    notices.push(legal(`${audit.name.replaceAll('/', '-')}-${audit.version}.txt`))
  }
  return (
    [
      `MonkeyBoy’s Modular Synth — licences and third-party notices\nSource revision: ${revision}`,
      'Original project source is MIT. The combined software application is distributed under AGPL-3.0-or-later terms. No warranty. Music, recordings, fonts and trademarks retain their separate rights.',
      read('LICENSE'),
      legal('AGPL-3.0.txt'),
      legal('modifications.txt'),
      legal('assets.txt'),
      legal('Octicons.txt'),
      legal('fonts.txt'),
      ...notices.sort(),
    ].join('\n\n============================================================\n\n') + '\n'
  )
}

type Upstream = {
  name: string
  revision: string
  url: string
  sha256: string
  packages: Record<string, string>
}
export function upstreamSources(): Upstream[] {
  const value: unknown = JSON.parse(legal('upstream.json'))
  if (!Array.isArray(value)) throw Error('Missing upstream source inventory')
  return value.map((entry: unknown) => {
    const item = record(entry)
    if (
      typeof item['name'] !== 'string' ||
      !/^[a-z-]+$/.test(item['name']) ||
      typeof item['revision'] !== 'string' ||
      !/^[a-f\d]{40}$/.test(item['revision']) ||
      typeof item['url'] !== 'string' ||
      !item['url'].startsWith('https://codeberg.org/') ||
      typeof item['sha256'] !== 'string' ||
      !/^[a-f\d]{64}$/.test(item['sha256'])
    )
      throw Error('Invalid upstream source inventory')
    const packages = record(item['packages'])
    if (!Object.values(packages).every((version) => typeof version === 'string'))
      throw Error('Invalid source package versions')
    return {
      packages: packages as Record<string, string>,
      name: item['name'],
      revision: item['revision'],
      url: item['url'],
      sha256: item['sha256'],
    }
  })
}

export function verifySource(data: Uint8Array, source: Pick<Upstream, 'name' | 'sha256'>) {
  if (hash(data) !== source.sha256) throw Error(`Source checksum mismatch: ${source.name}`)
}

export async function prepareSources() {
  const cache = resolve('node_modules/.cache/mms-sources')
  await mkdir(cache, { recursive: true })
  return Promise.all(
    upstreamSources().map(async (source) => {
      const path = join(cache, `${source.name}.tar.gz`)
      const included = resolve('../upstream', `${source.name}.tar.gz`)
      if (!existsSync(path) && existsSync(included)) {
        const data = await readFile(included)
        verifySource(data, source)
        await writeFile(path, data)
      }
      if (!existsSync(path)) {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(60_000) })
        if (!response.ok) throw Error(`Source download failed: ${source.name} (${response.status})`)
        const data = new Uint8Array(await response.arrayBuffer())
        verifySource(data, source)
        await writeFile(path, data)
      }
      verifySource(await readFile(path), source)
      return { ...source, path }
    }),
  )
}

function runtimeDirectories() {
  const packages = record(record(JSON.parse(read('package-lock.json')))['packages'])
  return Object.entries(packages)
    .filter(
      ([path, value]) =>
        path.startsWith('node_modules/') && !record(value)['dev'] && existsSync(path),
    )
    .map(([path]) => path)
    .filter((path) => {
      // jazz-midi's browser entry is an empty stub, not its Node/native implementation.
      const meta = metadata(path)
      return !(
        meta['name'] === 'jazz-midi' &&
        meta['version'] === '1.7.9' &&
        meta['browser'] === 'skip.js' &&
        read(join(path, 'skip.js')).trim() === 'module.exports = undefined;'
      )
    })
}

// Explicit source allowlist: never include .env, Git credentials, caches or local reports.
export function applicationSources(root = process.cwd()) {
  const files: string[] = []
  const visit = (path: string) => {
    if (!existsSync(join(root, path))) return
    const info = lstatSync(join(root, path))
    if (info.isDirectory()) {
      for (const entry of readdirSync(join(root, path))) visit(`${path}/${entry}`)
    } else if (info.isFile()) files.push(path)
  }
  for (const path of ['src', 'scripts', 'infra', 'tests', 'public', '.agents']) visit(path)
  for (const path of readdirSync(root)) if (lstatSync(join(root, path)).isFile()) files.push(path)
  if (existsSync(join(root, 'docs/licensing.md'))) files.push('docs/licensing.md')
  return [...new Set(files)]
    .filter(
      (path) =>
        /^(src|scripts|infra|tests|public|\.agents)\//.test(path) ||
        /^(package(?:-lock)?\.json|(?:tsconfig[^/]*\.json)|(?:vite|vitest)\.config\.ts|playwright\.config\.mjs|index\.html|LICENSE|README\.md|\.node-version|\.oxlintrc\.json|\.prettierignore|\.prettierrc\.json)$/.test(
          path,
        ) ||
        path === 'AGENTS.md' ||
        path === 'source-revision.json' ||
        path === 'docs/licensing.md' ||
        path === '.prettierrc',
    )
    .filter((path) => !/(^|\/)(\.env[^/]*|[^/]*\.(?:pem|key|p12|local))$/.test(path))
    .filter((path) => existsSync(join(root, path)) && lstatSync(join(root, path)).isFile())
    .sort()
}

export async function sourceArchive(revision: string, notices: string) {
  const archives = await prepareSources()
  const temporary = await mkdtemp(join(tmpdir(), 'mms-source-'))
  try {
    for (const path of applicationSources()) {
      const destination = join(temporary, 'source/app', path)
      await mkdir(dirname(destination), { recursive: true })
      await cp(path, destination)
    }
    await writeFile(
      join(temporary, 'source/app/source-revision.json'),
      JSON.stringify({ revision }),
    )
    // Include installed runtime packages as conveyed, in addition to upstream preferred source.
    for (const directory of runtimeDirectories()) {
      await cp(directory, join(temporary, 'source/app', directory), {
        recursive: true,
        filter: (path) => !path.includes('/node_modules/.cache/'),
      })
    }
    await mkdir(join(temporary, 'source/upstream'), { recursive: true })
    for (const source of archives)
      await cp(source.path, join(temporary, 'source/upstream', `${source.name}.tar.gz`))
    await writeFile(
      join(temporary, 'source/README.txt'),
      `Source revision: ${revision}\n\n${legal('modifications.txt')}\n\n${legal('upstream.json')}`,
    )
    await writeFile(join(temporary, 'source/licenses.txt'), notices)
    execFileSync('tar', [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-czf',
      join(temporary, 'source.tar.gz'),
      '-C',
      temporary,
      'source',
    ])
    return await readFile(join(temporary, 'source.tar.gz'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export function licensePlugins(release: string | undefined) {
  const build = buildRevision()
  const sourceDigest = createHash('sha256')
  for (const file of applicationSources()) sourceDigest.update(file).update(readFileSync(file))
  const base = `assets/${release ?? `local-${sourceDigest.digest('hex').slice(0, 20)}`}`
  const info = {
    ...build,
    noticesUrl: `/${base}/licenses.txt`,
    sourceUrl: `/${base}/corresponding-source.tar.gz`,
  }
  const modules = new Set<string>()
  // Vite's worker bundler and Rolldown chunks expose rendered module IDs.
  const collect = (
    bundle: Record<string, { type: string; modules?: Record<string, { renderedLength: number }> }>,
  ) => {
    for (const chunk of Object.values(bundle))
      if (chunk.type === 'chunk')
        for (const [id, value] of Object.entries(chunk.modules ?? {}))
          if (value.renderedLength > 0) modules.add(id)
  }
  const worker = (): Plugin => ({
    name: 'worker-licences',
    generateBundle(_, bundle) {
      collect(bundle)
    },
  })
  const app: Plugin = {
    name: 'app-licences',
    config() {
      return { define: { __LICENSE_BUILD__: JSON.stringify(info) } }
    },
    buildStart() {
      modules.clear()
    },
    async generateBundle(_, bundle) {
      collect(bundle)
      const notices = generateLicenses(modules, build.revision)
      this.emitFile({ type: 'asset', fileName: `${base}/licenses.txt`, source: notices })
      this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: notices })
      this.emitFile({
        type: 'asset',
        fileName: `${base}/corresponding-source.tar.gz`,
        source: await sourceArchive(build.revision, notices),
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0]
        if (![info.noticesUrl, info.sourceUrl, '/licenses.txt'].includes(url ?? '')) return next()
        const notices = generateLicenses(
          runtimeDirectories().map((path) => `${resolve(path)}/package.json`),
          build.revision,
        )
        if (url !== info.sourceUrl) {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          response.end(notices)
          return
        }
        sourceArchive(build.revision, notices)
          .then((data) => {
            response.setHeader('Content-Type', 'application/gzip')
            response.end(data)
          })
          .catch(next)
      })
    },
  }
  return { app, worker }
}
