import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { chooseSwitch, openMore, switchValue } from './panel-controls.mjs'

const output = process.argv[3] ?? '/tmp/monkeyboy-panels'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  ignoreHTTPSErrors: true,
})
const results = { browser: browser.version(), controls: [], pcm: [], physicalListening: false }
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const panel = (id) => page.locator(`[data-module="${id}"]`)
const suite = (fn, arg) =>
  page.evaluate(async ({ fn, arg }) => (await import('/scripts/panels-check.mjs'))[fn](arg), {
    fn,
    arg,
  })
async function synced() {
  await page.waitForFunction(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
}
async function stop() {
  const button = page.getByRole('button', { name: 'Stop', exact: true })
  if (await button.count()) {
    await button.click()
    await page.waitForFunction(
      () => document.querySelector('.transport-status')?.textContent === 'Ready',
    )
  }
}
await page.addInitScript(() => {
  const probes = []
  // oxlint-disable-next-line typescript/unbound-method -- Reapply the original AudioNode receiver.
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (...args) {
    const result = connect.apply(this, args)
    if (args[0] instanceof AudioDestinationNode) {
      const analyser = this.context.createAnalyser()
      connect.call(this, analyser)
      probes.push(analyser)
    }
    return result
  }
  window.panelPCM = async () => {
    let energy = 0,
      count = 0
    for (let n = 0; n < 45; n++) {
      for (const probe of probes) {
        const data = new Float32Array(probe.fftSize)
        probe.getFloatTimeDomainData(data)
        for (const value of data) {
          energy += value * value
          count++
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    return { rms: Math.sqrt(energy / Math.max(1, count)), samples: count }
  }
})
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5179')
  await page.locator('.cm-content').waitFor()
  await page.getByRole('checkbox', { name: 'Auto-apply', exact: true }).check()
  const cases = await page.evaluate(
    async () => (await import('/scripts/panels-check.mjs')).panelCases,
  )
  for (let index = 0; index < cases.length; index++) {
    const example = cases[index]
    const expected = await suite('loadCase', index)
    await synced()
    const actual = await suite('current')
    assert.equal(actual.layout, 'restored', `${example.type}.${example.control} layout`)
    assert.deepEqual(actual.patch, expected)
    const { label, kind, more } = await page.evaluate(async ({ type, control }) => {
      const { getModuleSpec } = await import('/src/modules/catalog.ts')
      return getModuleSpec(type).controls.find((c) => c.id === control)
    }, example)
    const subject = more ? await openMore(panel(`${example.type}1`)) : panel(`${example.type}1`)
    if (kind === 'switch') {
      assert.equal(await switchValue(subject, label), example.value)
    } else {
      const locator = subject.getByLabel(label, { exact: true })
      assert((await locator.count()) > 0, `${label} missing`)
      await locator.last().scrollIntoViewIfNeeded()
      assert(await locator.last().isVisible(), `${label} unreachable`)
      if (typeof example.value === 'string')
        assert.equal(await locator.last().inputValue(), example.value)
    }
    if (more) await page.keyboard.press('Escape')
    const source = await suite('source')
    assert(source.includes(example.call))
    results.controls.push(`${example.type}.${example.control}`)
  }
  await suite('jackScrollFixture')
  await synced()
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-module="mix1"] .patch-box')
    return box.scrollHeight > box.clientHeight
  })
  const beforeJackScroll = await suite('source')
  const jack = panel('mix1').locator('[data-jack="mix1:cv1"]')
  await jack.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const jack = document.querySelector('[data-jack="mix1:cv1"]')
    const box = jack.closest('.patch-box').getBoundingClientRect()
    const rect = jack.getBoundingClientRect()
    return rect.top >= box.top && rect.bottom <= box.bottom
  })
  await page.waitForTimeout(50)
  results.jackScroll = await page.evaluate(async () =>
    (await import('/scripts/rack-feel-check.mjs')).inspectCables(),
  )
  assert.equal(await suite('source'), beforeJackScroll)
  process.stdout.write(
    'PASS scrolling mixer jacks retain cable endpoints and exact source at Fit zoom\n',
  )
  await suite('loadCase', 4)
  await synced()
  assert.equal(await panel('osc1').getByRole('slider', { name: 'PW', exact: true }).count(), 1)
  await chooseSwitch(panel('osc1'), 'WAVE', 'sine')
  await synced()
  assert.equal(await panel('osc1').getByRole('slider', { name: 'PW', exact: true }).count(), 0)
  assert(!(await suite('source')).includes('.pw('))
  await suite('loadCase', 17)
  await synced()
  assert.equal(await panel('vcf1').getByRole('slider', { name: 'DRIVE', exact: true }).count(), 1)
  await chooseSwitch(panel('vcf1'), 'TYPE', '12db')
  await synced()
  assert.equal(await panel('vcf1').getByRole('slider', { name: 'DRIVE', exact: true }).count(), 0)
  assert(!(await suite('source')).includes('.drive('))
  await suite('loadCase', 26)
  await synced()
  const mixerNames = await openMore(panel('mix1'))
  await mixerNames.getByLabel('NAME 1', { exact: true }).fill('bass')
  await mixerNames.getByLabel('NAME 1', { exact: true }).press('Enter')
  await page.keyboard.press('Escape')
  await synced()
  assert((await suite('source')).includes('_bass:'))
  await page.screenshot({ path: `${output}/mixer.png` })
  process.stdout.write(
    `PASS ${results.controls.length} controls, conditional mode changes, label edit, exact rack recovery\n`,
  )
  for (const index of [4, 5, 17, 20, 21, 23, 11]) {
    await suite('loadCase', index)
    await synced()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('.transport-status')?.textContent === 'Playing',
      { timeout: 60000 },
    )
    const pcm = await page.evaluate(() => window.panelPCM())
    assert(pcm.rms > 0.0001, `case ${index} has no PCM: ${pcm.rms}`)
    results.pcm.push({ control: cases[index].control, ...pcm })
    await stop()
  }
  const cross = await suite('crossfader')
  await synced()
  const code = await suite('source')
  assert.equal((code.match(/\.postgain\(/g) ?? []).length, 2)
  assert(code.includes('.range(0.2, 0.8)') && code.includes('.range(0.8, 0.2)'))
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.transport-status')?.textContent === 'Playing',
  )
  const sounding = await page.evaluate(() => window.panelPCM())
  assert(sounding.rms > 0.0001)
  results.crossfader = { patch: cross, pcm: sounding }
  await chooseSwitch(panel('mix1'), 'MUTE 1', 'on')
  await chooseSwitch(panel('mix1'), 'MUTE 2', 'on')
  await synced()
  await page.waitForTimeout(600)
  const silent = await page.evaluate(() => window.panelPCM())
  assert(silent.rms < 0.00001, `muted PCM ${silent.rms}`)
  results.muted = silent
  await stop()
  const labels = await suite('pinnedLabels')
  assert.deepEqual(
    labels.map((events) => events.map((event) => [event.note, event.orbit])),
    [[['c3', 1]], [['e3', 2]], [['e3', 2]]],
  )
  results.labels = labels
  assert.deepEqual(errors, [])
  process.stdout.write(
    'PASS pulse/supersaw/ladder/velocity/sync/reverb/sample PCM, complementary STEP CV, mute silence, real REPL labels/orbits\n',
  )
} finally {
  results.errors = errors
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
