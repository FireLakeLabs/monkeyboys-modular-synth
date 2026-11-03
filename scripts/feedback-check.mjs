import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Real Chromium/Strudel acceptance. Requires the Vite dev server and network sample manifests.
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-feedback'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=user-gesture-required'],
})
const result = { browser: browser.version(), checks: [], physicalListening: false }
const pass = (name) => {
  result.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
// Count the real treatment boundary without adding production instrumentation.
await context.route('**/src/workspace/highlighting.ts*', async (route) => {
  const response = await route.fetch()
  const body = await response.text()
  const signature = 'export function sourceTreatments(document) {'
  assert(body.includes(signature), 'Treatment instrumentation no longer matches Vite output')
  await route.fulfill({
    response,
    body: body.replace(
      signature,
      signature + '\nwindow.treatmentReads = (window.treatmentReads ?? 0) + 1;',
    ),
  })
})
await context.addInitScript(() => {
  window.animationsSeen = []
  // oxlint-disable-next-line typescript/unbound-method -- Called with its original Element receiver.
  const animate = Element.prototype.animate
  Element.prototype.animate = function (frames, options) {
    window.animationsSeen.push({
      module: this.closest('[data-module]')?.dataset.module,
      options,
      at: performance.now(),
    })
    return animate.call(this, frames, options)
  }
  // oxlint-disable-next-line typescript/unbound-method -- Called with its original AudioNode receiver.
  const connect = AudioNode.prototype.connect
  window.probes = []
  AudioNode.prototype.connect = function (...args) {
    const value = connect.apply(this, args)
    if (args[0] instanceof AudioDestinationNode) {
      const analyser = this.context.createAnalyser()
      connect.call(this, analyser)
      window.probes.push(analyser)
    }
    return value
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const editor = page.getByRole('textbox', { name: 'Strudel source', exact: true })
async function sourceText() {
  return page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
}
async function accepted() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function code(text) {
  await editor.fill(text)
  await accepted()
  await page.evaluate(async () => {
    const view = (await import('/scripts/editor-browser.mjs')).editorView()
    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })
  })
  await page.waitForTimeout(100)
}
async function stopped() {
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Stopped',
  )
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.effect?.getComputedTiming().duration === 400)
          .length,
    ),
    0,
  )
}
try {
  await page.goto(base)
  const body = `// exact 🐒\nsetcpm(120/4)\nconst lead = note("c3 e3 g3 c4").s("sine");\n$: lead.iter(4).lpf(800).lpq(2)\n$: lead.jux(rev).gain(0.15)\n$: note("c2").s("sine").chunk(4, x => x.hurry(2))\n`
  await code(body)
  assert((await sourceText()).startsWith(body))
  const saved = await sourceText()
  const reads = await page.evaluate(() => window.treatmentReads)
  await page.getByRole('button', { name: 'Select vcf1', exact: true }).click()
  assert.equal(await page.evaluate(() => window.treatmentReads), reads)
  assert.deepEqual(await page.locator('.source-selected').allTextContents(), [
    '.lpf(800)',
    '.lpq(2)',
  ])
  assert.equal(await sourceText(), saved)
  const colors = await page.locator('.cm-content').evaluate((element) =>
    Array.from(element.querySelectorAll('span'))
      .filter((e) => e.className)
      .map((e) => ({
        text: e.textContent,
        color: getComputedStyle(e).color,
        underline: getComputedStyle(e).textDecorationStyle,
      })),
  )
  assert(colors.some((s) => s.text === '.iter(4)' && s.color === 'rgb(140, 245, 218)'))
  assert(colors.some((s) => s.text === '.s("sine")' && s.color === 'rgb(244, 164, 98)'))
  assert(colors.some((s) => s.text === 'lead' && s.color === 'rgb(255, 196, 143)'))
  assert(colors.some((s) => s.text.includes('chunk') && s.underline === 'dashed'))
  await page.screenshot({ path: `${output}/editor.png` })
  pass('family/category/named-output styling, all VCF spans, exact retained source')

  const position = await page.evaluate(async () => {
    const view = (await import('/scripts/editor-browser.mjs')).editorView()
    const from = view.state.doc.toString().indexOf('.lpq(2)')
    view.dispatch({ selection: { anchor: from + 7, head: from } })
    view.scrollDOM.scrollTop = 120
    view.scrollDOM.scrollLeft = 80
    return { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft }
  })
  await page
    .locator('[data-module="vcf1"]')
    .getByRole('button', { name: 'Set CUTOFF', exact: true })
    .click()
  await page
    .locator('[data-module="vcf1"]')
    .getByRole('textbox', { name: 'CUTOFF', exact: true })
    .fill('1800')
  await page
    .locator('[data-module="vcf1"]')
    .getByRole('textbox', { name: 'CUTOFF', exact: true })
    .press('Enter')
  const mapped = await page.evaluate(async () => {
    const view = (await import('/scripts/editor-browser.mjs')).editorView()
    const { from, to, anchor, head } = view.state.selection.main
    return {
      text: view.state.sliceDoc(from, to),
      backward: anchor > head,
      top: view.scrollDOM.scrollTop,
      left: view.scrollDOM.scrollLeft,
    }
  })
  assert.equal(mapped.text, '.lpq(2)')
  assert(mapped.backward)
  assert.deepEqual({ top: mapped.top, left: mapped.left }, position)
  assert((await sourceText()).includes('.lpf(1800)'))
  await page.locator('[data-module="vcf1"]').click({ button: 'right' })
  await page.getByRole('button', { name: 'Show in code', exact: true }).click()
  await page.waitForTimeout(100)
  assert(
    await page.evaluate(async () => {
      const view = (await import('/scripts/editor-browser.mjs')).editorView()
      const coords = view.coordsAtPos(view.state.selection.main.from)
      const bounds = view.scrollDOM.getBoundingClientRect()
      return coords && coords.top >= bounds.top && coords.bottom <= bounds.bottom
    }),
  )
  pass(
    'real rack value rewrite maps backward selection and both scroll axes; Show in code uses live geometry',
  )
  await code(saved)

  // Draft history ends at acceptance; accepted rack/source undo is owned by #63.
  await page.evaluate(async () => {
    const view = (await import('/scripts/editor-browser.mjs')).editorView()
    view.focus()
    view.dispatch({ selection: { anchor: 3 } })
  })
  await editor.press('x')
  await editor.press('ControlOrMeta+z')
  assert.equal(await sourceText(), saved)
  await accepted()
  await editor.press('x')
  await accepted()
  const checkpoint = await sourceText()
  await editor.press('ControlOrMeta+z')
  assert.equal(await sourceText(), checkpoint)
  await code(saved)
  pass('unaccepted typing can be undone locally; accepting source checkpoints local history')

  await editor.fill('$: note(')
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  assert.equal(await page.locator('.source-selected').count(), 0)
  assert.match(await page.locator('.source-selection').textContent(), /highlights paused/)
  await code(saved)
  assert.deepEqual(await page.locator('.source-selected').allTextContents(), [
    '.lpf(800)',
    '.lpq(2)',
  ])
  pass('invalid drafts clear selection highlights; accepted source restores current ownership')

  await page.evaluate(async () => {
    const { editorView } = await import('/scripts/editor-browser.mjs')
    const view = editorView()
    view.focus()
    view.dispatch({ selection: { anchor: 9, head: 9 } })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.sync-status').textContent(), 'Reading code…')
  assert.equal(await page.locator('.source-selected').count(), 0)
  await cdp.send('Input.insertText', { text: '日本' })
  await accepted()
  assert((await sourceText()).startsWith('// exact 日本🐒'))
  pass(
    'native Chromium IME composition defers parsing, clears stale highlights and commits exact Japanese text',
  )

  await page.getByRole('button', { name: 'Select code1', exact: true }).click()
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  )
  await page.locator('[data-module="code1"]').click({ button: 'right' })
  await page.getByRole('button', { name: 'Show in code', exact: true }).click()
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'cyber-edit',
  )
  const beforeCyberDraft = await sourceText()
  await page.evaluate(async () => {
    const view = (await import('/scripts/editor-browser.mjs')).editorView()
    view.dispatch({ selection: { anchor: view.state.selection.main.to } })
  })
  await editor.press('(')
  await page.waitForFunction(
    () => document.querySelector('.sync-status')?.textContent === 'Rack shows previous code',
  )
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'cyber-edit',
  )
  await editor.evaluate((element) => element.blur())
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.cyber-cursor')).animationName === 'none',
  )
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  )
  await page.getByRole('button', { name: 'Revert to last readable code', exact: true }).click()
  await accepted()
  assert.equal(await sourceText(), beforeCyberDraft)
  pass(
    'typing beyond a CODE span retains Cyber editing focus through an invalid draft; blur clears it and Revert restores source',
  )
  await page.getByRole('button', { name: 'Select vcf1', exact: true }).click()
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  )
  pass('Cyber cursor stays solid except while its block is being edited')

  await page.evaluate(async () => {
    const { editorDecorations } = await import('/scripts/editor-browser.mjs')
    window.savedDecorations = editorDecorations()
    window.readsBeforePlay = window.treatmentReads
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () =>
      window.animationsSeen.some((a) => a.module === 'iter1') &&
      window.animationsSeen.some((a) => a.module === 'jux1'),
    undefined,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(600)
  const audio = await page.evaluate(() => {
    let sum = 0,
      count = 0
    for (const analyser of window.probes) {
      const values = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(values)
      for (const value of values) {
        sum += value * value
        count++
      }
    }
    return {
      rms: Math.sqrt(sum / count),
      animations: window.animationsSeen,
      widths: Array.from(document.querySelectorAll('[data-module]')).map((e) => [
        e.dataset.module,
        e.getBoundingClientRect().width,
      ]),
      cables: Array.from(document.querySelectorAll('.cable > path:not(.cable-shadow)')).map((e) =>
        e.getAttribute('d'),
      ),
    }
  })
  assert(audio.rms > 0.001)
  assert(audio.animations.every((a) => a.options.duration === 400))
  assert(audio.animations.some((a) => a.module === 'osc1' && a.options.pseudoElement === '::after'))
  assert(!audio.animations.some((a) => ['seq2', 'osc2', 'code1'].includes(a.module)))
  assert(
    await page.evaluate(async () => {
      const { editorDecorations } = await import('/scripts/editor-browser.mjs')
      return (
        window.treatmentReads === window.readsBeforePlay &&
        editorDecorations() === window.savedDecorations
      )
    }),
  )
  pass(
    'selection does not reparse treatments; playback renders retain the same decorations and treatment count',
  )
  result.pcmRms = audio.rms
  pass(
    'real final ITER/JUX events drive 400 ms Alien/Instrument feedback; opaque voice has none; PCM remains nonzero',
  )
  await page.evaluate(() => {
    window.motionChanged = false
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener(
      'change',
      () => {
        window.motionChanged = true
      },
      { once: true },
    )
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => window.motionChanged)
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.effect?.getComputedTiming().duration === 400)
          .length,
    ),
    0,
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  pass('changing reduced motion during playback clears active fades')
  await stopped()
  const countAtStop = await page.evaluate(() => window.animationsSeen.length)
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => window.animationsSeen.length), countAtStop)
  pass('Stop cancels active fades and pending event visuals')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('[data-module="code1"]').click({ button: 'right' })
  await page.getByRole('button', { name: 'Show in code', exact: true }).click()
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Pattern scheduled',
  )
  await page.waitForTimeout(900)
  assert.equal(await page.evaluate(() => window.animationsSeen.length), countAtStop)
  const geometry = await page.evaluate(() => ({
    widths: Array.from(document.querySelectorAll('[data-module]')).map((e) => [
      e.dataset.module,
      e.getBoundingClientRect().width,
    ]),
    cables: Array.from(document.querySelectorAll('.cable > path:not(.cable-shadow)')).map((e) =>
      e.getAttribute('d'),
    ),
  }))
  assert.deepEqual(geometry.widths, audio.widths)
  assert.deepEqual(geometry.cables, audio.cables)
  pass('reduced motion suppresses pulses/blinking; widths and cable paths remain identical')
  await stopped()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction((count) => window.animationsSeen.length > count, countAtStop)
  await code('$: note("e3").s("sine").gain(0.1)\n')
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Pattern scheduled',
  )
  const countAfterReplace = await page.evaluate(
    () => window.animationsSeen.filter((a) => ['iter1', 'jux1'].includes(a.module)).length,
  )
  await page.waitForTimeout(700)
  assert.equal(
    await page.evaluate(
      () => window.animationsSeen.filter((a) => ['iter1', 'jux1'].includes(a.module)).length,
    ),
    countAfterReplace,
  )
  await code('$: note("c3").missingMethod()\n')
  await page.waitForFunction(
    () =>
      document.querySelector('.transport-status')?.textContent === 'Scheduling stopped after error',
  )
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.effect?.getComputedTiming().duration === 400)
          .length,
    ),
    0,
  )
  pass('replacement and surfaced errors clear obsolete activity')
  for (const bare of [
    `setcpm(30)
note('c3').s('sine').iter(4)`,
    `const lead = note('c3').s('sine')
lead.iter(4)`,
  ]) {
    await code(bare)
    const saved = await sourceText()
    await page.evaluate(() => {
      window.animationsSeen = []
    })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.transport-status')?.textContent === 'Pattern scheduled',
    )
    await page.waitForFunction(() => window.animationsSeen.some((a) => a.module.startsWith('iter')))
    assert.equal(await sourceText(), saved)
    await stopped()
  }
  pass(
    'semicolon-free bare voices after tempo and const declarations play with attributable activity',
  )
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${output}/results.json`, `${JSON.stringify(result, null, 2)}\n`)
  await browser.close()
}
