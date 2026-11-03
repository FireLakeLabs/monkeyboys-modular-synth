import { tokenizer } from 'acorn'
import { codeEnd } from './metadata'

/** Only replace EOF or mismatched-closer errors; earlier syntax errors keep precedence. */
export function unclosedBracket(source: string, errorOffset: number) {
  const end = codeEnd(source)
  const stack: { bracket: string; offset: number; closer: string }[] = []
  const tokens = tokenizer(source.slice(0, end), { ecmaVersion: 'latest' })
  try {
    while (true) {
      const token = tokens.getToken()
      const label = token.type.label
      if (label === 'eof') return errorOffset >= end ? stack.at(-1) : undefined
      if (token.start > errorOffset) return undefined
      if (label === '(' || label === '[' || label === '{' || label === '${') {
        stack.push({
          bracket: label === '${' ? '{' : label,
          offset: token.start + (label === '${' ? 1 : 0),
          closer: label === '(' ? ')' : label === '[' ? ']' : '}',
        })
      } else if (label === ')' || label === ']' || label === '}') {
        const opener = stack.at(-1)
        if (opener?.closer !== label) return token.start === errorOffset ? opener : undefined
        stack.pop()
      }
    }
  } catch (error) {
    // Unterminated literals/comments belong to Acorn's original diagnostic.
    if (!(error instanceof SyntaxError)) throw error
    return undefined
  }
}
