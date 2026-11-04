import { parse } from 'acorn'
import { generateDocument } from '../codegen/generate'
import {
  descriptor,
  RACK_MARKER,
  type Binding,
  type RackLayout,
  type Scope,
} from '../codegen/layout'
import { CATALOG, ENV, OUT, VCF } from '../modules/catalog'
import { looksFor } from '../modules/looks'
import type { Cable, ControlValue, Patch, PlacedModule } from '../patch/types'
import { parseSource, type ParsedScope } from './syntax'
import { rackMarker } from './metadata'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The reader normalizes scale tonics; that spelling change does not move routing. */
function routingSyntax(scope: Scope): Scope {
  return {
    ...scope,
    calls: scope.calls.map((call) => {
      if (call.name !== 'scale') return call
      const args: unknown = JSON.parse(call.arguments)
      if (!Array.isArray(args) || args.length !== 1) return call
      const arg: unknown = args[0]
      if (!record(arg) || arg.type !== 'Literal' || typeof arg.value !== 'string') return call
      const value = arg.value.charAt(0).toUpperCase() + arg.value.slice(1)
      return { ...call, arguments: descriptor([{ ...arg, value }]) }
    }),
  }
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
  if (value.name !== undefined && typeof value.name !== 'string')
    throw new Error('Invalid saved patch name')
  if (value.prelude !== undefined && typeof value.prelude !== 'string')
    throw new Error('Invalid saved prelude')
  if (value.rows !== undefined && typeof value.rows !== 'number')
    throw new Error('Invalid saved row count')
  return {
    version: 1,
    ...(value.name === undefined ? {} : { name: value.name }),
    modules,
    cables,
    names,
    ...(value.prelude === undefined ? {} : { prelude: value.prelude }),
    ...(value.rows === undefined ? {} : { rows: value.rows }),
  }
}

export type SavedLayout =
  | { kind: 'absent' }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; layout: RackLayout; patch: Patch; generated: string }

export function readLayout(source: string): SavedLayout {
  const marker = rackMarker(source)
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
    if (record(raw) && typeof raw.source === 'string') {
      const snapshot = parseSource(raw.source)
      parse(raw.source, {
        ecmaVersion: 'latest',
        onComment: (block, text) => {
          if (!block && `//${text}` === RACK_MARKER) throw new Error('Nested rack metadata')
        },
      })
      // Validate scope/binding shape against the generator before interpreting addresses.
      // Semantic agreement with the snapshot is checked by read() using its projection.
      if (!Array.isArray(raw.scopes) || !Array.isArray(raw.modules))
        throw new Error('Invalid source layout')
      const scopes = snapshot.scopes.map((scope) => scope.descriptor)
      const normalized = raw.scopes.map((scope: unknown) => {
        if (!record(scope)) throw new Error('Invalid source scope')
        const { routing: _routing, ...syntax } = scope
        return syntax
      })
      if (ordered(normalized) !== ordered(scopes))
        throw new Error('Source scopes do not match snapshot')
      const rawModules = raw.modules
      const rawScopes = raw.scopes
      const sourceScopes: Scope[] = scopes.map((scope, index) => {
        const candidate: unknown = rawScopes[index]
        if (!record(candidate) || candidate.routing === undefined) return scope
        // Scope IDs are addresses in this file, not generator ordinals. An unrelated
        // declaration can shift them without changing the proven routing expression.
        const proven = generated.layout.scopes.find(
          (item) =>
            ordered(routingSyntax(item)) ===
            ordered({ ...routingSyntax(scope), routing: candidate.routing, id: item.id }),
        )
        if (!proven?.routing) throw new Error('Unverifiable routing provenance')
        return { ...scope, routing: proven.routing }
      })
      const modules = generated.layout.modules.map((module, index) => {
        const candidate: unknown = rawModules[index]
        if (!record(candidate) || !Array.isArray(candidate.bindings))
          throw new Error('Invalid source bindings')
        const bindings: Binding[] = candidate.bindings.map((binding: unknown) => {
          if (
            !record(binding) ||
            typeof binding.scope !== 'string' ||
            !Array.isArray(binding.calls) ||
            (binding.role !== 'module' &&
              binding.role !== 'cv' &&
              binding.role !== 'mixer' &&
              binding.role !== 'tempo')
          )
            throw new Error('Invalid source binding')
          const scope = scopes.find((scope) => scope.id === binding.scope)
          const calls = binding.calls.map((call: unknown) => {
            if (
              !scope ||
              typeof call !== 'number' ||
              !Number.isInteger(call) ||
              call < 0 ||
              call >= scope.calls.length
            )
              throw new Error('Invalid source address')
            return call
          })
          if (!scope) throw new Error('Invalid source scope')
          let target: Binding['target']
          if (binding.target !== undefined) {
            if (
              !record(binding.target) ||
              typeof binding.target.module !== 'string' ||
              typeof binding.target.jack !== 'string' ||
              typeof binding.target.control !== 'string'
            )
              throw new Error('Invalid CV target')
            target = {
              module: binding.target.module,
              jack: binding.target.jack,
              control: binding.target.control,
            }
          }
          return { scope: binding.scope, calls, role: binding.role, ...(target ? { target } : {}) }
        })
        return { ...module, bindings }
      })
      const layout: RackLayout = {
        ...generated.layout,
        source: raw.source,
        scopes: sourceScopes,
        modules,
      }
      if (ordered(raw) !== ordered(layout)) throw new Error('Invalid source metadata fields')
      return { kind: 'valid', layout, patch, generated: raw.source }
    }
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

/** Only catalog mode aliases share a key; distinct controls never do. */
function modeMethod(name: string): string {
  if (name === 'note' || name === 'n') return 'note'
  const mode = VCF.controls.find((control) => control.id === 'mode')
  if (mode?.kind !== 'switch') return name
  const prefix = mode.options.find((option) => name.startsWith(String(option.value)))?.value
  return prefix !== undefined && (VCF.strudel.includes(name) || ENV.strudel.includes(name))
    ? `filter:${name.slice(String(prefix).length)}`
    : name
}

function modeRoot(scope: Scope): string {
  if (scope.anchor !== undefined) return root(scope)
  const ast: unknown = JSON.parse(scope.root)
  if (
    !record(ast) ||
    ast.type !== 'CallExpression' ||
    !record(ast.callee) ||
    ast.callee.type !== 'Identifier' ||
    typeof ast.callee.name !== 'string'
  )
    return root(scope)
  if (OUT.strudel.includes(ast.callee.name)) return `tempo:${ast.callee.name}`
  return descriptor({ ...ast, callee: { ...ast.callee, name: modeMethod(ast.callee.name) } })
}
const branch = (scope: Scope): string =>
  descriptor([modeRoot(scope), scope.calls.map((call) => modeMethod(call.name))])
function unique<T>(items: readonly T[], key: (item: T) => string, wanted: string): T | undefined {
  const matches = items.filter((item) => key(item) === wanted)
  return matches.length === 1 ? matches[0] : undefined
}

/** Map current scope/call addresses to proven saved addresses; never guess by position. */
export function matchScopes(
  saved: readonly Scope[],
  next: readonly ParsedScope[],
  unchangedSnapshot = false,
): Map<string, { saved: Scope; calls: Map<number, number>; exact: boolean }> {
  const result = new Map<string, { saved: Scope; calls: Map<number, number>; exact: boolean }>()
  const current = next.map((scope) => scope.descriptor)
  if (
    unchangedSnapshot &&
    saved.length === current.length &&
    saved.every((scope, index) => {
      const now = current[index]
      return now && scope.anchor === now.anchor && full(scope) === full(now)
    })
  ) {
    saved.forEach((scope, index) => {
      const now = current[index]
      if (now)
        result.set(now.id, {
          saved: scope,
          calls: new Map(now.calls.map((_, i) => [i, i])),
          exact: true,
        })
    })
    return result
  }
  for (const scope of current) {
    const key = scope.anchor === undefined ? full : root
    let previous = unique(current, key, key(scope)) ? unique(saved, key, key(scope)) : undefined
    previous ??= unique(current, root, root(scope)) ? unique(saved, root, root(scope)) : undefined
    previous ??= unique(current, modeRoot, modeRoot(scope))
      ? unique(saved, modeRoot, modeRoot(scope))
      : undefined
    previous ??= unique(current, branch, branch(scope))
      ? unique(saved, branch, branch(scope))
      : undefined
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
          unique(previous.calls, (item) => item.name, call.name)) ||
        (unique(scope.calls, (item) => modeMethod(item.name), modeMethod(call.name)) &&
          unique(previous.calls, (item) => modeMethod(item.name), modeMethod(call.name)))
      if (old) calls.set(index, previous.calls.indexOf(old))
    })
    result.set(scope.id, { saved: previous, calls, exact: full(previous) === full(scope) })
  }
  return result
}

