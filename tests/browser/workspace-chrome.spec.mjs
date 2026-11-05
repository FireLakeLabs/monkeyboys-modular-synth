import { test, expect } from 'playwright/test'
import { fileAction } from '../../scripts/panel-controls.mjs'

const tab = (page, name) => page.getByRole('tab', { name })
const fileButton = (page) => page.locator('.file-menu > button')
const fileItems = (page) => page.locator('#file-menu-items')

async function open(page, width = 1600, height = 1000) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
}

test.describe('left dock', () => {
  test('Modules, Sounds and Packs share one dock, and packs leave the rack pane', async ({
    page,
  }) => {
    await open(page)
    await expect(tab(page, 'Modules')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.rack .cartridge-bay')).toHaveCount(0)
    await tab(page, 'Sounds').click()
    await expect(page.getByLabel('Search sounds')).toBeVisible()
    await expect(page.getByPlaceholder('Name or Strudel call')).toBeHidden()
    await tab(page, 'Packs').click()
    await expect(page.getByLabel('Add a sample pack')).toBeVisible()
    await expect(page.getByLabel('Search sounds')).toBeHidden()
    const packs = await page
      .locator('.cartridge')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left))
    expect(new Set(packs).size).toBe(1)
  })

  test('chips are compact and two-column, and title and call stay available', async ({ page }) => {
    await open(page)
    const boxes = await page
      .locator('.library .chip')
      .evaluateAll((chips) => chips.slice(0, 4).map((chip) => chip.getBoundingClientRect().left))
    expect(new Set(boxes).size).toBe(2)
    const chip = page.getByRole('button', { name: 'Add VCF', exact: true })
    await expect(chip).toHaveAttribute('title', /Filter · \.lpf\(\)/)
    await expect(chip).toContainText('.lpf()')
    const heights = await page
      .locator('.library .chip')
      .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().height))
    const sorted = heights.toSorted((a, b) => a - b)
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThanOrEqual(46)
  })

  test('filtering still matches names and calls', async ({ page }) => {
    await open(page)
    const filter = page.getByPlaceholder('Name or Strudel call')
    await filter.fill('vcf')
    await expect(page.getByRole('button', { name: 'Add VCF', exact: true })).toBeVisible()
    await filter.fill('.lpf()')
    await expect(page.getByRole('button', { name: 'Add VCF', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add OSC', exact: true })).toHaveCount(0)
  })

  for (const [name, selector] of [
    ['Modules', '#dock-panel-modules'],
    ['Sounds', '#dock-panel-sounds'],
    ['Packs', '#dock-panel-packs'],
  ])
    test(`the ${name} tab has one vertical scroll`, async ({ page }) => {
      await open(page, 1600, 700)
      await tab(page, name).click()
      const scrollers = await page.locator('.library').evaluate((dock) =>
        [dock, ...dock.querySelectorAll('*')]
          .filter((element) => element.checkVisibility())
          .filter((element) => {
            const { overflowY } = getComputedStyle(element)
            return (
              ['auto', 'scroll'].includes(overflowY) &&
              element.scrollHeight > element.clientHeight + 1
            )
          })
          .map((element) => element.id),
      )
      expect(scrollers.length).toBeLessThanOrEqual(1)
      if (scrollers.length) expect(`#${scrollers[0]}`).toBe(selector)
    })

  for (const width of [1024, 900, 640])
    test(`every tab is reachable at ${width}px`, async ({ page }) => {
      await open(page, width, 768)
      for (const name of ['Sounds', 'Packs', 'Modules']) {
        await tab(page, name).click()
        await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true')
        const panel = page.locator('.dock-panel:not([hidden])')
        await expect(panel).toBeVisible()
        expect((await panel.boundingBox()).height).toBeGreaterThanOrEqual(100)
      }
      await page.getByRole('button', { name: 'Add OSC', exact: true }).click()
      await expect(page.locator('[data-module="osc1"]')).toBeVisible()
      const page_ = await page.evaluate(() => ({
        y: document.documentElement.scrollHeight - innerHeight,
        x: document.documentElement.scrollWidth - innerWidth,
      }))
      expect(page_).toEqual({ x: 0, y: 0 })
    })
})

test.describe('File menu', () => {
  test.beforeEach(async ({ page }) => open(page))

  test('holds the file actions, and the code pane keeps only its own', async ({ page }) => {
    await expect(fileItems(page)).toBeHidden()
    await fileButton(page).click()
    for (const name of [
      'New patch',
      'Open file',
      'Patch library',
      'Export',
      'Bounce WAV',
      'Open in Strudel',
    ])
      await expect(fileItems(page).getByRole('button', { name, exact: true })).toBeVisible()
    const actions = await page.locator('.code-actions').locator('button, label').allTextContents()
    expect(actions.map((text) => text.trim())).toEqual([
      'Apply code',
      'Auto-apply while playing',
      'Copy',
    ])
    await expect(page.locator('.editor-status')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('file-menu.png') })
  })

  test('works from the keyboard, and Escape returns to File', async ({ page }) => {
    await fileButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(fileButton(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await expect(fileItems(page).getByRole('button', { name: 'New patch' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(fileItems(page)).toBeHidden()
    await expect(fileButton(page)).toBeFocused()
  })

  test('a click elsewhere closes it, and closing the library returns to File', async ({ page }) => {
    await fileButton(page).click()
    await page.locator('.rack-toolbar h2').click()
    await expect(fileItems(page)).toBeHidden()
    await fileAction(page, 'Patch library')
    await page.getByRole('button', { name: 'Close library' }).click()
    await expect(fileButton(page)).toBeFocused()
  })

  test('Export and New still work from the menu', async ({ page }) => {
    const download = page.waitForEvent('download')
    await fileAction(page, 'Export')
    expect((await download).suggestedFilename()).toMatch(/\.strudel$/)
    await page.getByRole('button', { name: 'Add OSC', exact: true }).click()
    await fileAction(page, 'New patch')
    await expect(page.locator('[data-module="osc1"]')).toHaveCount(0)
  })

  test('shortcuts keep working', async ({ page }) => {
    await page.getByRole('button', { name: 'Add OSC', exact: true }).click()
    await expect(page.locator('[data-module="osc1"]')).toBeVisible()
    await page.locator('.rack-toolbar h2').click()
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-module="osc1"]')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.locator('[data-module="osc1"]')).toBeVisible()
  })
})

test.describe('a draft prompt is always on screen', () => {
  async function draft(page) {
    await page.evaluate(async () => {
      const { editorView } = await import('/scripts/editor-browser.mjs')
      editorView().dispatch({ changes: { from: 0, insert: '$: note(\n' }, userEvent: 'input.type' })
    })
    await expect(page.locator('.sync-status')).toHaveText('Rack shows previous code')
  }
  const cancel = (page) => page.locator('.replace-prompt').getByRole('button', { name: 'Cancel' })
  const openFile = (page) =>
    page.locator('input[type=file]').setInputFiles({
      name: 'next.strudel',
      mimeType: 'text/plain',
      buffer: Buffer.from('$: note("c3").s("sine")\n'),
    })

  test('New from the Code view', async ({ page }) => {
    await open(page, 900, 768)
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await draft(page)
    await fileAction(page, 'New patch')
    await expect(cancel(page)).toBeVisible()
    await expect(cancel(page)).toBeFocused()
  })

  test('Open from the Rack view', async ({ page }) => {
    await open(page, 900, 768)
    await draft(page)
    await page.getByRole('button', { name: 'Rack', exact: true }).click()
    await openFile(page)
    await expect(cancel(page)).toBeVisible()
    await expect(cancel(page)).toBeFocused()
  })

  test('Open from Focus rack', async ({ page }) => {
    await open(page)
    await draft(page)
    await page.getByRole('button', { name: 'Focus rack' }).click()
    await openFile(page)
    await expect(cancel(page)).toBeVisible()
    await expect(cancel(page)).toBeFocused()
  })
})

test('the rack toolbar is one row at 1600 px', async ({ page }) => {
  await open(page)
  const tops = await page
    .locator('.rack-toolbar > *')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect()))
  const toolbar = await page.locator('.rack-toolbar').boundingBox()
  for (const item of tops) {
    expect(item.top).toBeGreaterThanOrEqual(toolbar.y - 1)
    expect(item.bottom).toBeLessThanOrEqual(toolbar.y + toolbar.height + 1)
  }
  expect(toolbar.height).toBeLessThanOrEqual(44)
})

test('visible text is plain, with engine detail behind the info control', async ({ page }) => {
  await open(page)
  await tab(page, 'Packs').click()
  const text = await page.locator('body').innerText()
  for (const word of ['manifests', 'Seat ', 'orbit sends', 'HP', 'bay-owned', 'source-owned'])
    expect(text).not.toContain(word)
  await expect(page.locator('.audio-note')).toBeHidden()
  await page.getByLabel('Audio engine info').click()
  await expect(page.locator('.audio-note')).toContainText('Sample status')
})
