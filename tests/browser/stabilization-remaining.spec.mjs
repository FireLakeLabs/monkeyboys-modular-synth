import { test, expect } from 'playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })
async function load(page, source) {
  await page.evaluate(async (source) => {
    const { load } = await import('/scripts/rack-feel-check.mjs')
    await load(source)
  }, source)
}
const source = Array.from(
  { length: 8 },
  (_, i) => `$: note("c${(i % 4) + 2}").s("sine").lpf(800).gain(.1)\n`,
).join('')
test('overview draws every cable and navigates by pointer and keyboard without changing source', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await load(page, source)
  await page.getByLabel('Rack zoom').selectOption('fit')
  await expect(page.locator('.rack-frame')).toHaveAttribute('data-overview', 'true')
  const before = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  const geometry = await page.evaluate(async () => {
    await document.fonts.ready
    const { read } = await import('/src/reader/index.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    return {
      cables: read(editorSource()).patch.cables.length,
      drawn: document.querySelectorAll('.cables g.cable').length,
      enabledJacks: document.querySelectorAll('[data-jack]:enabled').length,
      scrollbars: [...document.querySelectorAll('.module-controls,.patch-box')].filter(
        (el) => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight,
      ).length,
    }
  })
  expect(geometry.drawn).toBe(geometry.cables)
  expect(geometry.enabledJacks).toBe(0)
  expect(geometry.scrollbars).toBe(0)
  await page.screenshot({ path: 'docs/evidence/stabilization-remaining/overview.png' })
  await page.getByRole('button', { name: 'Zoom to vcf1', exact: true }).click()
  await expect(page.getByLabel('Rack zoom')).toHaveValue('1')
  const targets = await page.locator('[data-jack]:enabled').evaluateAll((jacks) =>
    jacks.map((jack) => ({
      width: jack.getBoundingClientRect().width,
      height: jack.getBoundingClientRect().height,
    })),
  )
  expect(targets.every((rect) => rect.width >= 24 && rect.height >= 24)).toBe(true)
  await page.getByLabel('Rack zoom').selectOption('0.75')
  expect(
    await page.locator('[data-jack]:enabled').evaluateAll((jacks) =>
      jacks.every((jack) => {
        const rect = jack.getBoundingClientRect()
        return rect.width >= 24 && rect.height >= 24
      }),
    ),
  ).toBe(true)
  await page.getByLabel('Rack zoom').selectOption('fit')
  await page.getByRole('button', { name: 'Zoom to osc1', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Rack zoom')).toHaveValue('1')
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toBe(before)
})

test('overview Connections selects removes and repatches cables without using jacks', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await load(page, source)
  await page.getByLabel('Rack zoom').selectOption('fit')
  await page.getByText(/^Connections \(/).click()
  const connections = page.locator('.connections.rack-popover')
  const first = connections.locator('div > button').first()
  await first.click()
  await page.getByRole('button', { name: 'Move destination', exact: true }).click()
  await expect(connections.locator('fieldset')).toBeVisible()
  await connections.getByRole('button', { name: 'osc2:note', exact: true }).click()
  const moved = await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    return read(editorSource()).patch.cables.find((cable) => cable.from.module === 'seq1')?.to
  })
  expect(moved).toEqual({ module: 'osc2', jack: 'note' })
  await expect(page.locator('.rack-frame')).toHaveAttribute('data-overview', 'true')
  await connections.locator('div > button').first().click()
  const count = await connections.locator('div > button').count()
  await page.getByRole('button', { name: 'Remove cable', exact: true }).click()
  await expect(connections.locator('div > button')).toHaveCount(count - 1)
})

test('Trance import fits both dimensions and supports readable module navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  const result = await page.evaluate(async () => {
    const { libraryPatches } = await import('/src/library/catalog.ts')
    const { read } = await import('/src/reader/index.ts')
    const { saveLayout, sourceBody } = await import('/src/workspace/document.ts')
    const entry = libraryPatches().find((entry) => entry.id === 'switch-angel-trance-demo')
    await (await import('/scripts/rack-feel-check.mjs')).load(entry.source)
    const document = read(entry.source)
    const saved = saveLayout(document)
    return {
      rows: document.patch.rows,
      width: document.patch.railHp,
      sourceExact: sourceBody(saved.source) === entry.source,
      savedIdentity: JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    }
  })
  expect(result.rows).toBeLessThan(8)
  expect(result.width).toBeGreaterThan(64)
  expect(result.sourceExact).toBe(true)
  expect(result.savedIdentity).toBe(true)
  await page.getByLabel('Rack zoom').selectOption('fit')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'docs/evidence/stabilization-remaining/trance-fit.png' })
  await page.getByRole('button', { name: 'Zoom to code1', exact: true }).click()
  await expect(page.getByLabel('Rack zoom')).toHaveValue('1')
  await expect(page.locator('[data-module="code1"] .module-header')).toBeInViewport()
  await page.screenshot({ path: 'docs/evidence/stabilization-remaining/trance-detail.png' })
})

