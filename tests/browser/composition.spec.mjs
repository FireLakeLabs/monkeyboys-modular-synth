import { test, expect } from 'playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { chooseSwitch, detailPanel, fileAction } from '../../scripts/panel-controls.mjs'
const run = (page, method, arg) =>
  page.evaluate(
    async ({ method, arg }) => (await import('/scripts/composition-check.mjs'))[method](arg),
    { method, arg },
  )
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())

test('MIX modes retain source, inactive values, geometry, native Undo and atomic refusals', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    const before = await run(page, 'load', look)
    const voices = page.locator('[data-module="mix1"]'),
      stack = page.locator('[data-module="mix2"]')
    await detailPanel(voices)
    const strips = await voices
      .locator('.channel-strip')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
    expect(strips).toHaveLength(4)
    expect(Math.max(...strips) - Math.min(...strips)).toBeLessThan(1)
    await voices.screenshot({ path: info.outputPath(`voices-${look}.png`) })
    await chooseSwitch(voices, 'MODE', 'Stack')
    await expect(voices.getByRole('slider', { name: 'CH 1', exact: true })).toHaveCount(0)
    await expect(page.locator('[data-jack="mix1:cv1"]')).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (await run(page, 'state')).patch.modules.find((m) => m.id === 'mix1').values.mode,
      )
      .toBe('Stack')
    const changed = await source(page)
    expect(changed).not.toBe(before)
    const saved = await run(page, 'state')
    expect(saved.identity && saved.sourceExact).toBe(true)
    await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
    expect(saved.patch.modules.find((m) => m.id === 'mix1').values.ch1).toBe(0.8)
    await page.getByRole('button', { name: 'Undo', exact: true }).focus()
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page)).toBe(before)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => source(page)).toBe(changed)
    await page.keyboard.press('Control+z')
    await expect.poll(() => source(page)).toBe(before)
    await detailPanel(stack)
    // This known pattern group cannot become a Voices bus feeding OSC.
    await stack.getByRole('radio', { name: 'Voices', exact: true }).click()
    expect(await source(page)).toBe(before)
    for (const jack of ['mix2:in1', 'mix2:in3', 'mix2:out']) {
      const bounds = await page.locator(`[data-jack="${jack}"]`).boundingBox()
      expect(bounds.width).toBeGreaterThanOrEqual(24)
      expect(bounds.height).toBeGreaterThanOrEqual(24)
    }
    await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
    await stack.screenshot({ path: info.outputPath(`stack-${look}.png`) })
    await page.screenshot({ path: info.outputPath(`mix-${look}.png`) })
  }
  const nested = '$: stack(note("c3").fast(2), /* exact second */ note("g3").fast(2)).s("sine")\n'
  await page.evaluate(
    async (value) => (await import('/scripts/editor-browser.mjs')).replaceSource(value),
    nested,
  )
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  const second = page.locator('[data-module="seq2"]')
  await detailPanel(second)
  await second.getByRole('slider', { name: 'RATE', exact: true }).press('ArrowUp')
  await expect
    .poll(async () => (await run(page, 'state')).body)
    .toBe(
      nested.replace(
        '/* exact second */ note("g3").fast(2)',
        '/* exact second */ note("g3").fast(3)',
      ),
    )
  const edited = await run(page, 'state')
  const download = page.waitForEvent('download')
  await fileAction(page, 'Export')
  const exported = await readFile(await (await download).path(), 'utf8')
  await page.locator('input[type=file]').setInputFiles({
    name: 'nested.strudel',
    mimeType: 'text/plain',
    buffer: Buffer.from(exported),
  })
  // Export seats the existing factory cartridges; all pre-existing rack fields stay identical.
  await expect.poll(async () => (await run(page, 'state')).patch).toMatchObject(edited.patch)
  const reopened = await run(page, 'state')
  const { cartridges: _newPacks, ...rack } = reopened.patch
  const { cartridges: _oldPacks, ...beforeExport } = edited.patch
  expect(rack).toEqual(beforeExport)
  expect(reopened.identity).toBe(true)
  const group = edited.patch.modules.find((m) => m.type === 'mix' && m.values.mode === 'Stack')
  await detailPanel(page.locator('[data-module="seq2"]'))
  await page.locator('[data-jack="seq2:note"]').click()
  await page.locator(`[data-jack="${group.id}:in4"]`).click()
  await expect
    .poll(async () =>
      (await run(page, 'state')).patch.cables.some(
        (c) => c.to.module === group.id && c.to.jack === 'in4',
      ),
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await run(page, 'state')).patch).toEqual(reopened.patch)
  await page.evaluate(async () => {
    await (await import('/scripts/composition-check.mjs')).load('instrument', true)
  })
  const before = await source(page),
    voices = page.locator('[data-module="mix1"]')
  await detailPanel(voices)
  await voices.getByRole('radio', { name: 'Stack', exact: true }).click()
  expect(await source(page)).toBe(before)
  await expect(page.locator('[data-jack="mix1:cv1"]')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('MIX Stack shares native sends, isolates inline FX, retains inner routing and stops/replaces PCM', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const result = {
    browser: page.context().browser().version(),
    node: process.version,
    ...(await run(page, 'runtimeProof')),
  }
  await writeFile(
    info.outputPath('composition-runtime.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  await info.attach('composition-runtime', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.modeReplacement).toBe(true)
})
