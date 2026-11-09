import { test, expect } from 'playwright/test'

test.setTimeout(45_000)

const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const patch = (page) =>
  page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    return (await import('/src/reader/index.ts')).read(editorSource()).patch
  })
const row = (patch, id) => patch.modules.find((module) => module.id === id)

async function twoRows(page) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    let patch = m.starterPatch(104)
    patch = m.placeModule(patch, 'osc', 0, 0)
    patch = m.placeModule(patch, 'vcf', 1, 12)
    patch = m.connect(patch, { module: 'osc1', jack: 'out' }, { module: 'vcf1', jack: 'in' })
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
  })
  await page.getByLabel('Rack zoom').selectOption('1')
  await page.evaluate(() => document.fonts.ready)
}

test('+ inserts an empty row below and − removes it, each as one undoable edit', async ({
  page,
}, info) => {
  await twoRows(page)
  const before = await patch(page)
  const original = await source(page)
  await expect(page.getByRole('button', { name: /^Remove row/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Insert row below row 1', exact: true }).click()
  const inserted = await patch(page)
  expect(inserted.rows).toBe(3)
  expect(row(inserted, 'osc1')).toMatchObject({ row: 0, hp: 0 })
  expect(row(inserted, 'vcf1')).toMatchObject({ row: 2, hp: 12 })
  expect(inserted.cables).toEqual(before.cables)
  await expect(page.locator('.rack-row')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Remove row/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Remove row 2', exact: true })).toBeVisible()
  await expect(page.locator('[data-module="vcf1"]')).toBeVisible()
  await page.getByLabel('Rack zoom').selectOption('fit')
  await page.screenshot({ path: info.outputPath('inserted-row.png') })
  await page.getByLabel('Rack zoom').selectOption('1')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await source(page)).toBe(original)
  await page.locator('.history-redo').click()
  expect(await patch(page)).toEqual(inserted)

  await page.getByRole('button', { name: 'Remove row 2', exact: true }).click()
  expect(await patch(page)).toEqual({ ...before, rows: 2 })
  await expect(page.locator('.rack-row')).toHaveCount(2)

  await page.getByRole('button', { name: 'Insert row below row 2', exact: true }).click()
  expect(row(await patch(page), 'vcf1')).toMatchObject({ row: 1, hp: 12 })
  await expect(page.getByRole('button', { name: 'Remove row 3', exact: true })).toBeVisible()
})

test('row buttons keep a usable on-screen size and work in the zoomed-out overview', async ({
  page,
}, info) => {
  await twoRows(page)
  for (const zoom of ['fit', '1.5']) {
    await page.getByLabel('Rack zoom').selectOption(zoom)
    const box = await page
      .getByRole('button', { name: 'Insert row below row 1', exact: true })
      .boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(19)
    expect(box.width).toBeLessThanOrEqual(21)
  }
  await page.getByLabel('Rack zoom').selectOption('fit')
  const fit = await page.getByLabel('Rack zoom').locator('option[value="fit"]').textContent()
  expect(Number(fit.match(/\d+/)[0])).toBeLessThan(75)
  await page.screenshot({ path: info.outputPath('zoomed-out-rows.png') })
  await page.getByRole('button', { name: 'Insert row below row 2', exact: true }).click()
  expect((await patch(page)).rows).toBe(3)
  await page.getByRole('button', { name: 'Remove row 3', exact: true }).click()
  expect((await patch(page)).rows).toBe(2)
})
