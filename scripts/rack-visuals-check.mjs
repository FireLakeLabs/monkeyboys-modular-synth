import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { panelLabelContrast } from './rack-contrast-check.mjs'

// Run against Vite: node scripts/rack-visuals-check.mjs [url] [evidence directory].
// Exercises presentation and native input only; it never starts audio.
const output = process.argv[3] ?? '/tmp/monkeyboy-rack-visuals'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const results = { browser: browser.version(), checks: [] }
const pass = (message) => {
  results.checks.push(message)
  process.stdout.write(`PASS ${message}\n`)
}
const source = () =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const panel = (id) => page.locator(`[data-module="${id}"]`)
const button = (name) => page.getByRole('button', { name, exact: true })
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173')
  await page.waitForSelector('.cm-content')
  await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).enableAutoApply())
  const matrix = await page.evaluate(async () =>
    (await import('/scripts/rack-feel-check.mjs')).verifyPanels(),
  )
  const combinations = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/modules/catalog.ts')
    const { looksFor } = await import('/src/modules/looks.ts')
    return CATALOG.reduce((sum, spec) => sum + looksFor(spec.family).length, 0)
  })
  assert.equal(
    matrix.reduce((sum, row) => sum + row.panels, 0),
    combinations * 3,
  )
  pass(
    `${combinations} module/look combinations at 100%, 75% and Fit retain widths, controls and jack targets`,
  )

  // The 104-HP family fixture must be visible when sampling painted pixels.
  await button('Focus rack').click()
  results.panelContrast = await panelLabelContrast(page)
  await button('Restore workspace').click()
  pass(
    'Visible default labels in all ten dimmed looks exceed 4.5:1 against sampled painted backgrounds',
  )

  await page.evaluate(async () => {
    const { starterPatch, placeModule, placementPosition, connect } =
      await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    let patch = starterPatch()
    for (const type of [
      'seq',
      'osc',
      'vcf',
      'vca',
      'env',
      'lfo',
      'delay',
      'reverb',
      'jux',
      'osc',
    ]) {
      const position = placementPosition(patch, type)
      patch = placeModule(patch, type, position.row, position.hp)
    }
    for (const [from, out, to, input] of [
      ['seq1', 'note', 'osc1', 'note'],
      ['osc1', 'out', 'vcf1', 'in'],
      ['vcf1', 'out', 'vca1', 'in'],
      ['vca1', 'out', 'jux1', 'in'],
      ['jux1', 'out', 'delay1', 'in'],
      ['delay1', 'out', 'reverb1', 'in'],
      ['reverb1', 'out', 'mix1', 'in1'],
      ['env1', 'out', 'vca1', 'cv'],
      ['lfo1', 'out', 'vcf1', 'cv'],
    ])
      patch = connect(patch, { module: from, jack: out }, { module: to, jack: input })
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
    const zoom = document.querySelector('[aria-label="Rack zoom"]')
    zoom.value = '1'
    zoom.dispatchEvent(new Event('change', { bubbles: true }))
  })
  // Resolve browser colour formats (including color-mix) through a canvas.
  const contrast = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d')
    const rgb = (color) => {
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (color) => {
      const [r, g, b] = rgb(color).map((value) => {
        const c = value / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return [...document.querySelectorAll('.module-panel.look-instrument')].map((panel) => {
      const band = getComputedStyle(panel.querySelector('.module-header'))
      const category = getComputedStyle(panel).getPropertyValue('--category')
      assertEqual(rgb(band.backgroundColor), rgb(category))
      const a = luminance(band.color),
        b = luminance(band.backgroundColor)
      return { id: panel.dataset.module, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
    })
    function assertEqual(a, b) {
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Header changed category colour')
    }
  })
  assert(
    contrast.every((entry) => entry.ratio >= 4.5),
    JSON.stringify(contrast),
  )
  results.headerContrast = contrast
  pass(
    'All six Instrument category bands keep exact colours whether routed or not; header text exceeds 4.5:1',
  )
  assert.match(await panel('osc2').getAttribute('aria-label'), /not connected to OUT/)
  const statusLight = () =>
    panel('osc2')
      .locator('.module-dot')
      .evaluate((element) => {
        const { backgroundColor } = getComputedStyle(element)
        return { backgroundColor, title: element.title }
      })
  assert.deepEqual(await statusLight(), {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    title: 'Not connected to OUT',
  })
  await page.locator('[data-jack="osc2:out"]').click()
  await page.locator('[data-jack="mix1:in2"]').click()
  await page.waitForFunction(
    () => !document.querySelector('[data-module=osc2]').classList.contains('inactive'),
  )
  assert.doesNotMatch(await panel('osc2').getAttribute('aria-label'), /not connected/)
  assert.deepEqual(await statusLight(), {
    backgroundColor: 'rgb(47, 210, 122)',
    title: 'Connected to OUT',
  })
  await page.locator('.connections summary').click()
  await page.getByRole('button', { name: /osc2:out → mix1:in2/ }).click()
  await button('Remove cable').click()
  await page.waitForFunction(() =>
    document.querySelector('[data-module=osc2]').classList.contains('inactive'),
  )
  pass(
    'Native cable connection lights the spare OSC status light and changes its accessible name; disconnection empties it',
  )

  // These outputs already have cables: their centers must still receive native
  // pointer input above the cable SVG in both Hardware and Alien panels.
  for (const [sourceJack, input] of [
    ['osc1:out', 'mix1:in2'],
    ['jux1:out', 'mix1:in3'],
  ]) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator(`[data-jack="${sourceJack}"]`).click({ timeout: 3000 })
    await page.locator(`[data-jack="${input}"]`).click({ timeout: 3000 })
    const connection = page.getByRole('button', { name: `${sourceJack} → ${input}`, exact: true })
    await connection.click()
    await button('Remove cable').click()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  const beforeReplace = await source()
  await page.locator('[data-jack="osc2:out"]').click()
  await page.locator('[data-jack="mix1:in1"]').click({ timeout: 3000 })
  await page.locator('.replace-prompt').getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await source(), beforeReplace)
  await page.locator('[data-jack="osc2:out"]').click()
  await page.locator('[data-jack="mix1:in1"]').click({ timeout: 3000 })
  await page
    .locator('.replace-prompt')
    .getByRole('button', { name: 'Replace', exact: true })
    .click()
  assert.equal(
    await page.getByRole('button', { name: 'reverb1:out → mix1:in1', exact: true }).count(),
    0,
  )
  await button('Undo').click()
  assert.equal(await source(), beforeReplace)
  pass(
    'Connected Hardware/Alien outputs accept fan-out; occupied input supports Cancel, Replace and exact Undo',
  )

  const before = await source()
  const visibility = page.getByRole('group', { name: 'Cable visibility', exact: true })
  await visibility.waitFor({ timeout: 3000 })
  assert.equal(await button('Focus cables').getAttribute('aria-pressed'), 'true')
  await button('Select seq1').click()
  await page.mouse.move(20, 20)
  async function checkFade(id) {
    const cables = await page.locator('.cable').evaluateAll((cables) =>
      cables.map((cable) => ({
        title: cable.querySelector('title').textContent,
        opacity: Number(getComputedStyle(cable).opacity),
      })),
    )
    assert(cables.some((cable) => cable.title.includes(id + ':')))
    assert(cables.some((cable) => !cable.title.includes(id + ':')))
    for (const cable of cables) assert.equal(cable.opacity < 0.1, !cable.title.includes(id + ':'))
  }
  await checkFade('seq1')
  assert.match(await visibility.innerText(), /seq1.*selected/)
  await panel('vcf1').locator('.module-header').hover()
  await checkFade('vcf1')
  assert.match(await visibility.innerText(), /vcf1.*hovered/)
  await page.mouse.move(20, 20)
  await checkFade('seq1')
  assert.match(await visibility.innerText(), /seq1.*selected/)
  pass(
    'Selection fades unrelated cables; native hover takes precedence and leaving restores selection',
  )
  const cableOpacities = () =>
    page
      .locator('.cable')
      .evaluateAll((cables) => cables.map((cable) => Number(getComputedStyle(cable).opacity)))
  await button('All cables').click()
  assert((await cableOpacities()).every((opacity) => opacity === 1))
  assert.match(await visibility.innerText(), /All cables visible/)
  await panel('vcf1').locator('.module-header').hover()
  assert((await cableOpacities()).every((opacity) => opacity === 1))
  await page.mouse.move(20, 20)
  assert((await cableOpacities()).every((opacity) => opacity === 1))
  await button('Focus cables').click()
  await checkFade('seq1')
  await button('Dim cables').click()
  assert.equal(await button('Dim cables').getAttribute('aria-pressed'), 'true')
  assert.match(await visibility.innerText(), /All cables dimmed/)
  const activeStyle = await button('Dim cables').evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  assert.notEqual(
    activeStyle,
    await button('All cables').evaluate((element) => getComputedStyle(element).backgroundColor),
  )
  assert.equal(await visibility.locator('button[aria-pressed=true]').count(), 1)
  await panel('vcf1').locator('.module-header').hover()
  assert((await cableOpacities()).every((opacity) => opacity <= 0.1))
  await page.mouse.move(20, 20)
  assert((await cableOpacities()).every((opacity) => opacity <= 0.1))
  assert(
    await page
      .locator('.cable')
      .evaluateAll((cables) =>
        cables.every(
          (cable) =>
            Number(getComputedStyle(cable).opacity) <= 0.1 &&
            getComputedStyle(cable.querySelector('path:not(.cable-shadow)')).pointerEvents ===
              'none',
        ),
      ),
  )
  await button('All cables').click()
  assert((await cableOpacities()).every((opacity) => opacity === 1))
  await button('Focus cables').focus()
  await page.keyboard.press('Space')
  await checkFade('seq1')
  assert.equal(await source(), before)
  pass(
    'Dim cables fades every cable, lets controls receive pointer input and changes no saved source',
  )
  pass(
    'All/Focus/Dim visibly identify one active mode, explain hover/selection and support keyboard changes without source edits',
  )
  await button('Dim cables').click()
  await panel('jux1').locator('select').selectOption('fast2')
  assert.equal(await panel('jux1').locator('select').inputValue(), 'fast2')
  await panel('jux1').locator('select').selectOption('rev')
  await button('Focus cables').click()
  assert.match(await page.locator('[data-jack="jux1:out"]').getAttribute('aria-label'), /audio/)
  pass('JUX RIGHT remains operable through dimmed cables; passthrough jacks announce audio')

  const signals = await page.evaluate(() =>
    ['pattern', 'audio', 'mod'].map((signal) => {
      const cable = document.querySelector(`.cable.signal-${signal} path:not(.cable-shadow)`)
      const jack = document.querySelector(`.jack.signal-${signal}`)
      const mark = getComputedStyle(jack, '::after')
      return {
        signal,
        stroke: getComputedStyle(cable).stroke,
        dash: getComputedStyle(cable).strokeDasharray,
        mark: [mark.borderRadius, mark.transform],
        name: jack.getAttribute('aria-label'),
      }
    }),
  )
  assert.equal(new Set(signals.map((entry) => entry.dash)).size, 3)
  assert.equal(new Set(signals.map((entry) => JSON.stringify(entry.mark))).size, 3)
  for (const entry of signals) assert(entry.name.includes(entry.signal))
  assert.deepEqual(
    signals.map((entry) => entry.stroke),
    ['rgb(230, 211, 95)', 'rgb(244, 164, 98)', 'rgb(125, 185, 246)'],
  )
  results.signals = signals
  await button('Undo').click()
  await button('Redo').click()
  await page.mouse.move(20, 20)
  await page.screenshot({ path: `${output}/mixed-rack.png` })
  await page.evaluate(() => {
    document.documentElement.style.filter = 'grayscale(1)'
  })
  await page.screenshot({ path: `${output}/signals-greyscale.png` })
  await page.evaluate(() => {
    document.documentElement.style.filter = ''
  })
  pass(
    'Pattern dots/square marks, solid audio/circles and mod dashes/diamonds retain signal colours and accessible names',
  )

  const trance = await page.evaluate(async () =>
    (await import('/scripts/trance-check.mjs')).loadTrance(),
  )
  const tranceSource = await source()
  await button('Dim cables').click()
  await page.setViewportSize({ width: 1600, height: Math.max(1800, trance.rows * 440 + 320) })
  const readable = await page.locator('.module-panel').evaluateAll((panels) =>
    panels.every((panel) =>
      [
        ...panel.querySelectorAll(
          'select, .segments, .toggle-control, textarea, pre, .text-control button',
        ),
      ].every((element) => {
        element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + Math.min(5, rect.height / 2),
        )
        return hit && element.contains(hit)
      }),
    ),
  )
  assert(readable, 'A cable intercepts a trance selector or CODE control')
  assert.equal(await source(), tranceSource)
  await page.screenshot({ path: `${output}/trance-dim.png` })
  results.trance = trance
  pass(
    'All 29 trance panels expose their selectors and CODE text with cables dimmed; exact source is unchanged',
  )
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n')
} finally {
  await browser.close()
}
