import { test, expect } from 'playwright/test'
import { detailPanel, chooseSwitch } from '../../scripts/panel-controls.mjs'

const offsets = '[0, 0, 12, 0, 3, 0, 5, 0, 0, 12, 0, 7, 0, 3, 0, 12]'
const acid = `setcpm(130/4)\n$: note("c2*16").add("${offsets}").s("saw")\n  .cutoff(perlin.range(200, 1500).slow(4)).resonance(25).gain(0.005)\n`
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const body = (page) =>
  page.evaluate(async () =>
    (await import('/src/workspace/document.ts')).sourceBody(
      (await import('/scripts/editor-browser.mjs')).editorSource(),
    ),
  )
const state = (page) =>
  page.evaluate(async () => (await import('/scripts/extras-check.mjs')).state())
async function load(page) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async (text) => {
    const helper = await import('/scripts/extras-check.mjs')
    helper.prepare()
    await (await import('/scripts/rack-feel-check.mjs')).load(text)
  }, acid)
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
}

test('acid imports expose ADD, OSC and modulated VCF, with RES 50, Undo and saved identity', async ({
  page,
}, info) => {
  await load(page)
  await expect(page.locator('[data-module^="code"]')).toHaveCount(0)
  const filter = page.locator('[data-module="vcf1"]')
  const add = page.locator('[data-module="add1"]')
  await detailPanel(filter)
  await expect(filter.getByRole('slider', { name: 'RES', exact: true })).toHaveAttribute(
    'aria-valuemax',
    '50',
  )
  await filter.getByRole('slider', { name: 'RES', exact: true }).focus()
  await page.keyboard.press('End')
  await expect.poll(() => body(page)).toBe(acid.replace('resonance(25)', 'resonance(50)'))
  await filter.screenshot({ path: info.outputPath('resonance-50.png') })
  await page.keyboard.press('Control+z')
  await expect.poll(() => body(page)).toBe(acid)
  await detailPanel(add)
  await expect(add.locator('.module-notice')).toContainText('do not transpose')
  await add.getByRole('textbox', { name: 'VALUE', exact: true }).fill('<0 7>')
  await add.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(() => body(page)).toBe(acid.replace(offsets, '<0 7>'))
  await add.screenshot({ path: info.outputPath('add-controls.png') })
  const oscillator = page.locator('[data-module="osc1"]')
  await chooseSwitch(oscillator, 'WAVE', 'square')
  await expect
    .poll(() => body(page))
    .toBe(acid.replace(offsets, '<0 7>').replace('s("saw")', 's("square")'))
  const before = await state(page)
  const savedSource = await source(page)
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await expect.poll(() => source(page)).toBe(savedSource)
  const patch = await page.evaluate(
    async () =>
      (await import('/src/reader/index.ts')).read(
        (await import('/scripts/editor-browser.mjs')).editorSource(),
      ).patch,
  )
  expect(patch).toEqual(before.patch)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('acid-workspace.png') })
})

test('saw alias and RES 50 schedule live Perlin-filtered PCM through the real engine', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await load(page)
  const filter = page.locator('[data-module="vcf1"]')
  await detailPanel(filter)
  await filter.getByRole('slider', { name: 'RES', exact: true }).focus()
  await page.keyboard.press('End')
  await expect.poll(() => body(page)).toContain('resonance(50)')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', { timeout: 60_000 })
  await expect
    .poll(async () =>
      (await state(page)).triggered.some((e) => e.value.s === 'saw' && e.value.resonance === 50),
    )
    .toBe(true)
  const signal = await page.evaluate(async () =>
    (await import('/scripts/extras-check.mjs')).measure(),
  )
  expect(signal.rms).toBeGreaterThan(0.000001)
  expect(Number.isFinite(signal.peak)).toBe(true)
  await filter.getByRole('button', { name: 'Set RES', exact: true }).click()
  await filter.getByRole('textbox', { name: 'RES', exact: true }).fill('25')
  await filter.getByRole('textbox', { name: 'RES', exact: true }).press('Enter')
  await expect
    .poll(async () => (await state(page)).triggered.some((e) => e.value.resonance === 25))
    .toBe(true)
  const observed = await state(page)
  expect(observed.failures).toEqual([])
  await page.keyboard.press('Control+.')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await info.attach('acid-playback-evidence', {
    body: JSON.stringify({
      signal,
      events: observed.triggered.slice(-20),
      physicalListening: false,
    }),
    contentType: 'application/json',
  })
})
