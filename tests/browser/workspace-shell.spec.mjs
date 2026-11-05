import { test, expect } from 'playwright/test'

const add = (page, name) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
const header = (page, id) => page.locator(`[data-module="${id}"] .module-header`)
const frameSize = async (page) => {
  const box = await page.locator('.rack-frame').boundingBox()
  return { width: box.width, height: box.height }
}

async function open(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
}

for (const [width, height] of [
  [1440, 900],
  [1600, 1000],
  [1920, 1080],
]) {
  test(`the document never scrolls at ${width}×${height}`, async ({ page }) => {
    await open(page, width, height)
    await add(page, 'OSC')
    await header(page, 'osc1').click()
    const overflow = await page.evaluate(() => {
      const root = document.documentElement
      return { y: root.scrollHeight - root.clientHeight, x: root.scrollWidth - root.clientWidth }
    })
    expect(overflow).toEqual({ x: 0, y: 0 })
  })
}

test('the rack keeps its size through selection, messages, notes and popovers', async ({
  page,
}) => {
  await open(page, 1600, 1000)
  await add(page, 'OSC')
  await add(page, 'DELAY')
  const size = await frameSize(page)

  await header(page, 'osc1').click()
  expect(await frameSize(page)).toEqual(size)

  await page.keyboard.press('Delete')
  await expect(page.locator('.workspace-notice')).toContainText('Deleted OSC')
  expect(await frameSize(page)).toEqual(size)
  await page.locator('.workspace-notice').getByRole('button', { name: 'Undo' }).click()
  await expect(header(page, 'osc1')).toBeVisible()

  await page.locator('details.connections summary').click()
  await expect(page.locator('details.connections button').first()).toBeVisible()
  expect(await frameSize(page)).toEqual(size)
  await page.locator('details.connections button').first().click()
  await expect(page.getByRole('button', { name: 'Remove cable' })).toBeVisible()
  expect(await frameSize(page)).toEqual(size)
  await page.getByRole('button', { name: 'Remove cable' }).click()
  await expect(page.locator('details.connections summary')).toHaveText('Connections (0)')
  expect(await frameSize(page)).toEqual(size)
})

test('selection tools float beside the selected module, on the rack', async ({ page }) => {
  await open(page, 1600, 1000)
  await add(page, 'OSC')
  await add(page, 'VCF')
  await header(page, 'vcf1').click()
  const tools = await page.locator('.selection-tools').boundingBox()
  const panel = await page.locator('[data-module="vcf1"]').boundingBox()
  const frame = await page.locator('.rack-frame').boundingBox()
  expect(tools.y).toBeGreaterThanOrEqual(frame.y)
  expect(tools.y + tools.height).toBeLessThanOrEqual(frame.y + frame.height)
  expect(tools.x + tools.width).toBeLessThanOrEqual(frame.x + frame.width)
  expect(Math.abs(tools.x - panel.x)).toBeLessThan(40)
  await expect(page.getByRole('button', { name: 'Delete vcf1 and attached cables' })).toHaveText(
    'Delete',
  )
})

test('a replacement prompt is not covered by the selection tools', async ({ page }) => {
  await open(page, 1600, 1000)
  await add(page, 'OSC')
  await header(page, 'osc1').click()
  await expect(page.locator('.selection-tools')).toBeVisible()
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
  await page.getByRole('button', { name: 'New patch', exact: true }).click()
  await expect(page.locator('fieldset.replace-prompt legend')).toBeVisible()
  await expect(page.locator('.selection-tools')).toHaveCount(0)
})

test('footer popovers open one at a time', async ({ page }) => {
  await open(page, 1600, 1000)
  await add(page, 'OSC')
  await page.evaluate(async () => {
    const { enableAutoApply, replaceSource } = await import('/scripts/editor-browser.mjs')
    enableAutoApply()
    replaceSource('note("c3").s("sine").lpf(800).delay(0.4)\n')
  })
  await page.locator('details.rack-notes summary').click()
  await expect(page.locator('details.rack-notes')).toHaveAttribute('open', '')
  await page.locator('details.connections summary').click()
  await expect(page.locator('details.connections')).toHaveAttribute('open', '')
  await expect(page.locator('details.rack-notes')).not.toHaveAttribute('open', '')
})

