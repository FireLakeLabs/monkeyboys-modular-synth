import { test, expect } from 'playwright/test'

const sync = (page) => page.locator('.sync-status')
const status = (page) => page.locator('.transport-status')
const strip = (page) => page.locator('.rack-lock')
const panels = (page) => page.locator('.module-panel')
const play = (page) => page.locator('.topbar .play')
const undoButton = (page) => page.getByRole('button', { name: 'Undo', exact: true })
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const types = (page) =>
  page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    return read(editorSource()).patch.modules.map((m) => m.type)
  })
const replaceSource = (page, text) =>
  page.evaluate(
    async (value) => (await import('/scripts/editor-browser.mjs')).replaceSource(value),
    text,
  )

const voice = '$: note("c2 e2").s("sawtooth")'

async function open(page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await replaceSource(page, voice)
  await expect(sync(page)).toContainText('Rack matches code')
  await caretAfterVoice(page)
}

/** The saved rack block follows the voice, so go to the end of the voice line. */
async function caretAfterVoice(page) {
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
}

test.describe('while stopped', () => {
  test.beforeEach(async ({ page }) => open(page))

  test('finished code applies by itself and does not start playback', async ({ page }) => {
    await page.keyboard.type('.lpf(800)', { delay: 20 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    await expect(sync(page)).toContainText('Rack matches code')
    await expect(status(page)).toHaveText('Ready')
  })

  test('pausing after .l leaves the rack unchanged', async ({ page }) => {
    const before = await types(page)
    await page.keyboard.type('.l', { delay: 20 })
    await page.waitForTimeout(800)
    expect((await types(page)).length).toBeGreaterThan(0)
    await expect(panels(page)).toHaveCount(before.length)
    await expect(panels(page).filter({ hasText: 'CODE' })).toHaveCount(0)
    await expect(sync(page)).toHaveText('Unapplied changes')
  })

  test('a complete call the rack cannot model still applies, and ends a step', async ({ page }) => {
    const before = await source(page)
    await page.keyboard.type('.notARealCall(2)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'CODE' })).toHaveCount(1)
    await undoButton(page).click()
    await expect(panels(page).filter({ hasText: 'CODE' })).toHaveCount(0)
    expect(await source(page)).toBe(before)
  })

  test('each finished call is one undo step, ending with no pause needed', async ({ page }) => {
    const start = await source(page)
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    const first = await source(page)
    await page.keyboard.type('.room(0.5)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'REVERB' })).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(panels(page).filter({ hasText: 'REVERB' })).toHaveCount(0)
    expect(await source(page)).toBe(first)
    await page.keyboard.press('Control+z')
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(0)
    expect(await source(page)).toBe(start)
  })

  test('fast typing still ends a step at each finished call', async ({ page }) => {
    const start = await source(page)
    await page.keyboard.type('.lpf(800).room(0.5)', { delay: 10 })
    await expect(panels(page).filter({ hasText: 'REVERB' })).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(panels(page).filter({ hasText: 'REVERB' })).toHaveCount(0)
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(0)
    expect(await source(page)).toBe(start)
  })

  test('deleting a voice ends a step, even when typing resumes at once', async ({ page }) => {
    await page.keyboard.type('\n$: s("hh*4")', { delay: 15 })
    await expect(sync(page)).toContainText('Rack matches code')
    await page.waitForTimeout(1600)
    const both = await source(page)
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press('Delete')
    await page.keyboard.type('// note', { delay: 10 })
    await expect(sync(page)).toContainText('Rack matches code')
    await page.waitForTimeout(600)
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page).then((text) => text.includes('// note'))).toBe(false)
    expect(await source(page)).not.toBe(both)
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page)).toBe(both)
  })

  test('a paste is finished text, even with a property read in it', async ({ page }) => {
    await replaceSource(page, 'const size = [1, 2].length\n$: note("c2").gain(globalThis.g ?? 1)\n')
    await expect(sync(page)).toContainText('Rack matches code')
    await expect(status(page)).toHaveText('Ready')
  })

  test('moving the caret off an edited word lets finished code apply', async ({ page }) => {
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    for (let index = 0; index < '(800)'.length; index++) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(1800)
    await expect(sync(page)).toHaveText('Unapplied changes')
    await page.keyboard.press('End')
    await expect(sync(page)).toContainText('Rack matches code')
  })

  test('typing in a pattern string is one step per pause', async ({ page }) => {
    const start = await source(page)
    await page.locator('.cm-line').first().click()
    await page.keyboard.press('Home')
    for (let index = 0; index < '$: note("c2 e2'.length; index++)
      await page.keyboard.press('ArrowRight')
    await page.keyboard.type(' g2', { delay: 60 })
    await page.waitForTimeout(2000)
    const first = await source(page)
    expect(first).toContain('c2 e2 g2')
    await page.keyboard.type(' b2', { delay: 60 })
    await expect.poll(() => source(page).then((text) => text.includes('g2 b2'))).toBe(true)
    await page.waitForTimeout(600)
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page)).toBe(first)
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page)).toBe(start)
  })

  test('undo never lands on unreadable code or a half-typed word', async ({ page }) => {
    const start = await source(page)
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    const finished = await source(page)
    await page.keyboard.type('.ro', { delay: 15 })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => source(page)).toBe(finished)
    await undoButton(page).click()
    await expect.poll(() => source(page)).toBe(start)
  })

  test('leaving the editor ends a step and applies finished code at once', async ({ page }) => {
    await page.keyboard.type('.lpf(800).lpq(2)', { delay: 15 })
    await page.getByLabel('Patch name').click()
    await expect(sync(page)).toContainText('Rack matches code')
  })

  test('Apply and Ctrl+Enter apply readable half-typed code at once', async ({ page }) => {
    await page.keyboard.type('.l', { delay: 15 })
    await expect(sync(page)).toHaveText('Unapplied changes')
    await page.keyboard.press('Control+Enter')
    await expect(panels(page).filter({ hasText: 'CODE' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
  })
})

test.describe('the locked rack', () => {
  test.beforeEach(async ({ page }) => open(page))

  test('never flickers while typing, then says so with the reason and a way out', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.lockSeen = 0
      new MutationObserver(() => {
        if (document.querySelector('.rack-lock')) window.lockSeen++
      }).observe(document.body, { childList: true, subtree: true })
    })
    await page.keyboard.type('.lpf(800).room(0.5).delay(0.4).gain(0.8).pan(0.2)', { delay: 90 })
    expect(await page.evaluate(() => window.lockSeen)).toBe(0)
    await expect(strip(page)).toHaveCount(0)

    await page.keyboard.type('.l', { delay: 20 })
    await expect(strip(page)).toHaveCount(0)
    await expect(strip(page)).toContainText('Your code has changes that aren’t applied yet', {
      timeout: 4000,
    })
    await expect(strip(page).getByRole('button', { name: 'Apply', exact: true })).toBeVisible()
    await expect(strip(page).getByRole('button', { name: 'Revert', exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Rack locked' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
    await page.screenshot({ path: test.info().outputPath('locked.png') })

    await strip(page).getByRole('button', { name: 'Revert', exact: true }).click()
    await expect(strip(page)).toHaveCount(0)
    await expect(sync(page)).toContainText('Rack matches code')
  })

  test('unreadable code says how to get out, and covers rack, OUT and module list', async ({
    page,
  }) => {
    await page.keyboard.type('.lpf(', { delay: 20 })
    await expect(strip(page)).toContainText('Fix the code or revert to unlock', { timeout: 4000 })
    await expect(strip(page).getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0)
    expect(await page.locator('.rack-frame').evaluate((element) => element.inert)).toBe(true)
    expect(await page.locator('aside.library').evaluate((element) => element.inert)).toBe(true)
    const out = await page.locator('.output-panel .module-panel').boundingBox()
    await expect(page.locator('.rack-stage')).toHaveCSS('cursor', 'not-allowed')
    await page.mouse.click(out.x + out.width / 2, out.y + out.height / 2)
    await expect(strip(page)).toHaveAttribute('data-pulse', 'true')
    await expect(strip(page)).toHaveAttribute('data-pulse', 'false')
    const chip = await page.locator('aside.library .chip').first().boundingBox()
    await page.mouse.click(chip.x + chip.width / 2, chip.y + chip.height / 2)
    await expect(strip(page)).toHaveAttribute('data-pulse', 'true')
  })

  test('showing the lock and reverting keeps the panels', async ({ page }) => {
    await page.locator('.cm-line').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    await page.evaluate(() => {
      window.keptPanel = document.querySelector('.module-panel')
    })
    await page.keyboard.type('.l', { delay: 15 })
    await expect(strip(page)).toBeVisible({ timeout: 4000 })
    await strip(page).getByRole('button', { name: 'Revert', exact: true }).click()
    await expect(strip(page)).toHaveCount(0)
    expect(
      await page.evaluate(() => window.keptPanel === document.querySelector('.module-panel')),
    ).toBe(true)
  })

  test('leaving the editor on unfinished code locks at once', async ({ page }) => {
    await page.keyboard.type('.l', { delay: 20 })
    await page.locator('.rack-toolbar h2').click()
    await expect(strip(page)).toBeVisible({ timeout: 500 })
    await strip(page).getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(strip(page)).toHaveCount(0)
    await expect(status(page)).toHaveText('Ready')
    await expect(page.locator('.cm-content')).toBeFocused()
  })
})

test.describe('while playing', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await play(page).click()
    await expect(status(page)).toHaveText('Playing', { timeout: 30_000 })
    await caretAfterVoice(page)
  })

  test.afterEach(async ({ page }) => {
    await page.keyboard.press('Control+.')
  })

  test('code applies only on Apply, and Unapplied changes stays visible', async ({ page }) => {
    const before = await panels(page).count()
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await page.waitForTimeout(800)
    await expect(sync(page)).toHaveText('Unapplied changes')
    await expect(panels(page)).toHaveCount(before)
    await page.keyboard.press('Control+Enter')
    await expect(panels(page)).toHaveCount(before + 1)
    await expect(status(page)).toHaveText('Playing')
  })

  test('the toggle also applies finished code while playing, with the same check', async ({
    page,
  }) => {
    await page.getByRole('checkbox', { name: 'Auto-apply while playing' }).check()
    await caretAfterVoice(page)
    const before = await panels(page).count()
    await page.keyboard.type('.l', { delay: 15 })
    await page.waitForTimeout(600)
    await expect(panels(page)).toHaveCount(before)
    await page.keyboard.type('pf(800)', { delay: 15 })
    await expect(panels(page)).toHaveCount(before + 1)
    await expect(status(page)).toHaveText('Playing')
  })

  test('stopping applies code typed while playing', async ({ page }) => {
    const before = await panels(page).count()
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await expect(sync(page)).toHaveText('Unapplied changes')
    await page.keyboard.press('Control+.')
    await expect(panels(page)).toHaveCount(before + 1)
    await expect(sync(page)).toContainText('Rack matches code')
  })
})

