import { test, expect } from 'playwright/test'

test.setTimeout(45_000)

const jack = (page, id) => page.locator(`[data-jack="${id}"]`)
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const patch = (page) =>
  page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    return (await import('/src/reader/index.ts')).read(editorSource()).patch
  })
async function fixture(page, { look = 'instrument', playing = false } = {}) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(
    async ({ look, playing }) => {
      const m = await import('/src/rack/model.ts')
      const { generate } = await import('/src/codegen/generate.ts')
      let patch = m.starterPatch(104)
      patch = m.placeModule(patch, 'osc', 0, 0)
      patch = m.placeModule(patch, 'vcf', 0, 12)
      patch = m.placeModule(patch, 'lfo', 0, 24)
      patch = m.setLook(patch, 'osc1', look)
      patch = m.setLook(patch, 'vcf1', look)
      if (playing) {
        patch = m.placeModule(patch, 'seq', 0, 48)
        patch = m.connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
        patch = m.connect(patch, { module: 'osc1', jack: 'out' }, { module: 'vcf1', jack: 'in' })
        patch = m.connect(patch, { module: 'vcf1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
      }
      await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
    },
    { look, playing },
  )
  await page.getByLabel('Rack zoom').selectOption('1')
  await page.evaluate(() => document.fonts.ready)
}
async function dropOnRail(page, id) {
  await jack(page, id).scrollIntoViewIfNeeded()
  const start = await jack(page, id).boundingBox()
  const rail = await page.locator('.rack-surface').boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + 38 * 12, rail.y + 130, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'Add a connected module' })).toBeVisible()
}
async function undo(page) {
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
}

test('hover and focus discover compatible jacks in both directions without changing the patch', async ({
  page,
}, info) => {
  await fixture(page)
  const before = await source(page)
  await jack(page, 'lfo1:out').hover()
  await expect(page.locator('#jack-discovery-hint')).toContainText('vcf1:cv')
  await expect(jack(page, 'vcf1:cv')).toHaveClass(/valid/)
  await expect(jack(page, 'vcf1:in')).not.toHaveClass(/valid/)
  await expect(page.locator('[data-module="vcf1"]')).toHaveAttribute('data-compatible', 'true')
  await page.screenshot({ path: info.outputPath('hover.png') })
  await page.mouse.move(1500, 20)
  await jack(page, 'vcf1:cv').focus()
  await expect(page.locator('#jack-discovery-hint')).toContainText('lfo1:out')
  await expect(jack(page, 'lfo1:out')).toHaveClass(/valid/)
  await expect(jack(page, 'osc1:out')).toHaveClass(/signal-audio(?:\s|$)/)
  await expect(jack(page, 'osc1:out')).not.toHaveClass(/signal-audio-mod/)
  await expect(jack(page, 'vcf1:cv')).toHaveAttribute('aria-describedby', 'jack-discovery-hint')
  expect(await source(page)).toBe(before)
  await expect(page.locator('.transport-status')).toHaveText('Ready')
})

test('output rail drop previews catalog geometry, cancels cleanly, and commits placement plus cable as one undo', async ({
  page,
}, info) => {
  await fixture(page)
  const before = await source(page)
  await dropOnRail(page, 'osc1:out')
  const search = page.getByRole('searchbox', { name: 'Find compatible modules' })
  await expect(search).toBeFocused()
  await search.fill('vcf')
  await expect(page.locator('[data-choice]')).toHaveCount(2)
  const option = page.locator('[data-choice]').filter({ hasText: 'VCF · IN' })
  await option.hover()
  await expect(page.locator('.connected-module-ghost')).toContainText('VCF · IN')
  const preview = await page.locator('.connected-module-ghost').boundingBox()
  expect(preview.width).toBe(120)
  expect(await source(page)).toBe(before)
  await page.screenshot({ path: info.outputPath('chooser.png') })
  await page.keyboard.press('Escape')
  await expect(search).toHaveCount(0)
  await expect(page.locator('.rack-status')).toHaveText('Cancelled')
  await expect(jack(page, 'osc1:out')).toBeFocused()
  expect(await source(page)).toBe(before)
  await dropOnRail(page, 'osc1:out')
  await search.fill('vcf')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-choice]').first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-module="vcf2"]')).toBeVisible()
  await expect(page.locator('.rack-status')).toHaveText('Added and connected VCF')
  const after = await patch(page)
  expect(after.modules.find((module) => module.id === 'vcf2')).toMatchObject({ row: 0, hp: 38 })
  expect(after.cables).toContainEqual(
    expect.objectContaining({
      from: { module: 'osc1', jack: 'out' },
      to: { module: 'vcf2', jack: 'in' },
    }),
  )
  await undo(page)
  expect(await source(page)).toBe(before)
  await page.locator('.history-redo').click()
  expect(await patch(page)).toEqual(after)
})

test('input rail drop adds a source, preserves occupied cables until selection, and supports reverse direct wiring', async ({
  page,
}) => {
  await fixture(page, { playing: true })
  const before = await source(page)
  await dropOnRail(page, 'vcf1:in')
  await page.getByRole('searchbox', { name: 'Find compatible modules' }).fill('noise')
  await expect(page.locator('[data-choice]')).toHaveCount(1)
  await expect(page.locator('[data-choice]')).toContainText('Replaces the cable')
  expect(await source(page)).toBe(before)
  await page.locator('[data-choice]').click()
  const changed = await patch(page)
  expect(
    changed.cables.filter((cable) => cable.to.module === 'vcf1' && cable.to.jack === 'in'),
  ).toEqual([expect.objectContaining({ from: { module: 'noise1', jack: 'out' } })])
  await undo(page)
  expect(await source(page)).toBe(before)
  await jack(page, 'vcf1:cv').focus()
  await page.keyboard.press('Enter')
  await jack(page, 'lfo1:out').focus()
  await expect(jack(page, 'lfo1:out')).toHaveClass(/valid/)
  await page.keyboard.press('Enter')
  expect((await patch(page)).cables).toContainEqual(
    expect.objectContaining({
      from: { module: 'lfo1', jack: 'out' },
      to: { module: 'vcf1', jack: 'cv' },
    }),
  )
})

