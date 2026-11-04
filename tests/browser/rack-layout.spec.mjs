import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => {
    const { enableAutoApply, replaceSource } = await import('/scripts/editor-browser.mjs')
    enableAutoApply()
    replaceSource('note("c3 e3 g3").s("sine")\n')
  })
  await expect(page.locator('[data-module="osc1"]')).toHaveCount(1)
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
})

test('cartridges leave a usable rack while pack controls remain available', async ({ page }) => {
  const frame = await page.locator('.rack-frame').boundingBox()
  expect(frame.height).toBeGreaterThanOrEqual(430)
  await expect(page.locator('.cartridge-bay input')).toBeHidden()
  await page.locator('.cartridge-bay summary').click()
  await expect(page.locator('.cartridge-bay input')).toBeVisible()
  expect((await page.locator('.rack-frame').boundingBox()).height).toBeGreaterThanOrEqual(430)
})

test('Fit never draws cables to clipped mixer jacks and keeps source intact', async ({ page }) => {
  const source = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clipped = new Set(
          [...document.querySelectorAll('[data-jack]')]
            .filter((jack) => {
              const r = jack.getBoundingClientRect()
              const box = jack.closest('.patch-box').getBoundingClientRect()
              const x = r.left + r.width / 2
              const y = r.top + r.height / 2
              return x < box.left || x > box.right || y < box.top || y > box.bottom
            })
            .map((jack) => jack.dataset.jack),
        )
        return [...document.querySelectorAll('.cable title')]
          .map((title) => title.textContent.split(' → ').map((end) => end.split(' · ')[0]))
          .filter((ends) => ends.some((end) => clipped.has(end)))
      }),
    )
    .toEqual([])
  await page.locator('[data-jack="mix1:out"]').scrollIntoViewIfNeeded()
  await expect(page.locator('.cable title').filter({ hasText: 'mix1:out' })).toHaveCount(1)
  await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toBe(source)
})
