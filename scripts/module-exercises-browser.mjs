// Focused library acceptance. Continues after a failure to retain every module repro.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { fileAction, chooseSwitch } from './panel-controls.mjs'
const output = process.argv[3] ?? '/tmp/monkeyboy-module-exercises'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=user-gesture-required'],
})
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
page.setDefaultTimeout(5000)
const results = {
  browser: browser.version(),
  physicalListening: false,
  entries: [],
  bugs: [],
  errors: [],
}
page.on('pageerror', (e) => results.errors.push(e.message))
const actions = {
  gates: ['mini', 'GATES', 'x*8', 'steps'],
  switch: ['mini', 'SELECT', '<0 1 2 3>', 'steps'],
  aux: ['knob', 'CUTOFF', 3000, 'cutoff', 'vcf'],
  duck: ['knob', 'DEPTH', 0, 'depth'],
  seq: ['mini', 'STEPS', 'd3 e3 g3 b3', 'steps'],
  drums: ['mini', 'GRID', 'bd bd sd hh', 'grid'],
  quant: ['switch', 'SCALE', 'major', 'scale'],
  clock: ['knob', 'DIV', 1, 'division'],
  euclid: ['knob', 'PULSES', 5, 'pulses'],
  ratchet: ['text', 'REPEATS', '4', 'repeats'],
  chance: ['knob', 'DROP', 0, 'drop'],
  chord: ['mini', 'CHORDS', '<C Fm7 G7>', 'chords'],
  arp: ['text', 'INDICES', '3 2 1 0', 'indices'],
  osc: ['switch', 'WAVE', 'triangle', 'wave'],
  noise: ['switch', 'TYPE', 'pink', 'wave'],
  harmonic: ['drawbar', 'Partial 3', 1, 'partials'],
  fmop: ['knob', 'INDEX', 0, 'index'],
  splice: ['knob', 'SLICES', 8, 'count'],
  wavetable: ['knob', 'POSITION', 0.8, 'wt'],
  smpl: ['knob', 'SPEED', 0.5, 'speed'],
  vcf: ['knob', 'CUTOFF', 5000, 'cutoff'],
  vca: ['knob', 'LEVEL', 0, 'level'],
  env: ['knob', 'ATK', 0.3, 'atk'],
  lfo: ['knob', 'RATE', 0.5, 'rate'],
  samplehold: ['knob', 'STEPS', 16, 'rate'],
  attenuverter: ['knob', 'MAX', 600, 'max'],
  modmix: ['mini', 'STEPS', '<0 0>', 'steps', 'cvseq', 1],
  cvseq: ['mini', 'STEPS', '<200 800 1600 3200>', 'steps'],
  delay: ['knob', 'MIX', 0, 'mix'],
  reverb: ['knob', 'ROOM', 0, 'room'],
  drive: ['switch', 'TYPE', 'hard', 'type'],
  folder: ['knob', 'FOLD', 2, 'amount'],
  lofi: ['knob', 'BITS', 16, 'bits'],
  formant: ['text', 'VOWEL', 'a', 'vowel'],
  comp: ['text', 'THR:RATIO:KNEE:ATK:REL', '0:8:10:.005:.1', 'compressor'],
  phaser: ['knob', 'RATE', 0.25, 'rate'],
  pan: ['knob', 'PAN', 1, 'pan'],
  shift: ['knob', 'SHIFT', 0, 'shift'],
  mix: ['knob', 'CH 1', 0, 'ch1'],
  scope: ['knob', 'TAP', 2, 'id'],
  out: ['knob', 'BPM', 90, 'bpm'],
  iter: ['knob', 'STEPS', 1, 'steps'],
  jux: ['switch', 'RIGHT', 'fast2', 'right'],
  chunk: ['knob', 'CHUNKS', 2, 'chunks'],
  every: ['knob', 'CYCLES', 2, 'cycles'],
  sometimes: ['knob', 'CHANCE', 1, 'probability'],
  off: ['knob', 'TIME', 0.25, 'time'],
  layer: ['switch', 'MODE', 'palindrome', 'mode', 'rev'],
  rev: ['switch', 'MODE', 'palindrome', 'mode'],
  shuffle: ['knob', 'SLICES', 8, 'slices'],
  ribbon: ['knob', 'OFFSET', 2, 'offset'],
  'time-lens': ['knob', 'START', 0, 'start'],
  warp: ['switch', 'MODE', 'press', 'mode'],
  echo: ['knob', 'TIMES', 1, 'times'],
  code: ['source', 'CODE source', '.struct("x*8")', 'text'],
}
async function status(value) {
  await page.waitForFunction(
    (v) => document.querySelector('.transport-status')?.textContent === v,
    value,
  )
}
async function load(entry) {
  await fileAction(page, 'Patch library')
  await page.getByRole('button', { name: entry.title, exact: true }).click()
  await page.getByRole('button', { name: 'Load patch', exact: true }).click()
  await page.locator('.patch-library').waitFor({ state: 'detached' })
  await status('Ready')
}
async function inspect() {
  return page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/index.ts')
    const { saveLayout } = await import('/src/workspace/document.ts')
    const document = read(editorSource())
    const saved = saveLayout(document)
    const events = window.auditPattern
      ?.queryArc(0, 8)
      .filter((h) => h.hasOnset())
      .map((h) => ({
        value: h.value,
        start: h.whole.begin.toString(),
        end: h.whole.end.toString(),
      }))
    return {
      source: editorSource(),
      patch: document.patch,
      savedIdentity: JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
      events,
    }
  })
}
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
  const entries = await page.evaluate(async () => {
    window.auditMeasure = (await import('/scripts/library-check.mjs')).installAudioProbe()
    return (await import('/src/library/module-exercises.ts')).MODULE_EXERCISES.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.exercises[0],
    }))
  })
  assert.equal(
    entries.length,
    Object.keys(actions).length,
    'Every module exercise needs a native action',
  )
  await load(entries[0])
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await status('Playing')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await status('Ready')
  await page.evaluate(() => {
    const original = window.Pattern.prototype.onTrigger
    window.Pattern.prototype.onTrigger = function (...args) {
      window.auditPattern = this
      return original.apply(this, args)
    }
  })
  for (const entry of entries) {
    let result = { id: entry.id, type: entry.type, action: actions[entry.type] }
    results.entries.push(result)
    try {
      await load(entry)
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await status('Playing')
      const before = await inspect()
      assert(before.events.length > 0, 'no baseline events')
      assert(before.savedIdentity, 'baseline saved identity')
      const pcm = await page.evaluate(() => window.auditMeasure())
      result.pcm = pcm
      assert(pcm.rms > 0.0001, 'silent baseline')
      const [kind, label, value, control, target = entry.type, index = 0] = actions[entry.type]
      const module = before.patch.modules.filter((m) => m.type === target)[index]
      assert(module, `missing ${target} ${index}`)
      const panel = page.locator(`[data-module="${module.id}"]`)
      if (kind === 'knob') {
        await panel.getByRole('button', { name: `Set ${label}`, exact: true }).click()
        const input = panel.getByRole('textbox', { name: label, exact: true })
        await input.fill(String(value))
        await input.press('Enter')
      }
      if (kind === 'switch') await chooseSwitch(panel, label, value)
      if (kind === 'drawbar')
        await panel.getByRole('slider', { name: label, exact: true }).press('End')
      if (kind === 'mini') {
        await panel.getByRole('button', { name: 'Text mode', exact: true }).click()
        const input = panel.getByRole('textbox', {
          name: entry.type === 'drums' ? 'Drum notation' : 'Step notation',
          exact: true,
        })
        await input.fill(value)
        await input.press('Enter')
      }
      if (kind === 'source') {
        await panel.getByRole('button', { name: 'Edit in source', exact: true }).click()
        await page.keyboard.insertText(value)
        await page.getByRole('button', { name: 'Apply code', exact: true }).click()
      }
      if (kind === 'text') {
        await panel.getByRole('textbox', { name: label, exact: true }).fill(value)
        await panel.getByRole('button', { name: 'Apply', exact: true }).click()
      }
      await page.waitForFunction(
        async (original) =>
          (await import('/scripts/editor-browser.mjs')).editorSource() !== original,
        before.source,
      )
      const after = await inspect()
      const edited = after.patch.modules.find((m) => m.id === module.id)
      assert(edited, 'module disappeared')
      if (kind === 'drawbar') assert.equal(edited.values[control][2], value)
      else assert.equal(edited.values[control], value)
      assert(after.savedIdentity, 'edited saved identity')
      await status('Playing')
      result.savedIdentity = true
      result.eventsBefore = before.events.length
      result.eventsAfter = after.events.length
      result.status = 'passed'
      process.stdout.write(
        `PASS ${entry.type}: events ${result.eventsBefore}/${result.eventsAfter}, RMS ${pcm.rms}\n`,
      )
    } catch (e) {
      result.status = 'failed'
      result.error = String(e)
      results.bugs.push({ id: entry.id, action: actions[entry.type], error: String(e) })
      process.stderr.write(`FAIL ${entry.type}: ${String(e)}\n`)
      await page.screenshot({ path: `${output}/${entry.type}.png` })
    }
    const stop = page.getByRole('button', { name: 'Stop', exact: true })
    if (await stop.isVisible()) await stop.click()
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  }
  assert.equal(
    results.bugs.length,
    0,
    'Module exercises failed; see results.json for all reproductions',
  )
  assert.deepEqual(results.errors, [])
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
