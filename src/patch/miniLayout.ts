import { euclidean } from './euclidean'
import { textCell, type Cell, type Layer, type Tree } from './mini'

export interface MiniPiece {
  cell: Cell
  x: number
  y: number
  width: number
  height: number
  depth: number
  lane: number
  parent?: Cell
  start: number
  end: number
  copy: number
  primary: boolean
  continuedLeft: boolean
  continuedRight: boolean
  collapsed: boolean
  ghost: boolean
  hit: boolean
}
const total = (cells: Cell[]) => cells.reduce((sum, c) => sum + c.weight, 0)

export function lineCount(cells: Cell[], max = 4): number {
  const sum = total(cells)
  let at = 0
  const boundaries = [0, ...cells.map((c) => (at += c.weight / sum))]
  for (let n = max; n >= 2; n--)
    if (
      Array.from({ length: n - 1 }, (_, i) => (i + 1) / n).every((p) =>
        boundaries.some((b) => Math.abs(b - p) < 1e-8),
      )
    )
      return n
  return max
}

/** Logical panel pixels only: rack zoom can never select a different layout. */
export function layoutMini(
  tree: Tree,
  {
    width = 104,
    drum = false,
    cycle = 0,
    pages = {},
    focus,
  }: {
    width?: number
    drum?: boolean
    cycle?: number
    pages?: Readonly<Record<number, number>>
    focus?: Cell | undefined
  } = {},
): { pieces: MiniPiece[]; height: number; rows: string[] } {
  const pieces: MiniPiece[] = []
  const layers = focus?.layers ?? tree.root
  const join = focus?.join ?? tree.join
  const rows: string[] = []
  const stacked = join === 'stack' || join === 'choose'
  const lines = drum
    ? 1
    : Math.max(
        ...layers.map((l) =>
          lineCount(l.cells, stacked ? Math.max(1, Math.floor(4 / layers.length)) : 4),
        ),
      )
  const rowHeight = drum ? 18 : 73
  const height = rowHeight * (drum && stacked ? layers.length : 1)
  const laneHeight = stacked && !drum ? height / layers.length : rowHeight
  const drawLayer = (
    layer: Layer,
    box: { x: number; y: number; w: number; h: number },
    depth: number,
    lane: number,
    parent?: Cell,
    begin = 0,
    duration = 1,
    localCycle = cycle,
  ) => {
    let at = 0
    const sum = total(layer.cells)
    for (const cell of layer.cells) {
      const share = cell.weight / sum
      draw(
        cell,
        box.x + at * box.w,
        box.y,
        share * box.w,
        box.h,
        depth,
        lane,
        parent,
        begin + at * duration,
        share * duration,
        localCycle,
      )
      at += share
    }
  }
  const draw = (
    cell: Cell,
    x: number,
    y: number,
    w: number,
    h: number,
    depth: number,
    lane: number,
    parent: Cell | undefined,
    start: number,
    duration: number,
    localCycle = cycle,
  ) => {
    const fast =
      drum && depth === 0 ? cell.mods.find((m) => m.kind === 'fast' && !m.patterned) : undefined
    const euclid = drum
      ? cell.mods
          .find((m) => m.kind === 'euclid' && !textCell(cell))
          ?.arg?.split(',')
          .map(Number)
      : undefined
    const [k = 0, n = 0, r = 0] = euclid ?? []
    const euclidHits = euclid ? euclidean(k, n, r) : undefined
    const rate = Math.max(1, Math.min(128, Math.floor(Number(fast?.arg) || 1)))
    const count = textCell(cell)
      ? 1
      : Math.min(cell.reps, 128) * (euclid ? Math.max(1, Math.min(128, n)) : rate)
    for (let copy = 0; copy < count; copy++) {
      const cw = w / count,
        cx = x + copy * cw
      const children = cell.layers
      const lanes = children?.length ?? 1
      const min = drum ? 5 : 16
      const collapsed =
        !!children &&
        cell.shape !== 'alt' &&
        (h / lanes < (drum ? 5 : 12) ||
          children.some((l) => l.cells.some((c) => (cw * c.weight) / total(l.cells) < min)))
      const piece: MiniPiece = {
        cell,
        x: cx,
        y,
        width: cw,
        height: h,
        depth,
        lane,
        ...(parent ? { parent } : {}),
        start: start + (duration * copy) / count,
        end: start + (duration * (copy + 1)) / count,
        copy,
        primary: true,
        continuedLeft: false,
        continuedRight: false,
        collapsed,
        ghost: rate > 1 && copy > 0,
        hit: !euclidHits || euclidHits[copy % n] === true,
      }
      pieces.push(piece)
      if (!children || collapsed || textCell(cell) || depth >= 24) continue
      const inner = { x: cx + 2, y: y + 1, w: Math.max(cw - 4, 1), h: Math.max(h - 2, 1) }
      if (cell.shape === 'alt') {
        const options = children.flatMap((l) => l.cells)
        const selected =
          options.find((c) => c.span.start === pages[cell.span.start]) ??
          options[((Math.floor(localCycle) % options.length) + options.length) % options.length]
        if (selected)
          draw(
            selected,
            inner.x,
            inner.y,
            inner.w - 4,
            inner.h,
            depth + 1,
            lane,
            cell,
            piece.start,
            duration / count,
            Math.floor(localCycle / options.length),
          )
      } else
        children.forEach((l, i) => {
          const stack = cell.join === 'stack' || cell.join === 'choose'
          const feet = cell.join === 'feet'
          drawLayer(
            l,
            {
              x: inner.x + (feet ? (i * inner.w) / lanes : 0),
              y: inner.y + (stack ? (i * inner.h) / lanes : 0),
              w: feet ? inner.w / lanes : inner.w,
              h: stack ? inner.h / lanes : inner.h,
            },
            depth + 1,
            lane + i,
            cell,
            piece.start + (feet ? (duration * i) / count / lanes : 0),
            duration / count / (feet ? lanes : 1),
            localCycle,
          )
        })
    }
  }
  layers.forEach((layer, lane) => {
    const atoms: string[] = []
    const visit = (c: Cell) => {
      if (c.text && c.shape !== 'rest') atoms.push(c.text)
      c.layers?.forEach((l) => l.cells.forEach(visit))
    }
    layer.cells.forEach(visit)
    rows.push(new Set(atoms).size === 1 ? (atoms[0] ?? 'bd') : atoms.length ? 'mix' : 'bd')
    // First lay out on a continuous strip, then cut at equal-time boundaries.
    const feet = join === 'feet'
    drawLayer(
      layer,
      {
        x: feet ? (lane * width * lines) / layers.length : 0,
        y: stacked ? lane * laneHeight : 0,
        w: (width * lines) / (feet ? layers.length : 1),
        h: laneHeight / lines,
      },
      0,
      lane,
      undefined,
      feet ? lane / layers.length : 0,
      feet ? 1 / layers.length : 1,
    )
  })
  return {
    height,
    rows,
    pieces: pieces.flatMap((piece) => {
      const first = Math.floor((piece.x + 1e-8) / width),
        last = Math.ceil((piece.x + piece.width - 1e-8) / width) - 1
      const widths = Array.from(
        { length: Math.max(1, last - first + 1) },
        (_, i) =>
          Math.min(piece.x + piece.width, (first + i + 1) * width) -
          Math.max(piece.x, (first + i) * width),
      )
      const primaryIndex = widths.indexOf(Math.max(...widths))
      return Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => {
        const line = first + i,
          left = Math.max(piece.x, line * width),
          right = Math.min(piece.x + piece.width, (line + 1) * width)
        return {
          ...piece,
          x: left - line * width,
          y: piece.y + (line * laneHeight) / lines,
          width: right - left,
          primary: i === primaryIndex,
          continuedLeft: i > 0,
          continuedRight: line < last,
        }
      })
    }),
  }
}
