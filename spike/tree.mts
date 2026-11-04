/** Throwaway #146 research: a lossless cell tree over Strudel's own krill AST. Not production code. */
// @ts-expect-error upstream ships no declarations
import { parse as krillParse } from '@strudel/mini/krill-parser.js'

export interface Span { start: number; end: number }
export type ModKind = 'weight' | 'elongate' | 'replicate' | 'fast' | 'slow' | 'degrade' | 'euclid' | 'index' | 'range' | 'steps'
export interface Mod { kind: ModKind; span: Span; raw: string; arg?: string; patterned: boolean }
export type Shape = 'atom' | 'rest' | 'seq' | 'alt' | 'poly'
export interface Cell {
  shape: Shape
  /** Whole element including modifiers. */
  span: Span
  /** The slice alone: the atom or the bracketed group. */
  body: Span
  text?: string
  mods: Mod[]
  weight: number
  reps: number
  /** Layers: one for a plain group, several for `,` or `|` or `.`. */
  layers?: Layer[]
  join?: 'stack' | 'choose' | 'feet' | 'single'
}
export type Layer = { span: Span; cells: Cell[] }
export interface Tree { text: string; root: Layer[]; join: Cell['join']; marker: boolean }

type Loc = { start: { offset: number }; end: { offset: number } }
interface AstAtom { type_: 'atom'; source_: string; location_: Loc }
interface AstPattern { type_: 'pattern'; source_: (AstElement | AstPattern)[]; arguments_: { alignment: string; _steps?: boolean; stepsPerCycle?: unknown } }
interface AstElement { type_: 'element'; source_: AstAtom | AstPattern; options_: { ops: { type_: string; arguments_: Record<string, unknown> }[]; weight: number; reps: number }; location_: Loc }

