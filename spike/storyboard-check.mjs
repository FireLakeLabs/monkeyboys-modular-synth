// Drives the storyboard in Chromium and cross-checks its stand-in parser against krill.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { buildTree, walkCells } from './tree.mts'
import { idioms, repoCorpus, upstreamCorpus } from './corpus.mts'
const out = process.argv[2] ?? '/tmp/s146/shots'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await p.goto(pathToFileURL(resolve('docs/design/nested-step-editor.html')).href)
await p.waitForSelector('#panels .surface')
const results = { browser: b.version() }

// 1. The stand-in parser must agree with krill on every span, or the storyboard misrepresents.
const corpus = [...new Set([...repoCorpus(), ...upstreamCorpus(), ...idioms])]
const shape = (tree) => { const rows = []; walkCells(tree, (c, d) => rows.push([d, c.shape, c.span.start, c.span.end, c.body.start, c.body.end, c.weight, c.reps, c.mods.map((m) => [m.kind, m.span.start, m.span.end])])); return JSON.stringify(rows) }
const theirs = await p.evaluate((list) => list.map((s) => {
  try {
    const t = window.storyboard.parseMini(s); const rows = []
    const go = (l, d) => l.cells.forEach((c) => { rows.push([d, c.shape, c.span.start, c.span.end, c.body.start, c.body.end, c.weight, c.reps, c.mods.map((m) => [m.kind, m.span.start, m.span.end])]); c.layers?.forEach((x) => go(x, d + 1)) })
    t.root.forEach((l) => go(l, 0)); return JSON.stringify(rows)
  } catch (e) { return 'ERR ' + e.message }
}), corpus)
const mismatches = corpus.flatMap((s, i) => shape(buildTree(s)) === theirs[i] ? [] : [{ s, krill: shape(buildTree(s)).slice(0, 160), storyboard: theirs[i].slice(0, 160) }])
results.parserParity = { strings: corpus.length, mismatches: mismatches.length, examples: mismatches.slice(0, 6) }

// 2. Every scenario renders at catalog width without throwing, in every layout and look.
const matrix = await p.evaluate(() => {
  const rows = []
  for (const s of window.storyboard.scenarios) {
    window.storyboard.load(s.id)
    for (const layout of ['lines', 'strip', 'uniform']) for (const look of ['instrument', 'powder', 'vintage', 'learner', 'crystal', 'terminal']) {
      for (const [id, v] of [['layout', layout], ['look', look]]) { const n = document.getElementById(id); n.value = v; n.dispatchEvent(new Event('change')) }
      const seq = document.querySelector('.module.seq').getBoundingClientRect(), drums = document.querySelector('.module.drums').getBoundingClientRect()
      const surface = document.querySelector('.module.seq .surface').getBoundingClientRect()
      const over = [...document.querySelectorAll('.module.seq .surface .cell')].filter((c) => c.getBoundingClientRect().right > surface.right + 1.5 || c.getBoundingClientRect().bottom > surface.bottom + 1.5).length
      rows.push({ s: s.id, layout, look, seq: seq.width, drums: drums.width, over, cells: document.querySelectorAll('#panels .cell').length })
    }
  }
  return rows
})
results.matrix = { combos: matrix.length, badWidth: matrix.filter((r) => r.seq !== 120 || r.drums !== 168).length, overflow: matrix.filter((r) => r.over).map((r) => `${r.s}/${r.layout}/${r.look}:${r.over}`).slice(0, 12), empty: matrix.filter((r) => !r.cells).length }

// 3. Keyboard only, in the real page.
const seq = () => p.evaluate(() => window.storyboard.state.seq)
const drums = () => p.evaluate(() => window.storyboard.state.drums)
const load = (id) => p.evaluate((id) => { for (const [k, v] of [['layout', 'lines'], ['look', 'instrument']]) { const n = document.getElementById(k); n.value = v; n.dispatchEvent(new Event('change')) } window.storyboard.load(id) }, id)
const key = async (...keys) => { for (const k of keys) await p.keyboard.press(k) }
const enter = async () => { await p.locator('#panels [data-path][tabindex="0"]').first().focus() }
const checks = []
const check = (name, got, want) => { checks.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) }) }

