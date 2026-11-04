import type { Span } from './types'

/** Unescaped literal boundaries in original source, indexed by cooked UTF-16 offset. */
export function notationLiteral(
  source: string,
  span: Span,
  text: string,
):
  | {
      quote: string
      boundaries: number[]
    }
  | undefined {
  const raw = source.slice(span.start, span.end),
    quote = raw[0] ?? ''
  if (!['"', "'", '`'].includes(quote) || raw.at(-1) !== quote || raw.includes('\\'))
    return undefined
  const body = raw.slice(1, -1),
    boundaries = [span.start + 1]
  let cooked = ''
  for (let index = 0; index < body.length; index++) {
    const character = body[index] ?? ''
    if (quote === '`' && character === '\r') {
      if (body[index + 1] === '\n') index++
      cooked += '\n'
    } else cooked += character
    boundaries.push(span.start + index + 2)
  }
  return cooked === text ? { quote, boundaries } : undefined
}
