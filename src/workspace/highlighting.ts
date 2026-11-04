import { getModuleSpec } from '../modules/catalog'
import { parseSource, bindingScope, type Call } from '../reader/syntax'
import type { SourceDocument, Span } from '../reader/types'

export interface SourceTreatment extends Span {
  modules: string[]
  className: string
}

/** Use individual owned calls: a grouped binding can straddle another owner's CODE. */
export function sourceTreatments(document: SourceDocument): SourceTreatment[] {
  const { scopes, program } = parseSource(document.source)
  const treatments: SourceTreatment[] = []
  for (const binding of document.bindings) {
    const module = document.patch.modules.find((item) => item.id === binding.module)
    const scope = bindingScope(scopes, binding)
    if (!module || !scope) continue
    const spec = getModuleSpec(module.type)
    const spans: (Span | Call)[] = binding.calls.length
      ? binding.calls.flatMap((index) => scope.calls[index] ?? [])
      : [scope.root]
    if (module.type === 'lfo' && binding.role === 'module' && scope.root.type === 'Identifier')
      spans.push(scope.root)
    if (spec.functionLoop) {
      for (const call of spans) {
        if (!('args' in call)) continue
        const lambda = call.args.at(-1)
        if (lambda?.type === 'ArrowFunctionExpression')
          treatments.push({
            start: lambda.start,
            end: lambda.end,
            modules: [module.id],
            className: 'source-token source-function',
          })
      }
    }
    for (const call of spans) {
      const span =
        binding.role === 'cv' && module.type === 'lfo' && 'args' in call
          ? (call.args[0] ?? call)
          : call
      treatments.push({
        start: span.start,
        end: span.end,
        modules: [module.id],
        className: `source-token cat-${spec.category} source-${spec.family}`,
      })
    }
  }
  const names = new Set(
    scopes
      .filter(
        (scope) =>
          scope.kind === 'declaration' &&
          document.bindings.some(
            (binding) =>
              binding.scope === scope.descriptor.id &&
              document.patch.modules.some(
                (module) => module.id === binding.module && module.type !== 'code',
              ),
          ),
      )
      .map((s) => s.descriptor.anchor),
  )
  const named = (span: Span) => treatments.push({ ...span, modules: [], className: 'source-named' })
  for (const statement of program.body)
    if (statement.type === 'VariableDeclaration')
      for (const declaration of statement.declarations)
        if (declaration.id.type === 'Identifier' && names.has(declaration.id.name))
          named(declaration.id)
  for (const scope of scopes)
    if (scope.root.type === 'Identifier' && names.has(scope.root.name)) named(scope.root)
  return treatments
}

export function sourceSegments(
  source: string,
  treatments: SourceTreatment[],
  selected: string | null,
) {
  const boundaries = [
    ...new Set([0, source.length, ...treatments.flatMap((span) => [span.start, span.end])]),
  ].sort((a, b) => a - b)
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1] ?? source.length
    const owners = treatments.filter((span) => span.start <= start && span.end >= end)
    // Nested CV owns the same outer call; keep the shared selection and one stable ink treatment.
    const treatment =
      owners.find((owner) => owner.className === 'source-named') ??
      owners.find((owner) => owner.className.includes('source-cyber')) ??
      owners.find((owner) => owner.className.includes('source-function')) ??
      [...owners].sort((a, b) => a.end - a.start - (b.end - b.start))[0]
    return {
      start,
      text: source.slice(start, end),
      className: `${treatment?.className ?? ''}${selected && owners.some((owner) => owner.modules.includes(selected)) ? ' source-selected' : ''}`,
    }
  })
}
