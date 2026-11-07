import { test, expect } from 'playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { chooseSwitch } from '../../scripts/panel-controls.mjs'

const check = '/scripts/industrial-check.mjs'
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
const probe = (page) => page.evaluate(() => window.industrialProbe.read())
const sources = (page, after) =>
  page.evaluate(
    async ({ check, after }) =>
      (await import(check)).sources(window.industrialProbe.read(), after ?? -Infinity),
    { check, after },
  )
const setKnob = async (page, id, label, value) => {
  const panel = page.locator(`[data-module="${id}"]`)
  await panel.getByRole('button', { name: `Set ${label}`, exact: true }).click()
  const input = panel.getByRole('textbox', { name: label, exact: true })
  await input.fill(value)
  await input.press('Enter')
  await expect(page.locator('.sync-status')).toContainText('Rack matches code')
}

test('Industrial triplets: six-cycle identity, budgets, audio, edits and stopped replacement', async ({
  page,
}, info) => {
  test.setTimeout(240_000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  const loaded = await run(page, 'loadIndustrial')
  expect(loaded).toEqual({ stopped: true, modules: 20 })
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  await page.screenshot({ path: info.outputPath('industrial-rack.png') })
  await page.evaluate(async (check) => {
    window.industrialProbe = (await import(check)).installIndustrialProbe()
  }, check)
  try {
    await play(page)
    const events = await run(page, 'verifyIndustrialEvents')
    const pcm = await run(page, 'liveIndustrialPCM', 27_000)
    expect(pcm.rms).toBeGreaterThan(0.001)
    expect(pcm.peak).toBeLessThan(1)
    const steady = await probe(page)
    expect(steady.triggers[0].cycle).toBe(0)
    expect(steady.triggers[0].cps).toBeCloseTo(56 / 240, 10)
    expect(steady.orbits.sort()).toEqual(['1', '2', '3'])
    expect(steady.buses).toEqual([])
    const measured = await sources(page)
    const steadyPeaks = measured.peaks
    expect(steadyPeaks.primary).toBeLessThanOrEqual(6)
    expect(steadyPeaks.anchor).toBeLessThanOrEqual(4)
    expect(steadyPeaks.low).toBeLessThanOrEqual(2)
    expect(steadyPeaks.modulators).toBeLessThanOrEqual(4)
    expect(steadyPeaks.noise).toBeLessThanOrEqual(2)
    // Each anchor voice has exactly one modulator, and every source has a finite end.
    const scheduled = (o) => o.end !== null && o.end > o.begin
    const finished = measured.anchor.filter((o) => o.end <= steady.now)
    expect(finished.length).toBeGreaterThanOrEqual(17)
    for (const voice of finished) {
      const mine = measured.modulators.filter((m) => m.end === voice.end)
      expect(mine.some((m) => Math.abs(m.frequency - voice.frequency * 2.41) < 0.01)).toBe(true)
    }
    expect(measured.modulators.length).toBe(measured.anchor.length)
    expect(
      [...measured.anchor, ...measured.low, ...measured.modulators, ...measured.noise].every(
        scheduled,
      ),
    ).toBe(true)
    // One cached noise buffer serves every hit; each hit stops after gate, release and cleanup.
    expect(measured.noise.length).toBeGreaterThanOrEqual(23)
    expect(new Set(measured.noise.map((n) => n.buffer)).size).toBe(1)
    const noiseLifetime = Math.max(...measured.noise.map((n) => n.end - n.begin))
    expect(noiseLifetime).toBeLessThanOrEqual(1 / 16 / (56 / 240) + 0.05 + 0.01 + 0.001)

    // Rack controls update future onsets while sounding voices keep their settings.
    await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
    await setKnob(page, 'fmop1', 'INDEX', '0.4')
    await setKnob(page, 'vcf2', 'CUTOFF', '3000')
    await setKnob(page, 'mix1', 'CH 2', '0.45')
    await page.waitForTimeout(7000)
    const edited = await probe(page)
    const after = edited.triggers.slice(steady.triggers.length)
    expect(after.some((t) => t.orbit === 1 && t.fmi === 0.4)).toBe(true)
    expect(after.some((t) => t.orbit === 2 && t.bandf === 3000 && t.postgain === 0.45)).toBe(true)

    const ringing = await page.evaluate(
      async (check) => (await import(check)).stopHeldIndustrial(window.industrialProbe),
      check,
    )
    expect(ringing.held.end).toBeGreaterThan(ringing.requestedAt + 2.5)
    expect(ringing.pcm.rms).toBeGreaterThan(0.001)
    await page.waitForTimeout(300)
    const stopped = (await probe(page)).triggers.length
    // Longer than the longest gap between onsets in any lane.
    const stopWindow = Math.ceil(events.longestGapSeconds * 1000) + 500
    await page.waitForTimeout(stopWindow)
    expect((await probe(page)).triggers.length).toBe(stopped)

    // The same edits must reach rendered audio, not only event parameters.
    const editedWav = await run(page, 'bounceIndustrial')
    await play(page)
    const replay = await run(page, 'liveIndustrialPCM', 300)
    const replayState = await probe(page)
    expect(replayState.triggers[stopped].cycle).toBe(0)
    await run(page, 'stopIndustrial')
    await run(page, 'loadIndustrial')
    const roundTrip = await run(page, 'industrialRoundTrip')
    expect(roundTrip.fanout).toEqual([
      'env1->vcf1.cv',
      'env1->vca1.cv',
      'env2->vcf2.cv',
      'env2->vca2.cv',
    ])

    // Reloading always restores the repository default without starting audio.
    const beforeRepeats = await page.evaluate(() => window.industrialProbe.read().now)
    for (let i = 0; i < 2; i++) {
      await run(page, 'loadIndustrial')
      await play(page)
      await run(page, 'liveIndustrialPCM', 200)
      await run(page, 'stopIndustrial')
    }
    const cumulativeRepeatedLoad = (await sources(page, beforeRepeats)).peaks
    await page.waitForTimeout(6000)
    const settled = await probe(page)
    const stale = (o) => !o.offline && o.end > settled.now
    expect(settled.oscillators.filter(stale)).toEqual([])
    expect(settled.noises.filter(stale)).toEqual([])
    expect(settled.buses).toEqual([])
    await run(page, 'loadIndustrial')
    const immediateReplay = await run(page, 'immediateIndustrialReplay')
    const immediateRestart = (await sources(page, immediateReplay.before)).peaks

    await run(page, 'loadIndustrial')
    const download = page.waitForEvent('download')
    const wav = await run(page, 'bounceIndustrial')
    const audio = await download
    await audio.saveAs(info.outputPath('default.wav'))
    await info.attach('default-six-cycle-WAV', {
      body: await readFile(await audio.path()),
      contentType: 'audio/wav',
    })
    expect(wav.peak).toBeGreaterThan(0.1)
    expect(wav.clipped).toBe(0)
    expect(wav.peak).toBeLessThan(0.95)

    const defaultBytes = await readFile(await audio.path())
    const comparisons = {}
    for (const [name, control] of [
      ['anchor-solo', 'SOLO 1'],
      ['machinery-solo', 'SOLO 2'],
      ['low-solo', 'SOLO 3'],
      ['machinery-muted', 'MUTE 2'],
    ]) {
      await run(page, 'loadIndustrial')
      await chooseSwitch(page.locator('[data-module="mix1"]'), control, 'on')
      await expect(page.locator('.sync-status')).toContainText('Rack matches code')
      const pending = page.waitForEvent('download')
      comparisons[name] = await run(page, 'bounceIndustrial')
      const rendered = await pending
      const bytes = await readFile(await rendered.path())
      expect(bytes.equals(defaultBytes)).toBe(false)
      let energy = 0
      for (let offset = 44; offset < defaultBytes.length; offset += 2) {
        const sample = (defaultBytes.readInt16LE(offset) - bytes.readInt16LE(offset)) / 32768
        energy += sample * sample
      }
      comparisons[name].differenceRMS = Math.sqrt(energy / ((defaultBytes.length - 44) / 2))
      await rendered.saveAs(info.outputPath(`${name}.wav`))
      await info.attach(name, {
        body: await readFile(await rendered.path()),
        contentType: 'audio/wav',
      })
    }
    const anchor = comparisons['anchor-solo']
    const machinery = comparisons['machinery-solo']
    const low = comparisons['low-solo']
    const muted = comparisons['machinery-muted']

    // Steady FM: carriers lead and inharmonic sidebands hold through the longest dyads.
    for (const window of ['eEarly', 'eMid', 'eLate', 'dMid']) {
      const { carriers, sidebands, sidebandRatio } = anchor.fm[window]
      expect(Math.min(...carriers)).toBeGreaterThan(Math.max(...sidebands))
      expect(sidebandRatio).toBeGreaterThan(0.25)
    }
    expect(anchor.fm.eLate.sidebandRatio / anchor.fm.eEarly.sidebandRatio).toBeGreaterThan(0.75)

    // Each lane is present in level terms, and the machinery leaves the anchor's carriers alone.
    expect(anchor.rms).toBeGreaterThan(0.02)
    expect(low.lowRoot).toBeGreaterThan(0.02)
    expect(machinery.noise.hitRMS).toBeGreaterThan(0.01)
    expect(muted.differenceRMS).toBeGreaterThan(0.002)
    wav.carrierDuringHit.forEach((level, i) => {
      expect(level / muted.carrierDuringHit[i]).toBeGreaterThan(0.9)
      expect(level / muted.carrierDuringHit[i]).toBeLessThan(1.1)
    })

    // Noise samples vary between contexts, so these are level and envelope bounds.
    expect(machinery.noise.hitPeak).toBeGreaterThan(0.05)
    expect(machinery.noise.hitPeak).toBeLessThan(0.6)
    expect(machinery.noise.afterGateRMS).toBeLessThan(0.0005)
    expect(machinery.noise.emptyGroupRMS).toBeLessThan(0.0005)

    // Live edits: lower INDEX thins the sidebands, a lower MIX level and higher filter
    // change the machinery band.
    expect(editedWav.fm.dMid.sidebandRatio).toBeLessThan(wav.fm.dMid.sidebandRatio / 2)
    expect(editedWav.noise.band).toBeLessThan(wav.noise.band)
    expect(editedWav.noise.upperBand / editedWav.noise.band).toBeGreaterThan(
      wav.noise.upperBand / wav.noise.band,
    )

    expect(await run(page, 'loadIndustrial')).toEqual(loaded)
    expect(errors).toEqual([])
    const evidence = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      browser: page.context().browser().version(),
      events,
      pcm,
      steadyPeaks,
      sources: {
        anchorVoices: measured.anchor.length,
        lowVoices: measured.low.length,
        modulators: measured.modulators.length,
        noiseHits: measured.noise.length,
        noiseBuffers: new Set(measured.noise.map((n) => n.buffer)).size,
        noiseLifetime,
      },
      stop: {
        ringing,
        heldAtStopSeconds: ringing.held.end - ringing.requestedAt,
        noNewOnsetsForMs: stopWindow,
      },
      replay,
      roundTrip,
      immediateRestart: { ...immediateReplay, peaks: immediateRestart },
      cumulativeRepeatedLoad,
      settledOrbits: settled.orbits,
      editedWav,
      wav,
      comparisons,
      errors,
      physicalListening: false,
    }
    await writeFile(
      info.outputPath('industrial-evidence.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    )
    await info.attach('industrial-evidence', {
      path: info.outputPath('industrial-evidence.json'),
      contentType: 'application/json',
    })
  } finally {
    await run(page, 'stopIndustrial')
    await page.evaluate(() => window.industrialProbe.restore())
  }
})
