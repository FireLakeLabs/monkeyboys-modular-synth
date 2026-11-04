import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-nested-steps'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const result = { browser: browser.version(), checks: [], physicalListening: false }
const pass = (name) => {
  result.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript(() => {
  window.miniFlashes = []
  // oxlint-disable-next-line typescript/unbound-method -- Restore the original Element receiver.
  const animate = Element.prototype.animate
  Element.prototype.animate = function (frames, options) {
    if (this.hasAttribute('data-mini-start'))
      window.miniFlashes.push({
        module: this.closest('[data-module]')?.dataset.module,
        start: Number(this.dataset.miniStart),
        copy: Number(this.dataset.miniCopy),
        time: Number(this.dataset.miniTimeStart),
      })
    return animate.call(this, frames, options)
  }
  const probes = []
  // oxlint-disable-next-line typescript/unbound-method -- Restore the original AudioNode receiver.
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (...args) {
    const value = connect.apply(this, args)
    if (args[0] instanceof AudioDestinationNode) {
      const a = this.context.createAnalyser()
      connect.call(this, a)
      probes.push(a)
    }
    return value
  }
  window.miniPCM = async () => {
    let energy = 0,
      count = 0
    for (let i = 0; i < 40; i++) {
      for (const p of probes) {
        const data = new Float32Array(p.fftSize)
        p.getFloatTimeDomainData(data)
        for (const v of data) {
          energy += v * v
          count++
        }
      }
      await new Promise((r) => setTimeout(r, 30))
    }
    return { rms: Math.sqrt(energy / Math.max(1, count)), samples: count }
  }
})
const panel = (id) => page.locator(`[data-module="${id}"]`)
const cells = (id) => panel(id).locator('.mini-cell')
async function body() {
  return page.evaluate(async () =>
    (await import('/src/workspace/document.ts')).sourceBody(
      (await import('/scripts/editor-browser.mjs')).editorSource(),
    ),
  )
}
async function load(source) {
  await page.evaluate(async (s) => {
    const e = await import('/scripts/editor-browser.mjs')
    e.enableAutoApply()
    e.replaceSource(s)
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  }, source)
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function edit(cell, value) {
  await cell.focus()
  await cell.press('Enter')
  await page.getByLabel('Cell value', { exact: true }).fill(value)
  await page.getByLabel('Cell value', { exact: true }).press('Enter')
}
async function identity() {
  return page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { saveLayout } = await import('/src/workspace/document.ts')
    const d = read((await import('/scripts/editor-browser.mjs')).editorSource())
    const saved = saveLayout(d)
    return JSON.stringify(read(saved.source).patch) === JSON.stringify(d.patch)
  })
}
try {
  await page.goto(base)
  await page.locator('.cm-content').waitFor()
  const text = ' c3\n [e3\t g3]@2  a3 '
  const source = `// keep 🐒\r\n$: note(\`${text}\`).s('sine') // tail\r\n`
  await load(source)
  await edit(panel('seq1').getByRole('button', { name: 'Step e3', exact: true }), 'f3')
  assert.equal(await body(), source.replace('e3', 'f3'))
  assert(await identity())
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal(await body(), source)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.equal(await body(), source.replace('e3', 'f3'))
  pass(
    'Native nested backtick edit preserves tabs, CRLF, comments, exact source and saved identity; one Undo/Redo restores it',
  )
  for (const [key, before, after] of [
    ['[', 'c3', '[c3 c3]'],
    [']', '[c3 e3]', 'c3'],
    ['*', 'c3', 'c3*2'],
    ['/', 'c3', 'c3/2'],
    ['!', 'c3', 'c3!2'],
    ['@', 'c3', 'c3@2'],
    ['?', 'c3', 'c3?'],
    ['<', 'c3', '<c3 c3>'],
    [',', 'c3', '[c3, c3]'],
    ['|', 'c3', '[c3| c3]'],
    ['(', 'c3', 'c3(3,8)'],
    ['~', 'c3', '~'],
    ['+', 'c3', 'c3 ~'],
    ['Backspace', 'c3*2', 'c3'],
  ]) {
    const input = `note('${before}  a3').s('sine')\n`
    await load(input)
    await cells('seq1').first().focus()
    await cells('seq1').first().press(key)
    assert.equal(await body(), input.replace(before, after), key)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    assert.equal(await body(), input, `${key} undo`)
  }
  pass('Every notation-key gesture is a literal splice and exactly one undo step')
  await load("note('c3 {e3 g3}%4 a3').s('sine')\n")
  const raw = panel('seq1').getByRole('button', { name: 'Text cell {e3 g3}%4', exact: true })
  const unchanged = await body()
  await edit(raw, 'e3 g3')
  await page.getByRole('alert').first().waitFor()
  assert.equal(await body(), unchanged)
  await page.getByLabel('Cell value', { exact: true }).fill('[e3 g3]')
  await page.getByLabel('Cell value', { exact: true }).press('Enter')
  assert.equal(await body(), unchanged.replace('{e3 g3}%4', '[e3 g3]'))
  pass(
    'A text cell refuses multiple elements, accepts one group, and leaves its neighbors editable',
  )
  await load("note('[c3 [e3 g3 a3 b3 c4 d4 e4 f4]] d3 e3 f3').s('sine')\n")
  const collapsed = panel('seq1').locator('.mini-collapsed').first()
  await collapsed.focus()
  await collapsed.press('Enter')
  assert((await panel('seq1').locator('legend').innerText()).includes('/ 1'))
  await cells('seq1').first().press('Escape')
  assert(!(await panel('seq1').locator('legend').innerText()).includes('/'))
  await cells('seq1').first().focus()
  await cells('seq1').first().press('ArrowRight')
  assert.equal(await panel('seq1').locator('.mini-cell[tabindex="0"]').count(), 1)
  pass(
    'Collapsed groups open full width and back out with Enter/Escape; arrows use one roving cell Tab stop',
  )
  await load("note('c3@2 e3').s('sine')\n")
  const grip = panel('seq1').locator('.mini-grip').first()
  await grip.scrollIntoViewIfNeeded()
  const rect = await grip.boundingBox()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 32, rect.y + rect.height / 2, { steps: 5 })
  await page.mouse.up()
  assert((await body()).includes('c3@4'))
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert((await body()).includes('c3@2'))
  pass('Dragging the weight edge changes @n and groups the complete drag into one undo')
  await load('s("bd [~ sd]@3 hh!2, bd(3,8), [bd ~]*4")\n')
  assert.equal(await panel('drums1').locator('.mini-row-name').first().innerText(), 'mix')
  assert((await panel('drums1').locator('.mini-ghost').count()) > 0)
  assert.equal(await panel('drums1').locator('.mini-euclid').count(), 8)
  const drumRest = panel('drums1').locator('.mini-rest').first()
  await drumRest.click()
  const beat = await body()
  await drumRest.click()
  assert.notEqual(await body(), beat)
  pass(
    'DRUMS draws mixed sample rows, ghost periods, computed Euclidean steps and second-click rest toggles',
  )
  await load("note('c3 e3 g3 a3').s('sine')\n")
  const firstCell = cells('seq1').first()
  await firstCell.focus()
  await firstCell.press('Escape')
  await firstCell.press('Enter')
  await page.getByLabel('Cell value', { exact: true }).waitFor()
  await page.getByLabel('Cell value', { exact: true }).press('Escape')
  await page.getByRole('button', { name: 'Repeat (*)', exact: true }).focus()
  await page.getByRole('button', { name: 'Repeat (*)', exact: true }).press('Enter')
  assert((await body()).includes('c3*2'))
  await load('note("c3 e3 g3 a3 b3 c4 d4 e4").s("sine")\n')
  await cells('seq1').first().focus()
  await cells('seq1').first().press('ArrowDown')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mini-start') === '6')
  await page.keyboard.press('ArrowUp')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mini-start') === '0')
  await load('note("c3,e3").s("sine")\n')
  await cells('seq1').first().focus()
  await cells('seq1').first().press('ArrowDown')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-mini-start') === '3')
  await load('note("c3\\te3").s("sine")\n')
  assert(await page.getByLabel('Step notation', { exact: true }).count())
  pass(
    'Closed-tray Enter reopens value editing; tray buttons retain native Enter; Up/Down navigate time lines and lanes; escaped literals retain text fallback',
  )
  const fixtures = [
    ['seq', 'note("c3 [e3 g3]@2 <a3 <b3 c4>>!2 {d4 e4}%4").s("sine")'],
    ['drums', 's("bd [~ sd]@3 hh!2, bd(3,8), [bd ~]*4")'],
    ['cvseq', 'note("c3 e3").s("sine").lpf("400 [800 1200]@2")'],
    ['chord', 'chord("<Cm7 [Fm7 G7]>").voicing().s("sine")'],
  ]
  for (const [type, expression] of fixtures) {
    for (const look of ['instrument', 'powder', 'vintage', 'learner']) {
      await load(`${expression}\n`)
      const lookSource = await page.evaluate(
        async ({ id, look }) => {
          const { read } = await import('/src/reader/index.ts')
          const { editDocument } = await import('/src/workspace/document.ts')
          const { setLook } = await import('/src/rack/model.ts')
          const e = await import('/scripts/editor-browser.mjs')
          const d = read(e.editorSource())
          return editDocument(d, setLook(d.patch, id, look)).source
        },
        { id: `${type}1`, look },
      )
      await load(lookSource)
      await page.waitForFunction(
        ({ id, look }) =>
          document.querySelector(`[data-module="${id}"]`)?.classList.contains(`look-${look}`),
        { id: `${type}1`, look },
      )
      const before = await body()
      const styles = await cells(`${type}1`).evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute('style')),
      )
      await page.getByLabel('Rack zoom', { exact: true }).selectOption('0.75')
      assert.deepEqual(
        await cells(`${type}1`).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('style'))),
        styles,
      )
      assert.equal(await body(), before)
      assert(await identity())
      await page.getByLabel('Rack zoom', { exact: true }).selectOption('1')
      const first = cells(`${type}1`).first()
      await first.evaluate((e) => e.blur())
      await first.focus()
      await page.waitForTimeout(30)
      if (!(await page.locator('.mini-tray').count()))
        throw new Error(
          `Tray missing for ${type}/${look}: ${await first.evaluate((e) => JSON.stringify({ active: document.activeElement?.tagName, cell: e.outerHTML, legend: e.closest('fieldset').querySelector('legend').innerText }))}`,
        )
      const tray = await page.locator('.mini-tray').boundingBox()
      assert(
        tray.x >= 0 && tray.y >= 0 && tray.x + tray.width <= 1600 && tray.y + tray.height <= 1000,
      )
      await first.press('Escape')
      const geometry = await panel(`${type}1`).evaluate((p) => ({
        width: p.getBoundingClientRect().width,
        overflow: [...p.querySelectorAll('.mini-cell')].some((c) => {
          const b = c.getBoundingClientRect(),
            s = c.closest('.mini-surface').getBoundingClientRect()
          return (
            b.left < s.left - 1 ||
            b.right > s.right + 1 ||
            b.top < s.top - 1 ||
            b.bottom > s.bottom + 1
          )
        }),
      }))
      assert.equal(geometry.width, type === 'drums' ? 168 : type === 'chord' ? 144 : 120)
      assert(!geometry.overflow)
      const contrasts = await panel(`${type}1`).evaluate((p) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d')
        const luminance = (color) => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = color
          ctx.fillRect(0, 0, 1, 1)
          const rgba = [...ctx.getImageData(0, 0, 1, 1).data]
          return rgba
            .slice(0, 3)
            .map((v) => v / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0)
        }
        return [...p.querySelectorAll('.mini-cell')]
          .filter(
            (c) =>
              c.textContent.trim() &&
              !c.classList.contains('mini-drums') &&
              !c.classList.contains('mini-ghost'),
          )
          .map((c) => {
            const s = getComputedStyle(c),
              a = luminance(s.color),
              b = luminance(s.backgroundColor)
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          })
      })
      if (type !== 'drums')
        assert(
          contrasts.every((ratio) => ratio >= 4.5),
          `${type}/${look}: cell contrast ${contrasts.join(',')}`,
        )
    }
  }
  await page.screenshot({ path: `${output}/looks.png` })
  pass(
    'SEQ, DRUMS, CV SEQ and CHORD share the editor in all four Hardware looks; fixed widths, contained cells, zoom identity and clamped tray verified',
  )
  const live =
    'setcpm(120/4)\n$: note("c3!3 <e3 <f3 g3>> [a3 b3] {c4 d4}%4").s("sine").lpf("400 [800 1200]").gain(.12).rev()\n'
  await load(live)
  assert.equal(await page.locator('.transport-status').innerText(), 'Ready')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  result.pcm = await page.evaluate(() => window.miniPCM())
  assert(result.pcm.rms > 0.0001)
  await page.waitForFunction(() =>
    ['seq1', 'cvseq1'].every((id) => window.miniFlashes.some((f) => f.module === id)),
  )
  await page.waitForFunction(
    () =>
      new Set(
        window.miniFlashes.filter((f) => f.module === 'seq1' && f.start === 0).map((f) => f.copy),
      ).size === 3,
  )
  await page.waitForFunction(() =>
    window.miniFlashes.some((f) => f.module === 'seq1' && f.start === 26),
  )
  await edit(panel('seq1').getByRole('button', { name: 'Step c3!3', exact: true }).first(), 'd3')
  assert((await body()).includes('d3!3'))
  assert(await identity())
  assert.equal(await page.locator('.transport-status').innerText(), 'Playing')
  await page.waitForFunction(() =>
    [10, 13].every((start) =>
      window.miniFlashes.some((f) => f.module === 'seq1' && f.start === start),
    ),
  )
  result.livePCM = await page.evaluate(() => window.miniPCM())
  assert(result.livePCM.rms > 0.0001)
  await page.screenshot({ path: `${output}/playing.png` })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Ready',
  )
  const stopped = await page.evaluate(() => window.miniFlashes.length)
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.miniFlashes.length), stopped)
  result.stoppedPCM = await page.evaluate(() => window.miniPCM())
  assert(result.stoppedPCM.rms < 0.0001)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.playing-grid').length === 2)
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.effect?.target?.hasAttribute('data-mini-start'))
          .length,
    ),
    0,
  )
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.playing-grid').length === 0)
  pass(
    'Real Strudel/WebAudio produces PCM before and after a live nested edit; source-span flashes include copies, alternatives, text cells and CV, Stop clears, reduced motion outlines',
  )
  assert.deepEqual(errors, [])
} finally {
  result.errors = errors
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2))
  await browser.close()
}
