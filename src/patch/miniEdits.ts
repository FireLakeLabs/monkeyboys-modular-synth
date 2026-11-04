import { buildTree, textCell, type Cell, type ModKind, type Span } from './mini'

export interface MiniSplice extends Span {
  text: string
}
export const spliceMini = (text: string, edit: MiniSplice) =>
  text.slice(0, edit.start) + edit.text + text.slice(edit.end)

export function replaceCell(cell: Cell, raw: string): MiniSplice {
  const probe = buildTree(raw)
  if (probe.join !== 'single' || probe.root[0]?.cells.length !== 1 || probe.marker)
    throw new Error('Enter exactly one mini-notation element; use Text mode for a sequence.')
  return { ...(textCell(cell) ? cell.span : cell.body), text: raw.trim() }
}

export const gestureKeys = [
  '[',
  ']',
  '*',
  '/',
  '!',
  '@',
  '?',
  '<',
  ',',
  '|',
  '(',
  '~',
  '+',
  'Backspace',
] as const
export type Gesture = (typeof gestureKeys)[number]
export const gestureLabels: Record<Gesture, string> = {
  '[': 'Split',
  ']': 'Merge',
  '*': 'Repeat',
  '/': 'Slow',
  '!': 'Copies',
  '@': 'Stretch',
  '?': 'Maybe',
  '<': 'Alternative',
  ',': 'Chord note',
  '|': 'Random choice',
  '(': 'Euclid',
  '~': 'Rest',
  '+': 'Add step',
  Backspace: 'Remove modifier or cell',
}

export function miniGesture(text: string, cell: Cell, key: Gesture, token: string): MiniSplice {
  const body = text.slice(cell.body.start, cell.body.end)
  const append = (raw: string): MiniSplice => ({
    start: cell.span.end,
    end: cell.span.end,
    text: raw,
  })
  const replace = (raw: string): MiniSplice => ({ ...cell.body, text: raw })
  const modKinds: Partial<Record<Gesture, ModKind>> = {
    '*': 'fast',
    '/': 'slow',
    '!': 'replicate',
    '@': 'weight',
  }
  const kind = modKinds[key]
  if (kind) {
    const mod = cell.mods.find((m) => m.kind === kind)
    if (mod?.patterned) throw new Error('Edit the patterned modifier in its text cell.')
    return mod ? { ...mod.span, text: `${key}${Number(mod.arg ?? 2) + 1}` } : append(`${key}2`)
  }
  switch (key) {
    case '[':
      return replace(`[${body} ${body}]`)
    case ']': {
      const first = cell.layers?.[0]?.cells[0]
      if (!first) throw new Error('Select a group to merge.')
      return replace(text.slice(first.span.start, first.span.end))
    }
    case '?': {
      const mod = cell.mods.find((m) => m.kind === 'degrade')
      return mod ? { ...mod.span, text: '' } : append('?')
    }
    case '<': {
      const last =
        cell.shape === 'alt' && cell.join === 'single' ? cell.layers?.[0]?.cells.at(-1) : undefined
      return last
        ? { start: last.span.end, end: last.span.end, text: ` ${token}` }
        : replace(`<${body} ${token}>`)
    }
    case ',':
    case '|': {
      const join = key === ',' ? 'stack' : 'choose'
      const last = cell.shape === 'seq' && cell.join === join ? cell.layers?.at(-1) : undefined
      const previous = cell.layers?.at(-2)
      const separator =
        last && previous ? text.slice(previous.span.end, last.span.start) : `${key} `
      return last
        ? { start: last.span.end, end: last.span.end, text: `${separator}${token}` }
        : replace(`[${body}${key} ${token}]`)
    }
    case '(': {
      const mod = cell.mods.find((m) => m.kind === 'euclid')
      return mod ? { ...mod.span, text: '(5,8)' } : append('(3,8)')
    }
    case '~':
      return replace(cell.shape === 'rest' ? token : '~')
    case '+':
      return append(' ~')
    case 'Backspace': {
      const mod = cell.mods.at(-1)
      if (mod) {
        let start = mod.span.start
        if (mod.kind === 'elongate') while (start > 0 && /\s/.test(text[start - 1] ?? '')) start--
        return { start, end: mod.span.end, text: '' }
      }
      let { start, end } = cell.span
      while (end < text.length && /\s/.test(text[end] ?? '')) end++
      if (end === cell.span.end) while (start > 0 && /\s/.test(text[start - 1] ?? '')) start--
      return { start, end, text: '' }
    }
    default:
      throw new Error(`Unsupported gesture ${key}`)
  }
}

/** Validate the complete result before asking the document boundary to accept it. */
export function applyMiniEdit(text: string, edit: MiniSplice): string {
  if (edit.start < 0 || edit.end < edit.start || edit.end > text.length)
    throw new Error('Stale mini range')
  const next = spliceMini(text, edit)
  const tree = buildTree(next)
  if (tree.root.some((l) => !l.cells.length)) throw new Error('The last cell stays; use a rest.')
  return next
}