test('native sound drag highlights panels and selection plus Enter assigns a seated sound', async ({
  page,
}) => {
  await page.route('https://stabilization.example/strudel.json', (route) =>
    route.fulfill({
      json: {
        _base: 'https://stabilization.example/',
        fixture: ['hit.wav'],
        wt_fixture: ['wave.wav'],
      },
    }),
  )
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    let patch = {
      ...m.starterPatch(104),
      cartridges: [{ source: 'https://stabilization.example/strudel.json' }],
    }
    for (const [type, hp] of [
      ['smpl', 0],
      ['reverb', 10],
      ['splice', 20],
      ['wavetable', 34],
      ['drums', 48],
      ['vcf', 64],
    ])
      patch = m.placeModule(patch, type, 0, hp)
    patch = m.setValue(patch, 'drums1', 'grid', '[bd ~]*2, [sd ~]*4, hh*4')
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
  })
  await page.getByLabel('Rack zoom').selectOption('1')
  await page.getByRole('tab', { name: 'Sounds', exact: true }).click()
  const card = page.getByRole('button', { name: 'Audition fixture:0', exact: true })
  await expect(card).toBeVisible()
  const panel = page.locator('[data-module="smpl1"]')
  await panel.locator('.module-header').click()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-module="smpl1"] .sample-slot')).toHaveAttribute(
    'data-value',
    'fixture:0',
  )
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const from = await card.boundingBox()
  const to = await panel.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 10 })
  await expect(panel).toHaveAttribute('data-sound-target', 'true')
  await expect(page.locator('[data-module="wavetable1"]')).toHaveAttribute(
    'data-sound-target',
    'false',
  )
  await expect(page.locator('[data-module="vcf1"]')).toHaveAttribute('data-sound-target', 'false')
  await page.screenshot({ path: 'docs/evidence/stabilization-remaining/sound-drag.png' })
  await page.mouse.up()
  await expect(page.locator('[data-module="smpl1"] .sample-slot')).toHaveAttribute(
    'data-value',
    'fixture:0',
  )
  await expect(panel).not.toHaveAttribute('data-sound-target')
  await page.locator('[data-module="splice1"] .module-header').click()
  await card.dblclick()
  await expect(page.locator('[data-module="splice1"] .sample-slot')).toHaveAttribute(
    'data-value',
    'fixture:0',
  )
  await page.locator('[data-module="wavetable1"] .sample-readout').click()
  const picker = page.getByRole('dialog', { name: 'Choose sound for wavetable1' })
  await picker.getByRole('combobox', { name: 'Search sounds' }).fill('fixture')
  const choices = await picker
    .getByRole('option')
    .evaluateAll((options) => options.map((option) => option.getAttribute('aria-label')))
  expect(choices).toEqual([expect.stringMatching(/^wt_fixture:0,/)])
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  let unchanged = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  await page.locator('[data-module="vcf1"] .module-header').click()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.sound-crate output')).toContainText('refused')
  await expect(page.locator('.sound-crate output')).toContainText(
    'selected module does not accept sounds',
  )
  await page.locator('[data-module="drums1"] .module-header').click()
  await card.focus()
  await page.keyboard.press('Enter')
  const chooser = page.getByRole('dialog', { name: 'Choose DRUMS row' })
  await expect(chooser).toBeVisible()
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toBe(unchanged)
  await page.keyboard.press('Escape')
  await expect(chooser).toHaveCount(0)
  await expect(card).toBeFocused()
  const beforeRows = await page.evaluate(
    async () =>
      (await import('/src/reader/index.ts')).read(
        (await import('/scripts/editor-browser.mjs')).editorSource(),
      ).patch,
  )
  await card.dblclick()
  await expect(chooser).toBeVisible()
  await expect(chooser.getByRole('button').first()).toBeFocused()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'docs/evidence/stabilization-remaining/drums-row-chooser.png' })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(chooser).toHaveCount(0)
  const afterRows = await page.evaluate(
    async () =>
      (await import('/src/reader/index.ts')).read(
        (await import('/scripts/editor-browser.mjs')).editorSource(),
      ).patch,
  )
  expect(afterRows).toEqual({
    ...beforeRows,
    modules: beforeRows.modules.map((module) =>
      module.id === 'drums1'
        ? { ...module, values: { ...module.values, grid: '[bd ~]*2, [fixture:0 ~]*4, hh*4' } }
        : module,
    ),
  })
  unchanged = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  await page.getByLabel('Rack zoom').selectOption('fit')
  const dragFrom = await card.boundingBox()
  const dragTo = await panel.boundingBox()
  await page.mouse.move(dragFrom.x + dragFrom.width / 2, dragFrom.y + dragFrom.height / 2)
  await page.mouse.down()
  await page.mouse.move(dragFrom.x + dragFrom.width / 2 + 12, dragFrom.y + dragFrom.height / 2, {
    steps: 5,
  })
  await page.mouse.move(dragTo.x + dragTo.width / 2, dragTo.y + 30, { steps: 10 })
  await expect(page.locator('.module-panel[data-sound-target]')).toHaveCount(0)
  await page.mouse.up()
  await expect(page.getByLabel('Rack zoom')).toHaveValue('fit')
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toBe(unchanged)
  await page.getByRole('button', { name: 'Zoom to smpl1', exact: true }).click()
  await expect(page.getByLabel('Rack zoom')).toHaveValue('1')
})

