import { test, expect } from 'playwright/test'

const add = (page, name) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
const header = (page, id) => page.locator(`[data-module="${id}"] .module-header`)
const notice = (page) => page.locator('.workspace-notice')
const undo = (page) => notice(page).getByRole('button', { name: /^Undo: / })
const status = (page) => page.locator('.transport-status')
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const rack = (page) =>
  page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const { patch } = read(editorSource())
    return { modules: patch.modules.map((m) => m.id), cables: patch.cables.map((c) => c.id) }
  })
const replaceSource = (page, text) =>
  page.evaluate(
    async (value) => (await import('/scripts/editor-browser.mjs')).replaceSource(value),
    text,
  )
const accepted = (page) =>
  expect(page.locator('.sync-status')).toContainText('Rack matches code', { timeout: 10_000 })

async function open(page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
}

async function load(page, title) {
  await page.getByRole('button', { name: 'Patch library' }).click()
  await page.locator('.patch-collections').getByRole('button', { name: title }).click()
  await page.locator('.load-patch').click()
  await page.locator('.patch-library').waitFor({ state: 'detached' })
  await accepted(page)
}

async function cable(page, from, to) {
  await page.locator(`[data-jack="${from}"]`).focus()
  await page.keyboard.press('Enter')
  await page.locator(`[data-jack="${to}"]`).focus()
  await page.keyboard.press('Enter')
}

