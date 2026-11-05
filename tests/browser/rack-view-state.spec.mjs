import { test, expect } from 'playwright/test'
import { openMore } from '../../scripts/panel-controls.mjs'

const add = (page, name) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
const header = (page, id) => page.locator(`[data-module="${id}"] .module-header`)
const prompt = (page) => page.locator('fieldset.replace-prompt')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
})

async function viewState(page) {
  return {
    zoom: await page.getByLabel('Rack zoom').inputValue(),
    filter: await page.getByPlaceholder('Name or Strudel call').inputValue(),
    cables: await page.getByRole('button', { name: 'All cables' }).getAttribute('aria-pressed'),
    scrollLeft: await page.locator('.rack-scroll').evaluate((element) => element.scrollLeft),
  }
}

async function setViewState(page) {
  await page.getByLabel('Rack zoom').selectOption('1.5')
  await page.getByPlaceholder('Name or Strudel call').fill('o')
  await page.getByRole('button', { name: 'All cables' }).click()
  await page.locator('.rack-scroll').evaluate((element) => {
    element.scrollLeft = 120
  })
}

test('rack view state survives typing, applying and undoing', async ({ page }) => {
  await add(page, 'OSC')
  await add(page, 'VCF')
  await header(page, 'osc1').click()
  await setViewState(page)
  const expected = await viewState(page)
  expect(expected.scrollLeft).toBe(120)

  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
  expect(await viewState(page)).toEqual(expected)

  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  await page.keyboard.press('Control+.')
  expect(await viewState(page)).toEqual(expected)

  await header(page, 'osc1').click()
  const beforeUndo = await viewState(page)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  expect(await viewState(page)).toEqual(beforeUndo)
  await expect(header(page, 'osc1')).toHaveAttribute('aria-pressed', 'true')
})

test('panels still show an externally changed value after a code edit', async ({ page }) => {
  await add(page, 'MIX')
  const mix = page.locator('[data-module="mix1"]')
  const name = (await openMore(mix)).getByLabel('NAME 1')
  await name.fill('lead')
  await name.blur()
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await openMore(mix)
  await expect(name).toHaveValue('')
})

test('Delete and Backspace act on the selected module wherever rack focus is', async ({ page }) => {
  await add(page, 'OSC')
  await header(page, 'osc1').click()
  await page.keyboard.press('Backspace')
  await expect(prompt(page)).toContainText('Delete osc1')
  await page.keyboard.press('Escape')
  await expect(prompt(page)).toHaveCount(0)

  await page.locator('[data-module="osc1"] .module-controls').click({ position: { x: 3, y: 3 } })
  await page.keyboard.press('Delete')
  await expect(prompt(page)).toContainText('Delete osc1')
  await page.keyboard.press('Escape')

  // The patch name, code editor and a focused knob keep their own Backspace.
  await page.getByLabel('Patch name').click()
  await page.keyboard.press('Backspace')
  await expect(prompt(page)).toHaveCount(0)
  await page.getByLabel('Patch name').blur()
  await header(page, 'osc1').click()
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
  await expect(prompt(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Revert to last readable code' }).click()

  const knob = page.locator('[data-module="osc1"] .knob').first()
  await knob.focus()
  await knob.press('ArrowUp')
  await expect(knob).not.toHaveAttribute('aria-valuenow', '0')
  await knob.press('Backspace')
  await expect(prompt(page)).toHaveCount(0)
  await expect(knob).toHaveAttribute('aria-valuenow', '0')
})

test('Delete removes a selected cable and the menu shows the shortcut', async ({ page }) => {
  await page.locator('details.connections summary').click()
  await page.locator('details.connections button').first().click()
  await expect(page.getByRole('button', { name: 'Remove cable' })).toBeVisible()
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Delete')
  await expect(page.locator('details.connections summary')).toHaveText('Connections (0)')

  await add(page, 'OSC')
  await header(page, 'osc1').click({ button: 'right' })
  const item = page.locator('.module-menu').getByRole('button', { name: 'Delete', exact: true })
  await expect(item).toHaveAttribute('aria-keyshortcuts', 'Delete Backspace')
  await expect(item).toContainText('⌫')
})

for (const width of [1440, 1600, 1920]) {
  test(`a new patch shows MIX at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    await page.locator('.cm-content').waitFor()
    const { mix, rail } = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect()
      const frame = box('.rack-scroll')
      return {
        mix: box('[data-module="mix1"]').right,
        rail: frame.left + document.querySelector('.rack-scroll').clientWidth,
      }
    })
    expect(mix).toBeLessThanOrEqual(rail)
  })
}

test('a cable to an off-screen jack ends at the rail edge, not across OUT', async ({ page }) => {
  await page.getByLabel('Rack zoom').selectOption('1.5')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scroll = document.querySelector('.rack-scroll')
        const edge = scroll.getBoundingClientRect().left + scroll.clientWidth
        const mix = document.querySelector('[data-jack="mix1:out"]').getBoundingClientRect()
        return mix.left > edge
      }),
    )
    .toBe(true)
  const { mixEnd, edge } = await page.evaluate(() => {
    const scroll = document.querySelector('.rack-scroll')
    const svg = document.querySelector('svg.cables').getBoundingClientRect()
    const cable = document.querySelector('.cable path')
    return {
      mixEnd: cable.getPointAtLength(0).x + svg.left,
      edge: scroll.getBoundingClientRect().left + scroll.clientWidth,
    }
  })
  expect(mixEnd).toBeLessThanOrEqual(edge)
})

test('a slow draft does not reset an open sound drawer', async ({ page }) => {
  await page.getByRole('button', { name: 'SOUNDS', exact: true }).click()
  await expect(page.getByLabel('Filter sounds')).toBeVisible()
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
  await expect(page.getByLabel('Filter sounds')).toBeVisible()
})
