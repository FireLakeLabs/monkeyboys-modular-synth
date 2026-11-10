import { test, expect } from 'playwright/test'
import { writeFile, readFile } from 'node:fs/promises'
import { detailPanel, fileAction } from '../../scripts/panel-controls.mjs'
const run = (page, method, arg) =>
  page.evaluate(
    async ({ method, arg }) => (await import('/scripts/sections-check.mjs'))[method](arg),
    { method, arg },
  )
const synced = async (page) => {
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  await expect(page.locator('.rack')).not.toHaveClass(/rack-locked/)
}
const field = async (panel, label, value) => {
  const input = panel.getByRole('textbox', { name: label, exact: true })
  await input.fill(value)
  await input.press('Enter')
}

test('SECTIONS four looks retain exact numeric fields, order, native history, selection and full export identity', async ({
  page,
}, info) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    await run(page, 'loadUI', look)
    await synced(page)
    const before = await run(page, 'state'),
      panel = page.locator('[data-module="sections1"]')
    await detailPanel(panel)
    await panel.getByRole('button', { name: 'Select sections1', exact: true }).click()
    await expect(page.locator('.cm-content .source-selected')).toContainText(['arrange('])
    await field(panel, 'CYCLES 1', '0.123456789012345')
    await synced(page)
    const edited = await run(page, 'state')
    expect(edited.patch.modules.find((m) => m.id === 'sections1').values.cycles1).toBe(
      '0.123456789012345',
    )
    expect(edited.body).toContain('[0.123456789012345,')
    expect(edited.identity && edited.sourceExact).toBe(true)
    await page.getByRole('button', { name: 'Undo', exact: true }).focus()
    await page.keyboard.press('Control+z')
    await expect.poll(() => run(page, 'state')).toEqual(before)
    await expect(panel.getByRole('textbox', { name: 'CYCLES 1', exact: true })).toHaveValue('0.5')
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => run(page, 'state')).toEqual(edited)
    await field(panel, 'ORDER', '2 1 3 4')
    await synced(page)
    const reordered = await run(page, 'state')
    expect(reordered.body).not.toBe(edited.body)
    expect(reordered.patch.modules.find((m) => m.id === 'sections1').values.order).toBe('2 1 3 4')
    await field(panel, 'CYCLES 2', '0')
    await synced(page)
    expect((await run(page, 'state')).source).toBe(reordered.source)
    await expect(panel.getByRole('textbox', { name: 'CYCLES 2', exact: true })).toHaveValue('1.25')
    await page.keyboard.press('Escape')
    const size = await panel.boundingBox()
    expect(size.width).toBe(192)
    for (const id of ['in1', 'in2', 'in3', 'in4', 'next', 'out']) {
      const box = await page.locator(`[data-jack="sections1:${id}"]`).boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
    await page.evaluate(async () => {
      await document.fonts.ready
      ;(await import('/scripts/rack-feel-check.mjs')).inspectPanels()
      ;(await import('/scripts/rack-feel-check.mjs')).inspectCables()
    })
    await panel.screenshot({ path: info.outputPath(`sections-${look}.png`) })
  }
  const before = await run(page, 'state')
  const download = page.waitForEvent('download')
  await fileAction(page, 'Export')
  const saved = await download,
    text = await readFile(await saved.path(), 'utf8')
  const exported = await page.evaluate(async (source) => {
    const { read } = await import('/src/reader/read.ts')
    return read(source).patch
  }, text)
  const expected = await page.evaluate(
    async (source) => (await import('/scripts/editor-browser.mjs')).expectedExport(source),
    before.source,
  )
  expect(text).toBe(expected)
  const { cartridges: factorySetup, ...exportedRack } = exported
  const { cartridges: priorSetup, ...beforeRack } = before.patch
  expect(exportedRack).toEqual(beforeRack)
  expect(factorySetup.length).toBeGreaterThanOrEqual(priorSetup?.length ?? 0)
  const chooser = page.waitForEvent('filechooser')
  await fileAction(page, 'Open file')
  await (
    await chooser
  ).setFiles({ name: 'sections.strudel', mimeType: 'text/plain', buffer: Buffer.from(text) })
  await synced(page)
  expect((await run(page, 'state')).patch).toEqual(exported)
})

