import { test, expect } from 'playwright/test'
import { readFile } from 'node:fs/promises'
import { fileAction } from '../../scripts/panel-controls.mjs'

// #141: the arranger lane beneath the rack, against the real editor, history,
// recovery and pinned engine. Physical listening is not claimed.
const helper = '/scripts/arranger-browser.mjs'
const run = (page, method, arg) =>
  page.evaluate(async ({ helper, method, arg }) => (await import(helper))[method](arg), {
    helper,
    method,
    arg,
  })
const source = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
const replaceSource = (page, text) =>
  page.evaluate(
    async (value) => (await import('/scripts/editor-browser.mjs')).replaceSource(value),
    text,
  )
const accepted = (page) =>
  expect(page.locator('.sync-status')).toContainText('Rack matches code', { timeout: 10_000 })
const lane = (page) => page.locator('section.arranger')
const row = (page, label) => lane(page).getByRole('group', { name: `${label} lane` })
const cells = (page, label) => row(page, label).locator('.arranger-cell')
const pressed = async (page, label) =>
  (await cells(page, label).evaluateAll((all) => all.map((c) => c.ariaPressed))).join('')

async function open(page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
}
// Arrange is a footer popover, so the rack frame keeps its size.
async function openLane(page) {
  const summary = page.locator('.arranger-popover > summary')
  if ((await page.locator('.arranger-popover[open]').count()) === 0) await summary.click()
  await expect(lane(page)).toBeVisible()
}

async function drag(page, label, from, to) {
  const start = await cells(page, label).nth(from).boundingBox()
  const end = await cells(page, label).nth(to).boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 4 })
  await page.mouse.up()
}

