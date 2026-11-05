import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:5180'
const output = process.argv[3] ?? '/tmp/mms-metadata'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const results = { browser: browser.version(), checks: [], physicalListening: false }
const pass = (check) => {
  results.checks.push(check)
  process.stdout.write(`PASS ${check}\n`)
}
const editor = page.getByRole('textbox', { name: 'Strudel source', exact: true })
const source = () =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
async function accepted() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function selection(from, to = from) {
  await page.evaluate(
    async ({ from, to }) => {
      const view = (await import('/scripts/editor-browser.mjs')).editorView()
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
      view.focus()
    },
    { from, to },
  )
}
async function exportSource() {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
async function openFile(text) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'metadata.strudel',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  })
  await page.waitForFunction(
    async (expected) => (await import('/scripts/editor-browser.mjs')).editorSource() === expected,
    text,
  )
  await accepted()
}
async function folded() {
  assert.equal(await page.locator('.cm-foldPlaceholder').count(), 1)
  return page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorFolds())
}
try {
  await page.goto(base)
  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).check()
  await editor.waitFor()
  const starter = await source()
  await folded()
  assert.equal(
    await page
      .locator('.cm-content')
      .textContent()
      .then((s) => s.includes('"modules"')),
    false,
  )
  pass('Silent starter shows code and one metadata fold while retaining the complete file')

  await page.getByRole('button', { name: 'Patch library', exact: true }).click()
  await page.getByRole('button', { name: 'Enveloped synth', exact: true }).click()
  await page.getByRole('button', { name: 'Load patch', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await accepted()
  const synth = await source()
  await folded()
  assert(synth.split('\n').length > 100)
  assert(await page.locator('.source-token').count())
  await page.screenshot({ path: `${output}/folded-synth.png`, fullPage: true })
  pass('Enveloped synth folds automatically on library load; category-coloured code stays visible')

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const expected = await page.evaluate(
    async (text) => (await import('/scripts/editor-browser.mjs')).expectedExport(text),
    synth,
  )
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected)
  assert.equal(await exportSource(), expected)
  const expectedRack = await page.evaluate(async (text) => {
    return (await import('/src/reader/index.ts')).read(text).patch
  }, synth)
  await openFile(starter)
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.evaluate((text) => navigator.clipboard.writeText(text), synth)
  await page.keyboard.press('Control+v')
  await accepted()
  assert.equal(await source(), synth)
  assert.deepEqual(
    await page.evaluate(
      async (text) => (await import('/src/reader/index.ts')).read(text).patch,
      await source(),
    ),
    expectedRack,
  )
  await folded()
  await openFile(starter)
  await openFile(synth)
  assert.equal(await source(), synth)
  await folded()
  pass(
    'Copy, Export, Open and native whole-file paste preserve exact source and restore complete saved rack identity',
  )

  await page.locator('.cm-foldPlaceholder').click()
  assert.equal(await page.locator('.cm-foldPlaceholder').count(), 0)
  const metadataStart = synth.indexOf('// ── @monkeyboy rack v1 ──')
  await selection(metadataStart + 3)
  await page.keyboard.type('oops')
  assert.equal(await source(), synth)
  await selection(metadataStart)
  await page.keyboard.press('Backspace')
  assert.equal(await source(), synth)
  await selection(0, synth.length)
  await page.keyboard.press('Backspace')
  assert.equal(await source(), synth)
  pass('Unfolded metadata, its separator and select-all deletion are protected from keyboard edits')

  await selection(synth.indexOf('\n\n// ── @monkeyboy'))
  await page.keyboard.press('Enter')
  await page.keyboard.type('  .lpf(950)')
  await accepted()
  assert((await source()).includes('\n  .lpf(950)\n'))
  await folded()
  pass('Keyboard Enter and continued typing add a code line before the protected separator')

  await selection(0)
  await page.keyboard.type('// retained comment\n')
  await accepted()
  assert((await source()).startsWith('// retained comment\n'))
  await folded()
  const beforeInvalid = await source()
  await selection(0)
  await page.keyboard.type('/*')
  await page.waitForFunction(() => document.querySelector('[aria-invalid=true]'))
  assert.equal(await source(), '/*' + beforeInvalid)
  await folded()
  await selection((await source()).length)
  await page.keyboard.type('oops')
  assert.equal(await source(), '/*' + beforeInvalid)
  await page.getByRole('button', { name: 'Revert to last readable code', exact: true }).click()
  await accepted()
  await folded()
  pass(
    'Code edits refold metadata after acceptance; unfinished comments retain fold/protection; Revert restores source',
  )

  const deceptive = await page.evaluate(async () => {
    const { RACK_MARKER } = await import('/src/codegen/layout.ts')
    const prefix = `const marker = ${JSON.stringify(RACK_MARKER)};\n/*\n${RACK_MARKER}\n*/\n${RACK_MARKER}\n// earlier comment\n$: s("bd")\n\n`
    return { prefix, source: `${prefix}${RACK_MARKER}\n// {"version":999}\n` }
  })
  await openFile(deceptive.source)
  const ranges = await folded()
  assert.deepEqual(ranges, [
    {
      from: deceptive.prefix.length + '// ── @monkeyboy rack v1 ──'.length,
      to: deceptive.source.length,
    },
  ])
  assert.equal(
    await exportSource(),
    await page.evaluate(
      async (text) => (await import('/scripts/editor-browser.mjs')).expectedExport(text),
      deceptive.source,
    ),
  )
  pass(
    'Only the reader-recognized trailing block folds; strings, block comments and earlier marker comments stay visible; unknown metadata exports unchanged',
  )

  const invalid = '$: note(\n\n// ── @monkeyboy rack v1 ──\n// {}\n'
  await page.evaluate(
    async (text) => (await import('/scripts/editor-browser.mjs')).replaceSource(text),
    invalid,
  )
  await page.waitForFunction(() => document.querySelector('[aria-invalid=true]'))
  assert.match(
    await page.getByRole('alert').textContent(),
    /Line 1, column 8: Unclosed '\(' \(1:7\)/,
  )
  await folded()
  assert.equal(await exportSource(), invalid)
  await page.locator('.cm-foldPlaceholder').click()
  const numbers = await page.locator('.cm-lineNumbers .cm-gutterElement').allTextContents()
  assert(numbers.filter((number) => number.trim()).every((number) => Number(number) <= 2))
  pass(
    'EOF diagnostic points to code line 1, metadata has no line numbers even unfolded, and invalid draft export stays exact',
  )
  assert.deepEqual(errors, [])
  results.pageErrors = errors
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