for (let attempt = 1; attempt <= 3; attempt++) {
  test(`bounded natural sample probes attempt ${attempt}`, async ({ page }, info) => {
    const { installSampleDiagnostics } = await import('../../scripts/sample-diagnostics.mjs')
    const diagnostics = await installSampleDiagnostics(page)
    await page.goto('/')
    await page.locator('.cm-content').waitFor()
    await page.evaluate(async () => {
      window.auditMeasure = (await import('/scripts/library-check.mjs')).installAudioProbe()
    })
    const observations = []
    try {
      for (const fixture of ['soft', 'exercise-smpl']) {
        await page.evaluate(async (fixture) => {
          const { load } = await import('/scripts/rack-feel-check.mjs')
          const { libraryPatches } = await import('/src/library/catalog.ts')
          await load(
            fixture === 'soft'
              ? '$: s("bd*2").soft().gain(0.1)\n'
              : libraryPatches().find((entry) => entry.id === 'exercise-smpl').source,
          )
        }, fixture)
        await page.getByRole('button', { name: 'Play', exact: true }).click()
        await expect(page.locator('.transport-status')).toHaveText('Playing')
        const pcm = await page.evaluate(() => window.auditMeasure())
        observations.push({
          fixture,
          attempt,
          pcm,
          source: await page.evaluate(async () =>
            (await import('/scripts/editor-browser.mjs')).editorSource(),
          ),
          diagnostics: await diagnostics(),
        })
        await page.getByRole('button', { name: 'Stop', exact: true }).click()
        expect(pcm.rms).toBeGreaterThan(0.0001)
      }
    } finally {
      await mkdir(info.outputPath(), { recursive: true })
      await writeFile(
        info.outputPath('natural-probes.json'),
        JSON.stringify(
          {
            observations,
            conditions:
              'Fresh context per attempt; soft then SMPL; caches not explicitly cleared; no concurrent review or suite.',
          },
          null,
          2,
        ),
      )
      await info.attach('natural-probes', {
        body: JSON.stringify({
          observations,
          conditions:
            'Fresh browser context per attempt; soft then SMPL in same context; network/resource caches not explicitly cleared; no review or other local suite running.',
          physicalListening: false,
        }),
        contentType: 'application/json',
      })
    }
  })
}

test('injected fetch and decode failures remain distinguishable from readiness', async ({
  page,
}, info) => {
  const { installSampleDiagnostics } = await import('../../scripts/sample-diagnostics.mjs')
  const diagnostics = await installSampleDiagnostics(page)
  await page.route('https://stabilization.example/missing.wav', (route) => route.abort('failed'))
  let releaseRequest
  const held = new Promise((resolve) => {
    releaseRequest = resolve
  })
  await page.route('https://stabilization.example/pending.wav', (route) => releaseRequest(route))
  await page.goto('/')
  await page.evaluate(() => {
    fetch('https://stabilization.example/pending.wav').catch(() => {})
  })
  const pendingRoute = await held
  const pendingSnapshot = await diagnostics()
  expect(
    pendingSnapshot.requests.find((request) => request.url.endsWith('pending.wav'))?.state,
  ).toBe('requested')
  const failed = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('pending.wav'),
  )
  await pendingRoute.abort('failed')
  await failed
  const failedSnapshot = await diagnostics()
  expect(
    failedSnapshot.requests.find((request) => request.url.endsWith('pending.wav'))?.state,
  ).toBe('failed')
  expect(
    pendingSnapshot.requests.find((request) => request.url.endsWith('pending.wav'))?.state,
  ).toBe('requested')
  await page.evaluate(async () => {
    await fetch('https://stabilization.example/missing.wav').catch(() => {})
    const context = new AudioContext()
    await context.decodeAudioData(new ArrayBuffer(4)).catch(() => {})
    await context.close()
  })
  const evidence = await diagnostics()
  expect(
    evidence.requests.some((request) => request.url.endsWith('missing.wav') && request.error),
  ).toBe(true)
  expect(evidence.browser.decodes.some((decode) => decode.state === 'failed')).toBe(true)
  await mkdir(info.outputPath(), { recursive: true })
  await writeFile(
    info.outputPath('injected-failure.json'),
    JSON.stringify({ injected: true, historicalCause: 'unknown', evidence }, null, 2),
  )
  await info.attach('injected-failure', {
    body: JSON.stringify({ injected: true, historicalCause: 'unknown', evidence }),
    contentType: 'application/json',
  })
})

