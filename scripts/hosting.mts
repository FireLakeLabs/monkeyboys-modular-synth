import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hosting } from '../infra/config.mts'

export type Aws = (args: string[]) => unknown

export const aws: Aws = (args) => {
  const output = execFileSync('aws', [...args, '--region', hosting.region, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, AWS_PAGER: '' },
  }).trim()
  return output ? (JSON.parse(output) as unknown) : null
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an AWS object')
  }
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an AWS list')
  return value
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected a nonempty string')
  return value
}

export function resolveTargets(run: Aws) {
  const identity = record(run(['sts', 'get-caller-identity']))
  if (identity['Account'] !== hosting.account) throw new Error('Unexpected AWS account')
  const response = record(
    run(['cloudformation', 'describe-stacks', '--stack-name', hosting.stackName]),
  )
  const stack = record(array(response['Stacks'])[0])
  if (
    !string(stack['StackId']).startsWith(
      `arn:aws:cloudformation:${hosting.region}:${hosting.account}:stack/${hosting.stackName}/`,
    )
  ) {
    throw new Error('Unexpected hosting stack')
  }
  const outputs = new Map(
    array(stack['Outputs']).map((entry) => {
      const output = record(entry)
      return [string(output['OutputKey']), string(output['OutputValue'])]
    }),
  )
  const bucket = string(outputs.get('WebsiteBucketName'))
  const releases = string(outputs.get('ReleasesBucketName'))
  const distribution = string(outputs.get('DistributionId'))
  const url = string(outputs.get('WebsiteUrl'))
  if (
    ![bucket, releases].every((name) => /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) ||
    bucket === releases ||
    !/^[A-Z0-9]+$/.test(distribution) ||
    url !== `https://${hosting.hostname}`
  ) {
    throw new Error('Invalid hosting outputs')
  }
  const data = record(run(['cloudfront', 'get-distribution', '--id', distribution]))
  const config = record(record(data['Distribution'])['DistributionConfig'])
  const aliases = array(record(config['Aliases'])['Items'])
  const origins = array(record(config['Origins'])['Items'])
  if (
    config['Enabled'] !== true ||
    aliases.length !== 1 ||
    aliases[0] !== hosting.hostname ||
    origins.length !== 1
  ) {
    throw new Error('Unexpected CloudFront distribution')
  }
  const origin = record(origins[0])
  if (
    origin['DomainName'] !== `${bucket}.s3.${hosting.region}.amazonaws.com` ||
    (origin['OriginPath'] ?? '') !== '' ||
    !origin['OriginAccessControlId'] ||
    origin['CustomOriginConfig']
  ) {
    throw new Error('CloudFront origin does not match the stack bucket and OAC')
  }
  const behavior = record(config['DefaultCacheBehavior'])
  if (
    behavior['TargetOriginId'] !== origin['Id'] ||
    behavior['ViewerProtocolPolicy'] !== 'redirect-to-https'
  ) {
    throw new Error('Unexpected default CloudFront behavior')
  }
  return { bucket, releases, distribution, url }
}

export function releaseId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value)) throw new Error('Invalid release ID')
  return value
}
function safePath(value: string): boolean {
  return (
    /^[a-zA-Z0-9_./-]+$/.test(value) &&
    !value.startsWith('/') &&
    value.split('/').every((part) => part !== '.' && part !== '..' && part !== '')
  )
}
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
export type Manifest = { version: 1; release: string; files: { path: string; sha256: string }[] }