await load('flat')
check('one tab stop for both editors', await p.evaluate(() => document.querySelectorAll('#panels [tabindex="0"]').length), 1)
await enter(); await key('ArrowRight', '[')
check('[ splits the second step', await seq(), 'c2 [c2 c2] eb2 g2 c3 bb2 g2 eb2')
await key('Enter'); check('Enter opens the group', await p.evaluate(() => window.storyboard.state.focus.seq), [0, 1])
await key('ArrowRight', '*')
check('* adds a repeat inside the group', await seq(), 'c2 [c2 c2*2] eb2 g2 c3 bb2 g2 eb2')
await key('*'); check('* again steps the value', await seq(), 'c2 [c2 c2*3] eb2 g2 c3 bb2 g2 eb2')
await key('Backspace'); check('Backspace removes the modifier first', await seq(), 'c2 [c2 c2] eb2 g2 c3 bb2 g2 eb2')
await key('Escape'); check('Esc closes the focus', await p.evaluate(() => [window.storyboard.state.focus.seq, window.storyboard.state.path]), [[], [0, 1]])
await key(']'); check('] merges the group', await seq(), 'c2 c2 eb2 g2 c3 bb2 g2 eb2')
await key('@'); check('@ stretches', await seq(), 'c2 c2@2 eb2 g2 c3 bb2 g2 eb2')
await key('?'); check('? toggles on', await seq(), 'c2 c2@2? eb2 g2 c3 bb2 g2 eb2')
await key('?'); check('? toggles off', await seq(), 'c2 c2@2 eb2 g2 c3 bb2 g2 eb2')
await key('ArrowRight', '<'); check('< adds an alternative', await seq(), 'c2 c2@2 <eb2 c3> g2 c3 bb2 g2 eb2')
await key('ArrowRight', ','); check(', adds a chord note', await seq(), 'c2 c2@2 <eb2 c3> [g2, c3] c3 bb2 g2 eb2')
await key('ArrowRight', '|'); check('| adds a choice', await seq(), 'c2 c2@2 <eb2 c3> [g2, c3] [c3 | c3] bb2 g2 eb2')
await key('ArrowRight', '~'); check('~ makes a rest', await seq(), 'c2 c2@2 <eb2 c3> [g2, c3] [c3 | c3] ~ g2 eb2')
await key('+'); check('+ adds a step', await seq(), 'c2 c2@2 <eb2 c3> [g2, c3] [c3 | c3] ~ ~ g2 eb2')
await key('Delete'); check('Delete removes the step', await seq(), 'c2 c2@2 <eb2 c3> [g2, c3] [c3 | c3] ~ g2 eb2')

// Line navigation follows drawn positions, not a fixed cell count.
const selected = () => p.evaluate(() => window.storyboard.state.path)
await load('flat'); await enter(); await key('ArrowDown')
check('ArrowDown moves one line on even lines', await selected(), [0, 2])
await key('ArrowDown', 'ArrowRight', 'ArrowUp')
check('ArrowUp keeps the column', await selected(), [0, 3])
await load('weight'); await enter(); await key('ArrowDown')
check('ArrowDown finds the nearest cell on proportional lines', await selected(), [0, 1])
await key('ArrowUp'); check('ArrowUp returns to the long cell', await selected(), [0, 0])
await key('ArrowUp'); check('ArrowUp stops at the first line', await selected(), [0, 0])

await load('flat'); await enter(); await key('Enter')
await p.keyboard.type('f#2'); await key('Enter')
check('Enter edits a note in place', await seq(), 'f#2 c2 eb2 g2 c3 bb2 g2 eb2')

