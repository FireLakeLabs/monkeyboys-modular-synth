import { test, expect } from 'playwright/test'
import { chooseSwitch } from '../../scripts/panel-controls.mjs'

const suite = (page, fn, ...args) =>
  page.evaluate(
    async ({ fn, args }) => (await import('/scripts/panel-controls-check.mjs'))[fn](...args),
    { fn, args },
  )
async function loadCase(page, type, values) {
  const loaded = await suite(page, 'loadSwitchCase', type, values)
  await expect(page.locator(`[data-module="${loaded.id}"]`)).toHaveCount(1)
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  return loaded
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).enableAutoApply())
})

test('toggles and segments write the source and saved rack state the dropdown wrote', async ({
  page,
}, info) => {
  test.setTimeout(280_000)
  const cases = await suite(page, 'switchCases')
  const proved = []
  for (const { type, controls } of cases) {
    const { id, source } = await loadCase(page, type)
    expect(await suite(page, 'currentSource')).toBe(source)
    const panel = page.locator(`[data-module="${id}"]`)
    for (const control of controls) {
      const others = control.options.filter((option) => option !== control.default)
      for (const value of [...others, control.default]) {
        await chooseSwitch(panel, control.label, value)
        const expected = await suite(page, 'expectedAfter', id, control.id, value)
        await expect.poll(() => suite(page, 'currentSource')).toBe(expected)
        proved.push(`${type}.${control.id}=${value}`)
      }
    }
  }
  expect(proved.length).toBeGreaterThan(50)
  await info.attach('switch-options', { body: proved.join('\n'), contentType: 'text/plain' })
})

test('segments are radios and off/on switches are pressed buttons, from the keyboard', async ({
  page,
}) => {
  const lfo = await loadCase(page, 'lfo')
  const group = page
    .locator(`[data-module="${lfo.id}"]`)
    .getByRole('radiogroup', { name: 'MODE', exact: true })
  await expect(group.getByRole('radio', { name: 'SMOOTH', exact: true })).toBeChecked()
  await group.getByRole('radio', { name: 'SMOOTH', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'STEP', exact: true })).toBeChecked()
  await expect(group.getByRole('radio', { name: 'STEP', exact: true })).toBeFocused()
  await expect
    .poll(() => suite(page, 'currentSource'))
    .toBe(await suite(page, 'expectedAfter', lfo.id, 'mode', 'STEP'))

  const lofi = await loadCase(page, 'lofi')
  const crush = page
    .locator(`[data-module="${lofi.id}"]`)
    .getByRole('button', { name: 'CRUSH', exact: true })
  const pressed = await crush.getAttribute('aria-pressed')
  await crush.focus()
  await page.keyboard.press('Space')
  await expect(crush).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true')
  await expect(crush).toBeFocused()
})

test('values read as plain text, stay click-to-edit, and ACCENT opens on demand', async ({
  page,
}) => {
  const { id } = await loadCase(page, 'seq')
  const panel = page.locator(`[data-module="${id}"]`)
  const value = panel.getByRole('button', { name: 'Set LEN', exact: true })
  await expect(value).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(value).toHaveCSS('border-top-width', '0px')
  await value.click()
  await expect(panel.getByRole('textbox', { name: 'LEN', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')

  const accent = panel.getByRole('textbox', { name: 'ACCENT', exact: true })
  const controls = panel.locator('.module-controls')
  const before = await controls.evaluate((element) => element.scrollHeight)
  expect(await suite(page, 'accentHeight', id)).toBeLessThanOrEqual(24)
  await accent.focus()
  expect(await suite(page, 'accentHeight', id)).toBeGreaterThanOrEqual(90)
  expect(await controls.evaluate((element) => element.scrollHeight)).toBe(before)
  await accent.fill('1 .5')
  await page.keyboard.press('Enter')
  await expect.poll(() => suite(page, 'currentSource')).toContain('.velocity("1 .5")')
  await accent.blur()
  expect(await suite(page, 'accentHeight', id)).toBeLessThanOrEqual(24)
})

test('headers stay compact in every look at full size', async ({ page }) => {
  for (const look of [
    'powder',
    'instrument',
    'vintage',
    'learner',
    'crystal',
    'bio',
    'monolith',
    'terminal',
    'neon',
    'bare',
  ]) {
    await page.evaluate(
      async (look) => (await import('/scripts/rack-feel-check.mjs')).loadLook(look),
      look,
    )
    const heights = await page
      .locator(`.module-panel.look-${look} .module-header`)
      .evaluateAll((headers) => headers.map((header) => header.offsetHeight))
    expect(heights.length, look).toBeGreaterThan(0)
    expect(Math.max(...heights), look).toBeLessThanOrEqual(60)
    expect(heights.filter((height) => height <= 42).length / heights.length, look).toBeGreaterThan(
      0.8,
    )
  }
})

test('an open ACCENT editor is never clipped out of reach', async ({ page }) => {
  // A one-voice DRUMS leaves ACCENT close to the top of its scroller.
  for (const [type, values] of [
    ['drums', { grid: 'bd' }],
    ['drums', {}],
    ['seq', {}],
  ]) {
    const { id } = await loadCase(page, type, values)
    const accent = page
      .locator(`[data-module="${id}"]`)
      .getByRole('textbox', { name: 'ACCENT', exact: true })
    await accent.focus()
    const clipping = await suite(page, 'accentClipping', id)
    expect(clipping.above, type).toBeLessThanOrEqual(0)
    expect(clipping.below, type).toBeLessThanOrEqual(0)
    await accent.blur()
  }
})

test('module IDs appear on hover, focus or selection without changing accessible names', async ({
  page,
}) => {
  const { id } = await loadCase(page, 'lfo')
  const panel = page.locator(`[data-module="${id}"]`)
  const label = await panel.getAttribute('aria-label')
  await page.locator('.rack-toolbar h2').hover()
  const badge = panel.locator('.module-id')
  await expect(badge).toBeHidden()
  await panel.locator('.module-controls').hover()
  await expect(badge).toBeVisible()
  await page.locator('.rack-toolbar h2').hover()
  await expect(badge).toBeHidden()
  await page.getByRole('button', { name: `Select ${id}`, exact: true }).click()
  await page.locator('.rack-toolbar h2').hover()
  await expect(badge).toBeVisible()
  expect(await panel.getAttribute('aria-label')).toBe(label)
})