test('a selected library patch stays readable', async ({ page }) => {
  await open(page, 1600, 1000)
  await page.getByRole('button', { name: 'Patch library' }).click()
  const entry = page.locator('.patch-collections button').first()
  await entry.click()
  await expect(entry).toHaveAttribute('aria-pressed', 'true')
  await expect(entry).toHaveCSS('color', 'rgb(228, 230, 234)')
  await expect(page.locator('.load-patch')).toHaveCSS('background-color', 'rgb(244, 164, 98)')
})

test('selecting a scrolled module never swallows the click', async ({ page }) => {
  await open(page, 1600, 1000)
  await add(page, 'VCF')
  await page.locator('.rack-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.getByRole('button', { name: '+ Add row' }).click()
  await page.getByLabel('Rack zoom').selectOption('1.5')
  await page.locator('.rack-scroll').evaluate((element) => {
    element.scrollTop = 120
  })
  const panel = page.locator('[data-module="vcf1"]')
  const box = await panel.boundingBox()
  const frame = await page.locator('.rack-frame').boundingBox()
  expect(box.y).toBeLessThan(frame.y + 8)
  await panel.getByRole('button', { name: 'Set CUTOFF', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: 'CUTOFF', exact: true })).toBeFocused()
  const tools = await page.locator('.selection-tools').boundingBox()
  expect(tools.y).toBeGreaterThan(frame.y + frame.height / 2)
})

test('cable tools stay reachable with the Connections list open', async ({ page }) => {
  await open(page, 1600, 1000)
  await page.locator('details.connections summary').click()
  await page.locator('details.connections button').first().click()
  await page.getByRole('button', { name: 'Move destination', exact: true }).click({ timeout: 3000 })
  await expect(page.locator('.rack-status')).toContainText('Choose a new input')
})

test('a prompt stays usable while the rack is locked by a draft', async ({ page }) => {
  await open(page, 1600, 1000)
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
  await page.getByRole('button', { name: 'New patch', exact: true }).click()
  const prompt = page.locator('fieldset.replace-prompt')
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(prompt).toHaveCount(0)
})

test('Focus rack sits in the rack toolbar and takes no row of its own', async ({ page }) => {
  await open(page, 1600, 1000)
  const toggle = page.locator('.rack-toolbar').getByRole('button', { name: 'Focus rack' })
  await expect(toggle).toBeVisible()
  const top = await page.locator('.topbar').boundingBox()
  const workspace = await page.locator('.workspace').boundingBox()
  expect(workspace.y).toBe(top.y + top.height)
  await toggle.click()
  await expect(page.locator('.code')).toBeHidden()
  await page.getByRole('button', { name: 'Restore workspace' }).click()
  await expect(page.locator('.code')).toBeVisible()
})

test('every chrome button shares one style, with no browser defaults left', async ({ page }) => {
  await open(page, 1600, 1000)
  await page.getByRole('button', { name: 'SOUNDS', exact: true }).click()
  await page.locator('.cartridge-heading').click()
  await add(page, 'SEQ')
  await add(page, 'DRUMS')
  const unstyled = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((button) => button.offsetParent)
      .filter((button) => {
        const style = getComputedStyle(button)
        return style.borderTopStyle === 'outset' || style.backgroundColor === 'rgb(107, 107, 107)'
      })
      .map((button) => button.textContent.trim()),
  )
  expect(unstyled).toEqual([])
  const sizes = await page
    .locator(
      '.topbar button:not(.play, .readout, .knob), .rack-toolbar button, .code-actions button',
    )
    .evaluateAll((buttons) => [...new Set(buttons.map((b) => getComputedStyle(b).fontSize))])
  expect(sizes).toEqual(['12px'])
})
