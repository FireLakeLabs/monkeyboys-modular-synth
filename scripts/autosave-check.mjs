import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Uses the development server's real app, reader and public CodeMirror state.
const url = process.argv[2] ?? 'http://127.0.0.1:5180'
const output = process.argv[3] ?? '/tmp/mms-autosave'
const browser = await chromium.launch({ headless: true })
const results = { browser: browser.version(), checks: [] }
const failures = []
await mkdir(output, { recursive: true })

async function open(context) {
  const page = await context.newPage()
  page.on('pageerror', (error) =>
    failures.push({ stage: results.checks.at(-1), error: error.stack }),
  )
  await page.goto(url)
  await page.locator('.cm-content').waitFor()
  return page
}
async function source(page) {
  return page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
}
async function edit(page, value) {
  await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
  await page.evaluate(async (text) => {
    ;(await import('/scripts/editor-browser.mjs')).replaceSource(text)
    await new Promise(requestAnimationFrame)
  }, value)
}
async function accepted(page) {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function stored(page) {
  return page.evaluate(async () => {
    const { AUTOSAVE_KEY } = await import('/src/workspace/autosave.ts')
    return JSON.parse(localStorage.getItem(AUTOSAVE_KEY))
  })
}
async function assertStopped(page) {
  assert.equal(await page.locator('.transport-status').textContent(), 'Ready')
  assert.equal(await page.evaluate(() => window.audioContexts), 0)
}
async function exported(page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(() => {
    window.audioContexts = 0
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args) {
        window.audioContexts++
        return Reflect.construct(target, args)
      },
    })
  })
  let page = await open(context)
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await stored(page), null)
  const fixture = await page.evaluate(async () => {
    const { demoPatch } = await import('/src/patch/demo.ts')
    const { fromPatch } = await import('/src/workspace/document.ts')
    const patch = demoPatch()
    patch.rows = 3
    patch.names = { 'osc1:out': 'lead' }
    patch.modules = patch.modules.map((module) => ({ ...module, row: 1, look: 'instrument' }))
    return fromPatch(patch)
  })
  await edit(page, fixture.source)
  await accepted(page)
  await page.locator('[data-module="osc1"]').click({ button: 'right' })
  await page.getByRole('button', { name: 'Look Vintage lab', exact: true }).click()
  await page.locator('[data-module="osc1"].look-vintage').waitFor()
  const saved = await source(page)
  const expectedRack = {
    ...fixture.patch,
    modules: fixture.patch.modules.map((module) =>
      module.id === 'osc1' ? { ...module, look: 'vintage' } : module,
    ),
  }
  assert.equal((await stored(page)).source, saved)
  assert.equal((await stored(page)).draft, saved)
  await assertStopped(page)
  results.checks.push('Readable typing and a rack look edit save the canonical file immediately')

  await page.reload()
  const offer = page.locator('.workspace-notice')
  await offer.getByRole('button', { name: /^Start new/ }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal((await stored(page)).source, saved)
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await offer.waitFor()
  assert.equal(await source(page), saved)
  assert.equal(
    await exported(page),
    await page.evaluate(
      async (text) => (await import('/scripts/editor-browser.mjs')).expectedExport(text),
      saved,
    ),
  )
  const reopenedRack = await page.evaluate(
    async (text) => (await import('/src/reader/index.ts')).read(text).patch,
    saved,
  )
  assert.deepEqual(reopenedRack, expectedRack)
  assert.equal(await page.locator('.module-panel').count(), expectedRack.modules.length)
  await page.locator('[data-module="osc1"].look-vintage').waitFor()
  await assertStopped(page)
  results.checks.push(
    'Repeated reloads restore silently with a Start new offer; restore/export preserve exact source, module/cable IDs, positions, looks, names, values and empty rows; no AudioContext is created',
  )

  const invalid = `${saved}\n// unfinished café\n$: note(`
  await edit(page, invalid)
  assert.equal((await stored(page)).draft, invalid)
  // Close before waiting for reader acceptance: raw text must already be durable.
  await page.close()
  page = await open(context)
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  assert.equal(await source(page), invalid)
  assert.equal(await exported(page), invalid)
  assert.equal((await stored(page)).source, saved)
  await page.locator('[data-module="osc1"].look-vintage').waitFor()
  await assertStopped(page)
  await page.screenshot({ path: `${output}/restored-draft.png`, fullPage: true })
  await page.getByRole('button', { name: 'Revert to last readable code' }).click()
  assert.equal(await source(page), saved)
  assert.equal((await stored(page)).draft, saved)
  results.checks.push(
    'Closing immediately after an invalid edit retains exact draft and readable rack; restore stays stopped, Export retains the draft and Revert recovers the readable file',
  )

  await edit(page, '$: note(')
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  await page.reload()
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  assert.equal(await source(page), '$: note(')
  assert.equal((await stored(page)).source, saved)
  await page.locator('[data-module="osc1"].look-vintage').waitFor()
  await assertStopped(page)
  results.checks.push(
    'A draft shorter than the styled readable file restores exactly without stale decoration ranges or page errors',
  )

  const corrected = "// corrected source\n$: note('d3').s('triangle')\n"
  await edit(page, corrected)
  await accepted(page)
  const correctedSaved = await source(page)
  assert.equal((await stored(page)).source, correctedSaved)
  await page.reload()
  await page.locator('.workspace-notice').screenshot({ path: `${output}/restore-offer.png` })
  await page.getByRole('button', { name: /^Start new/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('.module-panel').length === 2)
  assert.notEqual((await stored(page)).source, correctedSaved)
  await page.locator('.workspace-notice').getByRole('button', { name: /^Undo/ }).click()
  await page.waitForFunction(
    async (text) => (await import('/scripts/editor-browser.mjs')).editorSource() === text,
    correctedSaved,
  )
  await assertStopped(page)
  results.checks.push(
    'A corrected draft replaces the recovery copy; explicit discard returns to the silent starter and removes the next restore offer',
  )
  await context.close()

  for (const failure of ['access', 'quota']) {
    const restricted = await browser.newContext()
    await restricted.addInitScript((mode) => {
      window.audioContexts = 0
      if (mode === 'access')
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Denied', 'SecurityError')
          },
        })
      else
        Storage.prototype.setItem = () => {
          throw new DOMException('Full', 'QuotaExceededError')
        }
    }, failure)
    const page = await open(restricted)
    assert.equal(await page.getByRole('dialog').count(), 0)
    await edit(page, corrected)
    await accepted(page)
    assert.equal(await page.getByRole('alert').count(), 0)
    await edit(page, '$: note(')
    await page.waitForFunction(
      () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
    )
    assert.equal(await source(page), '$: note(')
    // Actual browser navigation after a user gesture must ask before losing unsaved text.
    await page.locator('.cm-content').click()
    const warning = page.waitForEvent('dialog', { timeout: 10_000 })
    const navigation = page.evaluate(() => window.location.reload())
    const dialog = await warning
    assert.equal(dialog.type(), 'beforeunload')
    await dialog.dismiss()
    await navigation
    assert.equal(await source(page), '$: note(')
    assert.equal(await exported(page), '$: note(')
    await assertStopped(page)
    results.checks.push(
      `${failure}: storage failure stays quiet, editing/export work, and navigation warns before losing an unsaved draft`,
    )
    await restricted.close()
  }
  assert.deepEqual(failures, [])
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
} finally {
  await browser.close()
}
