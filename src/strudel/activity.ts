import { parseSource, type ParsedScope } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'

const ACTIVITY = '__monkeyboyActivity'

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
      code =
        code.slice(0, scope.end) +
        `.withContext(context => ({...context, ${ACTIVITY}: ${key}}))` +
        code.slice(scope.end)
    }
  return {
    code,
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
