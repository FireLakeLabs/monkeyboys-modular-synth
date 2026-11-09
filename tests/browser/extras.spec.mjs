import { test, expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'
import { detailPanel, openMore, chooseSwitch } from '../../scripts/panel-controls.mjs'

async function open(page) {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => (await import('/scripts/extras-check.mjs')).prepare())
}
async function load(page, source) {
  await page.keyboard.press('Control+.')
  await page.evaluate(async (source) => {
    const helper = await import('/scripts/extras-check.mjs')
    helper.reset()
    await (await import('/scripts/rack-feel-check.mjs')).load(source)
  }, source)
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
}
async function play(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await import('/scripts/extras-check.mjs')).state().triggered.length,
      ),
    )
    .toBeGreaterThan(0)
}
async function proof(page) {
  const data = await page.evaluate(async () => (await import('/scripts/extras-check.mjs')).proof())
  expect(data.sourceExact).toBe(true)
  expect(data.savedIdentity).toBe(true)
  expect(data.actualEvents.length).toBeGreaterThan(0)
  expect(data.eventEquivalent).toBe(true)
  return data
}
async function pcm(page) {
  return page.evaluate(async () => (await import('/scripts/extras-check.mjs')).measure())
}
async function evidence(info, value) {
  const body = JSON.stringify(value, null, 2)
  const path = info.outputPath('extras-evidence.json')
  await writeFile(path, body)
  await info.attach('extras-evidence', {
    path,
    contentType: 'application/json',
  })
}

test('BYTEBEAT: all fifteen presets, custom formula, real events and distinct PCM pitch', async ({
  page,
}, info) => {
  await open(page)
  const rows = []
  for (let preset = 0; preset < 15; preset++) {
    const source = `setcpm(120)\n$: note("a3*4").s("bytebeat").n(${preset}).bbst(0).gain(.1)\n`
    await load(page, source)
    await play(page)
    const data = await proof(page),
      signal = await pcm(page)
    expect(signal.rms).toBeGreaterThan(0.0001)
    expect(data.failures).toEqual([])
    rows.push({ preset, proof: data, pcm: signal })
  }
  const tones = []
  for (const divisor of [128, 64]) {
    const expression = `128+127*sin(t*PI/${divisor})`
    await load(
      page,
      `setcpm(60)\n$: freq(220).s("bytebeat").bbexpr(pure('${expression}')).bbst(0).gain(.1)\n`,
    )
    await play(page)
    const data = await proof(page),
      signal = await pcm(page)
    expect(signal.rms).toBeGreaterThan(0.0001)
    expect(Math.abs(signal.frequency - (divisor === 128 ? 220 : 440))).toBeLessThan(12)
    tones.push({ expression, proof: data, pcm: signal })
  }
  await page.keyboard.press('Control+.')
  await page.waitForTimeout(1200)
  const stopped = await pcm(page)
  expect(stopped.peak).toBeLessThan(0.000001)
  await evidence(info, { rows, tones, stopped, physicalListening: false })
})

test('CHIP: engine waves and every exposed effect control produce scheduled PCM', async ({
  page,
}, info) => {
  await open(page)
  const rows = []
  for (const wave of ['z_sine', 'z_sawtooth', 'z_triangle', 'z_square', 'z_tan', 'z_noise']) {
    await load(
      page,
      `setcpm(120)\n$: note("a3*4").s("${wave}").slide(.5).pitchJump(120).zcrush(.2).zdelay(.05).zmod(20).znoise(.1).pitchJumpTime(.02).deltaSlide(-.1).gain(.1)\n`,
    )
    await play(page)
    const data = await proof(page),
      signal = await pcm(page)
    expect(signal.rms).toBeGreaterThan(0.0001)
    expect(data.failures).toEqual([])
    rows.push({ wave, proof: data, pcm: signal })
  }
  await page.keyboard.press('Control+.')
  await page.waitForTimeout(1200)
  const stopped = await pcm(page)
  expect(stopped.peak).toBeLessThan(0.000001)
  await evidence(info, { rows, stopped, physicalListening: false })
})

for (const { type, looks } of [
  { type: 'bytebeat', looks: ['crystal', 'bio', 'monolith'] },
  { type: 'chip', looks: ['powder', 'instrument', 'vintage', 'learner'] },
  { type: 'speak', looks: ['crystal', 'bio', 'monolith'] },
])
  test(`${type}: every family look keeps width, reachable native controls and cable endpoints`, async ({
    page,
  }, info) => {
    await open(page)
    const rows = []
    for (const look of looks) {
      await page.evaluate(
        async ({ type, look }) => (await import('/scripts/extras-check.mjs')).layout(type, look),
        { type, look },
      )
      await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
      const panel = page.locator(`[data-module="${type}1"]`)
      await detailPanel(panel)
      if (type === 'bytebeat') {
        await panel.getByRole('slider', { name: 'PRESET', exact: true }).press('ArrowUp')
        const more = await openMore(panel)
        if (look === 'crystal') {
          await more
            .getByRole('textbox', { name: 'CUSTOM FORMULA', exact: true })
            .fill(`t /*${'long formula '.repeat(100)}*/`)
          await more.getByRole('button', { name: 'Apply', exact: true }).click()
          const size = await panel
            .getByLabel('Bytebeat formula')
            .evaluate((element) => ({ height: element.clientHeight, scroll: element.scrollHeight }))
          expect(size.height).toBeLessThanOrEqual(96)
          expect(size.scroll).toBeGreaterThan(size.height)
        }
        await more.getByRole('textbox', { name: 'CUSTOM FORMULA', exact: true }).fill('t*(t>>8)')
        await more.getByRole('button', { name: 'Apply', exact: true }).click()
        await page.keyboard.press('Escape')
        await expect(panel.getByLabel('Bytebeat formula')).toHaveText('t*(t>>8)')
      } else if (type === 'chip') {
        await chooseSwitch(panel, 'WAVE', 'z_noise')
        const more = await openMore(panel)
        await more.getByRole('slider', { name: 'MODULATION', exact: true }).press('ArrowUp')
        await page.keyboard.press('Escape')
      } else {
        await expect(panel).toContainText('Speech bypasses effects, MIX level and OUT volume.')
        await panel.getByRole('textbox', { name: 'LANG', exact: true }).fill('fr')
        await panel.getByRole('button', { name: 'Apply', exact: true }).click()
        await panel.getByRole('slider', { name: 'VOICE', exact: true }).press('ArrowUp')
        await expect(page.locator('.cable').filter({ hasText: 'Speech bypasses' })).toHaveCount(2)
      }
      await expect(page.locator('.sync-status')).toContainText('Rack matches code')
      await documentFonts(page)
      const geometry = await page.evaluate(
        async (look) => (await import('/scripts/extras-check.mjs')).geometry(look),
        look,
      )
      const shot = await page.screenshot({ path: info.outputPath(`${type}-${look}.png`) })
      await info.attach(`${type}-${look}`, { body: shot, contentType: 'image/png' })
      rows.push({ look, geometry })
    }
    await evidence(info, { rows })
  })