test('a clipped off-screen MIX endpoint stays at the rail viewport edge', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    let patch = m.placeModule(m.starterPatch(104), 'mix', 0, 84, 'mix1')
    patch = m.placeModule(patch, 'lfo', 0, 0)
    patch = m.connect(patch, { module: 'lfo1', jack: 'out' }, { module: 'mix1', jack: 'cv1' })
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
    await document.fonts.ready
  })
  await page.getByLabel('Rack zoom').selectOption('1')
  await page.addStyleTag({
    content:
      '[data-module="mix1"] .patch-box {max-height:40px; min-height:40px; flex:0 0 40px; overflow:auto}',
  })
  await page.waitForTimeout(80)
  const geometry = await page.evaluate(() => {
    const cable = [...document.querySelectorAll('.cable')].find((g) =>
      g.querySelector('title').textContent.includes('lfo1:out → mix1:cv1'),
    )
    const path = cable.querySelector('.cable-paint')
    const endpoint = path
      .getPointAtLength(path.getTotalLength())
      .matrixTransform(path.getScreenCTM())
    const view = document.querySelector('.rack-scroll').getBoundingClientRect()
    return {
      endpoint: { x: endpoint.x, y: endpoint.y },
      view: { right: view.right, bottom: view.bottom },
    }
  })
  expect(geometry.endpoint.x).toBeLessThanOrEqual(geometry.view.right + 1)
  expect(geometry.endpoint.y).toBeLessThanOrEqual(geometry.view.bottom + 1)
})

test('overview retains pinned OUT volume and tempo controls without enabling jacks', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await load(page, 'setcpm(120/4)\n' + source)
  await page.getByLabel('Rack zoom').selectOption('fit')
  const output = page.locator('.output-surface .module-panel')
  await expect(output.locator('.module-controls')).not.toHaveAttribute('inert')
  const volume = output.getByRole('slider', { name: 'VOL', exact: true })
  const before = Number(await volume.getAttribute('aria-valuenow'))
  await volume.focus()
  await page.keyboard.press('ArrowDown')
  await expect
    .poll(async () => Number(await volume.getAttribute('aria-valuenow')))
    .toBeLessThan(before)
  await output.getByRole('button', { name: 'Set BPM', exact: true }).click()
  await output.getByRole('textbox', { name: 'BPM', exact: true }).fill('130')
  await page.keyboard.press('Enter')
  await expect(output.getByRole('button', { name: 'Set BPM', exact: true })).toHaveText('130')
  await expect(page.getByLabel('Rack zoom')).toHaveValue('fit')
  await expect(output.locator('[data-jack]')).toBeDisabled()
})

test('moving an overview canvas cable opens its complete destination chooser', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await load(page, source)
  await page.getByLabel('Rack zoom').selectOption('fit')
  const point = await page.locator('.cable').evaluateAll((cables) => {
    const cable = cables.find((cable) =>
      cable.querySelector('title').textContent.startsWith('seq1:note → osc1:note'),
    )
    const path = cable.querySelector('.cable-hit')
    for (let distance = 5; distance < path.getTotalLength() - 5; distance += 2) {
      const point = path.getPointAtLength(distance).matrixTransform(path.getScreenCTM())
      if (document.elementFromPoint(point.x, point.y)?.closest('.cable') === cable)
        return { x: point.x, y: point.y }
    }
    return null
  })
  expect(point).not.toBeNull()
  await page.mouse.click(point.x, point.y)
  await page.getByRole('button', { name: 'Move destination', exact: true }).click()
  const connections = page.locator('.connections.rack-popover')
  await expect(connections.locator('fieldset')).toBeVisible()
  await connections.getByRole('button', { name: 'osc2:note', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { read } = await import('/src/reader/index.ts')
        const { editorSource } = await import('/scripts/editor-browser.mjs')
        return read(editorSource()).patch.cables.find((cable) => cable.from.module === 'seq1')?.to
          .module
      }),
    )
    .toBe('osc2')
})
