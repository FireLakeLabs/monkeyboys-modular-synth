import { tokenizer } from 'acorn'

export interface Credit {
  tag: string
  value: string
}

/** Exact comment bytes, including their original line endings, for explicit
 * conversion where ordinary source formatting is otherwise relinquished. */
export function creditComments(source: string): { start: number; end: number; text: string }[] {
  const comments: { start: number; end: number; text: string }[] = []
  const tokens = tokenizer(source, {
    ecmaVersion: 'latest',
    onComment: (block, text, start, end) => {
      if (block || !/^\s*@[\w-]+\s+\S/.test(text)) return
      const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(end))?.[0] ?? ''
      comments.push({ start, end, text: source.slice(start, end) + newline })
    },
  })
  while (tokens.getToken().type.label !== 'eof') {
    /* comments only */
  }
  return comments
}

/** Comments are read, never rewritten or evaluated; strings and templates stay opaque. */
export function patchCredits(source: string): Credit[] {
  const credits: Credit[] = []
  const tokens = tokenizer(source, {
    ecmaVersion: 'latest',
    onComment: (block, text) => {
      if (block) return
      const match = /^\s*@([\w-]+)\s+(.*?)\s*$/.exec(text)
      if (match?.[1] && match[2]) credits.push({ tag: match[1].toLowerCase(), value: match[2] })
    },
  })
  try {
    while (tokens.getToken().type.label !== 'eof') {
      /* comments only */
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  return credits
}

export function creditedTitle(source: string): string | undefined {
  return patchCredits(source).find((credit) => credit.tag === 'title')?.value
}
