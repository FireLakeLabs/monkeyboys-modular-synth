import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const output = process.argv[3] ?? '/tmp/monkeyboy-sound-effects'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const results = { browser: browser.version(), looks: [], forms: [], physicalListening: false }
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5131')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
  for (const look of ['powder', 'instrument', 'vintage', 'learner']) {
    const count = await page.evaluate(async (look) => {
      const s = await import('/scripts/rack-feel-check.mjs')
      await s.loadLook(look)
      return s.inspectPanels(look)
    }, look)
    results.looks.push({ look, count })
    await page.screenshot({ path: `${output}/${look}.png` })
  }
  const setup = await page.evaluate(async () =>
    (await import('/scripts/sound-effects-check.mjs')).prepareSoundProof(),
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  for (let i = 0; i < setup.forms; i++) {
    const result = await page.evaluate(
      async (i) => (await import('/scripts/sound-effects-check.mjs')).verifySoundForm(i),
      i,
    )
    results.forms.push(result)
    process.stdout.write(`PASS ${i} ${result.type} ${result.rms}\n`)
  }
  results.ordered = []
  for (const types of [
    ['drive', 'drive'],
    ['folder', 'lofi'],
    ['lofi', 'folder'],
    ['comp', 'vcf'],
    ['pan', 'shift'],
  ])
    results.ordered.push(
      await page.evaluate(
        async (types) =>
          (await import('/scripts/sound-effects-check.mjs')).verifyOrderedSound(types),
        types,
      ),
    )
  results.reviewForms = await page.evaluate(async () =>
    (await import('/scripts/sound-effects-check.mjs')).verifyReviewForms(),
  )
  await page.evaluate(async () =>
    (await import('/scripts/sound-effects-check.mjs')).finishSoundProof(),
  )
  results.sharedFM = await page.evaluate(async () =>
    (await import('/scripts/sound-effects-check.mjs')).verifySharedOperatorSave(),
  )
  results.panCV = []
  for (const mode of ['SMOOTH', 'STEP', 'ENV', 'CV SEQ'])
    results.panCV.push(
      await page.evaluate(
        async (mode) => (await import('/scripts/sound-effects-check.mjs')).verifyPanCV(mode),
        mode,
      ),
    )
  await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    const { load } = await import('/scripts/rack-feel-check.mjs')
    await load(generate(read('$: note("c3").s("user").partials([1,0.5,0,0.3]).gain(0.1)\n').patch))
  })
  await page.getByRole('slider', { name: 'Partial 2', exact: true }).press('End')
  results.drawbarEdit = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const { saveLayout } = await import('/src/workspace/document.ts')
    const doc = read(editorSource())
    const values = doc.patch.modules.find((m) => m.type === 'harmonic').values.partials
    const saved = saveLayout(doc)
    return {
      values,
      savedIdentity: JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    }
  })
  assert.deepEqual(results.drawbarEdit.values, [1, 1, 0, 0.3])
  assert(results.drawbarEdit.savedIdentity)
  await page.getByRole('combobox', { name: 'Harmonic count', exact: true }).selectOption('8')
  assert.equal(await page.getByRole('slider', { name: /^Partial / }).count(), 8)
  const beforeDrag = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  const bar = await page.getByRole('slider', { name: 'Partial 3', exact: true }).boundingBox()
  assert(bar)
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height - 3)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 4, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
    beforeDrag,
  )
  results.drawbarGestureUndo = true
  await page.screenshot({ path: `${output}/drawbars.png` })
  assert.deepEqual(errors, [])
} finally {
  results.errors = errors
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
