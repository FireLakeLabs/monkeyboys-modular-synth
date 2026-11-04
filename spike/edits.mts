import { buildTree, walkCells, type Cell, type Mod, type Tree } from './tree.mts'
export interface Splice { start: number; end: number; text: string }
export const apply = (t: string, s: Splice) => t.slice(0, s.start) + s.text + t.slice(s.end)
const src = (t: string, c: Cell) => t.slice(c.body.start, c.body.end)

export const replaceAtom = (c: Cell, token: string): Splice => ({ ...c.body, text: token })
export const split = (t: string, c: Cell, n = 2): Splice => ({ ...c.body, text: `[${Array(n).fill(src(t, c)).join(' ')}]` })
export function merge(t: string, c: Cell): Splice {
  const first = c.layers?.[0]?.cells[0]
  if (!first) throw new Error('Nothing to merge')
  return { ...c.body, text: t.slice(first.span.start, first.span.end) }
}
export const addMod = (c: Cell, raw: string): Splice => ({ start: c.span.end, end: c.span.end, text: raw })
export const setMod = (m: Mod, raw: string): Splice => ({ ...m.span, text: raw })
export function removeMod(t: string, m: Mod): Splice {
  let start = m.span.start
  // `_` stands alone; its leading whitespace goes with it.
  if (m.kind === 'elongate') while (start > 0 && /\s/.test(t[start - 1]!)) start--
  return { start, end: m.span.end, text: '' }
}
/** Join text follows the group's own spelling, so imported style survives. */
function separator(t: string, c: Cell, fallback: string): string {
  const [a, b] = [c.layers?.at(-2), c.layers?.at(-1)]
  return a && b ? t.slice(a.span.end, b.span.start) : fallback
}
export function addAlternative(t: string, c: Cell, token: string): Splice {
  if (c.shape === 'alt' && c.join === 'single') {
    const last = c.layers![0]!.cells.at(-1)!
    return { start: last.span.end, end: last.span.end, text: ` ${token}` }
  }
  return { ...c.body, text: `<${src(t, c)} ${token}>` }
}
export function addChordNote(t: string, c: Cell, token: string): Splice {
  if (c.shape === 'seq' && (c.join === 'stack' || c.join === 'single')) {
    const last = c.layers!.at(-1)!
    return { start: last.span.end, end: last.span.end, text: `${separator(t, c, ', ')}${token}` }
  }
  return { ...c.body, text: `[${src(t, c)}, ${token}]` }
}
export function addChoice(t: string, c: Cell, token: string): Splice {
  if (c.shape === 'seq' && c.join === 'choose') {
    const last = c.layers!.at(-1)!
    return { start: last.span.end, end: last.span.end, text: `${separator(t, c, ' | ')}${token}` }
  }
  return { ...c.body, text: `[${src(t, c)} | ${token}]` }
}
export const insertAfter = (c: Cell, token: string): Splice => ({ start: c.span.end, end: c.span.end, text: ` ${token}` })
export function removeCell(t: string, c: Cell): Splice {
  let { start, end } = c.span
  if (end < t.length && /\s/.test(t[end]!)) while (end < t.length && /\s/.test(t[end]!)) end++
  else while (start > 0 && /\s/.test(t[start - 1]!)) start--
  return { start, end, text: '' }
}
/** A text cell may only replace itself with exactly one element. */
export function editTextCell(t: string, c: Cell, raw: string): Splice {
  let probe: Tree
  try { probe = buildTree(raw) } catch { throw new Error('refused: does not parse') }
  if (probe.join !== 'single' || probe.root[0]?.cells.length !== 1) throw new Error('refused: not one cell')
  return { ...c.span, text: raw.trim() }
}
export function find(tree: Tree, match: (c: Cell) => boolean): Cell {
  let hit: Cell | undefined
  walkCells(tree, (c) => { if (!hit && match(c)) hit = c })
  if (!hit) throw new Error('No matching cell')
  return hit
}
export const atom = (tree: Tree, text: string) => find(tree, (c) => c.text === text)
