import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Real workspace/editor with a recording audio adapter; run against the Vite dev server.
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-code-application'
await mkdir(output, { recursive: true })
const results = { ui: [], pcm: {}, physicalListening: false }
const pass = (text) => {
  results.ui.push(text)
  process.stdout.write(`PASS ${text}\n`)
}
const browser = await chromium.launch({ headless: true })
const fixture = `
const state = window.audioFixture = { calls: [], stops: 0, fail: false, pending: false };
export async function play(code) {
  state.calls.push(code);
  if (state.pending) await new Promise(resolve => { state.release = resolve });
  if (state.fail) throw new Error('apply fixture');
}
export async function stop() { state.stops++; }
export async function setVolume() {}
export const getResourceStatus = () => 'unknown';
export const subscribe = () => () => {};
`
const source = (page) => page.getByRole('textbox', { name: 'Strudel source', exact: true })
async function edit(page, text) {
  await page.evaluate(async (value) => {
    ;(await import('/scripts/editor-browser.mjs')).replaceSource(value)
  }, text)
}
async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('monkeyboy.workspace.v1')))
}
async function waitStatus(page, text) {
  await page.waitForFunction(
    (value) => document.querySelector('.transport-status')?.textContent === value,
    text,
  )
}
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/src/strudel/engine.ts*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture }),
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  await source(page).waitFor()
  const initialRack = await page.locator('.module-panel').count()
  const first = '$: note("c3 e3").s("sine").lpf(800)\n'
  await edit(page, first)
  await page.waitForTimeout(600)
  assert.equal(
    await page.locator('.module-panel').count(),
    initialRack,
    'unapplied code must retain the accepted rack',
  )
  assert.match(await page.locator('.sync-status').textContent(), /Unapplied changes/)
  assert.equal((await saved(page)).draft, first)
  assert.notEqual((await saved(page)).source, first)
  await source(page).press('Control+Enter')
  await waitStatus(page, 'Pattern scheduled')
  assert.equal(await page.evaluate(() => window.audioFixture.calls.length), 1)
  assert.match(await page.locator('.sync-status').textContent(), /^Rack matches code/)
  assert.equal(
    await source(page)
      .textContent()
      .then((text) => text.includes('c3 e3')),
    true,
  )
  pass('explicit apply retains draft/rack until Ctrl+Enter, then starts once')
  const accepted = (await saved(page)).source
  await source(page).press('Control+z')
  assert.equal((await saved(page)).draft, accepted, 'Apply checkpoints local draft history')
  const calls = () => page.evaluate(() => window.audioFixture.calls.length)
  const draft = accepted.replace('800', '1200')
  await edit(page, draft)
  await source(page).press('Control+z')
  await source(page).press('Control+Shift+z')
  assert.equal((await saved(page)).draft, draft, 'unapplied draft undo/redo stays local')
  await page.waitForTimeout(600)
  assert.equal(await calls(), 1)
  assert.equal((await saved(page)).source, accepted)
  await page.getByRole('button', { name: 'Patch library', exact: true }).focus()
  await page.keyboard.press('Meta+Period')
  await waitStatus(page, 'Stopped')
  assert.equal((await saved(page)).draft, draft)
  await source(page).press('Meta+Enter')
  await waitStatus(page, 'Pattern scheduled')
  assert.equal(await calls(), 2)
  assert.match(await page.evaluate(() => window.audioFixture.calls.at(-1)), /lpf\(1200\)/)
  assert.equal((await saved(page)).draft, (await saved(page)).source)
  pass(
    'running edits stay unapplied; Cmd+. stops outside editor; Cmd+Enter applies the latest draft',
  )

  // Locate by panel content rather than assuming an imported module ID.
  const cutoff = page.getByRole('button', { name: 'Set CUTOFF', exact: true })
  await cutoff.click()
  const value = page.getByRole('textbox', { name: 'CUTOFF', exact: true })
  await value.fill('1600')
  await value.press('Enter')
  await page.waitForFunction(() => window.audioFixture.calls.length === 3)
  assert.match((await saved(page)).source, /lpf\(1600\)/)
  const knob = page.getByRole('slider', { name: 'CUTOFF', exact: true })
  const box = await knob.boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 15, { steps: 3 })
  await page.mouse.up()
  assert((await calls()) > 3)
  assert.notEqual((await saved(page)).source, accepted)
  pass('rack value entry and knob drag still apply immediately with auto-apply off')

  const beforeInvalid = await calls()
  const invalid = '// exact unfinished draft 🐒\n$: note('
  await edit(page, invalid)
  await source(page).press('Control+Enter')
  await page.getByRole('alert').filter({ hasText: 'Line 2' }).waitFor()
  assert.equal(await calls(), beforeInvalid)
  assert.equal(await page.locator('.transport-status').textContent(), 'Pattern scheduled')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.equal(Buffer.concat(chunks).toString('utf8'), invalid)
  await source(page).press('Control+Period')
  await waitStatus(page, 'Stopped')
  await page.getByRole('button', { name: 'Revert to last readable code' }).click()
  await waitStatus(page, 'Stopped')
  assert.equal(await calls(), beforeInvalid)
  pass('invalid apply retains prior scheduling/rack and exact Export; Stop and Revert remain safe')

  // IME and ordinary Enter must not execute code.
  await source(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
  )
  await source(page).press('Control+Enter')
  await page.waitForTimeout(300)
  assert.equal(await calls(), beforeInvalid)
  await source(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
  )
  await page.waitForTimeout(50)
  await source(page).press('Enter')
  assert.equal(await calls(), beforeInvalid)
  await page.getByRole('button', { name: 'Revert to last readable code' }).click()
  pass('composition and plain Enter do not apply')

  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).check()
  await edit(page, '$: note("d3").s("sine").lpf(900)\n')
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  assert.equal(await calls(), beforeInvalid)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(page, 'Pattern scheduled')
  await edit(page, (await saved(page)).source.replace('900', '1100'))
  await page.waitForFunction((count) => window.audioFixture.calls.length > count, beforeInvalid + 1)
  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).uncheck()
  const afterAuto = await calls()
  await edit(page, (await saved(page)).source.replace('1100', '1400'))
  await page.waitForTimeout(600)
  assert.equal(await calls(), afterAuto)
  pass(
    'auto-apply is opt-in, updates running code, never starts stopped audio, and can be disabled',
  )

  await page.evaluate(() => {
    window.audioFixture.fail = true
  })
  await page.getByRole('button', { name: 'Apply code', exact: true }).click()
  await waitStatus(page, 'Scheduling stopped after error')
  const afterFailure = await calls()
  await edit(page, '$: note(')
  await source(page).press('Control+Enter')
  await page.getByRole('alert').filter({ hasText: 'Line 1' }).waitFor()
  await edit(page, '$: note("e3").s("sine")\n')
  await page.waitForTimeout(600)
  assert.equal(await calls(), afterFailure)
  await page.evaluate(() => {
    window.audioFixture.fail = false
  })
  await source(page).press('Control+Enter')
  await waitStatus(page, 'Pattern scheduled')
  pass('runtime failure stops; incomplete correction stays editable; explicit Apply recovers')

  await page.evaluate(() => {
    window.audioFixture.pending = true
  })
  await edit(page, '$: note("g3").s("sine")\n')
  await source(page).press('Control+Enter')
  await page.waitForFunction(() => typeof window.audioFixture.release === 'function')
  await page.getByRole('button', { name: 'Patch library', exact: true }).click()
  await page.keyboard.press('Control+Period')
  await waitStatus(page, 'Stopped')
  await page.evaluate(() => {
    window.audioFixture.pending = false
    window.audioFixture.release()
  })
  await page.waitForTimeout(300)
  await waitStatus(page, 'Stopped')
  await page.keyboard.press('Escape')
  pass('global Stop works in a dialog during pending apply; late completion cannot restart')

  const beforeRestore = await calls()
  const restoredDraft = (await saved(page)).source.replace('g3', 'a3')
  await edit(page, restoredDraft)
  await page.reload()
  await page.getByRole('button', { name: 'Restore last patch', exact: true }).click()
  await page.waitForTimeout(600)
  assert.equal(await page.getByRole('checkbox', { name: 'Auto-apply' }).isChecked(), false)
  assert.equal((await saved(page)).draft, restoredDraft)
  assert.notEqual((await saved(page)).source, restoredDraft)
  await waitStatus(page, 'Stopped')
  assert.equal(await calls(), 0)
  assert(beforeRestore > 0)
  pass('reload defaults to explicit apply and restores accepted rack plus unapplied draft silently')
  await page.screenshot({ path: `${output}/unapplied.png`, fullPage: true })
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture.strudel',
    mimeType: 'text/plain',
    buffer: Buffer.from('$: note("b3").s("sine")\n'),
  })
  await page.getByRole('button', { name: 'Open patch', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  await waitStatus(page, 'Stopped')
  assert.equal(await calls(), 0)
  assert.match((await saved(page)).source, /b3/)
  pass('explicit file loading accepts the rack silently with auto-apply off')
  assert.deepEqual(errors, [])
  await context.close()
  if (process.argv.includes('--real')) {
    const real = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1600, height: 1000 },
    })
    await real.addInitScript(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Reapply with the original AudioNode receiver.
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
    await page.goto(base)
    await source(page).waitFor()
    await edit(page, '$: note("c3").s("sine").gain(0.15)\n')
    await page.waitForTimeout(600)
    assert.equal(await page.evaluate(() => window.probes.length), 0)
    await source(page).press('Control+Enter')
    await waitStatus(page, 'Pattern scheduled')
    async function rms() {
      return page.evaluate(async () => {
        let sum = 0,
          count = 0
        for (let i = 0; i < 25; i++) {
          for (const analyser of window.probes) {
            const samples = new Float32Array(analyser.fftSize)
            analyser.getFloatTimeDomainData(samples)
            for (const value of samples) {
              sum += value * value
              count++
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        return Math.sqrt(sum / count)
      })
    }
    results.pcm.applied = await rms()
    assert(results.pcm.applied > 0.001)
    await edit(page, '$: note("c3").s("sine").gain(0)\n')
    await page.waitForTimeout(600)
    results.pcm.unapplied = await rms()
    assert(results.pcm.unapplied > 0.001)
    await source(page).press('Meta+Enter')
    await waitStatus(page, 'Pattern scheduled')
    // Strudel installs live edits on its scheduling boundary; old notes may finish.
    for (let attempt = 0; attempt < 8; attempt++) {
      results.pcm.appliedMute = await rms()
      if (results.pcm.appliedMute < 0.00001) break
      await page.waitForTimeout(500)
    }
    assert(results.pcm.appliedMute < 0.00001, JSON.stringify(results.pcm))
    await source(page).press('Control+Period')
    await waitStatus(page, 'Stopped')
    pass(
      'real engine keyboard activation produces PCM; draft mute waits for Cmd+Enter; Ctrl+. stops',
    )
    await real.close()
  }
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`)
} finally {
  await browser.close()
}
