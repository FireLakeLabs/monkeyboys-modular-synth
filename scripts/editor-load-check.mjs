import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Compare optimized app builds served by Vite preview. No Play/audio startup is timed.
const before = process.argv[2] ?? 'http://127.0.0.1:4174'
const after = process.argv[3] ?? 'http://127.0.0.1:4173'
const output = process.argv[4] ?? '/tmp/mms-editor-load.json'
const browser = await chromium.launch({ headless: true })
const results = { browser: browser.version(), runs: [], lazyRack: false }
let expectedSource
try {
  for (let run = 0; run < 5; run++) {
    for (const [label, url] of [
      ['textarea', before],
      ['codemirror', after],
    ]) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1600, height: 1000 },
      })
      const page = await context.newPage()
      const failures = []
      page.on('pageerror', (error) => failures.push(error.message))
      page.on('requestfailed', (request) => failures.push(request.url()))
      page.on('response', (response) => {
        if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
      })
      await page.route('**/*', (route) => route.continue()) // Disables browser HTTP caching.
      await page.addInitScript(() => {
        window.rackPaint = null
        window.editorPaint = null
        const create = URL.createObjectURL.bind(URL)
        URL.createObjectURL = (blob) => {
          window.exportedSource = blob.text()
          return create(blob)
        }
        const watch = new MutationObserver(() => {
          if (window.rackPaint === null && document.querySelector('.module-panel')) {
            window.rackPaint = 'pending'
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                window.rackPaint = performance.now()
              }),
            )
          }
          if (
            window.editorPaint === null &&
            document.querySelector('.source-editor, .cm-content .cm-line')
          ) {
            window.editorPaint = 'pending'
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                window.editorPaint = performance.now()
              }),
            )
          }
        })
        watch.observe(document, { childList: true, subtree: true })
      })
      await page.goto(url)
      await page
        .waitForFunction(
          () => typeof window.rackPaint === 'number' && typeof window.editorPaint === 'number',
        )
        .catch(async (error) => {
          console.error(
            label,
            failures,
            await page.evaluate(() => ({
              rack: window.rackPaint,
              editor: window.editorPaint,
              body: document.body.textContent.slice(0, 500),
            })),
          )
          throw error
        })
      await page.getByRole('button', { name: 'Export', exact: true }).click()
      const source = await page.evaluate(() => window.exportedSource)
      expectedSource ??= source
      assert.equal(source, expectedSource)
      assert.equal(await page.locator('.module-panel').count(), 2)
      if (label === 'codemirror')
        assert.equal(await page.locator('.cm-line').first().textContent(), source.split('\n')[0])
      else assert.equal(await page.locator('.source-editor').inputValue(), source)
      assert.deepEqual(failures, [])
      results.runs.push(
        await page.evaluate(
          ({ label, run }) => ({
            label,
            run,
            rackPaintMs: window.rackPaint,
            editorPaintMs: window.editorPaint,
            js: performance
              .getEntriesByType('resource')
              .filter((r) => r.name.endsWith('.js'))
              .map((r) => ({
                name: new URL(r.name).pathname,
                bytes: r.decodedBodySize,
                transferBytes: r.transferSize,
                startMs: r.startTime,
                endMs: r.responseEnd,
              })),
          }),
          { label, run },
        ),
      )
      await context.close()
    }
  }
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 1000 },
  })
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/SourceEditor-*.js', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(after, { waitUntil: 'domcontentloaded' })
  await page.locator('.module-panel').first().waitFor()
  assert.equal(await page.locator('.cm-editor').count(), 0)
  assert.match(await page.locator('.source-surface').textContent(), /Loading source editor/)
  await page.screenshot({ path: '/tmp/mms-editor-rack-first.png' })
  release()
  await page.getByRole('textbox', { name: 'Strudel source', exact: true }).waitFor()
  assert.equal(await page.locator('.cm-editor').count(), 1)
  await page.screenshot({ path: '/tmp/mms-editor-loaded.png' })
  results.lazyRack = true
  await page.close()
} finally {
  await writeFile(output, JSON.stringify(results, null, 2) + '\n')
  await browser.close()
}
process.stdout.write(JSON.stringify(results) + '\n')
