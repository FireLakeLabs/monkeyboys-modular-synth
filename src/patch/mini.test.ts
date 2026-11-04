import { expect, it } from 'vitest'
import { buildTree, miniView, textCell, unclaimed, walkCells, type Cell } from './mini'
import { idioms } from './mini.fixtures'
import { applyMiniEdit, miniGesture, replaceCell } from './miniEdits'
import { layoutMini, lineCount } from './miniLayout'

it.each(idioms)('projects the chosen construct without losing source: %s', (text) => {
  expect(miniView(text).kind).toBe('tree')
  const tree = buildTree(text)
  expect(tree.text).toBe(text)
  expect(unclaimed(tree).replace(/[,.|^]/g, '')).toBe('')
})
it.each(['{a b}%4', '0 .. 3', 'bd*<2 3>', 'bd(<3 5>,8)'])(
  'isolates an unsupported element as a text cell: %s',
  (text) => {
    const tree = buildTree(`c2 ${text} e2`)
    expect(tree.root[0]?.cells.map(textCell)).toEqual([false, true, false])
  },
)
it.each(['', '[a', 'a\\tb'])('keeps unproven input in whole text mode: %s', (text) =>
  expect(miniView(text).kind).toBe('text'),
)
function first(text: string): Cell {
  const c = buildTree(text).root[0]?.cells[0]
  if (!c) throw new Error('No cell')
  return c
}
it.each([
  ['[', 'c2', '[c2 c2]'],
  [']', '[c2 e2]', 'c2'],
  ['*', 'c2', 'c2*2'],
  ['*', 'c2*2', 'c2*3'],
  ['/', 'c2', 'c2/2'],
  ['!', 'c2', 'c2!2'],
  ['@', 'c2', 'c2@2'],
  ['?', 'c2', 'c2?'],
  ['?', 'c2?', 'c2'],
  ['<', 'c2', '<c2 g2>'],
  [',', 'c2', '[c2, g2]'],
  ['|', 'c2', '[c2| g2]'],
  ['(', 'c2', 'c2(3,8)'],
  ['~', 'c2', '~'],
  ['~', '~', 'g2'],
  ['+', 'c2', 'c2 ~'],
  ['Backspace', 'c2*2', 'c2'],
] as const)('gesture %s on %s is one exact splice', (key, before, after) => {
  const text = ` \t${before}  \n e2 `
  expect(applyMiniEdit(text, miniGesture(text, first(text), key, 'g2'))).toBe(` \t${after}  \n e2 `)
})
it('keeps modifier spelling and whitespace around leaf edits', () => {
  const text = ' c2 _ _\n [e2\t g2]@3 '
  let hit: Cell | undefined
  walkCells(buildTree(text), (c) => {
    if (c.text === 'e2') hit = c
  })
  if (!hit) throw new Error('Missing leaf')
  expect(applyMiniEdit(text, replaceCell(hit, 'f2'))).toBe(' c2 _ _\n [f2\t g2]@3 ')
})
it('refuses text cell edits that would silently add elements or lanes', () => {
  const cell = first('{a b}%4')
  for (const raw of ['a b', 'a,b', '^a', '[']) expect(() => replaceCell(cell, raw)).toThrow()
  expect(applyMiniEdit('{a b}%4 e2', replaceCell(cell, 'g2*2'))).toBe('g2*2 e2')
})
it('weights time, links copies, cuts continuations and opens dense groups at fixed logical widths', () => {
  expect(lineCount(buildTree('a b c d e f g h').root[0]?.cells ?? [])).toBe(4)
  const weighted = layoutMini(buildTree('a@2 b c'))
  const a = weighted.pieces.filter((p) => p.cell.text === 'a').reduce((n, p) => n + p.width, 0)
  const b = weighted.pieces.filter((p) => p.cell.text === 'b').reduce((n, p) => n + p.width, 0)
  expect(a).toBeCloseTo(2 * b)
  expect(layoutMini(buildTree('a!3 b')).pieces.filter((p) => p.cell.text === 'a')).toHaveLength(3)
  expect(layoutMini(buildTree('a@3 b c')).pieces.some((p) => p.continuedRight)).toBe(true)
  const tree = buildTree('[a [b c d e f g h i]] j k l')
  const group = tree.root[0]?.cells[0]
  const overview = layoutMini(tree)
  expect(overview.pieces.some((p) => p.collapsed)).toBe(true)
  expect(layoutMini(tree, { focus: group }).pieces.some((p) => p.cell.text === 'a')).toBe(true)
})

it('draws continuation content once, in its widest piece, and keeps stacked lanes readable', () => {
  const layout = layoutMini(buildTree('a@3 b c'))
  const copies = layout.pieces.filter((p) => p.cell.text === 'a')
  expect(copies.length).toBeGreaterThan(1)
  expect(copies.filter((p) => p.primary)).toHaveLength(1)
  expect(copies.find((p) => p.primary)?.width).toBe(Math.max(...copies.map((p) => p.width)))
  expect(layoutMini(buildTree('a,b')).pieces.every((p) => p.height >= 12)).toBe(true)
})
