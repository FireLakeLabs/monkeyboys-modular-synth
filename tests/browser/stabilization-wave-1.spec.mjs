import { test, expect } from 'playwright/test'
import { fileAction, openMore } from '../../scripts/panel-controls.mjs'

test.setTimeout(60_000)

const looks = ['powder', 'instrument', 'vintage', 'learner']
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
async function load(page, type, values = {}, look = 'instrument') {
  const result = await page.evaluate(
    async ({ type, values, look }) => {
      const { panelFixture } = await import('/src/testing/panelCases.ts')
      const { generate } = await import('/src/codegen/generate.ts')
      const { replaceSource } = await import('/scripts/editor-browser.mjs')
      const patch = panelFixture(type, values)
      patch.modules.forEach((m) => {
        if (m.type === type) m.look = look
      })
      const text = generate(patch)
      replaceSource(text)
      return { id: `${type}1`, text, patch }
    },
    { type, values, look },
  )
  await expect.poll(() => source(page)).toBe(result.text)
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
  await expect(page.locator(`[data-module="${result.id}"]`)).toHaveClass(new RegExp(`look-${look}`))
  await page.getByLabel('Rack zoom', { exact: true }).selectOption('1')
  return result
}

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(() => document.fonts.ready)
})

test('supersaw fits note and freq in every Hardware look and preserves the complete file', async ({
  page,
}) => {
  for (const look of looks)
    for (const mode of ['note', 'freq']) {
      const fixture = await load(
        page,
        'osc',
        { wave: 'supersaw', mode, voices: 7, detune: 0.3, spread: 0.8 },
        look,
      )
      const panel = page.locator('[data-module="osc1"]')
      const overflow = await panel.locator('.module-controls').evaluate((e) => ({
        content: e.scrollHeight,
        area: e.clientHeight,
        width: e.scrollWidth,
        client: e.clientWidth,
      }))
      expect(overflow.content, `${look}/${mode}`).toBeLessThanOrEqual(overflow.area + 1)
      expect(overflow.width).toBeLessThanOrEqual(overflow.client + 1)
      const more = await openMore(panel)
      for (const label of ['VOICES', 'DETUNE', 'SPREAD'])
        await expect(more.getByRole('button', { name: `Set ${label}`, exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      expect(await source(page)).toBe(fixture.text)
      const reopened = await page.evaluate(async (text) => {
        const { read } = await import('/src/reader/index.ts')
        const { sourceBody } = await import('/src/workspace/document.ts')
        const document = read(text)
        return {
          patch: document.patch,
          body: sourceBody(document.source),
          expectedBody: sourceBody(text),
        }
      }, fixture.text)
      expect(reopened.body).toBe(reopened.expectedBody)
      for (const call of ['.s("supersaw")', '.unison(7)', '.detune(0.3)', '.spread(0.8)'])
        expect(reopened.body).toContain(call)
      expect(reopened.patch).toEqual(fixture.patch)
    }
})

test('SPLICE marks span the strip and follow COUNT in every Hardware look', async ({ page }) => {
  for (const look of looks) {
    await load(page, 'splice', {}, look)
    const panel = page.locator('[data-module="splice1"]')
    expect(
      await panel.locator('.module-controls').evaluate((e) => e.scrollHeight - e.clientHeight),
      look,
    ).toBeLessThanOrEqual(1)
    for (const count of [4, 8, 3]) {
      await panel.getByRole('button', { name: 'Set SLICES', exact: true }).click()
      await panel.getByRole('textbox', { name: 'SLICES', exact: true }).fill(String(count))
      await page.keyboard.press('Enter')
      await expect(panel.locator('.razor-marks i')).toHaveCount(count)
      const geometry = await panel.locator('.razor-marks').evaluate((e) => ({
        width: e.clientWidth,
        xs: [...e.children].map((c) => c.getBoundingClientRect().x),
        zoom: e.getBoundingClientRect().width / e.offsetWidth,
      }))
      expect(geometry.width, look).toBeGreaterThan(60)
      for (let i = 1; i < count; i++)
        expect(geometry.xs[i] - geometry.xs[i - 1]).toBeCloseTo(
          (geometry.width * geometry.zoom) / count,
          0,
        )
    }
  }
})

test('More Escape preserves status even after a committed control drops focus', async ({
  page,
}) => {
  await load(page, 'mix')
  const panel = page.locator('[data-module="mix1"]')
  const status = page.locator('.rack-status')
  const before = await status.textContent()
  const more = await openMore(panel)
  await more.getByLabel('NAME 1', { exact: true }).fill('discard')
  await page.keyboard.press('Escape')
  await expect(more).toBeHidden()
  await expect(status).toHaveText(before)
  await load(page, 'smpl')
  const flyout = await openMore(page.locator('[data-module="smpl1"]'))
  await flyout.getByRole('button', { name: 'Set CUT', exact: true }).click()
  await flyout.getByRole('textbox', { name: 'CUT', exact: true }).fill('2')
  await page.keyboard.press('Enter')
  await expect(flyout.getByRole('textbox', { name: 'CUT', exact: true })).toHaveCount(0)
  const committed = await status.textContent()
  await page.keyboard.press('Escape')
  await expect(flyout).toBeHidden()
  await expect(status).toHaveText(committed)
  await page.locator('[data-jack="smpl1:out"]').click()
  await expect(status).toContainText('Choose an input')
  await page.keyboard.press('Escape')
  await expect(status).toHaveText('Cancelled')
  await expect(page.locator('.provisional')).toHaveCount(0)
  const beforePlacement = await source(page)
  await page.getByRole('searchbox', { name: 'Filter modules' }).fill('LFO')
  const chip = page.getByRole('button', { name: 'Add LFO', exact: true })
  const start = await chip.boundingBox()
  const rack = await page.locator('.rack-scroll').boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 4 })
  await page.mouse.move(rack.x + 180, rack.y + 80, { steps: 12 })
  await page.mouse.move(rack.x + 181, rack.y + 81)
  await expect(page.locator('.placement-ghost')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.placement-ghost')).toHaveCount(0)
  await expect(page.locator('[data-module="lfo1"]')).toHaveCount(0)
  expect(await source(page)).toBe(beforePlacement)
})

test('every catalog name keeps whole words with loaded fonts in the 180px dock', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const geometry = await page.locator('.chip-name').evaluateAll(async (names) => {
    await document.fonts.ready
    return names.map((e) => {
      const text = e.firstChild
      const words = [...e.textContent.matchAll(/\S+/g)].map((match) => {
        const range = document.createRange()
        range.setStart(text, match.index)
        range.setEnd(text, match.index + match[0].length)
        return {
          word: match[0],
          rects: [...range.getClientRects()].map((r) => ({ x: r.x, right: r.right, y: r.y })),
        }
      })
      const r = e.getBoundingClientRect()
      return {
        name: e.textContent,
        words,
        x: r.x,
        right: r.right,
        accessible: e.closest('button').getAttribute('aria-label'),
        font: document.fonts.check('700 13px "Barlow Condensed"'),
      }
    })
  })
  expect(geometry.length).toBeGreaterThan(50)
  for (const item of geometry) {
    expect(item.font).toBe(true)
    expect(item.accessible).toBe(`Add ${item.name}`)
    for (const word of item.words) {
      expect(word.rects.length, `${item.name}: ${word.word}`).toBe(1)
      expect(word.rects[0].x).toBeGreaterThanOrEqual(item.x - 1)
      expect(word.rects[0].right).toBeLessThanOrEqual(item.right + 1)
    }
  }
  expect(await page.locator('.library').evaluate((e) => e.getBoundingClientRect().width)).toBe(180)
  const filter = page.getByRole('searchbox', { name: 'Filter modules' })
  await filter.fill('ATTENUVERTER')
  await expect(page.locator('.chip')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Add ATTENUVERTER', exact: true })).toBeVisible()
  await filter.fill('.slice(')
  await expect(page.getByRole('button', { name: 'Add SPLICE', exact: true })).toBeVisible()
})

test('native cable hover and selection cover gaps while dim cables pass through', async ({
  page,
}) => {
  for (const kind of ['pattern', 'function', 'audio-mod']) {
    await page.evaluate(async (kind) => {
      const { replaceSource } = await import('/scripts/editor-browser.mjs')
      const { generate } = await import('/src/codegen/generate.ts')
      const { routingFixture } = await import('/src/testing/routingCases.ts')
      replaceSource(
        kind === 'audio-mod'
          ? generate(routingFixture('audio-mod'))
          : kind === 'function'
            ? 'note("c3 e3").s("sine").chunk(4,x=>x.rev())\n'
            : 'note("c3 e3").s("sine")\n',
      )
    }, kind)
    await expect(page.locator(`.cable.signal-${kind}`).first()).toBeAttached()
    await page.getByRole('button', { name: 'All cables', exact: true }).click()
    await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
    const paint = page.locator(`.cable.signal-${kind}`).first().locator('.cable-paint')
    await expect(paint).toHaveCSS('stroke-width', kind === 'audio-mod' ? '7px' : '5px')
    await expect(paint).toHaveCSS(
      'stroke-dasharray',
      kind === 'pattern' ? '1px, 8px' : kind === 'function' ? '16px, 4px, 3px, 4px' : 'none',
    )
    const hitPath = page.locator(`.cable.signal-${kind}`).first().locator('.cable-hit')
    await expect(hitPath).toHaveCSS('stroke-dasharray', 'none')
    if (kind === 'audio-mod') {
      const core = page.locator('.audio-mod-core').first()
      await expect(core).toHaveCSS('stroke-width', '3px')
      await expect(core).toHaveCSS('stroke-dasharray', '3px, 7px')
    }
    // Sample actual generated curves away from controls/jacks and viewport clipping.
    const points = await page
      .locator(`.cable.signal-${kind}`)
      .first()
      .evaluate((g) => {
        const path = g.querySelector('path:not(.cable-shadow)')
        const matrix = path.getScreenCTM()
        const points = []
        for (let d = 20; d < path.getTotalLength() - 20; d += 2) {
          const p = path.getPointAtLength(d).matrixTransform(matrix)
          const top = document.elementFromPoint(p.x, p.y)
          if (
            !top ||
            p.x < 195 ||
            p.y < 175 ||
            p.y > innerHeight - 150 ||
            top.closest('button,input,select,textarea,[data-jack],.module-header')
          )
            continue
          points.push({ x: p.x, y: p.y, hit: top.closest('.cable') === g })
        }
        return points
      })
    expect(points.length, kind).toBeGreaterThan(10)
    expect(
      points.filter((p) => !p.hit),
      `${kind} missed curve points`,
    ).toEqual([])
    const point = points[Math.floor(points.length / 2)]
    await page.mouse.move(point.x, point.y)
    if (kind === 'pattern') await expect(page.locator('.cable-probe')).toBeVisible()
    await page.mouse.click(point.x, point.y)
    await expect(page.locator(`.cable.signal-${kind}.selected-cable`)).toHaveCount(1)
    await page.getByRole('button', { name: 'Dim cables', exact: true }).click()
    const hit = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.cable'),
      point,
    )
    expect(hit).toBe(false)
  }
})

for (const [width, expected] of [
  [1280, 64],
  [1600, 64],
  [1920, 84],
  [2200, 104],
]) {
  test(`new patches retain the default rail width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fileAction(page, 'New patch')
    await expect(page.getByLabel('Rail width', { exact: true })).toHaveValue(String(expected))
    expect(await page.locator('.library').evaluate((e) => e.getBoundingClientRect().width)).toBe(
      180,
    )
  })
}