for (const look of ['powder', 'vintage', 'learner']) {
  test(`reverse cable creation and ghost placement retain ${look} geometry at 75% zoom`, async ({
    page,
  }) => {
    await fixture(page, { look })
    await page.getByLabel('Rack zoom').selectOption('0.75')
    const start = await jack(page, 'vcf1:cv').boundingBox()
    const rail = await page.locator('.rack-surface').boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(rail.x + 38 * 12 * 0.75, rail.y + 130 * 0.75, { steps: 10 })
    await page.mouse.up()
    await expect(page.getByRole('dialog', { name: 'Add a connected module' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Find compatible modules' }).fill('env')
    await page
      .locator('[data-choice]')
      .filter({ hasText: /^ENV ·/ })
      .hover()
    const ghost = await page.locator('.connected-module-ghost').boundingBox()
    expect(ghost.width).toBe(10 * 12 * 0.75)
    await page.keyboard.press('Escape')
    await expect(jack(page, 'vcf1:cv')).toBeFocused()
  })
}

test('outside dismissal and unapplied drafts cancel a ghost without changing accepted source', async ({
  page,
}) => {
  await fixture(page)
  const before = await source(page)
  await dropOnRail(page, 'vcf1:cv')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(page.locator('[data-module-chooser]')).toHaveCount(0)
  expect(await source(page)).toBe(before)
  await page.keyboard.press('Escape')
  await dropOnRail(page, 'vcf1:cv')
  await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).replaceSource('note('),
  )
  await expect(page.locator('[data-module-chooser]')).toHaveCount(0)
  expect(await page.locator('[data-module="env1"]').count()).toBe(0)
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('monkeyboy.workspace.v1')).source),
  ).toBe(before)
})

test('connected-module selection updates real playback and Undo/Redo while cancellation keeps scheduled audio', async ({
  page,
}, info) => {
  await fixture(page, { playing: true })
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    const { read } = await import('/src/reader/index.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    let patch = read(editorSource()).patch
    patch = m.placeModule(patch, 'scope', 0, 60)
    patch = m.setValue(patch, 'osc1', 'wave', 'sine')
    patch = m.connect(patch, { module: 'vcf1', jack: 'out' }, { module: 'scope1', jack: 'in' })
    patch = m.connect(
      patch,
      { module: 'scope1', jack: 'out' },
      { module: 'mix1', jack: 'in1' },
      true,
    )
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', { timeout: 25_000 })
  async function pcm() {
    return page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((n) => n.includes('/src/strudel/engine.ts'))
      const engine = await import(url)
      for (let i = 0; i < 100; i++) {
        const data = engine.scopeData(1, 'waveform')
        if (data?.some((value) => Math.abs(value) > 0.00001))
          return { peak: Math.max(...data.map(Math.abs)), clock: engine.getClock() }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('No SCOPE PCM after cable edit')
    })
  }
  const initial = await pcm()
  const before = await source(page)
  await dropOnRail(page, 'vcf1:cv')
  await page.getByRole('searchbox', { name: 'Find compatible modules' }).fill('env')
  await page.keyboard.press('Escape')
  expect(await source(page)).toBe(before)
  const cancelled = await pcm()
  await dropOnRail(page, 'vcf1:cv')
  await page.getByRole('searchbox', { name: 'Find compatible modules' }).fill('env')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-module="env1"]')).toBeVisible()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  expect((await patch(page)).cables).toContainEqual(
    expect.objectContaining({
      from: { module: 'env1', jack: 'out' },
      to: { module: 'vcf1', jack: 'cv' },
    }),
  )
  const connected = await pcm()
  await undo(page)
  expect(await source(page)).toBe(before)
  const undone = await pcm()
  await page.locator('.history-redo').click()
  await expect(page.locator('[data-module="env1"]')).toBeVisible()
  const redone = await pcm()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Ready')
  await info.attach('real-playback', {
    body: JSON.stringify({
      initial,
      cancelled,
      connected,
      undone,
      redone,
      physicalListening: false,
    }),
    contentType: 'application/json',
  })
})

for (const keyboardFocus of ['search', 'option']) {
  test(`Enter from ${keyboardFocus} commits the jack shown by the hovered ghost`, async ({
    page,
  }) => {
    await fixture(page)
    await dropOnRail(page, 'osc1:out')
    const search = page.getByRole('searchbox', { name: 'Find compatible modules' })
    await search.fill('vcf')
    if (keyboardFocus === 'option') {
      await page.keyboard.press('ArrowDown')
      await expect(page.locator('[data-choice]').first()).toBeFocused()
    }
    await page.locator('[data-choice]').filter({ hasText: 'VCF · CV' }).hover()
    await expect(page.locator('.connected-module-ghost')).toContainText('VCF · CV')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-module="vcf2"]')).toBeVisible()
    expect((await patch(page)).cables).toContainEqual(
      expect.objectContaining({
        from: { module: 'osc1', jack: 'out' },
        to: { module: 'vcf2', jack: 'cv' },
      }),
    )
  })
}
