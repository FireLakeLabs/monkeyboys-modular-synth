import { sampleCalls } from '../samples/packs'
import { withFactoryPacks } from './cartridges'
import { parseSource } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'
import { sourceBody } from './document'

/** Only proven tempo statements establish silence; unclassified code may play. */
export function mayHaveOutput(document: SourceDocument): boolean {
  const setup = sampleCalls(document.source)
  return parseSource(document.source).program.body.some((statement) => {
    if (
      statement.type === 'EmptyStatement' ||
      setup.some((call) => call.start === statement.start && call.end === statement.end)
    )
      return false
    return !(
      statement.type === 'ExpressionStatement' &&
      document.bindings.some(
        (binding) =>
          binding.role === 'tempo' &&
          binding.start === statement.expression.start &&
          binding.end === statement.expression.end,
      )
    )
  })
}

export function strudelUrl(document: SourceDocument): string {
  const bytes = new TextEncoder().encode(
    sourceBody(document.layout === 'invalid' ? document.source : withFactoryPacks(document).source),
  )
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `https://strudel.cc/#${encodeURIComponent(btoa(binary))}`
}
