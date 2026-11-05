import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { fileAction } from './panel-controls.mjs'

// node scripts/output-panel-browser.mjs [url] [evidence directory]
const output = process.argv[3] ?? '/tmp/monkeyboy-output-panel'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const results = { browser: browser.version(), cases: [] }
try {
  results.defaults = []
  for (const [width, expected] of [
    [900, 64],
    [1920, 84],
    [2200, 104],
  ]) {
    const probe = await browser.newPage({ viewport: { width, height: 900 } })
    probe.on('pageerror', (error) => errors.push(error.message))
    await probe.goto(process.argv[2] ?? 'http://127.0.0.1:5173')
    await probe.waitForSelector('.cm-content')
    assert.equal(
      await probe.getByLabel('Rail width', { exact: true }).inputValue(),
      String(expected),
    )
    await probe.setViewportSize({ width: 1600, height: 900 })
    assert.equal(
      await probe.getByLabel('Rail width', { exact: true }).inputValue(),
      String(expected),
    )
    await fileAction(probe, 'New patch')
    await probe.waitForFunction(
      () => document.querySelector('[aria-label="Rail width"]').value === '64',
    )
    results.defaults.push({ width, initial: expected, afterResize: expected, newAt1600: 64 })
    await probe.close()
  }
  process.stdout.write(
    'PASS window-based defaults, fixed saved width on resize, and New patch width selection\n',
  )
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173')
  await page.waitForSelector('.cm-content')
  for (const width of [1600, 1024, 900]) {
    await page.setViewportSize({ width, height: width <= 1150 ? 768 : 1000 })
    const result = await page.evaluate(async () =>
      (await import('/scripts/output-panel-check.mjs')).verifyOutputPanel(),
    )
    results.cases.push({ viewportWidth: width, ...result })
    await page.screenshot({ path: `${output}/output-${width}.png` })
    process.stdout.write(
      `PASS ${width}px: four looks, three source rails, both scroll axes, Fit, focus, width rejection, BPM and VOL\n`,
    )
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async () => {
    await (await import('/scripts/rack-feel-check.mjs')).loadEnveloped()
    document.querySelector('.rack-zoom button').click()
  })
  await page.waitForTimeout(100)
  const fit = await page.locator('.rack-scroll').evaluate((e) => ({
    width: e.clientWidth,
    height: e.clientHeight,
    scrollWidth: e.scrollWidth,
    scrollHeight: e.scrollHeight,
  }))
  assert(fit.scrollWidth <= fit.width + 1 && fit.scrollHeight <= fit.height + 1)
  results.envelopedFit = { viewport: '1440x900', ...fit }
  await page.evaluate(async () => {
    const { starterPatch } = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(starterPatch(104)))
    document.querySelector('.rack-zoom button').click()
  })
  for (const type of ['SEQ', 'OSC', 'VCF'])
    await page.getByRole('button', { name: `Add ${type}`, exact: true }).click()
  const placements = await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    return read(editorSource())
      .patch.modules.filter((m) => m.type !== 'out')
      .sort((a, b) => a.hp - b.hp)
      .map((m) => [m.type, m.hp])
  })
  assert.deepEqual(placements, [
    ['seq', 0],
    ['osc', 10],
    ['vcf', 19],
    ['mix', 92],
  ])
  await page.getByRole('button', { name: '+ Add row', exact: true }).click()
  const chip = page.getByRole('button', { name: 'Add LFO', exact: true })
  await chip.scrollIntoViewIfNeeded()
  const start = await chip.boundingBox()
  const destination = await page.locator('.rack-row').nth(1).boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2, { steps: 4 })
  await page.mouse.move(destination.x + 25, destination.y + 80, { steps: 12 })
  await page.mouse.move(destination.x + 26, destination.y + 81)
  await page.waitForSelector('.placement-ghost')
  assert.match(await page.locator('.placement-ghost').innerText(), /LFO/)
  await page.mouse.up()
  await page.waitForSelector('[data-module="lfo1"]')
  results.insertion =
    'Native palette clicks retain SEQ/OSC/VCF/MIX order; drag previews LFO before dropping onto rail 2'
  process.stdout.write(`PASS ${results.insertion}; Enveloped synth fits at 1440x900\n`)
  await page.evaluate(async () => {
    const { fixture } = await import('/scripts/output-panel-check.mjs')
    const { generate } = await import('/src/codegen/generate.ts')
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(fixture('instrument', 2)))
    document.querySelector('.rack-zoom button').click()
  })
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.rack-row').length === 3 &&
      document.querySelector('.rack h2 small').textContent.includes('4 modules'),
  )
  await page.waitForFunction(
    async () =>
      JSON.parse(localStorage.getItem('monkeyboy.workspace.v1')).source ===
      (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  for (const id of ['mix1', 'osc1']) {
    const from = page.locator(`[data-jack="${id}:out"]`)
    const to = page.locator('[data-jack="out1:in"]')
    await from.click()
    await to.click()
    await page.waitForFunction(async (id) => {
      const { read } = await import('/src/reader/index.ts')
      const { editorSource } = await import('/scripts/editor-browser.mjs')
      return (
        read(editorSource()).patch.cables.find((c) => c.to.module === 'out1').from.module === id
      )
    }, id)
    assert.equal(await page.locator('.rack-status button').count(), 0)
  }
  await page.evaluate(async () => (await import('/scripts/rack-feel-check.mjs')).inspectCables())
  results.nativeConnection =
    'Native occupied-input replacement from rail 3 to pinned OUT; cables remain attached'
  process.stdout.write(`PASS ${results.nativeConnection}\n`)
  // Probe actual engine output after a real user-gesture Play.
  await page.evaluate(async () => {
    window.measureOutput133 = (await import('/scripts/library-check.mjs')).installAudioProbe()
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
    { timeout: 30000 },
  )
  results.pcm = await page.evaluate(async () => await window.measureOutput133())
  assert(results.pcm.rms > 0.0001, 'Output fixture has no real PCM')
  const volume = page.locator('.output-panel [role="slider"][aria-label="VOL"]')
  await volume.focus()
  await page.keyboard.press('Home')
  await page.waitForFunction(
    () =>
      document.querySelector('.output-panel [aria-label="VOL"]').getAttribute('aria-valuenow') ===
      '0',
  )
  await page.waitForTimeout(250)
  results.mutedPcm = await page.evaluate(async () => await window.measureOutput133())
  assert(results.mutedPcm.rms < 0.0001, 'Pinned VOL did not mute real output')
  await page.keyboard.press('Backspace')
  await page.waitForFunction(
    () =>
      document.querySelector('.output-panel [aria-label="VOL"]').getAttribute('aria-valuenow') ===
      '0.8',
  )
  await page.waitForTimeout(250)
  results.restoredPcm = await page.evaluate(async () => await window.measureOutput133())
  assert(results.restoredPcm.rms > 0.0001, 'Pinned VOL reset did not restore output')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  process.stdout.write('PASS real Strudel PCM, pinned VOL mute/reset and Stop\n')
  assert.deepEqual(errors, [])
  results.pageErrors = errors
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  throw error
} finally {
  await browser.close()
}
