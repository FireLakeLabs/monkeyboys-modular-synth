import { getModuleSpec } from '../modules/catalog'
import { tokenizer } from 'acorn'
import { DEFAULT_LOOK } from '../modules/looks'
import { placementPosition, validateRack } from '../rack/model'
import { read } from '../reader'
import type { SourceDocument } from '../reader'
import { saveLayout, sourceBody } from './document'

export interface CodeConversion {
  module: string
  type: string
  document: SourceDocument
}

/** Offer only complete, independently readable owners; never guess a partial match. */
export function codeConversions(document: SourceDocument): CodeConversion[] {
  if (document.layout === 'invalid' || JSON.stringify(document.patch) !== document.patchRevision)
    return []
  const blocks = document.patch.modules.filter((module) => module.type === 'code')
  if (!blocks.length) return []
  const projected = read(sourceBody(document.source))
  const offers: CodeConversion[] = []
  for (const block of blocks) {
    const owned = document.bindings.filter((binding) => binding.module === block.id)
    if (owned.length !== 1) continue
    const span = owned[0]
    if (!span) continue
    const matches = projected.bindings.filter(
      (binding) =>
        binding.scope === span.scope &&
        binding.end === span.end &&
        binding.role === 'module' &&
        JSON.stringify(binding.calls) === JSON.stringify(span.calls) &&
        binding.start <= span.start &&
        [...tokenizer(document.source.slice(binding.start, span.start), { ecmaVersion: 'latest' })]
          .length === 0,
    )
    if (matches.length !== 1) continue
    const binding = matches[0]
    const candidate = projected.patch.modules.find((module) => module.id === binding?.module)
    if (!binding || !candidate || candidate.type === 'code') continue
    const spec = getModuleSpec(candidate.type)
    const input = spec.jacks.find((jack) => jack.direction === 'in' && !jack.cvTarget)
    const output = spec.jacks.find((jack) => jack.direction === 'out')
    if (!output) continue
    // A context-dependent module (such as ENV/CV) needs a larger ownership plan.
    if (
      projected.bindings.filter((item) => item.module === candidate.id).length !== 1 ||
      projected.patch.cables.some(
        (cable) =>
          (cable.to.module === candidate.id && cable.to.jack !== input?.id) ||
          (cable.from.module === candidate.id && cable.from.jack !== output.id),
      )
    )
      continue
    let counter = 1
    while (document.patch.modules.some((module) => module.id === `${candidate.type}${counter}`))
      counter++
    const id = `${candidate.type}${counter}`
    const patch = {
      ...document.patch,
      modules: document.patch.modules.filter((module) => module.id !== block.id),
    }
    const replacement = {
      ...candidate,
      id,
      look: DEFAULT_LOOK[spec.family],
      ...placementPosition(patch, candidate.type, block.row, block.hp),
    }
    patch.modules = document.patch.modules.map((module) =>
      module.id === block.id ? replacement : module,
    )
    patch.cables = patch.cables.map((cable) => ({
      ...cable,
      from: cable.from.module === block.id ? { module: id, jack: output.id } : cable.from,
      to:
        cable.to.module === block.id ? { module: id, jack: input?.id ?? cable.to.jack } : cable.to,
    }))
    patch.names = Object.fromEntries(
      Object.entries(patch.names).map(([key, value]) => [
        key === `${block.id}:out` ? `${id}:${output.id}` : key,
        value,
      ]),
    )
    const bindings = document.bindings.map((item) =>
      item.module === block.id ? { ...binding, module: id } : item,
    )
    try {
      validateRack(patch)
      const next = saveLayout({ ...document, bindings }, patch)
      offers.push({ module: block.id, type: candidate.type, document: next })
    } catch {
      // Independent source/graph and saved-identity checks are the offer boundary.
    }
  }
  return offers
}
