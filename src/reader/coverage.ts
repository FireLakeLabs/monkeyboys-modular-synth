import { read } from './read'
import { readLayout } from './layout'
import { parseSource, type ParsedScope } from './syntax'

export interface CoverageCounts {
  patches: number
  parseFailures: number
  calls: number
  mappedCalls: number
  voices: number
  readableVoices: number
  patchesWithoutCode: number
  codeBlocks: number
}

export interface PatchCoverage extends CoverageCounts {
  id: string
  unmapped: Record<string, number>
  failure?: string
}

const emptyCounts = (): CoverageCounts => ({
  patches: 0,
  parseFailures: 0,
  calls: 0,
  mappedCalls: 0,
  voices: 0,
  readableVoices: 0,
  patchesWithoutCode: 0,
  codeBlocks: 0,
})

/** Same chain/scopes and ownership as the production reader; never evaluates source. */
export function measurePatch(id: string, source: string): PatchCoverage {
  const counts: PatchCoverage = { ...emptyCounts(), id, patches: 1, unmapped: {} }
  const unmapped = new Map<string, number>()
  // Keep syntax failures separate from reader defects: unexpected projection errors must fail the job.
  let scopes: ParsedScope[]
  try {
    scopes = parseSource(source).scopes
  } catch (error) {
    return {
      ...counts,
      parseFailures: 1,
      failure: error instanceof Error ? error.message : String(error),
    }
  }
  const document = read(source)
  const types = new Map(document.patch.modules.map((module) => [module.id, module.type]))
  const bindings = document.bindings
  const saved = document.layout === 'restored' ? readLayout(source) : undefined
  const routing = saved?.kind === 'valid' ? saved.layout.scopes : []
  const declarations = new Map(
    scopes
      .filter((scope) => scope.kind === 'declaration')
      .map((scope) => [scope.descriptor.anchor, scope]),
  )
  const opaque = new Set<string>()
  for (const scope of scopes) {
    if (scope.kind === 'tempo') continue
    const owners = bindings.filter(
      (binding) => binding.scope === scope.descriptor.id && !binding.path && !binding.loop,
    )
    // Unused declarations and setup helpers have no rack projection.
    if (scope.kind === 'declaration' && owners.length === 0) continue
    if (
      bindings.some(
        (binding) => binding.scope === scope.descriptor.id && types.get(binding.module) === 'code',
      )
    )
      opaque.add(scope.descriptor.id)
    for (const [index, call] of scope.calls.entries()) {
      // Proven generator routing is infrastructure, not a module or an unmapped call.
      if (routing[scopes.indexOf(scope)]?.routing?.call === index) continue
      counts.calls++
      const callOwners = owners.filter((binding) => binding.calls.includes(index))
      if (callOwners.length && callOwners.every((binding) => types.get(binding.module) !== 'code'))
        counts.mappedCalls++
      else {
        unmapped.set(call.name, (unmapped.get(call.name) ?? 0) + 1)
        opaque.add(scope.descriptor.id)
      }
    }
  }
  function readable(scope: ParsedScope, visited = new Set<string>()): boolean {
    if (opaque.has(scope.descriptor.id) || visited.has(scope.descriptor.id)) return false
    visited.add(scope.descriptor.id)
    const dependency =
      scope.root.type === 'Identifier' ? declarations.get(scope.root.name) : undefined
    return !dependency || readable(dependency, visited)
  }
  const voices = scopes.filter((scope) => scope.kind === 'voice')
  counts.voices = voices.length
  counts.readableVoices = voices.filter((scope) => readable(scope)).length
  counts.codeBlocks = document.patch.modules.filter((module) => module.type === 'code').length
  counts.patchesWithoutCode = counts.codeBlocks === 0 ? 1 : 0
  counts.unmapped = Object.fromEntries(unmapped)
  return counts
}

