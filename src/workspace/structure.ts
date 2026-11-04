import { tokenizer } from 'acorn'
import { generateDocument } from '../codegen/generate'
import { descriptor, type Scope } from '../codegen/layout'
import { getModuleSpec } from '../modules/catalog'
import type { Patch } from '../patch/types'
import { matchScopes, readLayout } from '../reader/layout'
import { parseSource, type ParsedScope } from '../reader/syntax'
import type { SourceAddress, SourceDocument, Span } from '../reader/types'

export interface SourceEdit extends Span {
  text: string
}
type Owner = Pick<SourceAddress, 'module' | 'role' | 'target'>
interface Unit extends Span {
  key: string
  owners: Owner[]
  calls: number[]
}
interface OwnedScope {
  scope: ParsedScope
  units: Unit[]
  roots: Owner[]
  routing?: Scope['routing']
}
export interface StructurePlan {
  source: string
  scopes: Scope[]
  bindings: SourceAddress[]
}
function refuse(reason: string): never {
  throw new Error(
    `Cannot preserve this imported structural edit: ${reason}. Edit the code instead.`,
  )
}

export function spliceSource(source: string, edits: SourceEdit[]): string {
  let end = source.length
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > end) throw new Error('Overlapping source edits')
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    end = edit.start
  }
  return source
}

/** Delete executable tokens only; comments, including comments inside arguments, survive. */
function trivia(text: string): string {
  return spliceSource(
    text,
    [...tokenizer(text, { ecmaVersion: 'latest' })].map(({ start, end }) => ({
      start,
      end,
      text: '',
    })),
  )
}

function owned(
  scope: ParsedScope,
  bindings: SourceAddress[],
  routing?: Scope['routing'],
): OwnedScope {
  const own = bindings.filter((binding) => binding.scope === scope.descriptor.id)
  const units: Unit[] = []
  scope.calls.forEach((call, index) => {
    const owners = own
      .filter((binding) => binding.calls.includes(index))
      .map(({ module, role, target }) => ({ module, role, ...(target ? { target } : {}) }))
      .sort((a, b) => descriptor(a).localeCompare(descriptor(b)))
    const key = index === routing?.call ? '@routing' : descriptor(owners)
    const previous = units.at(-1)
    if (previous?.key === key) {
      previous.end = call.end
      previous.calls.push(index)
    } else units.push({ ...call, key, owners, calls: [index] })
  })
  if (new Set(units.map((unit) => unit.key)).size !== units.length)
    refuse('one owner has separated call groups')
  return {
    scope,
    units,
    roots: own
      .filter((binding) => !binding.calls.length)
      .map(({ module, role, target }) => ({ module, role, ...(target ? { target } : {}) })),
    ...(routing ? { routing } : {}),
  }
}

interface Branch {
  key: string
  modules: string[]
}

/** Mixer-channel paths identify final branches without relying on source line ordinals. */
function branches(
  patch: Patch,
  origin = patch.modules.find((module) => module.type === 'out')?.id,
): Branch[] {
  function visit(id: string, path: string): Branch[] {
    const module = patch.modules.find((module) => module.id === id)
    if (!module) return []
    const spec = getModuleSpec(module.type)
    if (['seq', 'drums', 'lfo'].includes(module.type) || spec.source)
      return [{ key: path, modules: [id] }]
    const inputs = spec.jacks.filter((jack) => jack.direction === 'in' && !jack.cvTarget)
    if (module.type === 'code' && !patch.cables.some((cable) => cable.to.module === id)) {
      const text = module.values.text
      return typeof text === 'string' && !text.trimStart().startsWith('.')
        ? [{ key: path, modules: [id] }]
        : []
    }
    return inputs.flatMap((jack) => {
      const cable = patch.cables.find(
        (cable) => cable.to.module === id && cable.to.jack === jack.id,
      )
      return cable
        ? visit(cable.from.module, module.type === 'mix' ? `${path}/${id}:${jack.id}` : path).map(
            (branch) => ({ ...branch, modules: [...branch.modules, id] }),
          )
        : []
    })
  }
  return origin ? visit(origin, origin) : []
}

