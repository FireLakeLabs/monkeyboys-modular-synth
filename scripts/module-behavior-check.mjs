import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Real Chromium/Strudel acceptance. Requires Vite and the pinned sample resources.
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-module-behavior'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const results = { browser: browser.version(), checks: [], physicalListening: false }
const pass = (name) => {
  results.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
await context.route('**/src/strudel/engine.ts*', async (route) => {
  const response = await route.fetch()
  const body = await response.text()
  assert(body.includes('feedback?.();'))
  await route.fulfill({
    response,
    body: body.replace(
      'feedback?.();',
      'window.deliveryLeads ??= []; window.deliveryLeads.push(target - strudel.getAudioContext().currentTime); feedback?.();',
    ),
  })
})
await context.addInitScript(() => {
  window.cellFlashes = []
  // oxlint-disable-next-line typescript/unbound-method -- Called with its original Element receiver.
  const animate = Element.prototype.animate
  Element.prototype.animate = function (frames, options) {
    if (this.hasAttribute('data-mini-start'))
      window.cellFlashes.push({
        module: this.closest('[data-module]')?.dataset.module,
        index:
          this.closest('[data-module]')?.dataset.module === 'drums1'
            ? Math.round(Number(this.dataset.miniTimeStart) * 8)
            : Number(this.dataset.miniStart),
        at: performance.now(),
      })
    return animate.call(this, frames, options)
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const menu = page.getByRole('dialog', { name: / menu$/ })
const panel = (id) => page.locator(`[data-module="${id}"]`)
async function code(source) {
  await page.evaluate(
    async (text) => (await import('/scripts/editor-browser.mjs')).replaceSource(text),
    source,
  )
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function source() {
  return page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
}
const status = (text) =>
  page.waitForFunction(
    (value) => document.querySelector('.transport-status')?.textContent === value,
    text,
  )
async function stop() {
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await status('Ready')
}
const cellAnimations = () =>
  page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.effect?.target?.hasAttribute('data-mini-start'))
        .length,
  )
async function destructive(button) {
  return button.evaluate((e) => {
    const style = getComputedStyle(e)
    return [style.color, style.backgroundColor, style.borderColor]
  })
}
try {
  await page.goto(base)
  await page.getByRole('textbox', { name: 'Strudel source', exact: true }).waitFor()
  await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
  await code('$: note("c3 e3 g3 a3").s("sine").lpf(800)\n')
  await panel('vcf1').click({ button: 'right' })
  await menu.waitFor()
  assert.equal(await menu.locator('.look-swatch').count(), 4)
  assert.equal(await menu.getByRole('button', { name: 'Close menu', exact: true }).count(), 0)
  assert.equal(
    await menu
      .getByRole('button', { name: 'Look Instrument', exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  )
  const menuDelete = await destructive(menu.getByRole('button', { name: 'Delete', exact: true }))
  const panelDelete = await destructive(
    page.getByRole('button', { name: 'Delete vcf1 and attached cables', exact: true }),
  )
  assert.deepEqual(menuDelete, panelDelete)
  assert.equal(menuDelete[0], 'rgb(255, 180, 180)')
  await page.screenshot({ path: `${output}/module-menu.png` })
  await page.keyboard.press('Escape')
  assert.equal(await menu.count(), 0)
  assert.equal(
    await panel('vcf1')
      .getByRole('button', { name: 'Select vcf1', exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  )
  await panel('vcf1').click({ button: 'right' })
  await page.locator('.rack-toolbar h2').click()
  assert.equal(await menu.count(), 0)
  assert.equal(
    await panel('vcf1')
      .getByRole('button', { name: 'Select vcf1', exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  )
  pass(
    'four hardware swatches, shared destructive style, no Close item, Escape/outside dismissal return module focus',
  )

  for (const [fixture, id, count] of [
    ['$: note("c3").s("sine").iter(4)\n', 'iter1', 3],
    ['$: note("c3").s("sine").chunkBack(4, x => x.rev())\n', 'code1', 3],
  ]) {
    await code(fixture)
    await panel(id).click({ button: 'right' })
    assert.equal(await menu.locator('.look-swatch').count(), count)
    const styles = await menu
      .locator('.look-swatch')
      .evaluateAll((elements) =>
        elements.map((e) => [getComputedStyle(e).background, getComputedStyle(e).borderColor]),
      )
    assert.equal(new Set(styles.map((style) => JSON.stringify(style))).size, count)
    await page.keyboard.press('Escape')
  }
  pass('Alien and Cyber options show three distinct swatches from the existing look styles')

  const fixture =
    'setcpm(30)\n$: note("c3 ~ e3 g3").fast(2).s("sine").gain(0.1)\n$: s("[bd ~]*4, hh*8").gain(0.1)\n'
  await code(fixture)
  const saved = await source()
  await page.evaluate(async () => {
    window.gridEvents = []
    ;(await import('/src/strudel/engine.ts')).subscribe((event) => {
      if (event.type === 'activity') window.gridEvents.push(event.steps)
    })
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await status('Playing')
  await page.waitForFunction(() =>
    ['seq1', 'drums1'].every((id) => window.cellFlashes.some((f) => f.module === id)),
  )
  await page.waitForFunction(
    () =>
      new Set(window.cellFlashes.filter((f) => f.module === 'drums1').map((f) => f.index)).size ===
      8,
  )
  const flashes = await page.evaluate(() => window.cellFlashes)
  assert.deepEqual(
    [...new Set(flashes.filter((f) => f.module === 'seq1').map((f) => f.index))].sort(
      (a, b) => a - b,
    ),
    [0, 5, 8],
  )
  const leads = await page.evaluate(() => window.deliveryLeads)
  assert(leads.length > 0 && leads.every((lead) => lead <= 0.0051))
  results.maxVisualLeadSeconds = Math.max(...leads)
  assert((await cellAnimations()) > 0)
  await page.screenshot({ path: `${output}/playheads.png` })
  assert.equal(await source(), saved)
  await stop()
  assert.equal(await cellAnimations(), 0)
  const stoppedCount = await page.evaluate(() => window.cellFlashes.length)
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => window.cellFlashes.length), stoppedCount)
  pass(
    'real audio-time events flash SEQ sounding cells (including rate/rests) and all eight DRUMS columns; Stop cancels pending/active visuals; saved source stays exact',
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await status('Playing')
  await page.waitForFunction(() => document.querySelectorAll('.playing-grid').length === 2)
  assert.equal(await cellAnimations(), 0)
  assert.equal(await page.evaluate(() => window.cellFlashes.length), stoppedCount)
  await page.screenshot({ path: `${output}/reduced-motion.png` })
  await stop()
  assert.equal(await page.locator('.playing-grid').count(), 0)
  pass('reduced motion uses two steady grid glows without moving cell flashes; Stop clears both')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await status('Playing')
  await page.waitForFunction((count) => window.cellFlashes.length > count, stoppedCount)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(
    () =>
      document.getAnimations().filter((a) => a.effect?.target?.hasAttribute('data-mini-start'))
        .length === 0,
  )
  await page.waitForFunction(() => document.querySelectorAll('.playing-grid').length > 0)
  await code('$: note("c3 [e3 g3]*2").s("sine").gain(0.1)\n')
  await status('Playing')
  assert.equal(await cellAnimations(), 0)
  assert.equal(await page.locator('.playing-grid').count(), 0)
  pass(
    'changing motion preference cancels running playheads; text-mode replacement clears the old grid glow',
  )

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await code(fixture)
  await status('Playing')
  await page.waitForFunction(() =>
    document.getAnimations().some((a) => a.effect?.target?.hasAttribute('data-mini-start')),
  )
  await page.evaluate(async () => {
    await (
      await import('/src/strudel/engine.ts')
    )
      .play('note("c3").missingMethod()')
      .catch(() => {})
  })
  assert.equal(await cellAnimations(), 0)
  const afterFailure = await page.evaluate(() => window.cellFlashes.length)
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => window.cellFlashes.length), afterFailure)
  await stop()
  pass('construction errors clear active/pending grid feedback even before transport recovery')
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  throw error
} finally {
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`)
  await browser.close()
}
