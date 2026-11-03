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
async function accepted() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function code(text) {
  await editor.fill(text)
  await accepted()
}
async function stopped() {
  await page.getByRole('button', { name: 'Stop scheduling', exact: true }).click()
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
  assert((await editor.inputValue()).startsWith(body))
  const saved = await editor.inputValue()
  await page.getByRole('button', { name: 'Select vcf1', exact: true }).click()
  assert.deepEqual(await page.locator('.source-selected').allTextContents(), [
    '.lpf(800)',
    '.lpq(2)',
  ])
  assert.equal(await editor.inputValue(), saved)
  const colors = await page.locator('.source-ink').evaluate((element) =>
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
  const typography = await page.evaluate(() => {
    const properties = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'tabSize',
      'whiteSpace',
      'fontVariantLigatures',
    ]
    return ['.source-editor', '.source-ink'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector))
      return Object.fromEntries(properties.map((property) => [property, style[property]]))
    })
  })
  assert.deepEqual(typography[0], typography[1])
  const alignment = await page.evaluate(() => {
    const editor = document.querySelector('.source-editor'),
      ink = document.querySelector('.source-ink')
    const range = document.createRange()
    range.setStart(ink.firstChild.firstChild, 0)
    range.setEnd(ink.firstChild.firstChild, 8)
    const style = getComputedStyle(editor),
      canvas = document.createElement('canvas'),
      measure = canvas.getContext('2d')
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    return {
      actualWidth: range.getBoundingClientRect().width,
      expectedWidth: measure.measureText(editor.value.slice(0, 8)).width,
      actualLeft: range.getBoundingClientRect().left,
      expectedLeft:
        editor.getBoundingClientRect().left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft),
    }
  })
  assert(Math.abs(alignment.actualWidth - alignment.expectedWidth) < 0.1, JSON.stringify(alignment))
  assert.equal(alignment.actualLeft, alignment.expectedLeft)
  pass('ink typography, character width and text origin match native textarea')

  pass('family/category/named-output styling, all VCF spans, exact retained source')

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

  await editor.evaluate((e) => {
    e.focus()
    e.setSelectionRange(3, 7, 'backward')
    e.scrollTop = 400
    e.scrollLeft = e.scrollWidth
    e.dispatchEvent(new Event('scroll'))
  })
  const scrolled = await page.evaluate(() => {
    const e = document.querySelector('.source-editor'),
      ink = document.querySelector('.source-ink')
    return [e.scrollTop, ink.scrollTop, e.scrollLeft, ink.scrollLeft, e.selectionDirection]
  })
  assert.equal(scrolled[0], scrolled[1])
  assert.equal(scrolled[2], scrolled[3])
  assert.equal(scrolled[4], 'backward')
  await editor.evaluate((e) => {
    e.scrollTop = 0
    e.scrollLeft = 0
    e.setSelectionRange(9, 9)
    e.dispatchEvent(new Event('scroll'))
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.sync-status').textContent(), 'Reading code…')
  assert.equal(await page.locator('.source-selected').count(), 0)
  await cdp.send('Input.insertText', { text: '日本' })
  await accepted()
  assert((await editor.inputValue()).startsWith('// exact 日本🐒'))
  pass(
    'native scroll/selection preserved; real IME composition defers parsing and removes stale highlights',
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
  await page.getByRole('button', { name: 'Select vcf1', exact: true }).click()
  assert.equal(
    await page.locator('.cyber-cursor').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  )
  pass('Cyber cursor stays solid except while its block is being edited')

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
    const saved = await editor.inputValue()
    await page.evaluate(() => {
      window.animationsSeen = []
    })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.transport-status')?.textContent === 'Pattern scheduled',
    )
    await page.waitForFunction(() => window.animationsSeen.some((a) => a.module.startsWith('iter')))
    assert.equal(await editor.inputValue(), saved)
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
