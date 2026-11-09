import { notationLiteral } from '../reader/notationLiteral'
import type { Expression } from 'acorn'
import type { Span } from '../reader/types'
import { getModuleSpec } from '../modules/catalog'
import { isGrid, isSteps } from '../codegen/graph'
import { drumText } from '../patch/notation'
import { miniView, walkCells, type Cell } from '../patch/mini'
import { sequenceText } from '../rack/model'
import { sourceLocations } from './sourceLocations'
import { parseSource, bindingScope, expressionChildren, type ParsedScope } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'

const ACTIVITY = '__monkeyboyActivity'
const STEP = '__monkeyboyStep'

export interface GridStep {
  module: string
  control: string
  start: number
  end: number
  position: number
  cycle: number
}

/** Context-only decoration of evaluated voices. Saved/editor source is never instrumented. */
export function activityPlan(document: SourceDocument) {
  const { scopes, program } = parseSource(document.source)
  const modules = new Map(document.patch.modules.map((module) => [module.id, module]))
  const declarations = new Map(
    scopes
      .filter((scope) => scope.kind === 'declaration')
      .map((scope) => [scope.descriptor.anchor, scope]),
  )
  // Arbitrary statements/declarations can rewrite patterns behind the reader's back.
  const safe =
    !scopes.some(
      (scope) =>
        scope.kind === 'declaration' &&
        (!document.bindings.some((binding) => binding.scope === scope.descriptor.id) ||
          document.bindings.some(
            (binding) =>
              binding.scope === scope.descriptor.id && modules.get(binding.module)?.type === 'code',
          )),
    ) &&
    program.body.every((statement) => {
      if (statement.type === 'EmptyStatement') return true
      if (statement.type === 'VariableDeclaration')
        return (
          statement.kind === 'const' &&
          statement.declarations.every(
            (d) => d.id.type === 'Identifier' && declarations.has(d.id.name),
          )
        )
      if (statement.type === 'LabeledStatement')
        return statement.body.type === 'ExpressionStatement'
      return (
        statement.type === 'ExpressionStatement' &&
        scopes.some((scope) => scope.start >= statement.start && scope.end <= statement.end)
      )
    })
  function owners(scope: ParsedScope, visited = new Set<string>()): string[] | null {
    if (visited.has(scope.descriptor.id)) return null
    visited.add(scope.descriptor.id)
    const own = document.bindings
      .filter(
        (binding) =>
          binding.scope === scope.descriptor.id &&
          JSON.stringify(binding.path?.slice(0, scope.path?.length ?? 0) ?? []) ===
            JSON.stringify(scope.path ?? []) &&
          (binding.path?.slice(scope.path?.length ?? 0) ?? []).every(
            (step) => step.argument === 'body',
          ),
      )
      .map((binding) => binding.module)
    if (own.some((id) => modules.get(id)?.type === 'code')) return null
    if (scope.root.type === 'Identifier') {
      const dependency = declarations.get(scope.root.name)
      if (!dependency) return null
      const inherited = owners(dependency, visited)
      if (!inherited) return null
      own.push(...inherited)
    }
    if (!own.length) return null
    // The graph establishes which shared mixers/output receive this voice.
    for (const id of own)
      for (const cable of document.patch.cables.filter((cable) => cable.from.module === id)) {
        const target = modules.get(cable.to.module)
        if (target && ['mix', 'out'].includes(target.type) && !own.includes(target.id))
          own.push(target.id)
      }
    return [...new Set(own)]
  }
  const mapping = new Map<number, string[]>()
  const insertions: { at: number; text: string }[] = []
  const grids: {
    module: string
    control: string
    text: string
    boundaries: number[]
    local: boolean
    cells: Cell[]
  }[] = []
  let code = document.source
  function attribute(scope: ParsedScope, inherited: string[] = [], wanted = 1) {
    const own = owners(scope)
    if (!own) return
    const children = expressionChildren(scope).filter(
      (child) => child.path?.at(-1)?.call === scope.calls.findLastIndex((c) => c.name === 'stack'),
    )
    if (children.length) {
      for (const child of children) attribute(child, [...inherited, ...own], wanted)
      return
    }
    let key = wanted
    while (mapping.has(key)) key++
    mapping.set(key, [...new Set([...own, ...inherited])])
    insertions.push({
      at: scope.end,
      text:
        scope.root.type === 'Identifier'
          ? `.withContext(context => ({...context, ${ACTIVITY}: [...(Array.isArray(context.${ACTIVITY}) ? context.${ACTIVITY} : typeof context.${ACTIVITY} === 'number' ? [context.${ACTIVITY}] : []), ${key}]}))`
          : `.withContext(context => ({...context, ${ACTIVITY}: ${key}}))`,
    })
  }
  if (safe)
    for (const scope of scopes.filter(
      (s) => s.kind === 'declaration' && expressionChildren(s).length,
    ))
      attribute(scope)
  if (safe)
    for (const scope of scopes.filter((scope) => scope.kind === 'voice'))
      attribute(scope, [], scopes.indexOf(scope) + 1)
  // Capture the cell at the source, before rate/reverse/iteration can move its event.
  // Only sources reaching a fully attributed voice receive grid feedback.
  for (const binding of document.bindings) {
    if (![...mapping.values()].some((ids) => ids.includes(binding.module))) continue
    const module = modules.get(binding.module)
    if (!module) continue
    const spec = getModuleSpec(module.type)
    const control = spec.controls.find(
      (c) => c.kind === 'steps' || c.kind === 'grid' || (c.kind === 'text' && c.notation),
    )
    if (!control) continue
    const value = module.values[control.id] ?? control.default
    const text =
      typeof value === 'string'
        ? value
        : control.kind === 'steps' && isSteps(value)
          ? sequenceText(module, value)
          : control.kind === 'grid' && isGrid(value)
            ? drumText(value)
            : undefined
    if (text === undefined) continue
    const view = miniView(text)
    const span = binding.controls[control.id]
    const literal = span && notationLiteral(document.source, span, text)
    if (view.kind !== 'tree' || !span || !literal) continue
    const cells: Cell[] = []
    walkCells(view.tree, (c) => {
      if (!c.layers && c.shape !== 'rest') cells.push(c)
    })
    const key = grids.length
    grids.push({
      module: module.id,
      control: control.id,
      text,
      boundaries: literal.boundaries,
      local: document.source[span.start] === "'",
      cells,
    })
    const callback = `.withHap(hap => hap.setContext({...hap.context, ${STEP}${key}: [${key}, hap.whole.begin.cyclePos().valueOf(), Math.floor(hap.whole.begin.valueOf()), hap.context.locations]}))`
    if (binding.role === 'cv' || spec.modSource === 'sequence') {
      // Numeric literals may still be plain strings. Reify at the source before
      // utilities/voice transforms, retaining the pinned mini semantics.
      const expression = scopes.map((s) => miniContainer(s.expression, span)).find(Boolean) ?? span
      insertions.push(
        { at: expression.start, text: 'reify(' },
        { at: expression.end, text: `)${callback}` },
      )
    } else {
      const scope = bindingScope(scopes, binding)
      const call = scope?.calls[binding.calls[0] ?? -1]
      if (call) insertions.push({ at: call.end, text: callback })
    }
  }
  // At an equal offset, source decoration precedes final-voice decoration.
  insertions.sort(
    (a, b) =>
      a.at - b.at ||
      Number(a.text.startsWith('.withContext')) - Number(b.text.startsWith('.withContext')),
  )
  for (const insertion of [...insertions].reverse())
    code = code.slice(0, insertion.at) + insertion.text + code.slice(insertion.at)
  function thisOffset(offset: number): number | null {
    let shift = 0
    for (const insertion of insertions) {
      const start = insertion.at + shift
      if (offset <= start) break
      if (offset < start + insertion.text.length) return null
      shift += insertion.text.length
    }
    return offset - shift
  }
  return {
    code,
    sourceOffset(this: void, offset: number): number | null {
      const original = thisOffset(offset)
      if (original === null) return null
      const grid = grids.find(
        (g) =>
          !g.local &&
          original >= (g.boundaries[0] ?? 0) &&
          original <= (g.boundaries[0] ?? 0) + g.text.length,
      )
      return grid ? (grid.boundaries[original - (grid.boundaries[0] ?? 0)] ?? null) : original
    },
    steps(this: void, hap: unknown): GridStep[] {
      const context: unknown =
        hap && typeof hap === 'object' && 'context' in hap ? hap.context : undefined
      if (!context || typeof context !== 'object') return []
      const entries = Object.fromEntries(Object.entries(context))
      const records: unknown[] = grids.map((_, key) => entries[`${STEP}${key}`])
      return records.flatMap((record: unknown): GridStep[] => {
        if (!Array.isArray(record) || record.length !== 4) return []
        const [key, position, cycle, locations]: unknown[] = record
        if (
          typeof key !== 'number' ||
          !Number.isSafeInteger(key) ||
          typeof position !== 'number' ||
          !Number.isFinite(position) ||
          position < 0 ||
          position >= 1 ||
          typeof cycle !== 'number' ||
          !Number.isSafeInteger(cycle)
        )
          return []
        const grid = grids[key]
        if (!grid) return []
        const spans = sourceLocations(
          { context: { locations } },
          document.source.length,
          (offset) => {
            const original = thisOffset(offset)
            const local = grid.local
              ? offset - 1
              : original === null
                ? -1
                : original - (grid.boundaries[0] ?? 0)
            return grid.boundaries[local] ?? null
          },
        )
        const hits = grid.cells.filter((cell) =>
          spans.some((span) => {
            const raw = document.source.slice(span.start, span.end)
            const trimmedStart = span.start + raw.length - raw.trimStart().length
            const trimmedEnd = span.end - (raw.length - raw.trimEnd().length)
            return (
              grid.boundaries.indexOf(trimmedStart) === cell.body.start &&
              grid.boundaries.indexOf(trimmedEnd) === cell.body.end
            )
          }),
        )
        return hits.map((cell) => ({
          module: grid.module,
          control: grid.control,
          start: cell.body.start,
          end: cell.body.end,
          position,
          cycle,
        }))
      })
    },
    modules(this: void, hap: unknown): string[] {
      const context: unknown =
        hap && typeof hap === 'object' && 'context' in hap ? hap.context : undefined
      const id: unknown =
        context && typeof context === 'object' && ACTIVITY in context
          ? context[ACTIVITY]
          : undefined
      const ids: unknown[] = Array.isArray(id) ? id : [id]
      return [
        ...new Set(ids.flatMap((key) => (typeof key === 'number' ? (mapping.get(key) ?? []) : []))),
      ]
    },
  }
}

function miniContainer(expression: Expression, literal: Span): Span | undefined {
  if (expression.start === literal.start && expression.end === literal.end) return literal
  if (expression.type !== 'CallExpression') return undefined
  if (
    expression.callee.type === 'Identifier' &&
    expression.callee.name === 'mini' &&
    expression.arguments[0]?.start === literal.start
  )
    return expression
  for (const arg of expression.arguments) {
    if (arg.type === 'SpreadElement') continue
    const found = miniContainer(arg, literal)
    if (found) return found
  }
  const callee = expression.callee
  if (callee.type === 'MemberExpression' && callee.object.type !== 'Super')
    return miniContainer(callee.object, literal)
  return undefined
}
