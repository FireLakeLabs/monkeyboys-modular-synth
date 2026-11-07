import { test, expect } from 'playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { chooseSwitch } from '../../scripts/panel-controls.mjs'
const check = '/scripts/dub-check.mjs'
const run = (page, method, arg) =>
  page.evaluate(async ({ check, method, arg }) => (await import(check))[method](arg), {
    check,
    method,
    arg,
  })
const play = async (page) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
}
const probe = (page) => page.evaluate(() => window.dubProbe.read())
const knob = async (page, id, label, value) => {
  const panel = page.locator(`[data-module="${id}"]`)
  await panel.getByRole('button', { name: `Set ${label}`, exact: true }).click()
  const input = panel.getByRole('textbox', { name: label, exact: true })
  await input.fill(value)
  await input.press('Enter')
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
}
const bounce = async (page, info, name) => {
  const pending = page.waitForEvent('download')
  const pcm = await run(page, 'bounceDub')
  const download = await pending
  await download.saveAs(info.outputPath(`${name}.wav`))
  return { ...pcm, path: info.outputPath(`${name}.wav`) }
}

test('Dub afterimage: phrase, sources, native delay PCM, transport and saved identity', async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  expect(await run(page, 'loadDub')).toEqual({ stopped: true, modules: 20 })
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  await page.screenshot({ path: info.outputPath('dub-rack.png') })
  await page.evaluate(async (check) => {
    window.dubProbe = (await import(check)).installDubProbe()
  }, check)
  try {
    await play(page)
    const events = await run(page, 'verifyDubEvents')
    const live = await run(page, 'liveDubPCM', 53_000)
    expect(live.rms).toBeGreaterThan(0.001)
    expect(live.peak).toBeLessThan(1)
    expect(live.phaseRMS[1] / live.phaseRMS[0]).toBeGreaterThan(0.9)
    expect(live.phaseRMS[1] / live.phaseRMS[0]).toBeLessThan(1.1)
    const steady = await probe(page)
    expect(steady.triggers[0].cycle).toBe(0)
    expect(steady.orbits.sort()).toEqual(['1', '2', '3'])
    expect(steady.delays).toHaveLength(1)
    expect(steady.delays[0].orbit).toBe('2')
    expect(steady.reverbs).toBe(0)
    expect(steady.buses).toEqual([])
    const sources = await page.evaluate(
      async (check) => (await import(check)).sources(window.dubProbe.read()),
      check,
    )
    expect(sources.peaks.primary).toBeLessThanOrEqual(8)
    expect(sources.peaks.anchor).toBeLessThanOrEqual(4)
    expect(sources.peaks.reply).toBeLessThanOrEqual(2)
    expect(sources.peaks.low).toBeLessThanOrEqual(2)
    expect(sources.peaks.modulators).toBe(0)
    expect(sources.peaks.noise).toBe(0)
    expect(sources.anchor.length).toBeGreaterThanOrEqual(34)
    expect(sources.reply.length).toBeGreaterThanOrEqual(8)
    for (const [lane, orbit] of [
      ['anchor', 1],
      ['reply', 2],
      ['low', 3],
    ]) {
      expect(sources[lane].length).toBe(steady.triggers.filter((t) => t.orbit === orbit).length)
      for (const source of sources[lane]) {
        const trigger = steady.triggers.find(
          (t) => t.orbit === orbit && Math.abs(t.target - source.begin) < 0.0001,
        )
        expect(trigger).toBeTruthy()
        expect(source.end).toBeCloseTo(
          trigger.target + trigger.duration / trigger.cps + Math.max(trigger.release, 0.01) + 0.01,
          5,
        )
      }
    }
    await page.evaluate(
      async (check) => (await import(check)).waitForDubReply(window.dubProbe),
      check,
    )
    await run(page, 'delayBusIdentity', 'remember')
    await knob(page, 'mix1', 'CH 2', '0.35')
    await knob(page, 'pan1', 'PAN', '0.4')
    await knob(page, 'vcf1', 'CUTOFF', '1500')
    await knob(page, 'delay1', 'FDBK', '0.15')
    expect((await run(page, 'delayBusIdentity')).feedback).toBeCloseTo(0.25, 6)
    await page.waitForTimeout(7000)
    const edited = (await probe(page)).triggers.slice(steady.triggers.length)
    expect(
      edited.some(
        (t) =>
          t.orbit === 2 &&
          t.pan === 0.4 &&
          t.bandf === 1500 &&
          t.postgain === 0.35 &&
          t.feedback === 0.15,
      ),
    ).toBe(true)
    expect(await run(page, 'delayBusIdentity')).toMatchObject({ same: true })
    expect((await run(page, 'delayBusIdentity')).feedback).toBeCloseTo(0.15, 6)
    // Bypassing new sends leaves the old bus and its previous feedback intact.
    await knob(page, 'delay1', 'FDBK', '0')
    await page.waitForTimeout(7000)
    expect(await run(page, 'delayBusIdentity')).toMatchObject({ same: true })
    expect((await run(page, 'delayBusIdentity')).feedback).toBeCloseTo(0.15, 6)
    const stopped = await page.evaluate(
      async (check) => (await import(check)).stopHeldDub(window.dubProbe),
      check,
    )
    expect(stopped.pcm.rms).toBeGreaterThan(0.001)
    await page.waitForTimeout(300)
    const count = (await probe(page)).triggers.length
    const stopWindow = Math.ceil(events.longestGapSeconds * 1000) + 500
    await page.waitForTimeout(stopWindow)
    expect((await probe(page)).triggers.length).toBe(count)
    await run(page, 'loadDub')
    const replaced = await run(page, 'delayBusIdentity')
    // Structural replacement clears effects when the next Play installs the new patch.
    await play(page)
    await page.waitForTimeout(5100)
    expect(await run(page, 'delayBusIdentity')).toMatchObject({
      same: false,
      present: true,
      feedback: 0.25,
    })
    await run(page, 'stopDub')
    await run(page, 'loadDub')
    const roundTrip = await run(page, 'dubRoundTrip')
    expect(roundTrip.fanout).toEqual(['env2->vcf1.cv', 'env2->vca2.cv'])
    const reloadSource = await page.evaluate(async () =>
      (await import('/scripts/editor-browser.mjs')).editorSource(),
    )
    await page.reload()
    await page.locator('.cm-content').waitFor()
    await expect(page.locator('.transport-status')).toHaveText('Ready')
    expect(
      await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
    ).toBe(reloadSource)
    await page.evaluate(async (check) => {
      window.dubProbe = (await import(check)).installDubProbe()
    }, check)
    await run(page, 'loadDub')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('spinbutton', { name: 'Bounce cycles', exact: true }).fill('6')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    const renders = { default: await bounce(page, info, 'default') }
    expect(renders.default.seconds).toBeCloseTo(6 / (56 / 240), 4)
    expect(renders.default.clipped).toBe(0)
    for (const [name, label] of [
      ['dry-anchor', 'SOLO 1'],
      ['reply-solo', 'SOLO 2'],
      ['low-solo', 'SOLO 3'],
    ]) {
      await run(page, 'loadDub')
      await chooseSwitch(page.locator('[data-module="mix1"]'), label, 'on')
      renders[name] = await bounce(page, info, name)
      expect(renders[name].rms).toBeGreaterThan(0.0001)
    }
    await run(page, 'loadDub')
    await knob(page, 'delay1', 'MIX', '0')
    renders['delay-muted'] = await bounce(page, info, 'delay-muted')
    const [wet, dry] = await Promise.all([
      readFile(renders.default.path),
      readFile(renders['delay-muted'].path),
    ])
    let energy = 0
    for (let i = 44; i < wet.length; i += 2)
      energy += ((wet.readInt16LE(i) - dry.readInt16LE(i)) / 32768) ** 2
    const differenceRMS = Math.sqrt(energy / ((wet.length - 44) / 2))
    expect(differenceRMS).toBeGreaterThan(0.00001)
    await run(page, 'loadDub')
    const immediate = await run(page, 'immediateDubReplay')
    const isolatedRestart = await page.evaluate(
      async ({ check, after }) =>
        (await import(check)).sources(window.dubProbe.read(), after).peaks,
      { check, after: immediate.before },
    )
    const beforeRepeats = (await probe(page)).now
    for (let i = 0; i < 2; i++) {
      await run(page, 'loadDub')
      await play(page)
      await page.waitForTimeout(250)
      await run(page, 'stopDub')
    }
    const cumulativeRepeatedLoad = await page.evaluate(
      async ({ check, after }) =>
        (await import(check)).sources(window.dubProbe.read(), after).peaks,
      { check, after: beforeRepeats },
    )
    await page.waitForTimeout(6000)
    const settled = await probe(page)
    expect(
      settled.oscillators.filter((o) => !o.offline && (o.end ?? Infinity) > settled.now),
    ).toEqual([])
    expect(settled.delays).toEqual([])
    expect(settled.buses).toEqual([])
    expect(settled.orbits.sort()).toEqual(['1', '3'])
    await run(page, 'loadDub')
    expect(errors).toEqual([])
    const evidence = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      browser: page.context().browser().version(),
      events,
      live,
      sources,
      editedTriggers: edited,
      delays: steady.delays,
      stopped,
      noNewOnsetsForMs: stopWindow,
      replaced,
      roundTrip,
      renders,
      differenceRMS,
      immediate,
      isolatedRestart,
      cumulativeRepeatedLoad,
      settled: { orbits: settled.orbits, delays: settled.delays, buses: settled.buses },
      reloadExact: true,
      errors,
      physicalListening: false,
    }
    await writeFile(info.outputPath('dub-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    await info.attach('dub-evidence', {
      path: info.outputPath('dub-evidence.json'),
      contentType: 'application/json',
    })
  } finally {
    await run(page, 'stopDub')
    await page.evaluate(() => window.dubProbe?.restore())
  }
})