test.describe('Play', () => {
  test.beforeEach(async ({ page }) => open(page))

  for (const [name, draft] of [
    ['unreadable', '.lpf('],
    ['half-typed', '.l'],
  ])
    test(`a ${name} draft never disables Play, which plays the last applied code`, async ({
      page,
    }) => {
      await page.keyboard.type(draft, { delay: 15 })
      await page.waitForTimeout(400)
      await expect(play(page)).toBeEnabled()
      const text = await source(page)
      await play(page).click()
      await expect(status(page)).toHaveText('Playing', { timeout: 30_000 })
      expect(await source(page)).toBe(text)
      await page.keyboard.press('Control+.')
    })

  test('Play ends a step and applies finished code first', async ({ page }) => {
    await page.keyboard.type('.lpf(800)', { delay: 15 })
    await play(page).click()
    await expect(sync(page)).toContainText('Rack matches code')
    await expect(status(page)).toHaveText('Playing', { timeout: 30_000 })
    await expect(panels(page).filter({ hasText: 'VCF' })).toHaveCount(1)
    await page.keyboard.press('Control+.')
  })
})

test('a restored readable draft waits for you instead of applying itself', async ({ page }) => {
  await open(page)
  await page.keyboard.type('.l', { delay: 15 })
  await expect(sync(page)).toHaveText('Unapplied changes')
  const draft = await source(page)
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await page.waitForTimeout(600)
  expect(await source(page)).toBe(draft)
  await expect(sync(page)).toHaveText('Unapplied changes')
  await expect(strip(page)).toBeVisible()
})
