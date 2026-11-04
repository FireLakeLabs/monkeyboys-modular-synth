import { getModuleSpec } from '../modules/catalog'
import { isGrid, isSteps } from '../codegen/graph'
import { drumText, drumView, stepView } from '../patch/notation'
import { sequenceText } from '../rack/model'
import { parseSource, type ParsedScope } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'

const ACTIVITY = '__monkeyboyActivity'
const STEP = '__monkeyboyStep'

export interface GridStep {
  module: string
  index: number
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
        return statement.label.name === '$' && statement.body.type === 'ExpressionStatement'
      return (
        statement.type === 'ExpressionStatement' &&
        scopes.some((scope) => scope.start >= statement.start && scope.end <= statement.end)
      )
    })
  function owners(scope: ParsedScope, visited = new Set<string>()): string[] | null {
    if (visited.has(scope.descriptor.id)) return null
    visited.add(scope.descriptor.id)
    const own = document.bindings
      .filter((binding) => binding.scope === scope.descriptor.id)
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
  const grids: { module: string; count: number }[] = []
  let code = document.source
  if (safe)
    for (const scope of scopes.filter((scope) => scope.kind === 'voice').reverse()) {
      const own = owners(scope)
      if (!own) continue
      // Numbers stay literal through Strudel's double-quote-to-mini transformation.
      const key = scopes.indexOf(scope) + 1
      mapping.set(key, own)
      // Reader-owned voices are call/identifier chains. Append context without a
      // leading parenthesis, which could join semicolon-free top-level statements.
      const inserted = `.withContext(context => ({...context, ${ACTIVITY}: ${key}}))`
      insertions.push({ at: scope.end, text: inserted })
    }
  // Capture the cell at the source, before rate/reverse/iteration can move its event.
  // Only sources reaching a fully attributed voice receive grid feedback.
  for (const binding of document.bindings) {
    if (![...mapping.values()].some((ids) => ids.includes(binding.module))) continue
    const module = modules.get(binding.module)
    if (!module || !['seq', 'drums'].includes(module.type)) continue
    const control = getModuleSpec(module.type).controls.find(
      (c) => c.kind === 'steps' || c.kind === 'grid',
    )
    if (!control) continue
    const value = module.values[control.id] ?? control.default
    let count = 0
    if (control.kind === 'steps' && isSteps(value)) {
      const view = stepView(
        typeof value === 'string' ? value : sequenceText(module, value),
        control,
      )
      if (view.kind === 'grid') count = view.value.length
    } else if (control.kind === 'grid' && isGrid(value)) {
      const view = drumView(typeof value === 'string' ? value : drumText(value), control)
      if (view.kind === 'grid') count = view.value[0]?.steps.length ?? 0
    }
    if (!count) continue
    const scope = scopes.find((s) => s.descriptor.id === binding.scope)
    const call = scope?.calls[binding.calls[0] ?? -1]
    if (!call || !['note', 'n', 's'].includes(call.name)) continue
    const key = grids.length
    grids.push({ module: module.id, count })
    insertions.push({
      at: call.end,
      text: `.withHap(hap => hap.setContext({...hap.context, ${STEP}: [${key}, Math.floor(hap.whole.begin.cyclePos().mul(${count}).valueOf())]}))`,
    })
  }
  // At an equal offset, source decoration precedes final-voice decoration.
  insertions.sort(
    (a, b) =>
      a.at - b.at ||
      Number(a.text.startsWith('.withContext')) - Number(b.text.startsWith('.withContext')),
  )
  for (const insertion of [...insertions].reverse())
    code = code.slice(0, insertion.at) + insertion.text + code.slice(insertion.at)
  return {
    code,
    sourceOffset(this: void, offset: number): number | null {
      let shift = 0
      for (const insertion of insertions) {
        const start = insertion.at + shift
        if (offset <= start) break
        if (offset < start + insertion.text.length) return null
        shift += insertion.text.length
      }
      return offset - shift
    },
    steps(this: void, hap: unknown): GridStep[] {
      const context: unknown =
        hap && typeof hap === 'object' && 'context' in hap ? hap.context : undefined
      const step: unknown =
        context && typeof context === 'object' && STEP in context ? context[STEP] : undefined
      if (!Array.isArray(step) || step.length !== 2) return []
      const [key, index]: unknown[] = step
      if (
        typeof key !== 'number' ||
        !Number.isSafeInteger(key) ||
        typeof index !== 'number' ||
        !Number.isSafeInteger(index)
      )
        return []
      const grid = grids[key]
      return grid && index >= 0 && index < grid.count ? [{ module: grid.module, index }] : []
    },
    modules(this: void, hap: unknown): string[] {
      const context: unknown =
        hap && typeof hap === 'object' && 'context' in hap ? hap.context : undefined
      const id: unknown =
        context && typeof context === 'object' && ACTIVITY in context
          ? context[ACTIVITY]
          : undefined
      return typeof id === 'number' ? (mapping.get(id) ?? []) : []
    },
  }
}