test('Dub native delay: waveform spacing, decay, clamping and bypass', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await run(page, 'loadDub')
  await play(page)
  await run(page, 'stopDub')
  const taps = []
  for (const settings of [{}, { bpm: 40 }, { bpm: 240 }, { sync: 0.25 }, { sync: 0.375 }]) {
    const result = await run(page, 'isolatedDubPCM', settings)
    taps.push(result)
    const expected = Math.min(result.sync / (result.bpm / 240), 1)
    expect(result.taps[0].seconds).toBeCloseTo(expected, 2)
    result.taps.forEach((tap, i) => {
      expect(tap.correlation).toBeGreaterThan(0.98)
      expect(tap.seconds).toBeGreaterThanOrEqual(expected * (i + 1) - 1 / result.rate)
      expect(tap.seconds - expected * (i + 1)).toBeLessThanOrEqual((i * 128 + 1) / result.rate)
    })
    expect(result.tailDb).toBeLessThan(-60)
    if (result.bpm === 56 && result.sync === 0.125)
      expect(result.beforeRepeatPeak).toBeLessThan(result.dryPeak * 0.001)
  }
  const liveTail = await run(page, 'liveDubTail')
  expect(liveTail.immediate.peak).toBeGreaterThan(0)
  expect(liveTail.tailDb).toBeLessThan(-60)

  const bypass = []
  for (const setting of [{ send: 0 }, { feedback: 0 }]) {
    const result = await run(page, 'isolatedDubPCM', setting)
    expect(result.repeatPeaks).toEqual([0, 0, 0])
    bypass.push(result)
  }
  const evidence = { taps, liveTail, bypass, physicalListening: false }
  await writeFile(
    info.outputPath('dub-delay-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  )
  await info.attach('native-delay-PCM', {
    path: info.outputPath('dub-delay-evidence.json'),
    contentType: 'application/json',
  })
})