export function parseManifest(value: unknown, selected: string): Manifest {
  const source = record(value)
  if (source['version'] !== 1 || source['release'] !== selected)
    throw new Error('Unexpected release manifest')
  const paths = new Set<string>()
  const files = array(source['files']).map((entry) => {
    const file = record(entry)
    const path = string(file['path'])
    const sha256 = string(file['sha256'])
    if (
      !safePath(path) ||
      paths.has(path) ||
      path === 'release.json' ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      throw new Error('Invalid release file')
    paths.add(path)
    return { path, sha256 }
  })
  if (!paths.has('index.html')) throw new Error('Missing release homepage')
  return { version: 1, release: releaseId(selected), files }
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = []
  for (const name of await readdir(join(directory, prefix))) {
    const path = prefix ? `${prefix}/${name}` : name
    const stat = await lstat(join(directory, path))
    if (stat.isDirectory()) files.push(...(await listFiles(directory, path)))
    else if (stat.isFile() && safePath(path) && path !== 'release.json') files.push(path)
    else throw new Error(`Unsupported artifact entry: ${path}`)
  }
  return files.sort()
}

export async function createManifest(directory: string, selected: string): Promise<Manifest> {
  const files = await Promise.all(
    (await listFiles(directory)).map(async (path) => ({
      path,
      sha256: hash(await readFile(join(directory, path))),
    })),
  )
  return parseManifest({ version: 1, release: selected, files }, selected)
}

async function verifyFiles(directory: string, manifest: Manifest): Promise<void> {
  for (const file of manifest.files) {
    if (hash(await readFile(join(directory, file.path))) !== file.sha256)
      throw new Error(`Artifact checksum mismatch: ${file.path}`)
  }
}

export async function publish(options: {
  run: Aws
  directory: string
  manifest: Manifest
  archive: boolean
  verifyHomepage?: (url: string, expected: Uint8Array) => Promise<void>
}): Promise<void> {
  const { run, directory, manifest } = options
  await verifyFiles(directory, manifest)
  const target = resolveTargets(run)
  if (options.archive) {
    const existing = record(
      run([
        's3api',
        'list-objects-v2',
        '--bucket',
        target.releases,
        '--prefix',
        `${manifest.release}/`,
        '--max-keys',
        '1',
      ]),
    )
    if (existing['KeyCount'] !== 0)
      throw new Error('Release ID already exists; use rollback to restore it')
    for (const file of manifest.files) {
      run([
        's3',
        'cp',
        join(directory, file.path),
        `s3://${target.releases}/${manifest.release}/${file.path}`,
        '--only-show-errors',
      ])
    }
    const temporary = await mkdtemp(join(tmpdir(), 'mms-manifest-'))
    try {
      const path = join(temporary, 'release.json')
      await writeFile(path, JSON.stringify(manifest))
      // The manifest is the completion marker; an interrupted archive cannot be restored.
      run([
        's3',
        'cp',
        path,
        `s3://${target.releases}/${manifest.release}/release.json`,
        '--only-show-errors',
      ])
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  // Keep every old asset; publishing never deletes objects. HTML is the final write.
  const ordered = [...manifest.files].sort(
    (a, b) => Number(a.path === 'index.html') - Number(b.path === 'index.html'),
  )
  for (const file of ordered) {
    const cache = file.path.startsWith('assets/')
      ? 'public,max-age=31536000,immutable'
      : 'no-cache,max-age=0,must-revalidate'
    run([
      's3',
      'cp',
      join(directory, file.path),
      `s3://${target.bucket}/${file.path}`,
      '--cache-control',
      cache,
      '--only-show-errors',
    ])
  }
  const invalidation = record(
    record(
      run([
        'cloudfront',
        'create-invalidation',
        '--distribution-id',
        target.distribution,
        '--paths',
        '/*',
      ]),
    )['Invalidation'],
  )
  run([
    'cloudfront',
    'wait',
    'invalidation-completed',
    '--distribution-id',
    target.distribution,
    '--id',
    string(invalidation['Id']),
  ])
  await (options.verifyHomepage ?? verifyHomepage)(
    target.url,
    await readFile(join(directory, 'index.html')),
  )
  process.stdout.write(`Verified release ${manifest.release} at ${target.url}\n`)
}

async function verifyHomepage(url: string, expected: Uint8Array): Promise<void> {
  const response = await fetch(`${url}/`, {
    signal: AbortSignal.timeout(60_000),
    redirect: 'error',
  })
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(expected))
    throw new Error('Live homepage differs from the selected artifact')
}

export async function restore(run: Aws, selected: string): Promise<void> {
  releaseId(selected)
  const target = resolveTargets(run)
  const directory = await mkdtemp(join(tmpdir(), 'mms-rollback-'))
  try {
    const manifestPath = join(directory, 'release.json')
    run([
      's3',
      'cp',
      `s3://${target.releases}/${selected}/release.json`,
      manifestPath,
      '--only-show-errors',
    ])
    const manifest = parseManifest(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
      selected,
    )
    for (const file of manifest.files) {
      const path = join(directory, file.path)
      await mkdir(dirname(path), { recursive: true })
      run([
        's3',
        'cp',
        `s3://${target.releases}/${selected}/${file.path}`,
        path,
        '--only-show-errors',
      ])
    }
    await publish({ run, directory, manifest, archive: false })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, selected, directory] = process.argv.slice(2)
  if (command === 'deploy' && selected && directory) {
    await publish({
      run: aws,
      directory,
      manifest: await createManifest(directory, releaseId(selected)),
      archive: true,
    })
  } else if (command === 'rollback' && selected && !directory) {
    await restore(aws, selected)
  } else
    throw new Error('Usage: node scripts/hosting.mts deploy RELEASE_ID DIST | rollback RELEASE_ID')
}