const WS = /[ \n\r\t\u00A0]/
function trim(text: string, span: Span): Span {
  let { start, end } = span
  while (start < end && WS.test(text[start]!)) start++
  while (end > start && WS.test(text[end - 1]!)) end--
  return { start, end }
}
function matching(text: string, open: number): number {
  const pairs: Record<string, string> = { '[': ']', '<': '>', '{': '}', '(': ')' }
  const stack: string[] = []
  for (let i = open; i < text.length; i++) {
    const c = text[i]!
    if (c in pairs) stack.push(pairs[c]!)
    else if (c === stack.at(-1)) {
      stack.pop()
      if (!stack.length) return i + 1
    }
  }
  throw new Error(`Unbalanced group at ${open}`)
}
/** One slice argument: a word or a bracketed group. */
function argEnd(text: string, at: number, limit: number): number {
  if ('[<{'.includes(text[at] ?? ' ')) return matching(text, at)
  let i = at
  while (i < limit && !/[\s@!?*/:(\[\]<>{},|%]/.test(text[i]!)) i++
  return i
}
const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/

export function scanMods(text: string, start: number, end: number): Mod[] {
  const mods: Mod[] = []
  let i = start
  const push = (kind: ModKind, from: number, to: number, arg?: string) =>
    mods.push({ kind, span: { start: from, end: to }, raw: text.slice(from, to), ...(arg === undefined ? {} : { arg }), patterned: !!arg && !/^-?[\d.]+$/.test(arg) })
  while (i < end) {
    if (WS.test(text[i]!)) { i++; continue }
    const from = i
    const c = text[i]!
    if (c === '@' || c === '_' || c === '!' || c === '?') {
      i++
      const n = number.exec(text.slice(i, end))?.[0] ?? ''
      i += n.length
      push(c === '@' ? 'weight' : c === '_' ? 'elongate' : c === '!' ? 'replicate' : 'degrade', from, i, n || undefined)
    } else if (c === '*' || c === '/' || c === ':' || c === '%') {
      i++
      const to = argEnd(text, i, end)
      push(c === '*' ? 'fast' : c === '/' ? 'slow' : c === ':' ? 'index' : 'steps', from, to, text.slice(i, to))
      i = to
    } else if (c === '.' && text[i + 1] === '.') {
      i += 2
      while (i < end && WS.test(text[i]!)) i++
      const to = argEnd(text, i, end)
      push('range', from, to, text.slice(i, to))
      i = to
    } else if (c === '(') {
      const to = matching(text, i)
      push('euclid', from, to, text.slice(i + 1, to - 1))
      i = to
    } else throw new Error(`Unknown modifier at ${i}: ${text.slice(i, end)}`)
  }
  return mods
}

function checkMods(mods: Mod[], e: AstElement) {
  const counts = (k: ModKind) => mods.filter((m) => m.kind === k).length
  const ops = (t: string, f?: (a: Record<string, unknown>) => boolean) =>
    e.options_.ops.filter((o) => o.type_ === t && (!f || f(o.arguments_))).length
  const expected: [ModKind, number][] = [
    ['fast', ops('stretch', (a) => a['type'] === 'fast')],
    ['slow', ops('stretch', (a) => a['type'] === 'slow')],
    ['degrade', ops('degradeBy')],
    ['euclid', ops('bjorklund')],
    ['index', ops('tail')],
    ['range', ops('range')],
  ]
  for (const [kind, n] of expected)
    if (counts(kind) !== n) throw new Error(`Modifier mismatch ${kind}: scanned ${counts(kind)}, parsed ${n}`)
  // Recompute krill's weight and repetition folding from source text only.
  let weight = 1
  let reps = 1
  for (const mod of mods) {
    if (mod.kind === 'weight' || mod.kind === 'elongate') weight += (mod.arg ? Number(mod.arg) : 2) - 1
    if (mod.kind === 'replicate') { reps += (mod.arg ? Number(mod.arg) : 2) - 1; weight = reps }
  }
  if (weight !== e.options_.weight || reps !== e.options_.reps)
    throw new Error(`Weight mismatch: scanned ${weight}/${reps}, parsed ${e.options_.weight}/${e.options_.reps}`)
}

function layerOf(text: string, p: AstPattern, shift: number): Layer {
  const cells = p.source_.map((e) => cellOf(text, e as AstElement, shift))
  const first = cells[0]
  const last = cells.at(-1)
  return { span: first && last ? { start: first.span.start, end: last.span.end } : { start: 0, end: 0 }, cells }
}
function layersOf(text: string, p: AstPattern, shift: number): { layers: Layer[]; join: Cell['join'] } {
  const alignment = p.arguments_.alignment
  if (alignment === 'fastcat') return { layers: [layerOf(text, p, shift)], join: 'single' }
  const join = alignment === 'rand' ? 'choose' : alignment === 'feet' ? 'feet' : alignment === 'stack' || alignment === 'polymeter' || alignment === 'polymeter_slowcat' ? 'stack' : undefined
  if (!join) throw new Error(`Unknown alignment ${alignment}`)
  const layers = p.source_.map((l) => layerOf(text, l as AstPattern, shift))
  return { layers, join: layers.length === 1 ? 'single' : join }
}
function cellOf(text: string, e: AstElement, shift: number): Cell {
  const raw = { start: e.location_.start.offset + shift, end: e.location_.end.offset + shift }
  const span = trim(text, raw)
  const { options_: options, source_: source } = e
  if (source.type_ === 'atom') {
    const body = trim(text, { start: source.location_.start.offset + shift, end: source.location_.end.offset + shift })
    if (text.slice(body.start, body.end) !== source.source_) throw new Error(`Atom span mismatch for ${source.source_}`)
    const mods = scanMods(text, body.end, span.end)
    checkMods(mods, e)
    return { shape: source.source_ === '~' || source.source_ === '-' ? 'rest' : 'atom', span, body, text: source.source_, mods, weight: options.weight, reps: options.reps }
  }
  const close = matching(text, span.start)
  const body = { start: span.start, end: close }
  const mods = scanMods(text, close, span.end)
  checkMods(mods, e)
  const alignment = source.arguments_.alignment
  const opening = text[span.start]
  const shape: Shape = opening === '<' ? 'alt' : opening === '{' ? 'poly' : 'seq'
  if ((opening === '<') !== (alignment === 'polymeter_slowcat')) throw new Error('Group/alignment mismatch')
  return { shape, span, body, mods, weight: options.weight, reps: options.reps, ...layersOf(text, source, shift) }
}

export function buildTree(text: string): Tree {
  const ast = krillParse(`"${text}"`) as AstPattern
  const { layers, join } = layersOf(text, ast, -1)
  return { text, root: layers, join, marker: !!ast.arguments_._steps || /^\s*\^/.test(text) }
}

/** Every token the tree claims, used to prove nothing in the literal goes unaccounted for. */
export function claimed(tree: Tree): Span[] {
  const spans: Span[] = []
  const walkLayer = (l: Layer) => l.cells.forEach(walk)
  const walk = (c: Cell) => {
    c.mods.forEach((m) => spans.push(m.span))
    if (c.layers) {
      spans.push({ start: c.body.start, end: c.body.start + 1 }, { start: c.body.end - 1, end: c.body.end })
      c.layers.forEach(walkLayer)
    } else spans.push(c.body)
  }
  tree.root.forEach(walkLayer)
  return spans
}
/** Characters outside any claimed span. Only whitespace and layer separators may remain. */
export function unclaimed(tree: Tree): string {
  const mask = new Array<boolean>(tree.text.length).fill(false)
  for (const s of claimed(tree))
    for (let i = s.start; i < s.end; i++) {
      if (mask[i]) throw new Error(`Overlap at ${i} in ${tree.text}`)
      mask[i] = true
    }
  return [...tree.text].filter((c, i) => !mask[i] && !WS.test(c)).join('')
}
export function walkCells(tree: Tree, visit: (c: Cell, depth: number, parents: Cell[]) => void) {
  const go = (l: Layer, depth: number, parents: Cell[]) =>
    l.cells.forEach((c) => {
      visit(c, depth, parents)
      c.layers?.forEach((x) => go(x, depth + 1, [...parents, c]))
    })
  tree.root.forEach((l) => go(l, 0, []))
}