test.describe('undo instead of a confirmation', () => {
  test.beforeEach(async ({ page }) => open(page))

  test('deleting a module acts at once and Undo brings back modules, cables and source', async ({
    page,
  }) => {
    await add(page, 'OSC')
    await add(page, 'VCF')
    await cable(page, 'osc1:out', 'vcf1:in')
    const before = { source: await source(page), rack: await rack(page) }

    await header(page, 'osc1').click()
    await page.keyboard.press('Delete')
    await expect(header(page, 'osc1')).toHaveCount(0)
    await expect(notice(page)).toContainText('Deleted OSC and 1 cable')
    await expect(page.locator('.replace-prompt')).toHaveCount(0)
    // The rack keeps the keyboard: the next module takes focus and selection.
    await expect(header(page, 'vcf1')).toBeFocused()
    await expect(header(page, 'vcf1')).toHaveAttribute('aria-pressed', 'true')

    await undo(page).click()
    await expect(header(page, 'osc1')).toBeVisible()
    expect(await source(page)).toBe(before.source)
    expect(await rack(page)).toEqual(before.rack)
    await expect(header(page, 'osc1')).toBeFocused()
    await expect(notice(page)).toHaveCount(0)
  })

  test('the message is announced and its Undo works from the keyboard', async ({ page }) => {
    await add(page, 'OSC')
    await header(page, 'osc1').click()
    const before = await source(page)

    const region = page.getByRole('status').filter({ has: page.locator('.workspace-notice') })
    await page.keyboard.press('Backspace')
    await expect(region).toContainText('Deleted OSC')
    await expect(region).toHaveAttribute('aria-live', 'polite')

    await undo(page).focus()
    await page.keyboard.press('Enter')
    await expect(header(page, 'osc1')).toBeVisible()
    expect(await source(page)).toBe(before)

    await page.keyboard.press('Delete')
    await expect(notice(page)).toContainText('Deleted OSC')
    await page.keyboard.press('Control+z')
    await expect(header(page, 'osc1')).toBeVisible()
    await expect(notice(page)).toHaveCount(0)
    expect(await source(page)).toBe(before)
    // Undo rebuilds the panels, so the keyboard must not fall back to the page.
    await expect(header(page, 'osc1')).toBeFocused()
  })

  test('undo from the code editor leaves the caret there', async ({ page }) => {
    await add(page, 'OSC')
    await header(page, 'osc1').click()
    await page.keyboard.press('Delete')
    await expect(notice(page)).toContainText('Deleted OSC')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+z')
    await expect(header(page, 'osc1')).toBeVisible()
    await expect(page.locator('.cm-content')).toBeFocused()
  })

  test('a newer edit retires the message, so Undo can never take back the wrong thing', async ({
    page,
  }) => {
    await add(page, 'OSC')
    await add(page, 'VCF')
    await header(page, 'osc1').click()
    await page.keyboard.press('Delete')
    await expect(notice(page)).toBeVisible()
    await add(page, 'NOISE')
    await expect(notice(page)).toHaveCount(0)
  })

  test('the message stays long enough, and hovering holds it open', async ({ page }) => {
    await page.clock.install()
    await open(page)
    await add(page, 'OSC')
    await header(page, 'osc1').click()
    await page.keyboard.press('Delete')
    await expect(notice(page)).toBeVisible()
    await page.clock.fastForward(11_000)
    await expect(notice(page)).toBeVisible()
    await notice(page).hover()
    await page.clock.fastForward(60_000)
    await expect(notice(page)).toBeVisible()
    await page.mouse.move(5, 5)
    await page.clock.fastForward(13_000)
    await expect(notice(page)).toHaveCount(0)
  })

  test('replacing a cable acts at once and Undo restores the old one', async ({ page }) => {
    await add(page, 'OSC')
    await add(page, 'NOISE')
    await cable(page, 'osc1:out', 'mix1:in1')
    const before = { source: await source(page), rack: await rack(page) }

    await cable(page, 'noise1:out', 'mix1:in1')
    await expect(notice(page)).toContainText('Replaced the cable into mix1 in1')
    await expect(page.locator('.replace-prompt')).toHaveCount(0)
    expect(await source(page)).not.toBe(before.source)
    await expect(page.locator('[data-jack="mix1:in1"]')).toBeFocused()

    await undo(page).click()
    await expect(notice(page)).toHaveCount(0)
    expect(await source(page)).toBe(before.source)
    expect(await rack(page)).toEqual(before.rack)
    await expect(page.locator('[data-jack="mix1:in1"]')).toBeFocused()
  })

  test('loading over changed work acts at once and Undo restores it', async ({ page }) => {
    await add(page, 'OSC')
    const before = { source: await source(page), rack: await rack(page) }

    await load(page, 'Enveloped synth')
    await expect(notice(page)).toContainText('Loaded Enveloped synth')
    await expect(notice(page)).not.toContainText('Playback')

    await undo(page).click()
    await accepted(page)
    expect(await source(page)).toBe(before.source)
    expect(await rack(page)).toEqual(before.rack)
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeFocused()
  })

  test('a load that stops playback says so, and Undo does not restart it', async ({ page }) => {
    await load(page, 'Enveloped synth')
    await add(page, 'NOISE')
    const before = await source(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(status(page)).toHaveText('Playing', { timeout: 30_000 })

    await load(page, 'Quantized sequence')
    await expect(notice(page)).toContainText('Playback stopped')
    await expect(status(page)).toHaveText('Ready')
    await undo(page).click()
    await accepted(page)
    expect(await source(page)).toBe(before)
    await expect(status(page)).toHaveText('Ready')
  })

  test('opening identical source offers no Undo, which would take back an older edit', async ({
    page,
  }) => {
    await add(page, 'OSC')
    const before = await source(page)
    await page.locator('input[type=file]').setInputFiles({
      name: 'same.strudel',
      mimeType: 'text/plain',
      buffer: Buffer.from(before),
    })
    await expect(page.getByLabel('Rack zoom')).toHaveValue(/fit|0\.75/)
    await accepted(page)
    expect(await source(page)).toBe(before)
    await expect(undo(page)).toHaveCount(0)
  })

  test('a clean load has nothing to undo, so it stays quiet', async ({ page }) => {
    await load(page, 'Enveloped synth')
    await expect(notice(page)).toHaveCount(0)
  })

  test('an unapplied draft still gets a prompt, because undo cannot restore it', async ({
    page,
  }) => {
    await page.locator('.cm-line').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ')
    await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
    const draft = await source(page)
    await page.getByRole('button', { name: 'New patch', exact: true }).click()
    const prompt = page.locator('fieldset.replace-prompt')
    await expect(prompt).toContainText('Undo can’t bring back code')
    await expect(prompt.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await source(page)).toBe(draft)
  })
})

test.describe('conversion on edit', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await load(page, 'Switch Angel trance demo')
  })

  const knob = (page) => page.locator('[data-module="vcf1"] [role="slider"]').first()
  const message = 'Code rewritten in rack style'

  test('an edit completes without a dialog, says so every time, and Undo is exact', async ({
    page,
  }) => {
    const original = await source(page)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await knob(page).focus()
    await page.keyboard.press('ArrowUp')
    await expect(notice(page)).toContainText(message)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    const converted = await source(page)
    expect(converted).not.toBe(original)

    await undo(page).click()
    await expect(notice(page)).toHaveCount(0)
    expect(await source(page)).toBe(original)

    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(page.locator('.sync-status')).toContainText('Rack matches code')
    expect(await source(page)).toBe(converted)

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect(await source(page)).toBe(original)
    await knob(page).focus()
    await page.keyboard.press('ArrowUp')
    await expect(notice(page)).toContainText(message)
  })

  test('a knob drag keeps its message and takes back the rewrite in one Undo', async ({ page }) => {
    const original = await source(page)
    await knob(page).scrollIntoViewIfNeeded()
    const box = await knob(page).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    for (let step = 1; step <= 6; step++)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - step * 6)
    await page.mouse.up()
    await expect(notice(page)).toContainText(message)
    expect(await source(page)).not.toBe(original)
    await undo(page).click()
    expect(await source(page)).toBe(original)
  })

  test('deleting a module that needs a rewrite reports both', async ({ page }) => {
    const original = await source(page)
    await header(page, 'quant1').click()
    await page.keyboard.press('Delete')
    await expect(notice(page)).toContainText('Deleted QUANT')
    await expect(notice(page)).toContainText(message)
    await undo(page).click()
    expect(await source(page)).toBe(original)
  })
})

