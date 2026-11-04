import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const output = process.argv[3] ?? '/tmp/monkeyboy-routing'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const result = {
  browser: browser.version(),
  forms: [],
  looks: [],
  panels: [],
  physicalListening: false,
}
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5174')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).check()
  await page.evaluate(async () => (await import('/scripts/routing-check.mjs')).prepare())
  for (const kind of ['gates', 'switch', 'aux', 'duck', 'audio-mod']) {
    await page.evaluate(async (k) => (await import('/scripts/routing-check.mjs')).load(k), kind)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    result.forms.push(
      await page.evaluate(
        async (k) => (await import('/scripts/routing-check.mjs')).verify(k),
        kind,
      ),
    )
    process.stdout.write(`PASS ${kind}\n`)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
  }
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    await page.evaluate(
      async (l) => (await import('/scripts/routing-check.mjs')).load('audio-mod', l),
      look,
    )
    await page.getByRole('button', { name: 'All cables', exact: true }).click()
    result.looks.push({
      look,
      ...(await page.evaluate(async () =>
        (await import('/scripts/routing-check.mjs')).inspectCable(),
      )),
    })
    if (look === 'instrument') {
      await page.screenshot({ path: `${output}/audio-mod.png` })
      await page.locator('.rack-frame').evaluate((e) => {
        e.style.filter = 'grayscale(1)'
      })
      await page.screenshot({ path: `${output}/audio-mod-greyscale.png` })
      await page.locator('.rack-frame').evaluate((e) => {
        e.style.filter = ''
      })
    }
  }
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    for (const kind of ['gates', 'switch', 'aux', 'duck']) {
      await page.evaluate(
        async ({ kind, look }) => (await import('/scripts/routing-check.mjs')).load(kind, look),
        { kind, look },
      )
      result.panels.push({
        look,
        ...(await page.evaluate(
          async (kind) => (await import('/scripts/routing-check.mjs')).inspectPanel(kind),
          kind,
        )),
      })
    }
  }
  await page.evaluate(async () => (await import('/scripts/routing-check.mjs')).load('gates'))
  const cell = page.locator('[data-module="gates1"] .mini-cell').filter({ hasText: 'x' }).first()
  await cell.focus()
  await cell.press('Enter')
  await page.getByRole('textbox', { name: 'Cell value', exact: true }).fill('~')
  await page.getByRole('textbox', { name: 'Cell value', exact: true }).press('Enter')
  await page.waitForFunction(async () =>
    (await import('/scripts/editor-browser.mjs'))
      .editorSource()
      .includes('.struct("~ ~ x x ~ x ~ x")'),
  )
  result.nativeGateEdit = true
  result.reset = await page.evaluate(async () =>
    (await import('/scripts/routing-check.mjs')).verifyReset(),
  )
  process.stdout.write('PASS actual bus retention and replacement\n')
  result.audioRate = await page.evaluate(async () =>
    (await import('/scripts/routing-check.mjs')).verifyAudioRate(),
  )
  process.stdout.write('PASS within-note audio modulation sidebands\n')
  await page.evaluate(async () => (await import('/scripts/routing-check.mjs')).finish())
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n')
} finally {
  await browser.close()
}
