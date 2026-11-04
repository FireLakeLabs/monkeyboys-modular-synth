import { generateDocument } from '../codegen/generate'
import { graph, number } from '../codegen/graph'
import { getModuleSpec } from '../modules/catalog'
import { parseSource } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'
import { cableSignal } from '../rack/model'

export type ProbePlan =
  { kind: 'readable'; expression: string; cps: number } | { kind: 'unavailable'; reason: string }

/** Never pass imported source to an evaluator. Only a CODE-free, validated
 * upstream graph can supply a fresh generator-owned expression. */
export function probePlan(document: SourceDocument, cableId: string): ProbePlan {
  const refuse = (reason: string): ProbePlan => ({ kind: 'unavailable', reason })
  if (document.patchRevision !== JSON.stringify(document.patch) || document.layout === 'invalid')
    return refuse('unverified rack')
  const cable = document.patch.cables.find((c) => c.id === cableId)
  if (!cable) return refuse('cable removed')
  const nodes = graph(document.patch)
  if (cableSignal(document.patch, cable.from) !== 'pattern') return refuse('pattern cables only')
  const { program, scopes } = parseSource(document.source)
  // Helpers and arbitrary statements may redefine the meaning of otherwise
  // readable calls. Do not execute them, or claim their projection is equivalent.
  if (
    parseSource(document.patch.prelude ?? '').program.body.length > 0 ||
    program.body.some((statement) => {
      if (statement.type === 'EmptyStatement') return false
      const contained = scopes.filter((s) => s.start >= statement.start && s.end <= statement.end)
      return (
        !contained.length ||
        contained.some(
          (scope) =>
            scope.kind !== 'voice' &&
            (!document.bindings.some((b) => b.scope === scope.descriptor.id) ||
              document.bindings.some(
                (b) => b.scope === scope.descriptor.id && nodes.get(b.module)?.spec.id === 'code',
              )),
        )
      )
    })
  )
    return refuse('opaque setup')
  const visited = new Set<string>()
  let opaque = false
  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const node = nodes.get(id)
    if (!node || node.spec.id === 'code') {
      opaque = true
      return
    }
    for (const input of node.inputs.values()) visit(input.from.module)
  }
  visit(cable.from.module)
  if (opaque) return refuse('CODE upstream')
  // Drop every unrelated module, name and prelude before generation. A named
  // shared prefix is expanded from the same graph, never looked up in JS globals.
  const patch = {
    version: 1 as const,
    modules: document.patch.modules.filter((m) => visited.has(m.id)),
    cables: document.patch.cables.filter(
      (c) => visited.has(c.from.module) && visited.has(c.to.module),
    ),
    names: {},
  }
  try {
    const expression = generateDocument(patch, { prefix: cable.from.module }).code
    const out = [...nodes.values()].find((node) => node.spec.id === 'out')
    const bpm = out
      ? number(out, 'bpm')
      : getModuleSpec('out').controls.find((c) => c.id === 'bpm')?.default
    if (typeof bpm !== 'number') return refuse('unreadable tempo')
    return expression
      ? { kind: 'readable', expression, cps: bpm / 240 }
      : refuse('incomplete chain')
  } catch {
    return refuse('incomplete readable chain')
  }
}