test('an edit that cannot be converted explains why and changes nothing', async ({ page }) => {
  await open(page)
  await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).enableAutoApply())
  await replaceSource(
    page,
    "setcpm(110/4)\nconst turn = x => x.hurry(2), lead = note('c3 e3').s('triangle').chunk(4, turn).lpf(800).lpq(1).gain(.2);\n$: lead;\n",
  )
  await accepted(page)
  await add(page, 'LFO')
  await accepted(page)
  const before = await source(page)
  await cable(page, 'lfo1:out', 'vcf1:cv')
  await expect(notice(page)).toContainText('Separate helper and pattern')
  await expect(undo(page)).toHaveCount(0)
  expect(await source(page)).toBe(before)
  expect((await rack(page)).cables).not.toContain('lfo1:out→vcf1:cv')
})

test.describe('shorter loading and restore', () => {
  test.beforeEach(async ({ page }) => open(page))

  const entry = (page, title) =>
    page.locator('.patch-collections').getByRole('button', { name: title, exact: true })

  test('double-click or Enter loads; Space and a single click only select', async ({ page }) => {
    await page.getByRole('button', { name: 'Patch library' }).click()
    await entry(page, 'Enveloped synth').click()
    await expect(page.locator('.patch-detail h3')).toHaveText('Enveloped synth')
    await expect(page.locator('.patch-library')).toBeVisible()
    await entry(page, 'Quantized sequence').focus()
    await page.keyboard.press('Space')
    await expect(page.locator('.patch-detail h3')).toHaveText('Quantized sequence')
    await expect(page.locator('.patch-library')).toBeVisible()

    await entry(page, 'Enveloped synth').dblclick()
    await page.locator('.patch-library').waitFor({ state: 'detached' })
    await expect(page.getByLabel('Patch name')).toHaveValue('Enveloped synth')

    await page.getByRole('button', { name: 'Patch library' }).click()
    await entry(page, 'Quantized sequence').focus()
    await page.keyboard.press('Enter')
    await page.locator('.patch-library').waitFor({ state: 'detached' })
    await expect(page.getByLabel('Patch name')).toHaveValue('Quantized sequence')
  })

  test('a tall patch opens at a readable view with its first modules and cables', async ({
    page,
  }) => {
    await load(page, 'Switch Angel trance demo')
    await expect(page.getByLabel('Rack zoom')).toHaveValue('0.75')
    const viewport = await page.locator('.rack-scroll').boundingBox()
    const seen = await page.locator('.module-panel').evaluateAll((panels, frame) => {
      const within = panels.filter((panel) => {
        const box = panel.getBoundingClientRect()
        return box.top < frame.y + frame.height && box.left < frame.x + frame.width
      })
      return within.length
    }, viewport)
    expect(seen).toBeGreaterThan(5)
    await expect(page.locator('.cables .cable').first()).toBeVisible()
    expect(await page.locator('.rack-scroll').evaluate((element) => element.scrollTop)).toBe(0)
  })

  test('a patch that fits opens whole', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await load(page, 'First sounds')
    await expect(page.getByLabel('Rack zoom')).toHaveValue('fit')
    const fit = await page.locator('.rack-scroll').evaluate((element) => ({
      overflow: element.scrollHeight - element.clientHeight,
    }))
    expect(fit.overflow).toBeLessThanOrEqual(1)
  })

  test('a reload restores silently, with a dismissible Start new', async ({ page }) => {
    await add(page, 'OSC')
    const saved = await source(page)
    await page.reload()
    await page.locator('.cm-content').waitFor()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(notice(page)).toContainText('Restored your last patch')
    expect(await source(page)).toBe(saved)
    await expect(status(page)).toHaveText('Ready')

    await notice(page).getByRole('button', { name: 'Dismiss message' }).click()
    await expect(notice(page)).toHaveCount(0)
    expect(await source(page)).toBe(saved)

    await page.reload()
    await notice(page)
      .getByRole('button', { name: /^Start new: / })
      .click()
    await expect(page.locator('.module-panel')).toHaveCount(2)
    await undo(page).click()
    await accepted(page)
    expect(await source(page)).toBe(saved)
  })

  test('a draft still comes back after a reload', async ({ page }) => {
    await add(page, 'OSC')
    await page.locator('.cm-line').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ')
    await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
    const draft = await source(page)
    await page.reload()
    await page.locator('.cm-content').waitFor()
    await expect(notice(page)).toContainText('unapplied code')
    await expect(page.locator('.sync-status')).toHaveText('Unapplied changes')
    expect(await source(page)).toBe(draft)
  })

  test('restored work with no new edits loads without asking', async ({ page }) => {
    await add(page, 'OSC')
    const saved = await source(page)
    await page.reload()
    await page.locator('.cm-content').waitFor()
    await load(page, 'Enveloped synth')
    await expect(page.locator('.replace-prompt')).toHaveCount(0)
    await expect(notice(page)).toContainText('Loaded Enveloped synth')
    await undo(page).click()
    await accepted(page)
    expect(await source(page)).toBe(saved)
  })
})
