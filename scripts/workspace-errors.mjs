import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Run against the Vite development server; this suite replaces only the audio adapter.
// Real engine/resource probes below use separate fresh browser contexts.
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-workspace-errors'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=user-gesture-required'],
})
const results = {
  browser: browser.version(),
  ui: [],
  engine: [],
  pcm: {},
  events: {},
  physicalListening: false,
}
const pass = (group, name) => {
  results[group].push(name)
  process.stdout.write(`PASS ${group}: ${name}\n`)
}
const source = (page) => page.getByRole('textbox', { name: 'Strudel source', exact: true })
async function replaceSource(page, text) {
  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).check()
  await source(page).waitFor()
  await page.evaluate(async (value) => {
    ;(await import('/scripts/editor-browser.mjs')).replaceSource(value)
  }, text)
}
async function sourceText(page) {
  return page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
}
const status = (page) => page.locator('.transport-status')
async function waitStatus(page, value) {
  await page.waitForFunction(
    (text) => document.querySelector('.transport-status')?.textContent === text,
    value,
  )
}
async function accepted(page) {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function code(page, text) {
  await replaceSource(page, text)
  await accepted(page)
}
async function patch(page) {
  return page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    return read((await import('/scripts/editor-browser.mjs')).editorSource()).patch
  })
}
async function open(page, text) {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'fixture.strudel', mimeType: 'text/plain', buffer: Buffer.from(text) })
}
const fixture = `
const state = window.audioFixture = { calls: [], play: 'ok', stop: 'ok', release: null, reject: null };
export async function play(code) {
  state.calls.push(code);
  if (state.play === 'reject') throw new Error(state.detail || 'evaluation fixture');
  if (state.play === 'pending') await new Promise((resolve, reject) => { state.release = resolve; state.reject = reject });
}
export async function stop() {
  if (state.stop === 'reject') throw new Error('Stop fixture');
  if (state.stop === 'pending') await new Promise(resolve => { state.releaseStop = resolve });
}
export async function setVolume() {}
const samplePacks = [];
export const getSamplePacks = () => samplePacks;
export const getSampleWarnings = () => samplePacks;
export const subscribeSamplePacks = () => () => {};
export const getResourceStatus = () => 'unknown';
export const getClock = () => ({ cycle: 0, cps: 0.5, running: false });
export const scopeData = () => undefined;
export const probe = async () => ({ kind: 'unavailable', reason: 'audio fixture' });
export const subscribe = () => () => {};
`
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/src/strudel/engine.ts*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture }),
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  const longVoice = await readFile(
    new URL('../src/reader/fixtures/issue-44.strudel', import.meta.url),
    'utf8',
  )
  await code(page, longVoice)
  const longSaved = await sourceText(page)
  const longRack = await patch(page)
  await page.evaluate(async (original) => {
    const { read } = await import('/src/reader/index.ts')
    const { validateRack } = await import('/src/rack/model.ts')
    const { sourceBody } = await import('/src/workspace/document.ts')
    const saved = (await import('/scripts/editor-browser.mjs')).editorSource()
    validateRack(read(saved).patch)
    if (sourceBody(saved) !== original) throw new Error('Long voice executable source changed')
  }, longVoice)
  assert(new Set(longRack.modules.map((module) => module.row)).size > 2)
  // Invalid saved positions retain the exact file, with a valid projected rack
  // and an explicit replacement boundary before rack edits are allowed.
  const failedLayout = longSaved.replace('"hp": 0', '"hp": 104')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(page, 'Playing')
  await replaceSource(page, failedLayout)
  await page.getByRole('button', { name: 'Replace rack metadata', exact: true }).waitFor()
  await accepted(page)
  assert.equal(await sourceText(page), failedLayout)
  await page.evaluate(async () => {
    const { read } = await import('/src/reader/index.ts')
    const { validateRack } = await import('/src/rack/model.ts')
    const document = read((await import('/scripts/editor-browser.mjs')).editorSource())
    if (document.layout !== 'invalid') throw new Error('Off-rail metadata was trusted')
    validateRack(document.patch)
  })
  const projectedRack = await patch(page)
  await assert.rejects(
    () => page.getByRole('button', { name: 'Add VCF', exact: true }).click({ timeout: 500 }),
    /Timeout/,
  )
  assert.equal(await sourceText(page), failedLayout)
  assert.deepEqual(await patch(page), projectedRack)
  assert.equal(await page.locator('.module-panel').count(), longRack.modules.length)
  const failedDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  assert.equal(await readFile(await (await failedDownload).path(), 'utf8'), failedLayout)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(page, 'Ready')
  await code(page, longSaved)
  assert.equal(await sourceText(page), longSaved)
  assert.deepEqual(await patch(page), longRack)
  await replaceSource(page, failedLayout)
  await page.getByRole('button', { name: 'Replace rack metadata', exact: true }).click()
  await page.waitForFunction(async () => {
    const { read } = await import('/src/reader/index.ts')
    return read((await import('/scripts/editor-browser.mjs')).editorSource()).layout === 'restored'
  })
  assert.equal(await status(page).textContent(), 'Ready')
  await code(page, longVoice.replace('.room(.6)', '.room(.7)'))
  assert.equal(await status(page).textContent(), 'Ready')
  assert.match(await sourceText(page), /room\(\.7\)/)
  pass(
    'ui',
    'issue #44 spills long CODE/CV voice onto fixed rails; invalid metadata retains exact file and valid projected rack; Export/Stop and explicit metadata replacement recover without autoplay',
  )
  await code(page, '// retained 🐒\n$: note("c3").s("sine").lpf(800)\n')
  const original = await sourceText(page)
  const identity = await patch(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(page, 'Playing')
  const invalid = '// exact draft 🐒\n$: note('
  await replaceSource(page, invalid)
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  assert.equal(await status(page).textContent(), 'Playing')
  assert.match(await page.locator('.audio-note').textContent(), /Previous pattern scheduled/)
  assert.equal(await page.locator('.module-panel').count(), identity.modules.length)
  await assert.rejects(
    () => page.getByRole('button', { name: 'Add VCF', exact: true }).click({ timeout: 500 }),
    /Timeout/,
  )
  assert.match(await page.getByRole('alert').textContent(), /Line 2, column/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  assert.equal(await readFile(await (await download).path(), 'utf8'), invalid)
  await page.screenshot({ path: `${output}/syntax.png` })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(page, 'Ready')
  await page.getByRole('button', { name: 'Revert to last readable code', exact: true }).click()
  assert.equal(await sourceText(page), original)
  assert.deepEqual(await patch(page), identity)
  assert.equal(await status(page).textContent(), 'Ready')
  pass(
    'ui',
    'invalid draft export is byte exact; accepted rack retained/locked; Revert restores saved identity without Play',
  )

  for (const detail of ['manifest fixture', 'activation blocked fixture', 'evaluation fixture']) {
    await page.evaluate((detail) => {
      window.audioFixture.play = 'reject'
      window.audioFixture.detail = detail
    }, detail)
    const retained = await sourceText(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await waitStatus(page, 'Audio error')
    assert.equal(await sourceText(page), retained)
    assert.match(await page.locator('.error details').textContent(), new RegExp(detail))
    await replaceSource(page, '$: note(')
    await page.waitForFunction(
      () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
      undefined,
      { timeout: 2000 },
    )
    assert.equal(await sourceText(page), '$: note(')
    assert(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled())
    const failedDraftDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    assert.equal(await readFile(await (await failedDraftDownload).path(), 'utf8'), '$: note(')
    await page.evaluate(() => {
      window.audioFixture.play = 'ok'
    })
    await code(page, retained.replace('.lpf(800)', '.lpf(900)'))
    assert.equal(await status(page).textContent(), 'Audio error')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await waitStatus(page, 'Playing')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await waitStatus(page, 'Ready')
  }
  pass(
    'ui',
    'adapter manifest/resume/evaluation rejections keep incomplete drafts editable/exportable with Play disabled after confirmed Stop and require explicit Play after correction',
  )

  await page.evaluate(() => {
    window.audioFixture.play = 'pending'
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => window.audioFixture.release !== null)
  await code(page, '$: note("d3").s("sine")\n')
  await page.evaluate(() => window.audioFixture.reject(new Error('obsolete code failure')))
  await waitStatus(page, 'Audio error')
  assert.match(await page.getByRole('alert').textContent(), /earlier code revision/)
  assert.equal(await source(page).getAttribute('aria-invalid'), 'false')
  assert.match(await sourceText(page), /d3/)
  pass(
    'ui',
    'older failure is labeled as older work; current valid code has no invented runtime underline',
  )

  await page.evaluate(() => {
    window.audioFixture.play = 'ok'
    window.audioFixture.stop = 'reject'
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(page, 'Playing')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(page, 'Audio state unknown')
  const retained = await sourceText(page)
  await open(page, '$: note("g3").s("sine")\n')
  assert.equal(await sourceText(page), retained)
  await page.getByRole('button', { name: 'Open patch', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.code')?.textContent.includes('Could not replace patch'),
  )
  assert.equal(await sourceText(page), retained)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New patch', exact: true }).click()
  await page.getByRole('button', { name: 'Replace patch', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.code')?.textContent.includes('Could not replace patch'),
  )
  assert.equal(await sourceText(page), retained)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(() => {
    window.audioFixture.stop = 'ok'
  })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(page, 'Ready')
  pass(
    'ui',
    'failed Stop reports unknown audio, refuses Open/New, retains source and supports Retry Stop',
  )

  await page.evaluate(() => {
    window.audioFixture.play = 'pending'
    window.audioFixture.stop = 'pending'
    window.audioFixture.release = null
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => window.audioFixture.release !== null)
  await open(page, '$: note("a3").s("sine")\n')
  await page.getByRole('button', { name: 'Open patch', exact: true }).click()
  await waitStatus(page, 'Stopping audio')
  await replaceSource(page, '// work typed during Stop\n$: note("e3").s("sine")\n')
  await accepted(page)
  await page.waitForFunction(
    () => document.querySelector('.code')?.textContent.includes('Still waiting for audio'),
    undefined,
    { timeout: 15_000 },
  )
  assert.match(await sourceText(page), /work typed during Stop/)
  await page.screenshot({ path: `${output}/pending.png` })
  await page.evaluate(() => {
    window.audioFixture.release()
    window.audioFixture.releaseStop()
    window.audioFixture.stop = 'ok'
  })
  await waitStatus(page, 'Ready')
  await page.waitForFunction(() =>
    document.querySelector('.code')?.textContent.includes('Replacement cancelled'),
  )
  assert.match(await sourceText(page), /work typed during Stop/)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  pass(
    'ui',
    'pending evaluation/Stop warning does not claim cancellation; edits cancel pending Open replacement',
  )

  await open(page, '// unsupported preserved\n$: note("g3").s("sine").chunkBack(4, x => x.rev())\n')
  await page.getByRole('button', { name: 'Open patch', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.cm-content')?.textContent.includes('// unsupported preserved'),
  )
  await accepted(page)
  assert.match(await sourceText(page), /chunkBack\(4, x => x.rev\(\)\)/)
  assert((await patch(page)).modules.some((module) => module.type === 'code'))
  assert.equal(await status(page).textContent(), 'Ready')
  assert.deepEqual(errors, [])
  pass(
    'ui',
    'confirmed Open stays silent and preserves valid unsupported CODE; no unhandled browser errors',
  )
  for (const action of ['Cancel', 'Escape']) {
    await page.evaluate(() => {
      window.audioFixture.play = 'pending'
      window.audioFixture.stop = 'pending'
      window.audioFixture.release = null
    })
    const before = await sourceText(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(() => window.audioFixture.release !== null)
    await page.getByRole('button', { name: 'New patch', exact: true }).click()
    await page.getByRole('button', { name: 'Replace patch', exact: true }).click()
    await waitStatus(page, 'Stopping audio')
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.evaluate(() => {
      window.audioFixture.release()
      window.audioFixture.releaseStop()
      window.audioFixture.stop = 'ok'
    })
    await waitStatus(page, 'Ready')
    assert.equal(await sourceText(page), before)
  }
  pass('ui', 'Cancel and Escape invalidate New replacement while Stop is pending')
  const invalidFile = '// imported CRLF 🐒\r\n$: note('
  await open(page, invalidFile)
  await page.getByRole('button', { name: 'Open patch', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  const exactDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  assert.equal(await readFile(await (await exactDownload).path(), 'utf8'), invalidFile)
  pass('ui', 'imported invalid CRLF draft exports exact bytes with exact editor-state line endings')
  await context.close()

  // This is the real adapter, network and WebAudio engine in fresh, isolated contexts.
  const real = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    ignoreHTTPSErrors: true,
  })
  await real.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoke with the original AudioNode receiver below.
    const connect = AudioNode.prototype.connect
    const outputs = new Map()
    window.probes = []
    window.recoveryTriggers = 0
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args)
      if (args[0] instanceof AudioDestinationNode) {
        // Sum output branches per context. Averaging separate analysers would
        // dilute the measured signal as silent or expired branches accumulate.
        let analyser = outputs.get(this.context)
        if (!analyser) {
          analyser = this.context.createAnalyser()
          outputs.set(this.context, analyser)
          window.probes.push(analyser)
        }
        connect.call(this, analyser)
      }
      return result
    }
  })
  const audio = await real.newPage()
  await audio.goto(base)
  // Sustain across each gate so short PCM windows do not depend on note decay.
  await code(
    audio,
    '$: note("c3 e3").s("sine").attack(0).decay(0).sustain(1).release(.05).gain(.15).onTrigger(() => { globalThis.recoveryTriggers++; }, false)\n',
  )
  assert.match(
    await audio.locator('.audio-note').textContent(),
    /unknown; audio has not initialized/,
  )
  assert.equal(await audio.evaluate(() => window.probes.length), 0)
  let failManifest = true
  await real.route('**/strudel.json', (route) =>
    failManifest ? route.fulfill({ status: 503, body: 'manifest fixture' }) : route.continue(),
  )
  const saved = await sourceText(audio)
  await audio.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(audio, 'Playing')
  assert.equal(await sourceText(audio), saved)
  await audio.locator('.cartridge-error').first().waitFor()
  failManifest = false
  async function rms() {
    return audio.evaluate(async () => {
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
      return { rms: Math.sqrt(sum / count), samples: count }
    })
  }
  await audio.waitForFunction(() => window.recoveryTriggers > 0)
  results.pcm.play = await rms()
  assert(results.pcm.play.rms > 0.001)
  // Silent output branches do not change the sound and must not dilute the probe.
  await audio.evaluate(() => {
    const context = window.probes[0].context
    window.silentProbeBranches = Array.from({ length: 64 }, () => {
      const node = context.createGain()
      node.connect(context.destination)
      return node
    })
  })
  results.pcm.silentBranches = await rms()
  assert(results.pcm.silentBranches.rms > results.pcm.play.rms * 0.8)
  assert(results.pcm.silentBranches.rms < results.pcm.play.rms * 1.2)
  await audio.evaluate(() => window.silentProbeBranches.forEach((node) => node.disconnect()))
  const triggersBeforeDraft = await audio.evaluate(() => window.recoveryTriggers)
  results.events.beforeDraft = triggersBeforeDraft
  await replaceSource(audio, '$: note(')
  await audio.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  // Require future onsets, rather than mistaking a note's tail for continued scheduling.
  await audio.waitForFunction(
    (before) => window.recoveryTriggers >= before + 2,
    triggersBeforeDraft,
  )
  results.events.afterDraft = await audio.evaluate(() => window.recoveryTriggers)
  results.pcm.invalidDraft = await rms()
  assert(results.pcm.invalidDraft.rms > 0.001)
  await audio.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(audio, 'Ready')
  const triggersAtStop = await audio.evaluate(() => window.recoveryTriggers)
  results.events.atStop = triggersAtStop
  // Observe after the test synth's release; Stop itself does not promise immediate silence.
  await audio.waitForTimeout(1500)
  results.pcm.afterStop = await rms()
  assert(results.pcm.afterStop.rms < 0.00001)
  results.events.afterStop = await audio.evaluate(() => window.recoveryTriggers)
  assert.equal(results.events.afterStop, triggersAtStop)
  pass(
    'engine',
    'fresh-context real manifest failure keeps unrelated synth playing and retains source; PCM continues through syntax error and ceases after Stop/tails',
  )
  await real.close()

  const faults = await browser.newContext({ ignoreHTTPSErrors: true })
  await faults.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoke with the original AudioContext receiver below.
    const resume = AudioContext.prototype.resume
    const clear = globalThis.clearInterval
    globalThis.clearInterval = (id) => {
      if (globalThis.failNextStop) {
        globalThis.failNextStop = false
        throw new Error('injected scheduler Stop failure')
      }
      return clear(id)
    }
    let blocked = true
    AudioContext.prototype.resume = function () {
      if (blocked) {
        blocked = false
        return Promise.reject(new Error('injected activation rejection'))
      }
      return resume.call(this)
    }
  })
  const fault = await faults.newPage()
  await fault.goto(base)
  await code(fault, '$: note("c3").s("sine")\n')
  const beforeActivation = await sourceText(fault)
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(fault, 'Audio error')
  assert.equal(await sourceText(fault), beforeActivation)
  assert.match(await fault.locator('.error details').textContent(), /injected activation rejection/)
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(fault, 'Playing')
  await code(fault, '$: note("c3").missingMethod()\n')
  await waitStatus(fault, 'Audio error')
  await code(fault, '$: note("c4").s("sine")\n')
  assert.equal(await status(fault).textContent(), 'Audio error')
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(fault, 'Playing')
  pass(
    'engine',
    'real adapter resume rejection and construction throw retain work; retry/correction needs explicit Play',
  )

  await fault.evaluate(() => {
    globalThis.failNextStop = true
  })
  await fault.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(fault, 'Audio state unknown')
  assert.match(
    await fault.locator('.error details').textContent(),
    /injected scheduler Stop failure/,
  )
  await fault.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(fault, 'Ready')
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(fault, 'Playing')
  pass('engine', 'real scheduler Stop failure reports unknown state; explicit Stop retry recovers')

  const missing = fault.waitForEvent('console', {
    predicate: (message) => /monkeyboy_missing_fixture.*not found/.test(message.text()),
  })
  await code(fault, '$: s("monkeyboy_missing_fixture")\n')
  await missing
  await waitStatus(fault, 'Audio error')
  assert.match(
    await fault.locator('.audio-note').textContent(),
    /resource\/output failure observed/,
  )
  pass(
    'engine',
    'missing sample is reported in a workspace banner and automatically stops scheduling',
  )
  let decodeRequests = 0
  await faults.route('**/*.{wav,mp3,ogg}', (route) => {
    decodeRequests++
    return route.fulfill({ contentType: 'audio/wav', body: 'intentionally undecodable fixture' })
  })
  const decode = fault.waitForEvent('console', {
    predicate: (message) => /decode audio|decoding|EncodingError/i.test(message.text()),
  })
  await code(fault, '$: s("bd")\n')
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await decode
  assert(decodeRequests > 0)
  await waitStatus(fault, 'Audio error')
  assert.match(
    await fault.locator('.audio-note').textContent(),
    /resource\/output failure observed/,
  )
  pass(
    'engine',
    'undecodable sample reports failure; registered manifests never claim verified decoding',
  )
  await code(
    fault,
    '$: note("c3").s("sine").onTrigger(() => { globalThis.lateOutputFixture = true; throw new Error(\'late output fixture\') }, false)\n',
  )
  await fault.getByRole('button', { name: 'Play', exact: true }).click()
  await fault.waitForFunction(() => globalThis.lateOutputFixture === true)
  await waitStatus(fault, 'Audio error')
  assert.match(await fault.locator('.error details').textContent(), /late output fixture/)
  assert(await fault.getByRole('button', { name: 'Play', exact: true }).isEnabled())
  pass('engine', 'late output throw reaches workspace banner and automatically stops scheduling')
  await faults.close()

  const hung = await browser.newContext({ ignoreHTTPSErrors: true })
  const hang = await hung.newPage()
  await hang.goto(base)
  await code(
    hang,
    '// intentionally pending\nglobalThis.hungEvaluationStarted = true; new Promise(() => {})\n',
  )
  await hang.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(hang, 'Starting audio')
  await hang.waitForFunction(() => globalThis.hungEvaluationStarted === true)
  await hang.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(hang, 'Ready')
  const hungDraft = await sourceText(hang)
  const hungDownload = hang.waitForEvent('download')
  await hang.getByRole('button', { name: 'Export', exact: true }).click()
  assert.equal(
    await readFile(await (await hungDownload).path(), 'utf8'),
    await hang.evaluate(
      async (text) => (await import('/scripts/editor-browser.mjs')).expectedExport(text),
      hungDraft,
    ),
  )
  assert.equal(await status(hang).textContent(), 'Ready')
  await code(hang, '$: note("c3").s("sine")\n')
  await hang.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(hang, 'Audio error')
  assert.match(
    await hang.locator('.error details').textContent(),
    /previous evaluation is still pending/,
  )
  await hang.reload()
  await hang.getByRole('button', { name: 'Restore last patch', exact: true }).click()
  await waitStatus(hang, 'Ready')
  await code(hang, '$: note("c3").s("sine")\n')
  await hang.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(hang, 'Playing')
  pass(
    'engine',
    'real never-settling evaluation permits immediate Stop and exact export; replay refused until reload, then explicit Play succeeds',
  )
  await hang.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(hang, 'Ready')
  await code(
    hang,
    `new Promise(resolve => { globalThis.finishEvaluation = () => resolve(note('c3').s('sine')) })\n`,
  )
  await hang.getByRole('button', { name: 'Play', exact: true }).click()
  await hang.waitForFunction(() => typeof globalThis.finishEvaluation === 'function')
  await hang.getByRole('button', { name: 'Stop', exact: true }).click()
  await waitStatus(hang, 'Ready')
  let starts = 0
  hang.on('console', (message) => {
    if (message.text().includes('[cyclist] start')) starts++
  })
  const abandoned = hang.waitForEvent('console', {
    predicate: (message) =>
      /\[eval\] error: Audio operation cancelled by Stop/.test(message.text()),
  })
  await hang.evaluate(() => globalThis.finishEvaluation())
  await abandoned
  assert.equal(starts, 0)
  assert.equal(await status(hang).textContent(), 'Ready')
  await code(hang, '$: note("d3").s("sine")\n')
  await hang.getByRole('button', { name: 'Play', exact: true }).click()
  await waitStatus(hang, 'Playing')
  pass(
    'engine',
    'settled abandoned evaluation cannot restart its scheduler; explicit Play can recover without reload',
  )
  await hung.close()
} finally {
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`)
  await browser.close()
}
