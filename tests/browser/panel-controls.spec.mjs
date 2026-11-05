import { test, expect } from 'playwright/test'
import { chooseSwitch, openMore } from '../../scripts/panel-controls.mjs'

const LOOKS = [
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
]
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

test('a cable crossing a panel never takes clicks from its buttons and segments', async ({
  page,
}) => {
  // Selecting on press wakes a module's cables, so one can sit over a control at release.
  for (const type of ['lofi', 'lfo']) {
    const { id } = await loadCase(page, type)
    const hits = await page.evaluate((id) => {
      const svg = document.querySelector('.cables')
      const cover = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      for (const [name, value] of Object.entries({ width: '100%', height: '100%' }))
        cover.setAttribute(name, value)
      cover.style.pointerEvents = 'all'
      svg.append(cover)
      const controls = document.querySelectorAll(
        `[data-module="${id}"] :is(.toggle-control, .segments label)`,
      )
      const covered = [...controls].filter((control) => {
        control.scrollIntoView({ block: 'nearest' })
        const rect = control.getBoundingClientRect()
        return (
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === cover
        )
      })
      cover.remove()
      return { controls: controls.length, covered: covered.map((control) => control.textContent) }
    }, id)
    expect(hits.controls, type).toBeGreaterThan(0)
    expect(hits.covered, type).toEqual([])
  }
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

test('headers stay compact and no module scrolls in any look at full size', async ({ page }) => {
  for (const look of LOOKS) {
    await page.evaluate(
      async (look) => (await import('/scripts/rack-feel-check.mjs')).loadLook(look),
      look,
    )
    expect(await suite(page, 'overflowingPanels'), look).toEqual([])
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

test('More holds rarely used fields beside the panel and writes the same source', async ({
  page,
}) => {
  const { id } = await loadCase(page, 'smpl')
  const panel = page.locator(`[data-module="${id}"]`)
  const toggle = panel.getByRole('button', { name: /^More / })
  const flyout = await openMore(panel)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(flyout).toHaveRole('dialog')
  const beside = await flyout.boundingBox()
  const bounds = await panel.boundingBox()
  expect(beside.x >= bounds.x + bounds.width || beside.x + beside.width <= bounds.x).toBe(true)
  expect(beside.x).toBeGreaterThanOrEqual(0)
  expect(beside.x + beside.width).toBeLessThanOrEqual(page.viewportSize().width)
  await expect(flyout.locator(':focus')).toHaveCount(1)

  const cut = flyout.getByRole('button', { name: 'Set CUT', exact: true })
  await cut.click()
  await flyout.getByRole('textbox', { name: 'CUT', exact: true }).fill('2')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => suite(page, 'currentSource'))
    .toBe(await suite(page, 'expectedAfter', id, 'cut', 2))
  await chooseSwitch(flyout, 'BANK', 'RolandTR808')
  await expect
    .poll(() => suite(page, 'currentSource'))
    .toBe(await suite(page, 'expectedAfter', id, 'bank', 'RolandTR808'))

  await page.keyboard.press('Escape')
  await expect(flyout).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await openMore(panel)
  await page.locator('.rack-toolbar h2').click()
  await expect(flyout).toBeHidden()

  await openMore(panel)
  await page.getByRole('button', { name: 'Fit rack', exact: true }).focus()
  await expect(flyout).toBeHidden()

  await openMore(panel)
  const before = await flyout.boundingBox()
  const panelBefore = await panel.boundingBox()
  await panel.evaluate((element) => {
    element.closest('.rack-scroll').scrollTop -= 60
  })
  await expect.poll(async () => (await panel.boundingBox()).y).toBeGreaterThan(panelBefore.y)
  await expect(flyout).toBeVisible()
  await expect.poll(async () => (await flyout.boundingBox()).y).toBeGreaterThan(before.y)
})

test('Escape in a More field cancels the edit, closes More and writes nothing', async ({
  page,
}) => {
  const { id, source } = await loadCase(page, 'mix')
  const panel = page.locator(`[data-module="${id}"]`)
  const toggle = panel.getByRole('button', { name: /^More / })
  const flyout = await openMore(panel)
  await flyout.getByLabel('NAME 1', { exact: true }).fill('dropped')
  await page.keyboard.press('Escape')
  await expect(flyout).toBeHidden()
  await expect(toggle).toBeFocused()
  expect(await suite(page, 'currentSource')).toBe(source)
  await openMore(panel)
  await expect(flyout.getByLabel('NAME 1', { exact: true })).toHaveValue('')
  await page.keyboard.press('Escape')

  const smpl = await loadCase(page, 'smpl')
  const sampler = page.locator(`[data-module="${smpl.id}"]`)
  const more = await openMore(sampler)
  await more.getByRole('button', { name: 'Set CUT', exact: true }).click()
  await more.getByRole('textbox', { name: 'CUT', exact: true }).fill('5')
  await page.keyboard.press('Escape')
  await expect(more).toBeHidden()
  expect(await suite(page, 'currentSource')).toBe(smpl.source)
})

test('More opens on the free side of a panel at the right end of the rail', async ({ page }) => {
  const { id } = await loadCase(page, 'mix')
  const panel = page.locator(`[data-module="${id}"]`)
  await page.setViewportSize({ width: 1024, height: 800 })
  await panel.scrollIntoViewIfNeeded()
  const flyout = await openMore(panel)
  const box = await flyout.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(1024)
  await expect(flyout.getByLabel('NAME 1', { exact: true })).toBeVisible()
  await expect(flyout.getByLabel('OUTPUT 4', { exact: true })).toBeAttached()
})

test('MIX faders drive the same value by keyboard and pointer, and cables follow', async ({
  page,
}) => {
  const { id } = await loadCase(page, 'mix')
  const panel = page.locator(`[data-module="${id}"]`)
  const fader = panel.getByRole('slider', { name: 'CH 1', exact: true })
  await expect(panel.getByRole('group', { name: 'CH 3', exact: true })).toBeVisible()
  await expect(panel.locator('.channel-strip')).toHaveCount(4)
  const value = () => fader.getAttribute('aria-valuenow').then(Number)
  await fader.focus()
  await page.keyboard.press('End')
  await expect.poll(value).toBe(1)
  await expect
    .poll(() => suite(page, 'currentSource'))
    .toBe(await suite(page, 'expectedAfter', id, 'ch1', 1))

  const track = await fader.boundingBox()
  await page.mouse.move(track.x + track.width / 2, track.y + 6)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width / 2, track.y + 6 + track.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(value).toBeLessThan(0.6)
  await expect.poll(value).toBeGreaterThan(0.4)
  await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
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
