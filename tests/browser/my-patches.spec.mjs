import { test, expect } from 'playwright/test'
import { fileAction } from '../../scripts/panel-controls.mjs'

const add = (page, name) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
const notice = (page) => page.locator('.workspace-notice')
const prompt = (page) => page.getByRole('dialog', { name: 'Save to My patches' })
const library = (page) => page.locator('.patch-library')
const entry = (page, name) =>
  page.locator('.patch-collections').getByRole('button', { name, exact: true })
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('monkeyboy.patches.v1') ?? 'null'))

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
})

async function save(page, name) {
  await page.keyboard.press('Control+s')
  await prompt(page).getByLabel('Name').fill(name)
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText(`Saved ${name}`)
}

test('the first Ctrl+S asks for a name, and later saves update the same entry', async ({
  page,
}) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Control+s')
  await expect(prompt(page).getByLabel('Name')).toBeFocused()
  await expect(prompt(page).getByLabel('Name')).toHaveValue('Untitled patch')
  await prompt(page).getByLabel('Name').fill('Bass line')
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText('Saved Bass line')
  await expect(page.getByLabel('Patch name')).toHaveValue('Bass line')

  await add(page, 'VCF')
  await page.keyboard.press('Meta+s')
  await expect(prompt(page)).toHaveCount(0)
  await expect(notice(page)).toContainText('Saved Bass line')
  const { patches } = await stored(page)
  expect(patches.map((patch) => patch.name)).toEqual(['Bass line'])
  expect(patches[0].source).toContain('"vcf1"')
})

test('Escape cancels the first save and writes nothing', async ({ page }) => {
  await page.keyboard.press('Control+s')
  await expect(prompt(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(prompt(page)).toHaveCount(0)
  expect(await stored(page)).toBeNull()
})

test('a saved patch reloads with exact source and rack, from My patches', async ({ page }) => {
  await add(page, 'OSC')
  await add(page, 'VCF')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Kept')
  const kept = await source(page)
  const rack = await page.evaluate(async (text) => {
    const { read } = await import('/src/reader/index.ts')
    return read(text).patch
  }, kept)

  await fileAction(page, 'New patch')
  await expect(page.locator('.module-panel')).toHaveCount(2)
  await fileAction(page, 'Patch library')
  await entry(page, 'Kept').dblclick()
  await library(page).waitFor({ state: 'detached' })
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  expect(await source(page)).toBe(kept)
  const reopened = await page.evaluate(
    async (text) => {
      const { read } = await import('/src/reader/index.ts')
      return read(text).patch
    },
    await source(page),
  )
  expect(reopened).toEqual(rack)

  // Now linked, so saving updates it without asking.
  await add(page, 'LFO')
  await page.keyboard.press('Control+s')
  await expect(prompt(page)).toHaveCount(0)
  expect((await stored(page)).patches).toHaveLength(1)
})

test('patches can be renamed, exported, deleted and undeleted', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'First')
  await fileAction(page, 'Patch library')
  await entry(page, 'First').click()

  const name = library(page).getByLabel('Name')
  await name.fill('Second')
  await name.press('Enter')
  await expect(entry(page, 'Second')).toBeVisible()
  expect((await stored(page)).patches[0].source).toContain('Second')

  const download = page.waitForEvent('download')
  await library(page).locator('.my-patch-actions').getByRole('button', { name: 'Export' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Second.strudel')
  // Export is the same file Export writes anywhere else, factory setup included.
  const { readFile } = await import('node:fs/promises')
  expect(await readFile(await file.path(), 'utf8')).toContain('samples(')

  await library(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(entry(page, 'Second')).toHaveCount(0)
  expect((await stored(page)).patches).toHaveLength(0)
  await library(page).getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(entry(page, 'Second')).toBeVisible()
  expect((await stored(page)).patches).toHaveLength(1)
})

test('saved patches survive a reload', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Lasting')
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await fileAction(page, 'Patch library')
  await expect(entry(page, 'Lasting')).toBeVisible()
  await expect(library(page)).toContainText('My patches')
})

test('the File menu saves too', async ({ page }) => {
  await fileAction(page, 'Save patch')
  await expect(prompt(page)).toBeVisible()
})

test('an unapplied draft is saved as it is, never dropped', async ({ page }) => {
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('.lpf(')
  await expect(page.locator('.sync-status')).toHaveText('Rack shows previous code')
  const draft = await source(page)
  await page.keyboard.press('Control+s')
  await prompt(page).getByLabel('Name').fill('Unfinished')
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText('with its unapplied code')
  expect((await stored(page)).patches[0].source).toBe(draft)
})

test('a full store says so, and the work stays open', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Called below with its receiver.
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'monkeyboy.patches.v1')
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.keyboard.press('Control+s')
  await prompt(page).getByLabel('Name').fill('Too big')
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText('Browser storage is full')
  await expect(notice(page)).toContainText('Export')
  await page.clock.install()
  await page.clock.fastForward(60_000)
  await expect(notice(page)).toBeVisible()
  expect(await stored(page)).toBeNull()
  await expect(page.locator('[data-module="osc1"]')).toBeVisible()
})