interface GeneratedScope extends OwnedScope {
  members: string[]
}

function generated(patch: Patch, result = generateDocument(patch)): Map<string, GeneratedScope> {
  const bindings: SourceAddress[] = result.layout.modules.flatMap((module) =>
    module.bindings.map((binding) => ({
      ...binding,
      module: module.id,
    })),
  )
  const paths = branches(patch)
  let index = 0
  return new Map(
    parseSource(result.code)
      .scopes.filter((scope) => scope.kind !== 'tempo')
      .map((scope) => {
        const declaration =
          scope.kind === 'declaration'
            ? Object.entries(result.layout.names)
                .find(([, name]) => name === scope.descriptor.anchor)?.[0]
                .split(':')[0]
            : undefined
        const branch = declaration ? branches(patch, declaration)[0] : paths[index++]
        const key = scope.kind === 'declaration' ? `const:${scope.descriptor.anchor}` : branch?.key
        if (!key || !branch) return refuse('the final branch has no stable channel')
        const boundary = branch.modules.findLastIndex(
          (id) =>
            id !== declaration &&
            Object.keys(result.layout.names).some((key) => key.startsWith(`${id}:`)),
        )
        return [
          key,
          {
            ...owned(
              scope,
              bindings,
              result.layout.scopes.find((item) => item.id === scope.descriptor.id)?.routing,
            ),
            members: branch.modules.slice(boundary + 1),
          },
        ]
      }),
  )
}
const signature = (scope: OwnedScope, emitted: Set<string>): string =>
  descriptor([
    scope.scope.kind,
    scope.scope.descriptor.anchor,
    [
      ...new Set(
        [...scope.units.flatMap((unit) => unit.owners), ...scope.roots]
          .map((owner) => descriptor(owner))
          .filter((owner) => emitted.has(owner)),
      ),
    ].sort(),
  ])