export function summarize(patches: readonly PatchCoverage[]): {
  totals: CoverageCounts
  shares: {
    mappedCalls: number | null
    readableVoices: number | null
    patchesWithoutCode: number | null
  }
  unmapped: { name: string; count: number }[]
} {
  const totals = emptyCounts()
  const unmapped = new Map<string, number>()
  for (const patch of patches) {
    for (const key of Object.keys(totals) as (keyof CoverageCounts)[]) totals[key] += patch[key]
    for (const [name, count] of Object.entries(patch.unmapped))
      unmapped.set(name, (unmapped.get(name) ?? 0) + count)
  }
  const share = (part: number, whole: number) => (whole ? part / whole : null)
  return {
    totals,
    shares: {
      mappedCalls: share(totals.mappedCalls, totals.calls),
      readableVoices: share(totals.readableVoices, totals.voices),
      patchesWithoutCode: share(totals.patchesWithoutCode, totals.patches),
    },
    unmapped: [...unmapped]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  }
}

/** A baseline stores only gate-owned metrics, independent of timestamps and report provenance. */
export function baselineFor(
  patches: readonly PatchCoverage[],
): Record<string, Record<string, number>> {
  const metrics = (counts: CoverageCounts, unmapped: Record<string, number>) => ({
    mappedCallShare: counts.calls ? counts.mappedCalls / counts.calls : 1,
    readableVoiceShare: counts.voices ? counts.readableVoices / counts.voices : 1,
    codeFreePatchShare: counts.patches ? counts.patchesWithoutCode / counts.patches : 1,
    parseFailures: counts.parseFailures,
    codeBlocks: counts.codeBlocks,
    unmappedCalls: counts.calls - counts.mappedCalls,
    ...Object.fromEntries(
      Object.entries(unmapped).map(([name, count]) => [`unmapped:${name}`, count]),
    ),
  })
  const summary = summarize(patches)
  return Object.fromEntries([
    [
      '$total',
      metrics(
        summary.totals,
        Object.fromEntries(summary.unmapped.map(({ name, count }) => [name, count])),
      ),
    ],
    ...patches.map((patch) => [patch.id, metrics(patch, patch.unmapped)]),
  ])
}

export function regressions(patches: readonly PatchCoverage[], baseline: unknown): string[] {
  const current = baselineFor(patches)
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline))
    throw new Error('Invalid coverage baseline')
  const previous = new Map<string, Record<string, number>>()
  for (const [id, value] of Object.entries(baseline)) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid coverage baseline')
    const row: Record<string, number> = {}
    for (const [key, metric] of Object.entries(value)) {
      if (
        ![
          'mappedCallShare',
          'readableVoiceShare',
          'codeFreePatchShare',
          'parseFailures',
          'codeBlocks',
          'unmappedCalls',
        ].includes(key) &&
        !key.startsWith('unmapped:')
      )
        throw new Error(`Unknown baseline metric: ${key}`)
      if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < 0)
        throw new Error('Invalid coverage baseline metric')
      row[key] = metric
    }
    for (const key of [
      'mappedCallShare',
      'readableVoiceShare',
      'codeFreePatchShare',
      'parseFailures',
      'codeBlocks',
      'unmappedCalls',
    ])
      if (!(key in row)) throw new Error(`Missing baseline metric: ${key}`)
    previous.set(id, row)
  }
  const failures: string[] = []
  for (const id of new Set([...Object.keys(current), ...previous.keys()])) {
    const now = current[id],
      before = previous.get(id)
    if (!now || !before) {
      failures.push(`${id}: corpus membership changed`)
      continue
    }
    for (const key of new Set([...Object.keys(now), ...Object.keys(before)])) {
      const actual = now[key] ?? 0,
        expected = before[key] ?? 0
      if (key.endsWith('Share') ? actual < expected : actual > expected)
        failures.push(`${id}: ${key} ${expected} -> ${actual}`)
    }
  }
  return failures
}