test('an unreadable store is reported and left exactly as it was', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('monkeyboy.patches.v1', '{not json'))
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await page.keyboard.press('Control+s')
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText('can’t be read')
  expect(await page.evaluate(() => localStorage.getItem('monkeyboy.patches.v1'))).toBe('{not json')
  await fileAction(page, 'Patch library')
  await expect(library(page).getByRole('alert')).toContainText('left as they are')
})

test('undoing a load never saves the old patch over the one that was loaded', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'A')
  await fileAction(page, 'New patch')
  await add(page, 'VCF')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'B')
  const before = await stored(page)
  const sourceOf = (data, name) => data.patches.find((patch) => patch.name === name).source

  await fileAction(page, 'Patch library')
  await entry(page, 'A').dblclick()
  await library(page).waitFor({ state: 'detached' })
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Control+z')
  await expect(page.getByLabel('Patch name')).toHaveValue('B')
  await page.keyboard.press('Control+s')
  await expect(notice(page)).toContainText('Saved B')
  const after = await stored(page)
  expect(sourceOf(after, 'A')).toBe(sourceOf(before, 'A'))
  expect(sourceOf(after, 'B')).toBe(sourceOf(before, 'B'))
})

test('a failed Undo of a delete keeps the entry, so it can be tried again', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Fragile')
  await fileAction(page, 'Patch library')
  await entry(page, 'Fragile').click()
  await library(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Called below with its receiver.
    const original = Storage.prototype.setItem
    window.restoreStorage = () => {
      Storage.prototype.setItem = original
    }
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
  const undo = library(page).getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(library(page).getByRole('alert')).toContainText('storage is full')
  await expect(undo).toBeVisible()
  await page.evaluate(() => window.restoreStorage())
  await undo.click()
  await expect(entry(page, 'Fragile')).toBeVisible()
})

test('a failed save stays on screen through later edits', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Called below with its receiver.
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'monkeyboy.patches.v1')
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.keyboard.press('Control+s')
  await prompt(page).getByLabel('Name').fill('Stuck')
  await page.keyboard.press('Enter')
  await expect(notice(page)).toContainText('Browser storage is full')
  const failure = page.locator('.workspace-notice[data-tone="error"]')
  await add(page, 'VCF')
  await expect(failure).toContainText('Browser storage is full')
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await expect(failure).toContainText('Browser storage is full')
  // Its own message: a delete can say what it did without hiding the failure.
  await page.locator('[data-module="vcf1"] .module-header').click()
  await page.keyboard.press('Delete')
  await expect(failure).toContainText('Browser storage is full')
  await expect(page.locator('.workspace-notice').filter({ hasText: 'Deleted VCF' })).toBeVisible()
  await failure.getByRole('button', { name: 'Dismiss message' }).click()
  await expect(failure).toHaveCount(0)
})

test('later saves keep the name you chose', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Before')
  await fileAction(page, 'Patch library')
  await entry(page, 'Before').click()
  const name = library(page).getByLabel('Name')
  await name.fill('After')
  await name.press('Enter')
  await expect(entry(page, 'After')).toBeVisible()
  await page.getByRole('button', { name: 'Close library' }).click()
  await expect(page.getByLabel('Patch name')).toHaveValue('After')
  await add(page, 'VCF')
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Control+s')
  await expect(notice(page)).toContainText('Saved After')
  expect((await stored(page)).patches.map((patch) => patch.name)).toEqual(['After'])
})

