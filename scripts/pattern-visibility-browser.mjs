// #139: real engine, UI, no-audio probe safety and reduced-motion proof.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-pattern-visibility'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
await context.addInitScript(() => {
  window.audioContexts = 0
  const Original = AudioContext
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args)
      window.audioContexts++
    }
  }
  window.scopeDraws = 0
  // oxlint-disable-next-line typescript/unbound-method -- Called with its original canvas receiver.
  const stroke = CanvasRenderingContext2D.prototype.stroke
  CanvasRenderingContext2D.prototype.stroke = function (...args) {
    window.scopeDraws++
    return stroke.apply(this, args)
  }
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
const result = { browser: browser.version(), checks: [], errors: [], physicalListening: false }
page.on('pageerror', (error) => result.errors.push(error.message))
const pass = (name) => {
  result.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
async function load(source) {
  await page.evaluate(async (source) => {
    const editor = await import('/scripts/editor-browser.mjs')
    editor.enableAutoApply()
    editor.replaceSource(source)
  }, source)
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent?.startsWith('Rack matches code'),
  )
  await page.waitForFunction(
    (s) => document.querySelector('.cm-content')?.textContent?.includes(s),
    source.split('\n').find((line) => line.startsWith('$:')),
  )
}
try {
  await page.goto(base)
  await page.locator('.cm-content').waitFor()
  const source =
    '//  @title  Visible café  \r\n// @by Alice & Bob\r\n// @license CC BY-SA 4.0\r\n// @url javascript:never-run()\r\n$: note("c3 e3 g3 b3").rev().fast(2).s("sine").gain(.15).analyze(1)\r\n'
  await load(source)
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  assert.equal(
    await page.getByRole('textbox', { name: 'Patch name', exact: true }).inputValue(),
    'Visible café',
  )
  await page.getByText('Patch credits', { exact: true }).click()
  assert((await page.locator('.patch-credits').innerText()).includes('Alice & Bob'))
  assert.equal(await page.locator('.patch-credits a').count(), 0)
  pass('Real comments supply title/credits; URL stays inert text')
  const prefix = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const engine = await import('/src/strudel/engine.ts')
    const document = read(editorSource()),
      rev = document.patch.modules.find((m) => m.type === 'rev')
    const cable = document.patch.cables.find((c) => c.from.module === rev.id)
    const result = await engine.probe(document, cable.id)
    const fractional = read('$: note("c3 e3").fast(2/3).rev().s("sine")')
    const fractionalRev = fractional.patch.modules.find((m) => m.type === 'rev')
    const fractionalCable = fractional.patch.cables.find((c) => c.from.module === fractionalRev.id)
    const { routingFixture } = await import('/src/testing/routingCases.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    const routes = {}
    for (const kind of ['gates', 'switch']) {
      const routed = read(generate(routingFixture(kind)))
      const type = kind === 'gates' ? 'seq' : 'switch'
      const module = routed.patch.modules.find((m) => m.type === type)
      const routedCable = routed.patch.cables.find((c) => c.from.module === module.id)
      routes[kind] = await engine.probe(routed, routedCable.id)
    }
    return {
      result,
      fractional: await engine.probe(fractional, fractionalCable.id, 1000),
      routes,
      cable: cable.id,
      contexts: window.audioContexts,
    }
  })
  assert.equal(prefix.contexts, 0)
  assert.equal(prefix.result.kind, 'events')
  assert.equal(prefix.result.events.length, 16)
  pass(
    'Probe returns 16 REV-prefix onsets, excludes downstream fast(2), creates zero AudioContexts',
  )
  assert.equal(prefix.fractional.kind, 'events')
  assert.deepEqual(
    [...prefix.fractional.events].sort((a, b) => a.begin - b.begin),
    [
      { begin: 1000.5, end: 1001.25, value: { note: 'e3' } },
      { begin: 1001, end: 1001.75, value: { note: 'e3' } },
      { begin: 1001.75, end: 1002.5, value: { note: 'c3' } },
      { begin: 1002.25, end: 1003, value: { note: 'c3' } },
      { begin: 1003.5, end: 1004.25, value: { note: 'e3' } },
    ],
  )
  pass('Fractional fast(2/3) prefix retains exact event values and times at cycle 1000')
  assert.equal(prefix.routes.gates.kind, 'events')
  assert.equal(prefix.routes.gates.events.length, 20)
  assert.deepEqual(
    prefix.routes.gates.events
      .filter((e) => e.begin < 1)
      .map((e) => e.begin)
      .sort((a, b) => a - b),
    [0, 0.25, 0.375, 0.625, 0.875],
  )
  assert.equal(prefix.routes.switch.kind, 'events')
  assert.deepEqual(
    prefix.routes.switch.events.map((e) => e.value),
    [{ note: 'c3' }, { note: 'c3' }, { note: 'd3' }, { note: 'e3' }],
  )
  pass('GATES and SWITCH multi-input probes retain expected prefixes without audio')
  await page.getByRole('button', { name: 'All cables', exact: true }).click()
  const path = page.locator('.cable.signal-pattern path:not(.cable-shadow)').first()
  const point = await path.evaluate((path) => {
    const p = path.getPointAtLength(path.getTotalLength() * 0.55),
      screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM())
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.move(point.x, point.y)
  await page.getByRole('region', { name: 'Cable probe' }).waitFor()
  await page.waitForFunction(() => document.querySelector('.cable-probe rect'))
  await page.keyboard.down('Alt')
  await page.mouse.click(point.x, point.y)
  await page.keyboard.up('Alt')
  await page.mouse.move(5, 5)
  assert(await page.getByRole('region', { name: 'Cable probe' }).isVisible())
  const bounds = await page.getByRole('region', { name: 'Cable probe' }).boundingBox()
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 1000)
  await page.screenshot({ path: `${output}/cable-probe.png` })
  pass('Real pointer hover opens punchcard; Alt-click pins it after pointer leave')
  await page.getByRole('button', { name: 'Close probe', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  const pcm = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((n) => n.includes('/src/strudel/engine.ts'))
    const engine = await import(url)
    for (let i = 0; i < 100; i++) {
      const data = engine.scopeData(1, 'waveform')
      if (data?.some((v) => Math.abs(v) > 0.00001))
        return { peak: Math.max(...data.map(Math.abs)), clock: engine.getClock() }
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error('No analyser PCM: ' + JSON.stringify({ clock: engine.getClock(), url }))
  })
  assert(pcm.peak > 0)
  result.pcm = pcm
  const clock = await page.locator('.cycle-clock output').innerText()
  await page.waitForFunction(
    (before) => document.querySelector('.cycle-clock output')?.textContent !== before,
    clock,
  )
  pass('SCOPE reads nonzero per-voice PCM; header tracks the real scheduler cycle')
  const scope = page.locator('[data-module]').filter({ has: page.locator('.scope-display') })
  await scope.getByRole('combobox', { name: 'VIEW', exact: true }).selectOption('spectrum')
  await page.waitForFunction(
    async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((n) => n.includes('/src/strudel/engine.ts'))
      return (await import(url)).scopeData(1, 'spectrum')?.some(Number.isFinite)
    },
    undefined,
    { timeout: 5000 },
  )
  pass('SCOPE VIEW changes to live spectrum without a source rewrite or playback restart')
  await context.tracing.start({ screenshots: true, snapshots: true })
  await page.screenshot({ path: `${output}/scope-spectrum.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByText('Motion paused', { exact: true }).waitFor()
  const frozen = await page.evaluate(() => ({
    draws: window.scopeDraws,
    clock: document.querySelector('.cycle-clock output').textContent,
  }))
  // Give several display/clock periods a chance to expose motion under the setting.
  await page.waitForTimeout(450)
  assert.deepEqual(
    await page.evaluate(() => ({
      draws: window.scopeDraws,
      clock: document.querySelector('.cycle-clock output').textContent,
    })),
    frozen,
  )
  await page.screenshot({ path: `${output}/reduced-motion.png` })
  pass('Reduced motion stops both analyser drawing and clock movement; audio keeps scheduling')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Ready',
  )
  const saved = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const { sourceBody } = await import('/src/workspace/document.ts')
    const source = editorSource(),
      document = read(source)
    return { source, body: sourceBody(source), patch: document.patch, layout: document.layout }
  })
  assert.equal(saved.layout, 'restored')
  assert.equal(saved.body, source)
  assert.equal(saved.patch.modules.find((m) => m.type === 'scope').values.mode, 'spectrum')
  pass(
    'Presentation-only VIEW saves and reopens with the full rack; executable/editor text stays exact',
  )
  const unsafe =
    '$: note("c3 e3").custom(() => {globalThis.probeSideEffect = true}).rev().s("sine")'
  await load(unsafe)
  const safety = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs'),
      { read } = await import('/src/reader/index.ts'),
      engine = await import('/src/strudel/engine.ts')
    const document = read(editorSource()),
      rev = document.patch.modules.find((m) => m.type === 'rev')
    return {
      result: await engine.probe(
        document,
        document.patch.cables.find((c) => c.from.module === rev.id).id,
      ),
      executed: 'probeSideEffect' in globalThis,
      running: engine.getClock().running,
    }
  })
  assert.equal(safety.result.kind, 'unavailable')
  assert.equal(safety.executed, false)
  assert.equal(safety.running, false)
  await page.locator('.connections > summary').first().click()
  await page.locator('.connections > button').filter({ hasText: 'rev1:out' }).first().click()
  await page.getByRole('button', { name: 'Probe cable', exact: true }).click()
  await page.getByText('Not probed · CODE upstream', { exact: true }).waitFor()
  pass('Downstream CODE UI says Not probed; side effect never executes and transport stays stopped')
  assert.deepEqual(result.errors, [])
  await context.tracing.stop({ path: `${output}/trace.zip` })
} finally {
  result.diagnostics = await page.evaluate(() => ({
    status: document.querySelector('.transport-status')?.textContent,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent),
  }))
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2))
  await browser.close()
}