async function documentFonts(page) {
  await page.evaluate(() => document.fonts.ready)
}

test('BYTEBEAT: invalid panel text is refused; CODE and DSP errors surface and Stop the whole patch', async ({
  page,
}, info) => {
  await open(page)
  await page.evaluate(async () =>
    (await import('/scripts/extras-check.mjs')).layout('bytebeat', 'crystal'),
  )
  const panel = page.locator('[data-module="bytebeat1"]')
  await detailPanel(panel)
  const before = await page.evaluate(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource(),
  )
  const more = await openMore(panel)
  await more.getByRole('textbox', { name: 'CUSTOM FORMULA', exact: true }).fill('t +')
  await more.getByRole('button', { name: 'Apply', exact: true }).click()
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toBe(before)
  await expect(more).toContainText('Cannot apply.')
  await page.keyboard.press('Escape')
  const rows = []
  for (const formula of ['t +', 'missingBytebeatFunction(t)']) {
    const source = `setcpm(120)\n$: note("a3*4").s("bytebeat").bbexpr(pure('${formula}')).gain(.1)\n$: note("a4*4").s("sine").gain(.05)\n`
    await load(page, source)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('.transport-status')).toHaveText('Audio error')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    const state = await page.evaluate(async () =>
      (await import('/scripts/extras-check.mjs')).state(),
    )
    expect(state.failures.length).toBeGreaterThan(0)
    await page.waitForTimeout(1200)
    const stopped = await pcm(page)
    expect(stopped.peak).toBeLessThan(0.000001)
    rows.push({ formula, state, stopped })
  }
  await evidence(info, { rows })
})

test('SPEAK: real browser voice availability, actual utterance requests, bypass PCM and Stop cancellation', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    globalThis.speechProof = { requests: [], errors: [], cancels: 0, starts: 0, ends: 0 }
    const synth = globalThis.speechSynthesis
    if (!synth) return
    const speak = synth.speak.bind(synth),
      cancel = synth.cancel.bind(synth)
    synth.speak = (utterance) => {
      speechProof.requests.push({
        text: utterance.text,
        lang: utterance.lang,
        voice: utterance.voice?.name ?? null,
      })
      utterance.addEventListener('error', (e) => speechProof.errors.push(e.error))
      utterance.addEventListener('start', () => speechProof.starts++)
      utterance.addEventListener('end', () => speechProof.ends++)
      return speak(utterance)
    }
    synth.cancel = () => {
      speechProof.cancels++
      return cancel()
    }
  })
  await open(page)
  await load(page, 'setcpm(120)\n$: "hello modular".speak("zz-unavailable", 127)\n')
  await play(page)
  const data = await proof(page),
    signal = await pcm(page)
  expect(signal.peak).toBeLessThan(0.000001)
  const native = await page.evaluate(() => ({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    voices: globalThis.speechSynthesis?.getVoices().map((v) => ({ name: v.name, lang: v.lang })),
    ...speechProof,
  }))
  expect(data.actualEvents.every((e) => e.dominant)).toBe(true)
  expect(native.requests.map((r) => r.text)).toEqual(expect.arrayContaining(['hello', 'modular']))
  expect(native.requests.every((r) => r.voice === null)).toBe(true)
  const before = native.cancels
  await page.keyboard.press('Control+.')
  expect(await page.evaluate(() => speechProof.cancels)).toBeGreaterThan(before)
  await evidence(info, {
    data,
    signal,
    native,
    physicalListening: false,
    nativeSpeechStarted: native.starts > 0,
  })
})

test('SPEAK: browser scheduler with a controlled missing-voice provider cancels an in-progress request', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    globalThis.speechStub = { speaking: false, cancels: 0, requests: [] }
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel: () => {
          speechStub.speaking = false
          speechStub.cancels++
        },
        speak: (u) => {
          speechStub.speaking = true
          speechStub.requests.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null })
        },
      },
    })
  })
  await open(page)
  await load(page, 'setcpm(120)\n$: "hello".speak("en", 127)\n')
  await play(page)
  await expect.poll(() => page.evaluate(() => speechStub.speaking)).toBe(true)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  expect(await page.evaluate(() => speechStub.speaking)).toBe(false)
  const stub = await page.evaluate(() => speechStub)
  expect(stub.requests[0]).toEqual({ text: 'hello', lang: 'en', voice: null })
  await evidence(info, { stub, providerStub: true, actualSpeechEngine: false })
})
