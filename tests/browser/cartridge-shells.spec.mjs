import { test, expect } from 'playwright/test'

const PACK = 'https://packs.example.test/shell/strudel.json'

async function openPacks(page) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('tab', { name: 'Packs', exact: true }).click()
}
const editorSource = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())

test('each pack is a shell with a label, worded status and sound count; its URL waits for hover or focus', async ({
  page,
}) => {
  await openPacks(page)
  const shells = page.locator('.cartridge')
  await expect(shells).toHaveCount(2)
  for (const shell of await shells.all()) {
    await expect(shell.locator('strong')).not.toBeEmpty()
    await expect(shell.locator('.cartridge-led')).toHaveCount(1)
    await expect(shell.locator('.cartridge-status')).toHaveText(/not loaded|loading|ready|failed/)
    await expect(shell).toContainText(/\d+ sounds|\? sounds/)
    // The source is only an accessible description on the shell itself.
    const visible = await shell.locator('.cartridge-label > :not(.sr-only)').allInnerTexts()
    expect(visible.join(' ')).not.toContain('https://')
  }
  // Factory packs stay seated: no Eject.
  await expect(page.locator('.cartridge-eject-button')).toHaveCount(0)

  const readout = page.locator('.cartridge-readout')
  await expect(readout).not.toContainText('https://')
  await shells.first().locator('.cartridge-label').hover()
  await expect(readout).toContainText('Dirt Samples')
  await expect(readout).toContainText('raw.githubusercontent.com/tidalcycles/Dirt-Samples')
  await page.mouse.move(0, 0)
  await expect(readout).not.toContainText('https://')
  await shells.nth(1).locator('.cartridge-label').focus()
  await expect(readout).toContainText('Drum Machines')
  await expect(readout).toContainText('https://')
  await expect(shells.nth(1).locator('.cartridge-label')).toHaveAccessibleDescription(
    /built in\. Source: https:\/\//,
  )
  const panel = page.locator('#dock-panel-packs')
  expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
})

test('the empty slot adds a pack, and its Eject is reachable from the keyboard', async ({
  page,
}) => {
  await page.route(PACK, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ _base: 'https://example.test/', one: ['a.wav'], two: ['b.wav'] }),
    }),
  )
  await openPacks(page)
  await expect(page.getByLabel('Pack address')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add sample pack' }).click()
  await expect(page.getByLabel('Pack address')).toBeFocused()
  await page.keyboard.type(PACK)
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Pack address')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add sample pack' })).toBeFocused()

  const shell = page.locator('.cartridge').filter({ hasText: 'packs.example.test' })
  await expect(shell).toContainText('follows URL')
  await expect(shell.locator('.cartridge-status')).toHaveText('not loaded')
  expect(await editorSource(page)).toContain(`samples('${PACK}');`)

  // Visiting Sounds registers the seated packs.
  await page.getByRole('tab', { name: 'Sounds', exact: true }).click()
  await page.getByRole('tab', { name: 'Packs', exact: true }).click()
  await expect(shell.locator('.cartridge-status')).toHaveText('ready')
  await expect(shell).toContainText('2 sounds')

  await shell.locator('.cartridge-label').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Eject packs.example.test' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(shell).toHaveCount(0)
  expect(await editorSource(page)).not.toContain(PACK)
})

test('a wrapped, ejectable pack keeps its status and Eject inside the shell on the shelf', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openPacks(page)
  await page.getByRole('button', { name: 'Add sample pack' }).click()
  await page
    .getByLabel('Pack address')
    .fill('github:person/an-exceptionally-long-field-tapes-repo/dev')
  await page.keyboard.press('Enter')
  const shell = page.locator('.cartridge').filter({ hasText: 'follows dev' })
  const box = await shell.evaluate((e) => {
    const inside = (child) => {
      const r = child.getBoundingClientRect()
      const parent = child.parentElement.getBoundingClientRect()
      return r.top >= parent.top && r.bottom <= parent.bottom + 0.5
    }
    return {
      status: inside(e.querySelector('.cartridge-status')),
      eject: inside(e.querySelector('.cartridge-eject-button')),
    }
  })
  expect(box).toEqual({ status: true, eject: true })
})

test('keyboard focus shows its own source even while the pointer rests on another pack', async ({
  page,
}) => {
  await openPacks(page)
  const labels = page.locator('.cartridge-label')
  await labels.first().hover()
  await expect(page.locator('.cartridge-readout')).toContainText('Dirt Samples')
  await labels.nth(1).focus()
  await expect(page.locator('.cartridge-readout')).toContainText('Drum Machines')
})