test('a named draft keeps its name on the next save', async ({ page }) => {
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('.lpf(')
  await expect(page.locator('.sync-status')).toHaveText('Rack shows previous code')
  await save(page, 'Unfinished')
  await page.keyboard.press('Control+s')
  await expect(notice(page)).toContainText('Saved Unfinished')
  expect((await stored(page)).patches.map((patch) => patch.name)).toEqual(['Unfinished'])
})

test('a stale tab cannot overwrite newer work, even by renaming first', async ({
  page,
  context,
}) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Shared')

  const other = await context.newPage()
  await other.goto('/')
  await other.locator('.cm-content').waitFor()
  await fileAction(other, 'Patch library')
  await entry(other, 'Shared').dblclick()
  await library(other).waitFor({ state: 'detached' })
  await add(other, 'VCF')
  await other.locator('.rack-toolbar h2').click()
  await other.keyboard.press('Control+s')
  await expect(notice(other)).toContainText('Saved Shared')
  const newer = (await stored(page)).patches[0].source
  expect(newer).toContain('"vcf1"')

  await fileAction(page, 'Patch library')
  await entry(page, 'Shared').click()
  const name = library(page).getByLabel('Name')
  await name.fill('Renamed')
  await name.press('Enter')
  await expect(entry(page, 'Renamed')).toBeVisible()
  await page.getByRole('button', { name: 'Close library' }).click()
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Control+s')
  await expect(page.locator('.workspace-notice[data-tone="error"]')).toContainText(
    'changed in another tab',
  )
  expect((await stored(page)).patches[0].source).toContain('"vcf1"')

  // The next save asks for a name, so this tab's work has a safe place to go.
  await page.keyboard.press('Control+s')
  await expect(prompt(page)).toBeVisible()
})

test('a library left open in a stale tab cannot overwrite newer work', async ({
  page,
  context,
}) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Shared')
  await fileAction(page, 'Patch library')
  await entry(page, 'Shared').click()

  const other = await context.newPage()
  await other.goto('/')
  await other.locator('.cm-content').waitFor()
  await fileAction(other, 'Patch library')
  await entry(other, 'Shared').dblclick()
  await library(other).waitFor({ state: 'detached' })
  await add(other, 'VCF')
  await other.locator('.rack-toolbar h2').click()
  await other.keyboard.press('Control+s')
  await expect(notice(other)).toContainText('Saved Shared')

  const name = library(page).getByLabel('Name')
  await name.fill('Renamed')
  await name.press('Enter')
  await expect(entry(page, 'Renamed')).toBeVisible()
  await page.getByRole('button', { name: 'Close library' }).click()
  await page.locator('.rack-toolbar h2').click()
  await page.keyboard.press('Control+s')
  await expect(page.locator('.workspace-notice[data-tone="error"]')).toContainText(
    'changed in another tab',
  )
  expect((await stored(page)).patches[0].source).toContain('"vcf1"')
})

test('storage use is reported, with a warning when nearly full', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'monkeyboy.patches.v1',
      JSON.stringify({
        version: 1,
        patches: [
          {
            id: 'big',
            name: 'Big',
            source: `// ${'x'.repeat(2_200_000)}\n`,
            savedAt: '2026-11-05T00:00:00.000Z',
            revision: 'fixture',
          },
        ],
      }),
    ),
  )
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await fileAction(page, 'Patch library')
  await entry(page, 'Big').click()
  const storage = page.locator('.my-patches-storage')
  await expect(storage).toContainText('of about 5.0 MB used')
  await expect(storage).toHaveAttribute('data-warning', 'true')
})

test('loading a saved patch over an unapplied draft still asks', async ({ page }) => {
  await add(page, 'OSC')
  await page.locator('.rack-toolbar h2').click()
  await save(page, 'Safe')
  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('.lpf(')
  await expect(page.locator('.sync-status')).toHaveText('Rack shows previous code')
  await fileAction(page, 'Patch library')
  await entry(page, 'Safe').dblclick()
  await expect(library(page).locator('.replace-prompt')).toContainText('Undo can’t bring back code')
})