test('SECTIONS creates through native connected placement, patches before OSC and undoes the complete gesture', async ({
  page,
}, info) => {
  test.setTimeout(60000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await run(page, 'loadStarter')
  await synced(page)
  await page.getByLabel('Rack zoom').selectOption('1')
  const before = await run(page, 'state'),
    jack = page.locator('[data-jack="seq1:note"]')
  const start = await jack.boundingBox(),
    rail = await page.locator('.rack-surface').boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + 38 * 12, rail.y + 130, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'Add a connected module' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Find compatible modules' }).fill('sections')
  await page.getByRole('button', { name: 'SECTIONS · IN 1', exact: true }).click()
  await synced(page)
  const added = await run(page, 'state')
  expect(added.patch.modules.find((m) => m.id === 'sections1')).toMatchObject({ row: 0, hp: 38 })
  await page.locator('[data-jack="sections1:out"]').click()
  await page.locator('[data-jack="osc1:note"]').click()
  await synced(page)
  const connected = await run(page, 'state')
  expect(connected.body).toContain('arrange(')
  expect(connected.identity).toBe(true)
  await page.screenshot({ path: info.outputPath('created-before-osc.png') })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => run(page, 'state')).toEqual(added)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => run(page, 'state')).toEqual(before)
  await run(page, 'loadExact')
  await synced(page)
  const exact = await run(page, 'state'),
    section = exact.patch.modules.find((m) => m.type === 'sections')
  const panel = page.locator(`[data-module="${section.id}"]`)
  await detailPanel(panel)
  await field(panel, 'CYCLES 1', '0.875')
  await synced(page)
  expect((await run(page, 'state')).body).toBe(exact.body.replace('[.5,phrase]', '[0.875,phrase]'))
  const argumentBefore = await run(page, 'state'),
    nested = argumentBefore.patch.modules.find((m) => m.type === 'seq' && m.values.steps === 'g4')
  expect(nested).toBeTruthy()
  const nestedPanel = page.locator(`[data-module="${nested.id}"]`)
  await detailPanel(nestedPanel)
  await nestedPanel.getByRole('slider', { name: 'RATE', exact: true }).press('ArrowUp')
  await synced(page)
  expect((await run(page, 'state')).body).toBe(
    argumentBefore.body.replace('note("g4").fast(2)', 'note("g4").fast(3)'),
  )
  await detailPanel(panel)
  await field(panel, 'ORDER', '2 1 3 4')
  await synced(page)
  const reordered = await run(page, 'state')
  const trivia = reordered.source.replace('arrange(', 'arrange(/* retained */ ')
  await page.evaluate(
    async (source) => (await import('/scripts/editor-browser.mjs')).replaceSource(source),
    trivia,
  )
  await synced(page)
  await field(panel, 'CYCLES 1', '0.625')
  await synced(page)
  const final = await run(page, 'state')
  const body = await page.evaluate(
    async (source) => (await import('/src/workspace/document.ts')).sourceBody(source),
    trivia,
  )
  expect(final.body).toBe(body.replace('[0.875,', '[0.625,'))
  expect(final.identity).toBe(true)
  await page.screenshot({ path: info.outputPath('nested-source-and-order.png') })
})

