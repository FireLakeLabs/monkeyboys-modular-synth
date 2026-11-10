import { test, expect } from 'playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { detailPanel, fileAction } from '../../scripts/panel-controls.mjs'
const run = (page, method, arg) =>
  page.evaluate(
    async ({ method, arg }) => (await import('/scripts/callback-branches-check.mjs'))[method](arg),
    { method, arg },
  )
const synced = async (page) => {
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  await expect(page.locator('.rack')).not.toHaveClass(/rack-locked/)
}
async function load(page) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await run(page, 'loadUI')
  await synced(page)
}

test('callback branches support native local patching, nested selection, edits, Undo and complete reopen', async ({
  page,
}, info) => {
  await load(page)
  const before = await run(page, 'state')
  const iter = page.locator('[data-module="iter2"]')
  await detailPanel(iter)
  await iter.getByRole('button', { name: 'Select iter2', exact: true }).click()
  await expect(page.locator('.cm-content .source-selected')).toContainText(['.iter(3)'])
  await iter.getByRole('slider', { name: 'STEPS', exact: true }).press('ArrowUp')
  await synced(page)
  const edited = await run(page, 'state')
  expect(edited.body).toBe(before.body.replace('q.iter(3)', 'q.iter(4)'))
  await page.getByRole('button', { name: 'Undo', exact: true }).focus()
  await page.keyboard.press('Control+z')
  await expect.poll(() => run(page, 'state')).toEqual(before)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(() => run(page, 'state')).toEqual(edited)
  await page.keyboard.press('Control+z')
  await expect.poll(() => run(page, 'state')).toEqual(before)
  // SEND can fan out to another local socket through real pointer clicks.
  const stack = before.patch.modules.find((m) => m.type === 'mix' && m.values.mode === 'Stack')
  await detailPanel(page.locator('[data-module="off1"]'))
  await page.locator('[data-jack="off1:send"]').click()
  const innerStack = before.patch.cables.find(
    (c) => c.from.module === 'rev1' && c.to.jack.startsWith('in'),
  )?.to.module
  expect(innerStack).toBeTruthy()
  await page.locator(`[data-jack="${innerStack}:in4"]`).click()
  await synced(page)
  const fanout = await run(page, 'state')
  expect(
    fanout.patch.cables.some(
      (c) => c.from.module === 'off1' && c.to.module === innerStack && c.to.jack === 'in4',
    ),
  ).toBe(true)
  expect(await page.locator('[data-jack="off1:send"]').getAttribute('aria-label')).toContain(
    'function',
  )
  expect(await page.locator('[aria-label="Name off1 SEND"]').count()).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => run(page, 'state')).toEqual(before)
  // Keyboard patching replaces one branch input with a shared local transform.
  await detailPanel(page.locator('[data-module="iter2"]'))
  await page.locator('[data-jack="iter2:out"]').focus()
  await page.keyboard.press('Enter')
  await page.locator('[data-jack="rev1:in"]').focus()
  await page.keyboard.press('Enter')
  await synced(page)
  const shared = await run(page, 'state')
  expect(shared.body.match(/q.iter\(3\)/g)).toHaveLength(1)
  expect(shared.body).not.toMatch(/const .*iter/)
  // Native naming is local and remains one structural Undo operation.
  const name = page.getByRole('textbox', { name: 'Name iter2 OUT', exact: true })
  await name.fill('innerShared')
  await name.press('Enter')
  await synced(page)
  expect((await run(page, 'state')).body).toContain('(innerShared =>')
  await page.screenshot({ path: info.outputPath('nested-shared.png') })
  const accepted = await run(page, 'state')
  await detailPanel(page.locator(`[data-module="${stack.id}"]`))
  await page
    .locator(`[data-module="${stack.id}"]`)
    .getByRole('radio', { name: 'Voices', exact: true })
    .click()
  expect(await run(page, 'state')).toEqual(accepted)
  // Wrong-owner RETURN refuses atomically through keyboard wiring.
  await page.locator('[data-jack="iter2:out"]').focus()
  await page.keyboard.press('Enter')
  await page.locator('[data-jack="jux1:return"]').focus()
  await page.keyboard.press('Enter')
  expect(await run(page, 'state')).toEqual(accepted)
  await page.keyboard.press('Escape')
  const download = page.waitForEvent('download')
  await fileAction(page, 'Export')
  const exported = await readFile(await (await download).path(), 'utf8')
  await page.locator('input[type=file]').setInputFiles({
    name: 'branches.strudel',
    mimeType: 'text/plain',
    buffer: Buffer.from(exported),
  })
  await synced(page)
  const reopened = await run(page, 'state')
  const { cartridges: _a, ...rack } = reopened.patch,
    { cartridges: _b, ...old } = accepted.patch
  expect(rack).toEqual(old)
  await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
})

test('local Stack retains function cable geometry in all Hardware looks', async ({
  page,
}, info) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    const state = await run(page, 'loadUI', look)
    await synced(page)
    const stacks = state.patch.modules.filter((m) => m.type === 'mix' && m.values.mode === 'Stack')
    const panel = page.locator(`[data-module="${stacks[0].id}"]`)
    await detailPanel(panel)
    await panel.screenshot({ path: info.outputPath(`local-stack-${look}.png`) })
    await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
    expect(await page.locator('.cable.signal-function').count()).toBeGreaterThan(5)
  }
})

test('original and regenerated callbacks retain events, scoped construction, live PCM, Stop and replacement', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const proof = await run(page, 'runtimeProof')
  await run(page, 'loadUI')
  await synced(page)
  await run(page, 'capture')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  const before = await run(page, 'liveState')
  const iter = page.locator('[data-module="iter2"]')
  await detailPanel(iter)
  await iter.getByRole('slider', { name: 'STEPS', exact: true }).press('ArrowUp')
  await synced(page)
  const after = await run(page, 'liveState')
  expect(after.events).not.toEqual(before.events)
  expect(after.pcm.rms).toBeGreaterThan(0.0001)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Ready')
  await run(page, 'restore')
  const result = {
    browser: page.context().browser().version(),
    node: process.version,
    ...proof,
    liveEdit: { before, after },
  }
  await writeFile(info.outputPath('callback-runtime.json'), JSON.stringify(result, null, 2) + '\n')
  await info.attach('callback-runtime', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
})
