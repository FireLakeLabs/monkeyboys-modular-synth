import { parseSource } from '../reader/syntax'
import type { SourceDocument } from '../reader/types'
import { sourceBody } from './document'

/** Use the accepted executable source, including opaque imported voices. */
export function hasOutput(document: SourceDocument): boolean {
  return parseSource(sourceBody(document.source)).scopes.some((scope) => scope.kind === 'voice')
}

export function strudelUrl(document: SourceDocument): string {
  const bytes = new TextEncoder().encode(sourceBody(document.source))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `https://strudel.cc/#${encodeURIComponent(btoa(binary))}`
}
