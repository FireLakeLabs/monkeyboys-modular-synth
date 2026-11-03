import { tokenizer } from 'acorn'
import { RACK_MARKER } from '../codegen/layout'
import type { Span } from './types'

/** Tokenization also finds real comments in syntactically unfinished drafts. */
export function rackMarker(source: string): number | undefined {
  let marker: number | undefined
  try {
    const tokens = tokenizer(source, {
      ecmaVersion: 'latest',
      onComment: (block, text, start) => {
        if (!block && `//${text}` === RACK_MARKER) marker = start
      },
    })
    while (tokens.getToken().type.label !== 'eof') {
      // Consume tokens so strings, templates, regexps and block comments stay opaque.
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  return marker
}

/** Only a standalone marker followed by trailing comment lines can be hidden. */
export function rackMetadata(source: string): Span | null {
  const start = rackMarker(source)
  if (start === undefined) return null
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  if (source.slice(lineStart, start).trim()) return null
  const lines = source.slice(start).split(/\r?\n/).slice(1)
  while (lines.at(-1)?.trim() === '') lines.pop()
  if (lines.some((line) => !line.startsWith('// '))) return null
  return { start, end: source.length }
}

export function codeEnd(source: string): number {
  const metadata = rackMetadata(source)
  return metadata ? source.slice(0, metadata.start).trimEnd().length : source.length
}
