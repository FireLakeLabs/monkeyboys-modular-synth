import { chromium } from 'playwright'

// Times one knob step against a production build: `npm run build`, `npm run preview`,
// then pass its URL. Compare medians and ranges across runs; see docs/usability-review.md.
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const rounds = Number(process.argv[3] ?? 5)
const steps = 7
const patches = ['1 · First sounds', 'Three-voice sketch', 'Function loops', 'Switch Angel']

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

async function loadPatch(page, name) {
  await page.getByRole('button', { name: 'Patch library' }).click()
  await page.locator('.patch-collections button').filter({ hasText: name }).first().click()
  const started = Date.now()
  await page
    .getByRole('button', { name: /Load patch/ })
    .first()
    .click()
  await page.locator('dialog[open]').waitFor({ state: 'detached' })
  return Date.now() - started
}

const firstKnobModule = (page) =>
  page
    .locator('[data-module]')
    .evaluateAll(
      (panels) =>
        panels.find((panel) => panel.querySelector('.module-controls .knob'))?.dataset.module,
    )

// Trance refuses its first edit, so it is measured after explicit conversion.
async function acceptEdits(page, id) {
  const knob = page.locator(`[data-module="${id}"] .module-controls .knob`).first()
  await knob.focus()
  await knob.press('ArrowUp')
  await page.waitForTimeout(200)
  const convert = page.getByRole('button', { name: 'Make rack-editable' })
  if (await convert.count()) {
    await convert.click()
    await page.waitForTimeout(800)
  }
}

const step = (page, id) =>
  page.evaluate(async (module) => {
    const selector = `[data-module="${module}"] .module-controls .knob`
    const knob = document.querySelector(selector)
    const before = knob.getAttribute('aria-valuenow')
    knob.focus()
    const started = performance.now()
    knob.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    )
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return {
      ms: performance.now() - started,
      changed: document.querySelector(selector)?.getAttribute('aria-valuenow') !== before,
    }
  }, id)

const browser = await chromium.launch()
const results = new Map(patches.map((name) => [name, { loads: [], times: [], failures: 0 }]))
for (let round = 0; round < rounds; round++) {
  for (const name of patches) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    await page.goto(base)
    const result = results.get(name)
    result.loads.push(await loadPatch(page, name))
    const id = await firstKnobModule(page)
    await acceptEdits(page, id)
    for (let index = 0; index < steps; index++) {
      const { ms, changed } = await step(page, id)
      if (changed) result.times.push(ms)
      else result.failures++
      await page.waitForTimeout(120)
    }
    await context.close()
  }
}
await browser.close()

for (const [name, { loads, times, failures }] of results) {
  const range = `${Math.round(Math.min(...times))}-${Math.round(Math.max(...times))}`
  process.stdout.write(
    `${name}: step ${Math.round(median(times))} ms (range ${range}, ${times.length} steps, ${failures} failed), load ${median(loads)} ms\n`,
  )
}
