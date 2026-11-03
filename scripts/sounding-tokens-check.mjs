import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Real engine/editor acceptance; requires Vite, Chromium and the pinned sample resources.
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const output = process.argv[3] ?? '/tmp/monkeyboy-sounding-tokens'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const result = { browser: browser.version(), checks: [], physicalListening: false }
const pass = (name) => {
  result.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
for (const [path, signature, counter] of [
  ['workspace/SourceEditor.tsx', 'export function SourceEditor(props) {', 'editorRenders'],
  ['workspace/highlighting.ts', 'export function sourceTreatments(document) {', 'treatmentReads'],
  [
    'reader/syntax.ts',
    'export function parseSource(source, { lastExpressionIsVoice = true } = {}) {',
    'sourceParses',
  ],
]) {
  await context.route(`**/src/${path}*`, async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    assert(body.includes(signature), `Instrumentation no longer matches ${path}`)
    await route.fulfill({
      response,
      body: body.replace(
        signature,
        `${signature}\nwindow.${counter} = (window.${counter} ?? 0) + 1;`,
      ),
    })
  })
}
await context.route('**/src/strudel/engine.ts*', async (route) => {
  const response = await route.fetch()
  const body = await response.text()
  assert(body.includes('feedback?.();'))
  await route.fulfill({
    response,
    body: body.replace(
      'feedback?.();',
      'window.deliveryLeads ??= []; window.deliveryLeads.push(target - strudel.getAudioContext().currentTime); feedback?.();',
    ),
  })
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const status = (text) =>
  page.waitForFunction(
    (value) => document.querySelector('.transport-status')?.textContent === value,
    text,
  )
async function accepted() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function code(source) {
  await page.evaluate(
    async (text) => (await import('/scripts/editor-browser.mjs')).replaceSource(text),
    source,
  )
  await accepted()
}
async function start() {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await status('Pattern scheduled')
}
async function stop() {
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await status('Stopped')
  assert.equal(await page.locator('.source-sounding').count(), 0)
}
async function observe() {
  await page.evaluate(async () => {
    const { editorView } = await import('/scripts/editor-browser.mjs')
    const { EditorView, StateEffect } = await import('/scripts/sounding-tokens-browser.mjs')
    const { tokenActivity, setTokenActivity } = await import('/src/workspace/soundingTokens.ts')
    window.tokenEvents = []
    window.tokenMarks = () => {
      const view = editorView()
      const marks = []
      view.state.field(tokenActivity).decorations.between(0, view.state.doc.length, (from, to) => {
        marks.push({ from, to, text: view.state.sliceDoc(from, to) })
      })
      return marks
    }
    editorView().dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((update) => {
          if (
            update.transactions.some((tr) =>
              tr.effects.some((effect) => effect.is(setTokenActivity) && effect.value),
            )
          )
            window.tokenEvents.push(window.tokenMarks())
        }),
      ),
    })
    window.counters = () => [window.editorRenders, window.treatmentReads, window.sourceParses]
  })
}
try {
  await page.goto(base)
  await page.getByRole('textbox', { name: 'Strudel source', exact: true }).waitFor()
  // A generated library exercise proves generated source, separately from the imported fixture.
  await page.evaluate(async () => {
    const { libraryPatches } = await import('/src/library/catalog.ts')
    const { replaceSource } = await import('/scripts/editor-browser.mjs')
    replaceSource(libraryPatches().find((entry) => entry.id === 'enveloped-synth').source)
  })
  await accepted()
  await observe()
  await start()
  await page.waitForFunction(() => window.tokenMarks().length > 0)
  assert((await page.locator('.source-sounding').count()) > 0)
  await stop()
  pass(
    'generated exercise tokens highlight through real scheduled Strudel events and clear on Stop',
  )

  const imported =
    '// 🐒 offsets\nsetcpm(120/4)\nconst lead = note("c3 e3 g3 c4").s("sine");\n$: lead.iter(4)\n$: note("a2 b2").s("triangle")\n$: note("d2").s("sine").chunk(4, p => p.add("12"))\n'
  await code(imported)
  const saved = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  await page.evaluate(() => {
    window.tokenEvents = []
  })
  await start()
  await page.waitForFunction(() => window.tokenEvents.flat().some((span) => span.text === 'a2'))
  const marks = await page.evaluate(() => window.tokenEvents.flat())
  assert(marks.some((span) => span.text === 'c3'))
  assert(marks.some((span) => span.from === imported.indexOf('a2')))
  assert(marks.every((span) => imported.slice(span.from, span.to) === span.text))
  assert(!marks.some((span) => span.text.includes('chunk') || span.text === '12'))
  assert.equal(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
    saved,
  )
  await page.screenshot({ path: `${output}/imported-tokens.png` })
  pass(
    'imported shared/later voices retain original UTF-16 token positions without marking opaque calls or changing source',
  )

  await page.evaluate(async () => {
    const { replaceSource, editorSource } = await import('/scripts/editor-browser.mjs')
    replaceSource('$: note(')
    if (editorSource() !== '$: note(') throw new Error('Invalid draft was not installed')
  })
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  await page.getByRole('button', { name: 'Revert to last readable code', exact: true }).click()
  await accepted()
  await page.waitForFunction(() => window.tokenMarks().length > 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => window.tokenMarks().length === 0)
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(() => window.tokenMarks().length > 0)
  pass(
    'draft mismatch clears immediately; Revert resumes mapped tokens; runtime reduced motion clears and suppresses pulses',
  )

  await code("$: note(60).s('sine')\n")
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  pass('replacement with unmapped numeric/single-quoted code never claims token activity')
  await code('$: note("e3").s("sine")\n')
  await page.waitForFunction(() => window.tokenMarks().some((span) => span.text === 'e3'))
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('strudel.log', {
        detail: { type: 'error', message: '[output] error: token acceptance fixture' },
      }),
    )
  })
  await status('Scheduling stopped after error')
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  await start()
  await page.waitForFunction(() => window.tokenMarks().some((span) => span.text === 'e3'))
  await code('$: note("e3").missingMethod()\n')
  await status('Scheduling stopped after error')
  assert.equal(await page.evaluate(() => window.tokenMarks().length), 0)
  pass('replacement and evaluation failure remove obsolete token marks')

  await page.evaluate(async () => (await import('/scripts/trance-check.mjs')).loadTrance())
  await start()
  await page.waitForFunction(() => window.tokenMarks().length > 0)
  // No React state or parsing work during a busy, steady-state trance interval.
  const before = await page.evaluate(() => ({
    counters: window.counters(),
    events: window.tokenEvents.length,
  }))
  await page.waitForTimeout(1800)
  const after = await page.evaluate(() => ({
    counters: window.counters(),
    events: window.tokenEvents.length,
  }))
  assert(after.events > before.events + 5)
  assert.deepEqual(after.counters, before.counters)
  result.trance = { before, after }
  result.deliveryLeadSeconds = await page.evaluate(() => ({
    max: Math.max(...window.deliveryLeads),
    count: window.deliveryLeads.length,
  }))
  assert(result.deliveryLeadSeconds.max <= 0.0051)
  await page.screenshot({ path: `${output}/trance-tokens.png` })
  await stop()
  const eventsAtStop = await page.evaluate(() => window.tokenEvents.length)
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.tokenEvents.length), eventsAtStop)
  pass(
    'trance drives CodeMirror effects with no editor React renders, treatment work or reparses; delivery waits for audio time; Stop cancels future marks',
  )
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n')
  await browser.close()
}