test('SECTIONS sparse NEXT duration edits retain source trivia and native history', async ({
  page,
}, info) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await run(page, 'loadSparse')
  await synced(page)
  const edits = []
  for (const [id, control, before, after] of [
    ['sections1', 'CYCLES 3', '1.125', '3.875'],
    ['sections2', 'CYCLES 4', '0.75', '0.123456789012345'],
    ['sections2', 'CYCLES 2', '2.25', '0.987654321098765'],
  ]) {
    const state = await run(page, 'state'),
      panel = page.locator(`[data-module="${id}"]`)
    await detailPanel(panel)
    await field(panel, control, after)
    await synced(page)
    const edited = await run(page, 'state')
    edits.push({ id, control, before: state, after: edited })
    expect(edited.body).toBe(state.body.replace(`[${before},`, `[${after},`))
    expect(edited.identity && edited.sourceExact).toBe(true)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => run(page, 'state')).toEqual(state)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(() => run(page, 'state')).toEqual(edited)
  }
  await page.screenshot({ path: info.outputPath('sparse-next.png') })
  await writeFile(info.outputPath('sparse-next-edits.json'), JSON.stringify(edits, null, 2) + '\n')
})

test('CODE comment boundaries preserve native text edits, source trivia and history', async ({
  page,
}, info) => {
  test.setTimeout(60000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  const edits = []
  for (const [shape, margin] of [
    ['plain', false],
    ['Stack', false],
    ['arrange', false],
    ['arrange', true],
  ]) {
    await run(page, 'loadComment', { shape, margin })
    await synced(page)
    const before = await run(page, 'state'),
      code = before.patch.modules.filter((m) => m.type === 'code')
    expect(code).toHaveLength(1)
    expect(code[0].values.text).toBe('.gain(.5) // tail')
    const panel = page.locator(`[data-module="${code[0].id}"]`)
    await detailPanel(panel)
    await panel.getByRole('button', { name: 'Edit in source', exact: true }).click()
    await page.keyboard.insertText(margin ? '.gain(.7) // tail' : '.gain(.7)')
    await page.getByRole('button', { name: 'Apply code', exact: true }).click()
    await synced(page)
    const after = await run(page, 'state')
    expect(after.body).toBe(
      margin
        ? before.body.replace('.gain(.5)', '.gain(.7)')
        : before.body.replace('\n  .gain(.5)', '.gain(.7)'),
    )
    expect(after.identity && after.sourceExact).toBe(true)
    edits.push({ shape, margin, before, after })
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => run(page, 'state')).toEqual(before)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(() => run(page, 'state')).toEqual(after)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.locator('.transport-status')).toHaveText('Ready')
  }
  await page.screenshot({ path: info.outputPath('code-trivia.png') })
  await writeFile(info.outputPath('code-trivia-edits.json'), JSON.stringify(edits, null, 2) + '\n')
})

test('SECTIONS original and regenerated events, native tails, sharing, custom routes, live edits and bus cleanup', async ({
  page,
}, info) => {
  test.setTimeout(180000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const proof = await run(page, 'runtimeProof')
  await run(page, 'loadLive')
  await synced(page)
  await run(page, 'capture')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  const before = await run(page, 'liveState'),
    panel = page.locator('[data-module="sections1"]')
  await run(page, 'rememberBuses')
  expect(before.nativeSends).toBe(true)
  await detailPanel(panel)
  const live = []
  for (const value of ['0.75', '1', '0.5']) {
    await field(panel, 'CYCLES 1', value)
    await synced(page)
    await expect(page.locator('.transport-status')).toHaveText('Playing')
    const state = await run(page, 'liveState')
    expect(state.pcm.rms).toBeGreaterThan(0.0001)
    expect(state.orbits).toEqual(before.orbits)
    expect(state.sameBuses && state.nativeSends).toBe(true)
    live.push({ value, ...state })
  }
  expect(live[0].events).not.toEqual(before.events)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Ready')
  await run(page, 'restore')
  const result = {
    browser: page.context().browser().version(),
    node: process.version,
    ...proof,
    live,
  }
  await writeFile(info.outputPath('sections-runtime.json'), JSON.stringify(result, null, 2) + '\n')
  await info.attach('sections-runtime', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
})
