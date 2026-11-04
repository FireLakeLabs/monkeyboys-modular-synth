import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const output = process.argv[3] ?? '/tmp/monkeyboy-function-loops'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const results = { browser: browser.version(), forms: [], physicalListening: false }
const suite = (fn, arg) =>
  page.evaluate(
    async ({ fn, arg }) => (await import('/scripts/function-loops-check.mjs'))[fn](arg),
    { fn, arg },
  )
async function synced() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5175')
  await page.locator('.cm-content').waitFor()
  const prepared = await suite('prepareFunctionProof')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  for (let i = 0; i < prepared.forms; i++) {
    const form = await suite('verifyFunctionForm', i)
    results.forms.push(form)
    process.stdout.write(
      `PASS ${form.type}: ${form.call}; ${form.events} events, RMS ${form.rms}\n`,
    )
  }
  results.stopped = await suite('finishFunctionProof')
  const initial = await suite('loadNestedRack')
  results.initial = await suite('currentFunctionRack')
  const chunk = page.locator('[data-module="chunk1"]')
  const value = chunk.getByRole('button', { name: 'Set CHUNKS', exact: true })
  await value.click()
  await chunk.getByRole('textbox', { name: 'CHUNKS', exact: true }).fill('3')
  await chunk.getByRole('textbox', { name: 'CHUNKS', exact: true }).press('Enter')
  await synced()
  results.edited = await suite('currentFunctionRack')
  assert.match(results.edited.body, /\.chunk\(3,/)
  assert.match(results.edited.ui.sends[0].label, /1 of 3 chunks/)
  // Undo and redo retain the exact accepted rack/source revision, including nested wiring.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await synced()
  assert.deepEqual((await suite('currentFunctionRack')).patch, initial.patch)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await synced()
  assert.deepEqual((await suite('currentFunctionRack')).patch, results.edited.patch)
  // Repatch a complete rack-owned inner chain through the actual jack controls.
  await page.locator('details.connections summary').click()
  await page
    .getByRole('button', { name: 'off1:send → ratchet1:in · function λ', exact: true })
    .click()
  await page.getByRole('button', { name: 'Move destination', exact: true }).click()
  await page.locator('[data-jack="rev1:in"]').click()
  const replace = page.getByRole('button', { name: 'Replace', exact: true })
  if (await replace.count()) await replace.click()
  await synced()
  results.repatched = await suite('currentFunctionRack')
  assert.match(results.repatched.body, /y => y\.rev\(\)/)
  assert.doesNotMatch(results.repatched.body, /\.ply\(/)
  // The displaced RATCHET is saved as a dangling chain, not silently removed.
  assert(results.repatched.patch.modules.some((m) => m.type === 'ratchet'))
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await synced()
  assert.deepEqual((await suite('currentFunctionRack')).patch, results.edited.patch)
  await page.screenshot({ path: `${output}/nested-loops.png` })
  // S4: a CV jack stays modulation, and a RETURN-side partial chain stays function.
  await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    await (
      await import('/scripts/rack-feel-check.mjs')
    ).load(generate(read('$: note("c3 e3").s("sine").chunk(4,x=>x.gain(.4))\n').patch))
  })
  const cv = page.locator('[data-jack="vca1:cv"]')
  assert.match(await cv.getAttribute('aria-label'), /mod$/)
  const connections = page.locator('details.connections')
  await connections.locator('summary').click()
  await page
    .getByRole('button', { name: 'chunk1:send → vca1:in · function λ', exact: true })
    .click()
  await page.getByRole('button', { name: 'Remove cable', exact: true }).click()
  await synced()
  assert.match(await cv.getAttribute('aria-label'), /mod$/)
  assert.match(await page.locator('[data-jack="vca1:out"]').getAttribute('aria-label'), /function$/)
  assert.equal(await page.locator('.cable.signal-function').count(), 1)
  results.partialLoop = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const doc = read(editorSource())
    return {
      layout: doc.layout,
      patch: doc.patch,
      dash: getComputedStyle(
        document.querySelector('.cable.signal-function path:not(.cable-shadow)'),
      ).strokeDasharray,
    }
  })
  assert.equal(results.partialLoop.layout, 'restored')
  assert.equal(results.partialLoop.dash, '16px, 4px, 3px, 4px')
  results.nestedFX = await page.evaluate(async () => {
    const { load } = await import('/scripts/rack-feel-check.mjs')
    const source =
      '$: note("c3 e3").s("sine").chunk(4,x=>x.FX(lpf(/* first */800).lpq(1),lpf(/* second */1200).lpq(1)).rev())\n'
    await load(source)
    return { source }
  })
  const filter = page.locator('[data-module="vcf2"]')
  await filter.getByRole('button', { name: 'Set CUTOFF', exact: true }).click()
  await filter.getByRole('textbox', { name: 'CUTOFF', exact: true }).fill('1400')
  await filter.getByRole('textbox', { name: 'CUTOFF', exact: true }).press('Enter')
  await synced()
  const fxEdited = await suite('currentFunctionRack')
  assert.equal(
    fxEdited.body,
    results.nestedFX.source.replace('/* second */1200', '/* second */1400'),
  )
  results.nestedFX.after = fxEdited.body
  // Incomplete loops use the preset, so their saved FX must not be described as sounding.
  await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(read(editorSource()).patch))
  })
  if (!(await connections.evaluate((e) => e.open))) await connections.locator('summary').click()
  await page
    .getByRole('button', { name: 'chunk1:send → vcf1:in · function λ', exact: true })
    .click()
  await page.getByRole('button', { name: 'Remove cable', exact: true }).click()
  await synced()
  assert.equal(await page.locator('.rack-note').count(), 0)
  results.nestedFX.partialHasNoAudibleStageNote = true
  results.sourceEditing = await page.evaluate(async () => {
    const { load } = await import('/scripts/rack-feel-check.mjs')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { sourceBody } = await import('/src/workspace/document.ts')
    const { read } = await import('/src/reader/index.ts')
    const source =
      '// exact comments\n$: note("c3 e3").s("sine").chunk(4,p=>p.iter(/* keep */ 3).rev())\n'
    await load(source)
    return {
      source,
      body: sourceBody(editorSource()),
      module: read(editorSource()).patch.modules.find((m) => m.type === 'iter'),
    }
  })
  assert.equal(results.sourceEditing.body, results.sourceEditing.source)
  const iter = page.locator('[data-module="iter1"]')
  await iter.getByRole('button', { name: 'Set STEPS', exact: true }).click()
  await iter.getByRole('textbox', { name: 'STEPS', exact: true }).fill('5')
  await iter.getByRole('textbox', { name: 'STEPS', exact: true }).press('Enter')
  await synced()
  const after = await suite('currentFunctionRack')
  assert.equal(after.body, results.sourceEditing.source.replace('/* keep */ 3', '/* keep */ 5'))
  results.sourceEditing.after = after.body
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify({ ...results, errors }, null, 2) + '\n')
  process.stdout.write(
    'PASS nested rack edit, repatch, undo/redo, exact literal edit, source hover, accessible styling and geometry\n',
  )
} finally {
  await browser.close()
}
