import { test, expect } from 'playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { chooseSwitch, detailPanel } from '../../scripts/panel-controls.mjs'

const run = (page, method, arg) =>
  page.evaluate(async ({ method, arg }) => (await import('/scripts/doom-check.mjs'))[method](arg), {
    method,
    arg,
  })
const play = async (page) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
}

test('Doom instrument: six-cycle identity, budgets, audio, edits and stopped replacement', async ({
  page,
}, info) => {
  test.setTimeout(180_000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  const loaded = await run(page, 'loadDoom')
  expect(loaded).toEqual({ stopped: true, modules: 20 })
  await page.getByRole('button', { name: 'Fit rack', exact: true }).click()
  await page.screenshot({ path: info.outputPath('doom-rack.png') })
  await page.evaluate(async () => {
    window.doomProbe = (await import('/scripts/doom-check.mjs')).installDoomProbe()
  })
  try {
    await play(page)
    const events = await run(page, 'verifyDoomEvents')
    const pcm = await run(page, 'liveDoomPCM', 27_000)
    expect(pcm.rms).toBeGreaterThan(0.001)
    expect(pcm.peak).toBeLessThan(1)
    const steady = await page.evaluate(() => window.doomProbe.read())
    expect(steady.triggers[0].cycle).toBe(0)
    expect(steady.triggers[0].cps).toBeCloseTo(56 / 240, 10)
    expect(steady.cumulativeDrivePeak).toBeGreaterThan(0)
    expect(steady.cumulativeDrivePeak).toBeLessThanOrEqual(4)
    expect(steady.orbits.sort()).toEqual(['1', '2', '3'])
    expect(steady.buses).toEqual([])
    const primaries = steady.oscillators.filter((o) => o.frequency > 20)
    expect(primaries.every((o) => o.end !== null && o.end > o.begin)).toBe(true)
    const primaryPeak = await page.evaluate(
      async (list) => (await import('/scripts/doom-check.mjs')).overlap(list),
      primaries,
    )
    expect(primaryPeak).toBeLessThanOrEqual(8)
    const vibrato = steady.oscillators.filter((o) => o.frequency < 1)
    expect(vibrato.length).toBe(1)
    expect(vibrato[0].frequency).toBeCloseTo(56 / 240 / 4, 7)
    expect(vibrato[0].end - vibrato[0].begin).toBeCloseTo(2 / (56 / 240) + 0.6 + 0.01, 2)

    // Rack controls update future onsets while held voices retain their settings.
    await page.getByRole('checkbox', { name: 'Auto-apply while playing', exact: true }).check()
    for (const [id, label, value] of [
      ['vcf1', 'CUTOFF', '1800'],
      ['drive1', 'DRIVE', '1'],
      ['mix1', 'CH 1', '0.1'],
    ]) {
      await detailPanel(page.locator(`[data-module="${id}"]`))
      const control = page
        .locator(`[data-module="${id}"]`)
        .getByRole('button', { name: `Set ${label}`, exact: true })
      await control.click()
      const input = page
        .locator(`[data-module="${id}"]`)
        .getByRole('textbox', { name: label, exact: true })
      await input.fill(value)
      await input.press('Enter')
      await expect(page.locator('.sync-status')).toContainText('Rack matches code')
    }
    await page.waitForTimeout(7000)
    const edited = await page.evaluate(() => window.doomProbe.read())
    expect(
      edited.triggers.some(
        (t) => t.orbit === 1 && t.cutoff === 1800 && t.distort === 1 && t.postgain === 0.1,
      ),
    ).toBe(true)
    const ringing = await page.evaluate(async () =>
      (await import('/scripts/doom-check.mjs')).stopHeldDoom(window.doomProbe),
    )
    expect(ringing.held.end).toBeGreaterThan(ringing.requestedAt + 3)
    expect(ringing.pcm.rms).toBeGreaterThan(0.001)
    await page.waitForTimeout(300)
    const stopped = await page.evaluate(() => window.doomProbe.read().triggers.length)
    await page.waitForTimeout(5500)
    expect(await page.evaluate(() => window.doomProbe.read().triggers.length)).toBe(stopped)
    // Replay after the Stop scheduling observation.
    await play(page)
    const replay = await run(page, 'liveDoomPCM', 300)
    const replayState = await page.evaluate(() => window.doomProbe.read())
    expect(replayState.triggers[stopped].cycle).toBe(0)
    await run(page, 'stopDoom')
    await run(page, 'loadDoom')
    const roundTrip = await run(page, 'doomRoundTrip')
    // Reloading always restores the repository default without starting audio.
    for (let i = 0; i < 2; i++) {
      await run(page, 'loadDoom')
      await play(page)
      await run(page, 'liveDoomPCM', 200)
      await run(page, 'stopDoom')
    }
    await page.waitForTimeout(5500)
    const settled = await page.evaluate(() => window.doomProbe.read())
    expect(settled.activeDrive).toBe(0)
    expect(settled.orbits.sort()).toEqual(['1', '2'])
    expect(settled.buses).toEqual([])
    await run(page, 'loadDoom')
    const immediateReplay = await run(page, 'immediateDoomReplay')
    const immediateState = await page.evaluate(() => window.doomProbe.read())
    const immediatePrimaryPeak = await page.evaluate(
      async ({ list, after }) =>
        (await import('/scripts/doom-check.mjs')).overlap(
          list.filter((o) => !o.offline && o.frequency > 20 && o.end > after),
        ),
      { list: immediateState.oscillators, after: immediateReplay.before },
    )
    const immediateAnchorPeak = await page.evaluate(
      async ({ list, after }) =>
        (await import('/scripts/doom-check.mjs')).overlap(
          list.filter((o) => !o.offline && o.type === 'sawtooth' && o.end > after),
        ),
      { list: immediateState.oscillators, after: immediateReplay.before },
    )
    const immediateConnectedDrive = immediateState.activeDrive
    expect(immediateConnectedDrive).toBe(immediateAnchorPeak)
    await run(page, 'loadDoom')
    const download = page.waitForEvent('download')
    const wav = await run(page, 'bounceDoom')
    const audio = await download
    await audio.saveAs(info.outputPath('war-pigs-doom-instrument.wav'))
    await info.attach('default-six-cycle-WAV', {
      body: await readFile(await audio.path()),
      contentType: 'audio/wav',
    })
    const defaultBytes = await readFile(await audio.path())
    const comparisons = {}
    for (const [name, control] of [
      ['anchor-solo', 'SOLO 1'],
      ['warning-muted', 'MUTE 3'],
    ]) {
      await run(page, 'loadDoom')
      await chooseSwitch(page.locator('[data-module="mix1"]'), control, 'on')
      await expect(page.locator('.sync-status')).toContainText('Rack matches code')
      const pending = page.waitForEvent('download')
      comparisons[name] = await run(page, 'bounceDoom')
      const rendered = await pending
      const comparisonBytes = await readFile(await rendered.path())
      expect(comparisonBytes.equals(defaultBytes)).toBe(false)
      let energy = 0
      for (let offset = 44; offset < defaultBytes.length; offset += 2) {
        const sample =
          (defaultBytes.readInt16LE(offset) - comparisonBytes.readInt16LE(offset)) / 32768
        energy += sample * sample
      }
      comparisons[name].differenceRMS = Math.sqrt(energy / ((defaultBytes.length - 44) / 2))
      if (name === 'warning-muted') expect(comparisons[name].differenceRMS).toBeGreaterThan(0.01)
      await rendered.saveAs(info.outputPath(`${name}.wav`))
      await info.attach(name, {
        body: await readFile(await rendered.path()),
        contentType: 'audio/wav',
      })
    }
    expect(wav.accents.strongGsharp).toBeGreaterThan(wav.accents.softGsharp)
    expect(comparisons['anchor-solo'].accents.strongGsharp).toBeGreaterThan(
      comparisons['anchor-solo'].accents.softGsharp,
    )
    expect(await run(page, 'loadDoom')).toEqual(loaded)
    expect(errors).toEqual([])
    const evidence = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      browser: page.context().browser().version(),
      events,
      pcm,
      steady,
      primaryPeak,
      immediateReplay,
      immediatePrimaryPeak,
      immediateAnchorPeak,
      immediateConnectedDrive,
      immediateState,
      ringing,
      replay,
      replayState,
      edited,
      settled,
      roundTrip,
      wav,
      comparisons,
      errors,
      physicalListening: false,
    }
    await writeFile(info.outputPath('doom-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    await info.attach('doom-evidence', {
      path: info.outputPath('doom-evidence.json'),
      contentType: 'application/json',
    })
  } finally {
    await run(page, 'stopDoom')
    await page.evaluate(() => window.doomProbe.restore())
  }
})
