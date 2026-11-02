import { parse } from 'acorn'
import { generateDocument } from '../codegen/generate'
import { descriptor, RACK_MARKER, type RackLayout, type Scope } from '../codegen/layout'
import { CATALOG } from '../modules/catalog'
import { looksFor } from '../modules/looks'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'
import type { ParsedScope } from './syntax'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function controlValue(value: unknown): value is ControlValue {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      (value.every((item: unknown) => typeof item === 'string') ||
        value.every(
          (item: unknown) =>
            record(item) &&
            typeof item.sample === 'string' &&
            Array.isArray(item.steps) &&
            item.steps.every((step: unknown) => step === 0 || step === 1),
        )))
  )
}

/** Decode only saved graph fields; the existing generator validates domain invariants. */
function patchFrom(value: unknown): Patch {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.cables) ||
    !record(value.names)
  )
    throw new Error('Unsupported or malformed rack metadata')
  const modules: PlacedModule[] = value.modules.map((item: unknown) => {
    if (!record(item) || typeof item.type !== 'string') throw new Error('Invalid saved module')
    const spec = CATALOG.find((spec) => spec.id === item.type)
    const look = spec && looksFor(spec.family).find((look) => look === item.look)
    if (
      !look ||
      typeof item.id !== 'string' ||
      typeof item.row !== 'number' ||
      typeof item.hp !== 'number' ||
      !record(item.values)
    )
      throw new Error('Invalid saved module')
    const values: Record<string, ControlValue> = {}
    for (const [key, candidate] of Object.entries(item.values)) {
      if (!controlValue(candidate)) throw new Error('Invalid saved value')
      Object.defineProperty(values, key, {
        value: candidate,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return { id: item.id, type: item.type, row: item.row, hp: item.hp, look, values }
  })
  const cables: Cable[] = value.cables.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !record(item.from) ||
      !record(item.to) ||
      typeof item.from.module !== 'string' ||
      typeof item.from.jack !== 'string' ||
      typeof item.to.module !== 'string' ||
      typeof item.to.jack !== 'string'
    )
      throw new Error('Invalid saved cable')
    return {
      id: item.id,
      from: { module: item.from.module, jack: item.from.jack },
      to: { module: item.to.module, jack: item.to.jack },
    }
  })
  const names: Record<string, string> = {}
  for (const [key, name] of Object.entries(value.names)) {
    if (typeof name !== 'string') throw new Error('Invalid saved output name')
    Object.defineProperty(names, key, {
      value: name,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return { version: 1, modules, cables, names }
}

export type SavedLayout =
  | { kind: 'absent' }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; layout: RackLayout; patch: Patch; generated: string }

export function readLayout(source: string): SavedLayout {
  let marker: number | undefined
  parse(source, {
    ecmaVersion: 'latest',
    onComment: (block, text, start) => {
      if (!block && `//${text}` === RACK_MARKER) marker = start
    },
  })
  if (marker === undefined) return { kind: 'absent' }
  try {
    const lines = source.slice(marker).split(/\r?\n/).slice(1)
    while (lines.at(-1)?.trim() === '') lines.pop()
    if (lines.some((line) => !line.startsWith('// ')))
      throw new Error('Rack block must be trailing line comments')
    const raw: unknown = JSON.parse(lines.map((line) => line.slice(3)).join('\n'))
    const patch = patchFrom(raw)
    const generated = generateDocument(patch)
    // This proves bindings, scopes and routing against the writer, rather than trusting
    // arbitrary JSON call indices. Unknown fields/versions are retained in source.
    const ordered = (value: unknown): string =>
      JSON.stringify(value, (_key, item: unknown) =>
        record(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      )
    if (ordered(raw) !== ordered(generated.layout))
      throw new Error('Unverifiable rack bindings or metadata')
    return { kind: 'valid', layout: generated.layout, patch, generated: generated.code }
  } catch (error) {
    return {
      kind: 'invalid',
      message: error instanceof Error ? error.message : 'Invalid rack metadata',
    }
  }
}

const full = (scope: Scope): string => descriptor([scope.root, scope.calls])
const root = (scope: Scope): string =>
  scope.anchor === undefined ? scope.root : `name:${scope.anchor}`
function unique<T>(items: readonly T[], key: (item: T) => string, wanted: string): T | undefined {
  const matches = items.filter((item) => key(item) === wanted)
  return matches.length === 1 ? matches[0] : undefined
}

/** Map current scope/call addresses to proven saved addresses; never guess by position. */
export function matchScopes(
  saved: readonly Scope[],
  next: readonly ParsedScope[],
): Map<string, { saved: Scope; calls: Map<number, number>; exact: boolean }> {
  const result = new Map<string, { saved: Scope; calls: Map<number, number>; exact: boolean }>()
  const current = next.map((scope) => scope.descriptor)
  for (const scope of current) {
    const key = scope.anchor === undefined ? full : root
    let previous = unique(current, key, key(scope)) ? unique(saved, key, key(scope)) : undefined
    previous ??= unique(current, root, root(scope)) ? unique(saved, root, root(scope)) : undefined
    if (!previous || previous.anchor !== scope.anchor) continue
    const calls = new Map<number, number>()
    const unchanged = descriptor(previous.calls) === descriptor(scope.calls)
    scope.calls.forEach((call, index) => {
      if (unchanged) {
        calls.set(index, index)
        return
      }
      const exact =
        unique(scope.calls, descriptor, descriptor(call)) &&
        unique(previous.calls, descriptor, descriptor(call))
      const old =
        exact ||
        (unique(scope.calls, (item) => item.name, call.name) &&
          unique(previous.calls, (item) => item.name, call.name))
      if (old) calls.set(index, previous.calls.indexOf(old))
    })
    result.set(scope.id, { saved: previous, calls, exact: full(previous) === full(scope) })
  }
  return result
}
