import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Workspace history acceptance against Vite. --real also measures actual Strudel output.
const base = process.argv[2] ?? 'http://127.0.0.1:5183'
const output = process.argv[3] ?? '/tmp/monkeyboy-history'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = { browser: browser.version(), checks: [], pcm: {}, physicalListening: false }
const pass = (name) => {
  results.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
const fixture = `
const state = window.audioFixture = { calls: [], stops: 0 };
export async function play(code) { state.calls.push(code); }
export async function stop() { state.stops++; }
export async function setVolume() {}
export const getResourceStatus = () => 'unknown';
export const subscribe = () => () => {};
`
const editor = (page) => page.getByRole('textbox', { name: 'Strudel source', exact: true })
const button = (page, name) => page.getByRole('button', { name, exact: true })
const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('monkeyboy.workspace.v1')))
const text = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const edit = (page, source) =>
  page.evaluate(
    async (value) => (await import('/scripts/editor-browser.mjs')).replaceSource(value),
    source,
  )
async function accepted(page) {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function expectSource(page, source) {
  await page.waitForFunction(
    (value) => JSON.parse(localStorage.getItem('monkeyboy.workspace.v1'))?.source === value,
    source,
  )
  await accepted(page)
  assert.equal(await text(page), source)
  const reopened = await page.evaluate(
    async (value) => (await import('/src/reader/index.ts')).read(value).patch,
    source,
  )
  const rendered = await page.locator('.module-panel').evaluateAll((panels) =>
    panels.map((p) => ({
      id: p.dataset.module,
      look: [...p.classList].find((c) => c.startsWith('look-')).slice(5),
      left: p.style.left,
      right: p.style.right,
      top: p.style.top,
    })),
  )
  assert.deepEqual(
    rendered,
    reopened.modules.map((m) => ({
      id: m.id,
      look: m.look,
      left: m.type === 'out' ? '' : `${m.hp * 12}px`,
      right: m.type === 'out' ? '8px' : '',
      top: `${m.row * 440 + 20}px`,
    })),
  )
}
async function shortcut(page, key, inEditor = false) {
  if (inEditor) await editor(page).focus()
  else await button(page, 'Patch library').focus()
  await page.keyboard.press(key)
}
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/src/strudel/engine.ts*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture }),
  )
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  await editor(page).waitFor()
  assert(await button(page, 'Undo').isDisabled())
  const original = await page.evaluate(async () => {
    const { demoPatch } = await import('/src/patch/demo.ts')
    const { fromPatch } = await import('/src/workspace/document.ts')
    const { renameOutput, placeModule, setLook } = await import('/src/rack/model.ts')
    let patch = renameOutput(demoPatch(), 'osc1:out', 'lead')
    patch = placeModule(patch, 'osc', 1, 20, 'osc1')
    patch = setLook(patch, 'osc1', 'instrument')
    return fromPatch(patch).source
  })
  await edit(page, original)
  await editor(page).press('Control+Enter')
  await accepted(page)
  await button(page, 'Stop').click()
  await expectSource(page, original)

  await page.getByRole('button', { name: 'Select osc1', exact: true }).press('Delete')
  await button(page, 'Delete module').click()
  const deleted = (await saved(page)).source
  assert.notEqual(deleted, original)
  assert.equal(await page.locator('[data-module=osc1]').count(), 0)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  await shortcut(page, 'Control+Shift+z', true)

  await expectSource(page, deleted)
  await shortcut(page, 'Meta+z', true)
  await expectSource(page, original)
  pass(
    'Ctrl/Cmd undo and editor redo restore deleted module, cables, exact saved names/positions/looks',
  )

  await page.locator('[data-module=vcf1]').click({ button: 'right' })
  await button(page, 'Look Vintage lab').click()
  const looked = (await saved(page)).source
  await button(page, 'Undo').click()
  await expectSource(page, original)
  await button(page, 'Redo').click()
  await expectSource(page, looked)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  pass('look changes undo/redo through both visible buttons and shortcuts')

  await page.locator('.connections > summary').click()
  await button(page, 'osc1:out → vcf1:in').click()
  await button(page, 'Remove cable').click()
  const disconnected = (await saved(page)).source
  await shortcut(page, 'Control+z', true)
  await expectSource(page, original)
  await shortcut(page, 'Meta+Shift+z')
  await expectSource(page, disconnected)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  pass('cable deletion restores complete source and saved wiring')

  await button(page, 'New patch').click()
  await button(page, 'Replace patch').click()
  const replacement = (await saved(page)).source
  assert.equal(await page.locator('.module-panel').count(), 2)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  assert.equal(await page.locator('.transport-status').textContent(), 'Ready')
  await shortcut(page, 'Control+Shift+z')
  await expectSource(page, replacement)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  pass('New replacement undo/redo retains complete rack and never starts stopped playback')

  await page.locator('.header-tempo').getByRole('button', { name: 'Set BPM', exact: true }).click()
  await page.locator('.header-tempo').getByRole('textbox', { name: 'BPM', exact: true }).fill('140')
  const blurKnob = page.getByRole('slider', { name: 'CUTOFF', exact: true })
  const blurBox = await blurKnob.boundingBox()
  assert(blurBox)
  await page.mouse.move(blurBox.x + blurBox.width / 2, blurBox.y + blurBox.height / 2)
  await page.mouse.down()
  const blurred = (await saved(page)).source
  assert.match(blurred, /setcpm\(140\/4\)/)
  await page.mouse.move(blurBox.x + blurBox.width / 2, blurBox.y + blurBox.height / 2 - 40, {
    steps: 8,
  })
  await page.mouse.up()
  assert.notEqual((await saved(page)).source, blurred)
  await shortcut(page, 'Control+z')
  assert.equal(
    (await saved(page)).source,
    blurred,
    'undo drag must retain the preceding BPM blur commit',
  )
  await expectSource(page, blurred)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  pass('BPM blur commit and subsequent CUTOFF drag remain separate undo steps')

  const knob = page.getByRole('slider', { name: 'CUTOFF', exact: true })
  const box = await knob.boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 8 })
  await page.mouse.up()
  const dragged = (await saved(page)).source
  assert.notEqual(dragged, original)
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  await shortcut(page, 'Control+Shift+z')
  await expectSource(page, dragged)
  pass('continuous live knob drag is one accepted undo step')

  const draft = dragged.replace('setcpm(120/4)', 'setcpm(140/4)')
  assert.notEqual(draft, dragged)
  await edit(page, draft)
  await shortcut(page, 'Control+z', true)
  assert.equal(await text(page), dragged)
  assert.equal((await saved(page)).source, dragged)
  await shortcut(page, 'Control+Shift+z', true)
  assert.equal(await text(page), draft)
  assert.equal((await saved(page)).source, dragged)
  await editor(page).press('Control+Enter')
  await accepted(page)
  await button(page, 'Stop').click()
  await shortcut(page, 'Control+z', true)
  await expectSource(page, dragged)
  await shortcut(page, 'Control+z', true)
  await expectSource(page, original)
  await shortcut(page, 'Control+Shift+z', true)
  await expectSource(page, dragged)
  pass(
    'draft undo/redo stays local, then acceptance checkpoints it without a duplicate accepted undo',
  )

  const invalid = '// retain unfinished 🐒\n$: note('
  await edit(page, invalid)
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  await button(page, 'Undo').click()
  await expectSource(page, dragged)
  await shortcut(page, 'Control+z', true)
  await expectSource(page, original)
  await shortcut(page, 'Control+Shift+z', true)
  await expectSource(page, dragged)
  await edit(page, invalid)
  await shortcut(page, 'Control+z', true)
  assert.equal(await text(page), dragged)
  await shortcut(page, 'Control+z', true)
  await expectSource(page, dragged)
  await shortcut(page, 'Control+z', true)
  await expectSource(page, original)
  pass('invalid draft escape consumes one undo before accepted history and preserves redo')

  await button(page, 'Set CUTOFF').click()
  const value = page.getByRole('textbox', { name: 'CUTOFF', exact: true })
  await value.fill('1600')
  await value.press('Enter')
  const typed = (await saved(page)).source
  assert.notEqual(typed, original)
  assert(await button(page, 'Redo').isDisabled())
  await shortcut(page, 'Control+z')
  await expectSource(page, original)
  pass('new accepted edits after undo discard the old redo branch')

  await button(page, 'Play').click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  await shortcut(page, 'Control+Shift+z', true)
  await expectSource(page, typed)
  await page.waitForFunction(() => window.audioFixture.calls.at(-1)?.includes('lpf(1600)'))
  await shortcut(page, 'Control+z', true)
  await expectSource(page, original)
  await page.waitForFunction(() => window.audioFixture.calls.at(-1)?.includes('lpf(800)'))
  assert.equal(await page.locator('.transport-status').textContent(), 'Playing')
  pass('accepted undo/redo during playback reaches the normal engine update path')
  await button(page, 'Stop').click()
  await page.reload()
  await button(page, 'Restore last patch').click()
  await accepted(page)
  assert(await button(page, 'Undo').isDisabled())
  assert(await button(page, 'Redo').isDisabled())
  assert.equal((await saved(page)).source, original)
  assert.equal(await page.locator('.transport-status').textContent(), 'Ready')
  assert.deepEqual(errors, [])
  pass('recovery starts a fresh accepted history without autoplay or page errors')
  await page.screenshot({ path: `${output}/restored.png`, fullPage: true })
  await context.close()
  if (process.argv.includes('--real')) {
    const real = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1600, height: 1000 },
    })
    await real.addInitScript(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Called with its original AudioNode receiver.
      const connect = AudioNode.prototype.connect
      window.probes = []
      AudioNode.prototype.connect = function (...args) {
        const result = connect.apply(this, args)
        if (args[0] instanceof AudioDestinationNode) {
          const analyser = this.context.createAnalyser()
          connect.call(this, analyser)
          window.probes.push(analyser)
        }
        return result
      }
    })
    const page = await real.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await editor(page).waitFor()
    await edit(page, '$: note("c3*4").s("sine").gain(0.15)\n')
    await editor(page).press('Control+Enter')
    await page.waitForFunction(
      () => document.querySelector('.transport-status')?.textContent === 'Playing',
      null,
      { timeout: 60000 },
    )
    async function signal() {
      return page.evaluate(async () => {
        let sum = 0,
          count = 0
        for (let i = 0; i < 16; i++) {
          for (const probe of window.probes) {
            const values = new Float32Array(probe.fftSize)
            probe.getFloatTimeDomainData(values)
            for (const value of values) {
              sum += value * value
              count++
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 40))
        }
        return count ? Math.sqrt(sum / count) : 0
      })
    }
    results.pcm.initial = await signal()
    assert(results.pcm.initial > 0.001)
    await edit(page, (await saved(page)).source.replace('gain(0.15)', 'gain(0)'))
    await editor(page).press('Control+Enter')
    async function settle(name, audible) {
      for (let attempt = 0; attempt < 10; attempt++) {
        results.pcm[name] = await signal()
        if (audible ? results.pcm[name] > 0.001 : results.pcm[name] < 0.00001) return
        await page.waitForTimeout(250)
      }
      assert.fail(`${name}: ${JSON.stringify(results.pcm)}`)
    }
    await settle('mute', false)
    await shortcut(page, 'Control+z', true)
    await settle('undo', true)
    await shortcut(page, 'Meta+Shift+z', true)
    await settle('redo', false)
    assert.equal(await page.locator('.transport-status').textContent(), 'Playing')
    await button(page, 'Stop').click()
    assert.deepEqual(errors, [])
    pass(
      'real Strudel PCM: accepted mute, undo restores signal, redo mutes while scheduling continues',
    )
    await real.close()
  }
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`)
} finally {
  await browser.close()
}