test('lane edits write per-voice masks, undo, recover and play only their cycles', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page)
  await replaceSource(page, await run(page, 'arrangerSong'))
  await accepted(page)
  const frame = await page.locator('.rack-frame').boundingBox()
  await openLane(page)
  expect(await page.locator('.rack-frame').boundingBox()).toEqual(frame)
  await expect(cells(page, 'osc1')).toHaveCount(16)

  // With no masks there is no song length to save; always-on channels write nothing.
  await expect(lane(page).getByRole('button', { name: 'Shorter song' })).toBeDisabled()
  await expect(lane(page).getByRole('button', { name: 'Longer song' })).toBeDisabled()

  // Pointer: drag across the lead's first two cycles, then cut its lane to four.
  await drag(page, 'osc2', 0, 1)
  await accepted(page)
  for (let i = 0; i < 12; i++)
    await lane(page).getByRole('button', { name: 'Shorter song' }).click()
  await expect(lane(page).locator('output')).toHaveText('4 cycles')
  expect(await pressed(page, 'osc2')).toBe('falsefalsetruetrue')
  expect(await run(page, 'lanes')).toMatchObject({ arr1: '', arr2: '<0!2 1!2>' })
  const afterDrag = await source(page)
  expect(afterDrag).toContain('.mask("<0!2 1!2>")\n  .postgain(0.8)\n  .orbit(2)')
  expect(afterDrag).toContain('.postgain(0.8)\n  .orbit(1)')
  await expect(lane(page).locator('.arranger-code').nth(1)).toHaveText('.mask("<0!2 1!2>")')
  await lane(page).screenshot({ path: info.outputPath('arranger-lane.png') })
  await page.screenshot({ path: info.outputPath('arranger-workspace.png') })

  // Keyboard: End, then Space rests the bass's last cycle.
  await cells(page, 'osc1').first().focus()
  await page.keyboard.press('End')
  await expect(cells(page, 'osc1').nth(3)).toBeFocused()
  await page.keyboard.press('Space')
  await accepted(page)
  expect(await run(page, 'lanes')).toMatchObject({ arr1: '<1!3 0>', arr2: '<0!2 1!2>' })

  // Accepted-document history: each lane edit is one step.
  await page.keyboard.press('Control+z')
  await accepted(page)
  expect(await source(page)).toBe(afterDrag)
  await page.keyboard.press('Shift+Control+z')
  await accepted(page)
  expect(await run(page, 'lanes')).toMatchObject({ arr1: '<1!3 0>' })

  // Code to rack: editing the mask moves the lane.
  const edited = (await source(page)).replace('"<1!3 0>"', '"<1 0!3>"')
  await replaceSource(page, edited)
  await accepted(page)
  expect(await pressed(page, 'osc1')).toBe('truefalsefalsefalse')
  const beforeReload = await source(page)
  expect(beforeReload.startsWith(edited.split('\n// ── @monkeyboy rack v1')[0])).toBe(true)

  // Local recovery restores the exact file and the lane.
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await accepted(page)
  await openLane(page)
  await expect(page.locator('.arranger-popover > summary')).toHaveText('Arrange (2)')
  expect(await source(page)).toBe(beforeReload)
  expect(await pressed(page, 'osc1')).toBe('truefalsefalsefalse')
  expect(await pressed(page, 'osc2')).toBe('falsefalsetruetrue')

  // Real playback: orbit 1 (bass) only in cycle 0 of each 4, orbit 2 (lead) in 2 and 3.
  await run(page, 'installTriggerProbe')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  await expect(page.locator('.arranger-cell[aria-current="step"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click()
  await lane(page).screenshot({ path: info.outputPath('arranger-playhead.png') })
  const { pcm, positions } = await run(page, 'playheadPCM', 6_000)
  // Away from the 100ms display tick boundary, the highlighted cycle matches the scheduler.
  const settled = positions.filter(({ cycle }) => cycle % 1 > 0.25 && cycle % 1 < 0.85)
  expect(settled.length).toBeGreaterThan(20)
  expect(settled.every(({ cycle, current }) => current === Math.floor(cycle) % 4)).toBe(true)
  expect(new Set(settled.map(({ current }) => current))).toEqual(new Set([0, 1, 2, 3]))
  expect(settled.some(({ cycle }) => cycle >= 4)).toBe(true)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Ready', { timeout: 10_000 })
  await expect(page.locator('.arranger-cell[aria-current="step"]')).toHaveCount(0)
  const triggers = await page.evaluate(() => window.arrangerProbe.read())
  const whole = (orbit) => [
    ...new Set(triggers.filter((t) => t.orbit === orbit).map((t) => Math.floor(t.cycle) % 4)),
  ]
  expect(triggers.length).toBeGreaterThan(8)
  expect(new Set(triggers.map((t) => t.cps))).toEqual(new Set([1]))
  expect(whole(1)).toEqual([0])
  expect(whole(2).toSorted((a, b) => a - b)).toEqual([2, 3])
  expect(pcm.rms).toBeGreaterThan(0.001)
  expect(pcm.peak).toBeLessThan(1)
  expect(errors).toEqual([])
  await info.attach('results', {
    body: JSON.stringify(
      {
        triggers: triggers.length,
        cycles: [...new Set(triggers.map((t) => Math.floor(t.cycle)))],
        pcm,
        positions,
        physicalListening: false,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})

test('imported lanes edit in place; adding one converts with Undo to the exact source', async ({
  page,
}) => {
  await open(page)
  const imported = `// my song
$: note("c3 e3").s("sine").mask("<1!2 0!2>") // bass enters
$: note("g4").s("square")
`
  await replaceSource(page, imported)
  await accepted(page)
  await openLane(page)
  expect(await pressed(page, 'osc1')).toBe('truetruefalsefalse')
  // An imported literal changes in place; comments and other bytes stay.
  await cells(page, 'osc1').nth(2).focus()
  await page.keyboard.press('Enter')
  await accepted(page)
  const spliced = await source(page)
  expect(spliced.split('\n// ── @monkeyboy rack v1')[0]).toBe(
    imported.replace('"<1!2 0!2>"', '"<1!3 0>"').trimEnd(),
  )
  // A channel without a mask has no literal: the edit converts, with Undo.
  await cells(page, 'osc2').first().focus()
  await page.keyboard.press('Space')
  await accepted(page)
  await expect(page.locator('.workspace-notice')).toContainText('Code rewritten in rack style')
  expect(await run(page, 'lanes')).toMatchObject({ arr2: '<0 1!3>' })
  await page.locator('.workspace-notice').getByRole('button', { name: /^Undo/ }).click()
  await accepted(page)
  expect(await source(page)).toBe(spliced)

  // Playing the last rested cycle clears the lane: only the mask call goes.
  await cells(page, 'osc1').nth(3).focus()
  await page.keyboard.press('Space')
  await accepted(page)
  expect((await source(page)).split('\n// ── @monkeyboy rack v1')[0]).toBe(
    imported.replace('.mask("<1!2 0!2>")', '').trimEnd(),
  )
  expect(await run(page, 'lanes')).toMatchObject({ arr1: '', arr2: '' })
})

test('recorded scheduler clock drives the playhead without editing history or saved state', async ({
  page,
}) => {
  await page.route('**/src/strudel/engine.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
const state = window.clockFixture = { cycle: 0, reads: [], running: false };
const listeners = new Set();
export const getClock = () => {
  state.reads.push(state.cycle);
  return { cycle: state.cycle, cps: 1, running: state.running };
};
export async function play() {
  state.running = true;
  if (state.hold) await new Promise(resolve => { state.finish = resolve; });
}
export async function stop() {
  state.running = false;
  listeners.forEach(listener => listener({ type: 'activity-clear' }));
}
export async function setVolume() {}
export async function loadSamplePacks() {}
export async function auditionSample() {}
const samplePacks = [];
export const getSamplePacks = () => samplePacks;
export const getSampleWarnings = () => samplePacks;
export const subscribeSamplePacks = () => () => {};
export const getResourceStatus = () => 'unknown';
export const scopeData = () => undefined;
export const probe = async () => ({ kind: 'unavailable', reason: 'clock fixture' });
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
`,
    }),
  )
  await open(page)
  await replaceSource(page, '$: note("c3").s("sine").mask("<1 0!3>")\n')
  await accepted(page)
  await openLane(page)
  const saved = await source(page)
  const recovery = await page.evaluate(() => localStorage.getItem('monkeyboy.workspace.v1'))
  const highlighted = page.locator('.arranger-cell[aria-current="step"]')
  await expect(highlighted).toHaveCount(0)
  await page.evaluate(() => {
    window.clockFixture.hold = true
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Starting audio')
  await expect(highlighted).toHaveAttribute('data-cycle', '0')
  for (const [cycle, expected] of [
    [2.5, '2'],
    [7.75, '3'],
    [8.25, '0'],
  ]) {
    await page.evaluate((value) => {
      window.clockFixture.cycle = value
    }, cycle)
    await expect(highlighted).toHaveAttribute('data-cycle', expected)
  }
  await page.evaluate(() => window.clockFixture.finish())
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  expect(await page.evaluate(() => window.clockFixture.reads)).toContain(8.25)
  // Changing the preference cancels the shared clock's polling interval.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.cycle-clock')).toContainText('motion paused')
  const frozen = await highlighted.getAttribute('data-cycle')
  const reads = await page.evaluate(() => window.clockFixture.reads.length)
  await page.evaluate(() => {
    window.clockFixture.cycle = 11.5
  })
  await page.waitForTimeout(350)
  await expect(highlighted).toHaveAttribute('data-cycle', frozen)
  expect(await page.evaluate(() => window.clockFixture.reads.length)).toBe(reads)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(highlighted).toHaveAttribute('data-cycle', '3')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.cycle-clock')).toContainText('motion paused')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(highlighted).toHaveCount(0)
  expect(await source(page)).toBe(saved)
  expect(await page.evaluate(() => localStorage.getItem('monkeyboy.workspace.v1'))).toBe(recovery)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // A held live rack edit keeps advancing the playhead while evaluation is applying.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Starting audio')
  await page.evaluate(() => window.clockFixture.finish())
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  await lane(page).getByRole('button', { name: 'Longer song' }).click()
  await expect(page.locator('.transport-status')).toHaveText('Applying code')
  await expect(highlighted).toHaveAttribute('data-cycle', '1') // cycle 11, five-cycle song
  await page.evaluate(() => {
    window.clockFixture.cycle = 14.5
  })
  await expect(highlighted).toHaveAttribute('data-cycle', '4')
  await page.evaluate(() => {
    window.clockFixture.hold = false
    window.clockFixture.finish()
  })
  await expect(page.locator('.transport-status')).toHaveText('Playing')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(highlighted).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await source(page)).toBe(saved)
  // The next Undo still undoes the code edit, not a playhead update.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await accepted(page)
  expect(await source(page)).not.toBe(saved)
})

test('song length edits align imported lanes, undo/redo, recover and Export/Open', async ({
  page,
}, info) => {
  await open(page)
  const imported = `// my song\n$: note("c3").s("sine").mask(/* bass */ "<1!2 0!2>") // keep\n$: note("g4").s("square").mask("<0 1>")\n$: note("c5").s("triangle")\n`
  await replaceSource(page, imported)
  await accepted(page)
  await openLane(page)
  await expect(lane(page).locator('output')).toHaveText('4 cycles')
  await expect(lane(page).locator('.arranger-hint')).toContainText('drift apart')
  const before = await source(page)
  await lane(page).getByRole('button', { name: 'Longer song' }).click()
  await accepted(page)
  await expect(lane(page).locator('output')).toHaveText('5 cycles')
  await expect(lane(page).locator('.arranger-hint')).not.toContainText('drift apart')
  const longer = await source(page)
  expect(longer.split('\n// ── @monkeyboy rack v1')[0]).toBe(
    imported.replace('"<1!2 0!2>"', '"<1!2 0!3>"').replace('"<0 1>"', '"<0 1!4>"').trimEnd(),
  )
  expect(await run(page, 'lanes')).toMatchObject({ arr1: '<1!2 0!3>', arr2: '<0 1!4>', arr3: '' })
  await lane(page).getByRole('button', { name: 'Shorter song' }).click()
  await accepted(page)
  await expect(lane(page).locator('output')).toHaveText('4 cycles')
  const shorter = await source(page)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane(page).locator('output')).toHaveText('5 cycles')
  expect(await source(page)).toBe(longer)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane(page).locator('output')).toHaveText('4 cycles')
  expect(await source(page)).toBe(before)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await source(page)).toBe(longer)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await source(page)).toBe(shorter)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lane(page).locator('output')).toHaveText('5 cycles')

  const pending = page.waitForEvent('download')
  await fileAction(page, 'Export')
  const download = await pending
  const exported = await readFile(await download.path(), 'utf8')
  // Export adds the app's standard factory sample setup; the complete rack stays intact.
  const patches = await page.evaluate(
    async ({ longer, exported }) => {
      const { read } = await import('/src/reader/index.ts')
      return { before: read(longer).patch, after: read(exported).patch }
    },
    { longer, exported },
  )
  expect(patches.after).toEqual({ ...patches.before, cartridges: expect.any(Array) })
  expect(exported).toContain(
    imported.replace('"<1!2 0!2>"', '"<1!2 0!3>"').replace('"<0 1>"', '"<0 1!4>"').trimEnd(),
  )
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await accepted(page)
  await openLane(page)
  await expect(lane(page).locator('output')).toHaveText('5 cycles')
  expect(await source(page)).toBe(longer)
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'song.strudel', mimeType: 'text/plain', buffer: Buffer.from(exported) })
  await accepted(page)
  await openLane(page)
  await expect(lane(page).locator('output')).toHaveText('5 cycles')
  expect(await source(page)).toBe(exported)
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click()
  await lane(page).screenshot({ path: info.outputPath('arranger-length.png') })
})