/** A plan never mutates the accepted document. Its result still needs semantic reader validation. */
export function planStructure(document: SourceDocument, next: Patch, body: string): StructurePlan {
  const before = generated(document.patch)
  const emitted = new Set(
    [...before.values()].flatMap((scope) =>
      [...scope.units.flatMap((unit) => unit.owners), ...scope.roots].map((owner) =>
        descriptor(owner),
      ),
    ),
  )
  const nextGenerated = generateDocument(next)
  const after = generated(next, nextGenerated)
  const declarations = (scopes: Map<string, OwnedScope>) =>
    [...scopes.keys()].filter((key) => key.startsWith('const:')).sort()
  if (
    descriptor(declarations(before)) !== descriptor(declarations(after)) ||
    descriptor(document.patch.names) !== descriptor(next.names)
  )
    refuse('shared declaration topology or names would change')
  for (const module of next.modules) {
    const old = document.patch.modules.find((item) => item.id === module.id)
    if (old && (old.type !== module.type || descriptor(old.values) !== descriptor(module.values)))
      refuse('combine structural and value edits separately')
  }
  const cv = (patch: Patch) =>
    patch.cables
      .filter((cable) => {
        const module = patch.modules.find((module) => module.id === cable.to.module)
        return (
          module &&
          getModuleSpec(module.type).jacks.some(
            (jack) => jack.id === cable.to.jack && jack.cvTarget,
          )
        )
      })
      .map(({ from, to }) => ({ from, to }))
  if (descriptor(cv(document.patch)) !== descriptor(cv(next)))
    refuse('CV routing needs a code edit')
  const buses = (patch: Patch) => ({
    modules: patch.modules
      .filter((module) => ['mix', 'out'].includes(module.type))
      .map(({ id, type }) => [id, type]),
    cables: patch.cables
      .filter((cable) =>
        patch.modules.some((module) => module.id === cable.from.module && module.type === 'mix'),
      )
      .map(({ from, to }) => ({ from, to })),
  })
  if (descriptor(buses(document.patch)) !== descriptor(buses(next)))
    refuse('mixer structure would change')
  const parsed = parseSource(body)
  const saved = readLayout(document.source)
  const matches = matchScopes(saved.kind === 'valid' ? saved.layout.scopes : [], parsed.scopes)
  const edits: SourceEdit[] = []
  const plans: {
    units: Unit[]
    roots: Owner[]
    routing?: Scope['routing']
  }[] = []
  const claimed = new Set<string>()
  for (const scope of parsed.scopes) {
    const routingMatch = matches.get(scope.descriptor.id)
    const savedRouting = routingMatch?.saved.routing
    const call =
      savedRouting && [...routingMatch.calls].find(([, old]) => old === savedRouting.call)?.[0]
    const routing =
      savedRouting &&
      call !== undefined &&
      !document.bindings.some(
        (binding) => binding.scope === scope.descriptor.id && binding.calls.includes(call),
      )
        ? { ...savedRouting, call }
        : undefined
    const original = owned(scope, document.bindings, routing)
    if (
      scope.kind === 'tempo' ||
      (scope.kind === 'declaration' &&
        !document.bindings.some((binding) => binding.scope === scope.descriptor.id))
    ) {
      plans.push(original)
      continue
    }
    const candidates = [...before].filter(
      ([, item]) => signature(item, emitted) === signature(original, emitted),
    )
    const match = candidates[0]
    if (candidates.length !== 1 || !match || claimed.has(match[0]))
      refuse('scope ownership is ambiguous')
    const [key, canonical] = match
    claimed.add(key)
    const target = after.get(key)
    if (!target) {
      if (
        scope.kind !== 'voice' ||
        original.units.some((unit) =>
          unit.owners.some(
            (owner) =>
              document.patch.modules.find((module) => module.id === owner.module)?.type === 'code',
          ),
        ) ||
        original.roots.length
      )
        refuse('removing this voice would remove opaque code or a declaration')
      const statement = parsed.program.body.find(
        (statement) =>
          statement.type === 'LabeledStatement' &&
          statement.label.name === '$' &&
          statement.body.type === 'ExpressionStatement' &&
          statement.body.expression === scope.expression,
      )
      if (!statement) refuse('only independent $: voices can be disconnected')
      edits.push({ ...statement, text: trivia(body.slice(statement.start, statement.end)) })
      continue
    }
    const oldUnits = original.units.filter((unit) => unit.key !== '@routing')
    const targetUnits = target.units.filter(
      (unit) =>
        unit.key !== '@routing' &&
        (oldUnits.some((item) => item.key === unit.key) ||
          !canonical.units.some((item) => item.key === unit.key)),
    )
    // Explicit bypassed/default calls still own source even when generation omits them.
    for (const unit of oldUnits) {
      if (
        canonical.units.some((item) => item.key === unit.key) ||
        !unit.owners.length ||
        !unit.owners.every(
          (owner) => owner.role === 'module' && target.members.includes(owner.module),
        )
      )
        continue
      const position = Math.min(...unit.owners.map((owner) => target.members.indexOf(owner.module)))
      const following = targetUnits.findIndex((item) =>
        item.owners.some(
          (owner) => owner.role === 'module' && target.members.indexOf(owner.module) > position,
        ),
      )
      targetUnits.splice(following < 0 ? targetUnits.length : following, 0, unit)
    }
    if (
      descriptor(oldUnits.map((unit) => unit.key)) ===
      descriptor(targetUnits.map((unit) => unit.key))
    ) {
      plans.push(original)
      continue
    }
    if (
      descriptor(canonical.scope.root) !== descriptor(target.scope.root) ||
      descriptor(original.roots) !== descriptor(target.roots)
    )
      refuse('the expression root would change')
    if (
      [...original.units, ...target.units].some((unit) =>
        unit.owners.some(
          (owner) =>
            owner.role === 'mixer' ||
            (owner.role === 'cv' &&
              (!original.units.some((item) => item.key === unit.key) ||
                !targetUnits.some((item) => item.key === unit.key))),
        ),
      )
    )
      refuse('CV or mixer ownership needs a code edit')
    const retained = oldUnits.filter((unit) => targetUnits.some((item) => item.key === unit.key))
    if (
      descriptor(retained.map((unit) => unit.key)) !==
      descriptor(
        targetUnits
          .filter((unit) => oldUnits.some((item) => item.key === unit.key))
          .map((unit) => unit.key),
      )
    )
      refuse('surviving source groups would move')
    for (const unit of oldUnits.filter(
      (unit) => !targetUnits.some((item) => item.key === unit.key),
    )) {
      if (
        unit.start <= scope.root.start ||
        unit.owners.some(
          (owner) =>
            document.patch.modules.find((module) => module.id === owner.module)?.type === 'code',
        )
      )
        refuse('a root or opaque CODE group would be removed')
      edits.push({ ...unit, text: trivia(body.slice(unit.start, unit.end)) })
    }
    const units: Unit[] = []
    let insertion = scope.root.end
    for (const unit of targetUnits) {
      const existing = oldUnits.find((item) => item.key === unit.key)
      if (existing) {
        units.push(existing)
        insertion = existing.end
      } else {
        if (
          unit.start <= target.scope.root.start ||
          unit.owners.some(
            (owner) => next.modules.find((module) => module.id === owner.module)?.type === 'code',
          )
        )
          refuse('a root or opaque CODE group would be inserted')
        const fragment = nextGenerated.code.slice(unit.start, unit.end)
        const previous = edits.find((edit) => edit.start === insertion && edit.end === insertion)
        if (previous) previous.text += fragment
        else edits.push({ start: insertion, end: insertion, text: fragment })
        units.push(unit)
      }
    }
    const route = original.units.find((unit) => unit.key === '@routing')
    if (route) units.push(route)
    plans.push({ units, roots: original.roots, ...(routing ? { routing } : {}) })
  }
  if ([...before.keys()].some((key) => !claimed.has(key)))
    refuse('a sounding branch crosses source scopes')
  for (const [key, scope] of after) {
    if (before.has(key)) continue
    if (
      scope.scope.kind !== 'voice' ||
      scope.roots.length ||
      scope.units.some((unit) =>
        unit.owners.some(
          (owner) =>
            next.modules.find((module) => module.id === owner.module)?.type === 'code' ||
            owner.role !== 'module',
        ),
      )
    )
      refuse('new voices must be independent catalog chains')
    const units = scope.units.filter((unit) => unit.key !== '@routing')
    const last = units.at(-1)
    if (!last) refuse('new voice has no source')
    const text = `\n$: ${nextGenerated.code.slice(scope.scope.start, last.end)};\n`
    const append = edits.find((edit) => edit.start === body.length && edit.end === body.length)
    if (append) append.text += text
    else edits.push({ start: body.length, end: body.length, text })
    plans.push({ units, roots: [] })
  }
  const source = spliceSource(body, edits)
  const scopes = parseSource(source).scopes
  if (scopes.length !== plans.length) refuse('the edit changes unrelated statement interpretation')
  const bindings: SourceAddress[] = []
  const descriptors = scopes.map((scope, index): Scope => {
    const plan = plans[index]
    if (!plan) return refuse('missing planned scope')
    let call = 0
    for (const unit of plan.units) {
      const indices = unit.calls.map(() => call++)
      for (const owner of unit.owners)
        bindings.push({
          ...owner,
          scope: scope.descriptor.id,
          calls: indices,
        })
    }
    for (const owner of plan.roots)
      bindings.push({
        ...owner,
        scope: scope.descriptor.id,
        calls: [],
      })
    if (call !== scope.calls.length) return refuse('call boundaries are not preserved')
    return {
      ...scope.descriptor,
      ...(plan.routing ? { routing: { ...plan.routing, call: call - 1 } } : {}),
    }
  })
  return { source, scopes: descriptors, bindings }
}