/** Routing ownership is independent of conservative module/layout identity. */
export function matchRouting(
  saved: readonly Scope[],
  next: readonly ParsedScope[],
  snapshot: readonly ParsedScope[],
): Map<string, NonNullable<Scope['routing']>> {
  const result = new Map<string, NonNullable<Scope['routing']>>()
  const matches = matchScopes(saved, next)
  const voices = next.filter((scope) => scope.kind === 'voice')
  const oldVoices = snapshot.filter((scope) => scope.kind === 'voice')
  for (const [voiceIndex, scope] of voices.entries()) {
    const initial = scope.calls[0]
    const provenance = matches.get(scope.descriptor.id)
    // A unique proven route plus the same receiver/call names, or an unchanged
    // suffix after a root edit, survives edits with ambiguous module matching.
    const candidates = saved.filter(
      (item) =>
        item.anchor === undefined &&
        item.routing !== undefined &&
        descriptor(item.calls[item.routing.call]) === descriptor(scope.descriptor.calls.at(-1)) &&
        ((item.root === scope.descriptor.root &&
          descriptor(item.calls.map((call) => call.name)) ===
            descriptor(scope.descriptor.calls.map((call) => call.name))) ||
          (initial?.start === scope.root.start &&
            descriptor(item.calls.slice(1)) === descriptor(scope.descriptor.calls.slice(1)))),
    )
    const previous = provenance?.saved ?? (candidates.length === 1 ? candidates[0] : undefined)
    const routing = previous?.routing
    const call = scope.calls.length - 1
    if (
      routing &&
      (provenance ? provenance.calls.get(call) : call) === routing.call &&
      descriptor(scope.descriptor.calls[call]) === descriptor(previous.calls[routing.call]) &&
      // A shifted voice set may no longer agree with the writer's allocation.
      // Position constrains an independently matched route; it is not identity.
      oldVoices[voiceIndex]?.descriptor.id === previous.id
    )
      result.set(scope.descriptor.id, { call, orbit: routing.orbit })
  }
  return result
}
