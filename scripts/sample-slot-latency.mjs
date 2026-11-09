import { chromium } from 'playwright'

// Times a knob step in a rack with six sound slots once both factory packs have loaded,
// alternating two production builds each round:
//   node scripts/sample-slot-latency.mjs <before-url> <after-url> [rounds]
// Serve each with `npm run build` and `npx vite preview --port <port>`. The packs come from
// their pinned URLs, so this needs the network. See docs/sound-crate.md#sound-picker-227.
const sides = { before: process.argv[2], after: process.argv[3] }
const rounds = Number(process.argv[4] ?? 5)
const steps = 9
// Added from the palette, so the rack owns the patch and accepts knob edits.
const MODULES = ['SMPL', 'SMPL', 'SMPL', 'SPLICE', 'SPLICE', 'REVERB']

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

async function prepare(page, base) {
  await page.goto(base)
  await page.locator('.cm-content').waitFor()
  for (const name of MODULES) {
    const count = await page.locator('[data-module]').count()
    await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-module]').length > count,
      count,
    )
  }
  await page.getByRole('tab', { name: 'Sounds', exact: true }).click()
  for (const pack of ['Dirt Samples', 'Drum Machines'])
    await page
      .locator('.sound-pack > summary', { hasText: new RegExp(`^${pack}$`) })
      .waitFor({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'Modules', exact: true }).click()
  await page.waitForTimeout(500)
  return page.evaluate(() => ({
    slots: document.querySelectorAll('.sample-slot').length,
    options: document.querySelectorAll('.sample-slot option').length,
  }))
}

// The same knob step as scripts/knob-latency-check.mjs: keydown to the second frame after.
const step = (page) =>
  page.evaluate(async () => {
    const selector = '[data-module="smpl1"] .module-controls .knob'
    const knob = document.querySelector(selector)
    const before = knob.getAttribute('aria-valuenow')
    knob.focus()
    const started = performance.now()
    knob.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    )
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {
      ms: performance.now() - started,
      changed: document.querySelector(selector)?.getAttribute('aria-valuenow') !== before,
    }
  })

// Only the picker build has a readout: click to the second frame, then one typed search
// from its input event to the second frame.
async function openPicker(page) {
  const open = await page.evaluate(async () => {
    const readout = document.querySelector('[data-module="smpl1"] .sample-readout')
    if (!readout) return null
    const started = performance.now()
    readout.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const search = document.querySelector('.sound-picker-search')
    window.searchTime = new Promise((resolve) =>
      search.addEventListener(
        'input',
        () => {
          const typed = performance.now()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now() - typed)),
          )
        },
        { once: true, capture: true },
      ),
    )
    return performance.now() - started
  })
  if (open === null) return null
  await page.keyboard.insertText('808')
  const search = await page.evaluate(() => window.searchTime)
  const rows = await page.locator('.sound-picker [role="option"]').count()
  await page.keyboard.press('Escape')
  return { open, search, rows }
}

const browser = await chromium.launch()
const results = Object.fromEntries(
  Object.keys(sides).map((side) => [
    side,
    { counts: [], times: [], failures: 0, open: [], search: [], rows: [] },
  ]),
)
for (let round = 0; round < rounds; round++) {
  for (const [side, base] of Object.entries(sides)) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    const result = results[side]
    result.counts.push(await prepare(page, base))
    await step(page)
    await page.waitForTimeout(800)
    for (let index = 0; index < steps; index++) {
      const { ms, changed } = await step(page)
      if (changed) result.times.push(ms)
      else result.failures++
      await page.waitForTimeout(150)
    }
    const picker = await openPicker(page)
    if (picker) {
      result.open.push(picker.open)
      result.search.push(picker.search)
      result.rows.push(picker.rows)
    }
    await context.close()
  }
}
await browser.close()

const summary = (values) =>
  values.length
    ? `${median(values).toFixed(1)} ms (range ${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)}, n=${values.length})`
    : 'n/a'
for (const [side, { counts, times, failures, open, search, rows }] of Object.entries(results)) {
  process.stdout.write(
    `${side}: ${JSON.stringify(counts[0])}; knob step ${summary(times)}, ${failures} unchanged; picker open ${summary(open)}; search ${summary(search)}, rows ${rows.join('/') || 'n/a'}\n`,
  )
}
process.stdout.write(`${JSON.stringify({ sides, rounds, steps, results })}\n`)