await load('text'); await enter(); await key('ArrowRight', 'Enter')
const input = p.locator('.tray .inline-edit')
check('Enter opens a text cell with its source', await input.inputValue(), '{e2 g2 a2}%4')
await input.fill('a b'); await key('Enter')
check('a text cell refuses two elements', [await seq(), await p.locator('.tray .refusal').count()], ['c2 {e2 g2 a2}%4 bd*<2 3> 0 .. 3', 1])
await input.fill('[a'); await key('Enter')
check('a text cell refuses broken notation', await seq(), 'c2 {e2 g2 a2}%4 bd*<2 3> 0 .. 3')
await input.fill('{e2 g2}%8'); await key('Enter')
check('a valid text edit splices only that cell', await seq(), 'c2 {e2 g2}%8 bd*<2 3> 0 .. 3')
await p.locator('#undo').click()
check('undo restores the exact source', await seq(), 'c2 {e2 g2 a2}%4 bd*<2 3> 0 .. 3')

// Formatting outside the edit survives a real gesture.
await p.evaluate(() => { const s = window.storyboard.state; s.seq = 'c2   [e2  g2]@2\n  a2'; s.path = [0, 0]; document.getElementById('look').dispatchEvent(new Event('change')) })
await enter(); await key('ArrowRight', '@')
check('stepping @ keeps imported spacing', await seq(), 'c2   [e2  g2]@3\n  a2')

// 4. Pointer: DRUMS toggle and the stretch grip.
await load('flat')
const drumCell = p.locator('#panels .module.drums [data-path="0.1"]')
await drumCell.click(); await drumCell.click()
check('second click toggles a DRUMS rest into a step', (await drums()).startsWith('bd cp bd'), true)
await load('weight')
const grip = p.locator('#panels .module.seq .grip').nth(1)
const box = await grip.boundingBox()
await p.mouse.move(box.x + 2, box.y + 4); await p.mouse.down(); await p.mouse.move(box.x + 60, box.y + 4); await p.mouse.up()
check('dragging the grip rewrites only @n', /^c2@3 e2 g2@\d a2$/.test(await seq()) && (await seq()) !== 'c2@3 e2 g2@2 a2', true)

// 5. Deep nesting opens level by level and stays legible.
await load('deep'); await enter(); await key('ArrowRight', 'Enter')
const widths = await p.evaluate(() => [...document.querySelectorAll('.module.seq .surface > .cell')].map((n) => n.offsetWidth))
check('focus gives each child a full line', widths.every((w) => w >= 100), true)
check('the crumb shows the open group', await p.locator('.module.seq .crumb').textContent(), '[e2 [g2 [a2 [b2 c3]]]]')
await key('Escape'); check('source is untouched by opening', await seq(), 'c2 [e2 [g2 [a2 [b2 c3]]]] d3 e3')

// 6. Zoom scales the panel and never re-lays out cells.
await load('all')
const at = (z) => p.evaluate((z) => { const n = document.getElementById('zoom'); n.value = String(z); n.dispatchEvent(new Event('change')); return { w: document.querySelector('.module.seq').getBoundingClientRect().width, cells: [...document.querySelectorAll('.module.seq .cell')].map((c) => [c.style.left, c.style.width]) } }, z)
const zooms = []; for (const z of [0.75, 1, 1.25, 1.5]) zooms.push(await at(z))
check('panel width follows zoom', zooms.map((z) => Math.round(z.w)), [90, 120, 150, 180])
check('zoom never changes the layout', new Set(zooms.map((z) => JSON.stringify(z.cells))).size, 1)
await at(1)

// 7. Playhead and reduced motion.
await load('sub'); await p.locator('#play').click(); await p.waitForTimeout(700)
let seen = 0
for (let i = 0; i < 40; i++) { seen = Math.max(seen, await p.locator('#panels .cell.flash').count()); await p.waitForTimeout(25) }
check('simulated playhead lights nested cells', seen > 0, true)
await p.locator('#reduced').click(); await p.waitForTimeout(150)
check('reduced motion swaps flashes for an outline', [await p.locator('#panels .cell.flash').count(), (await p.locator('#panels .surface.playing-outline').count()) > 0], [0, true])
await p.locator('#reduced').click(); await p.locator('#play').click()
results.interactions = { passed: checks.filter((c) => c.ok).length, total: checks.length, failed: checks.filter((c) => !c.ok) }
writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 1))
console.log(JSON.stringify({ results, errors: errors.slice(0, 6) }, null, 1))
await b.close()
