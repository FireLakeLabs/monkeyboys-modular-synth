import { test, expect } from 'playwright/test'

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

  // A shorter song changes only the view while no lane runs past it.
  const generated = await source(page)
  for (let i = 0; i < 12; i++)
    await lane(page).getByRole('button', { name: 'Shorter song' }).click()
  await expect(lane(page).locator('output')).toHaveText('4 cycles')
  expect(await source(page)).toBe(generated)

  // Pointer: drag across the lead's first two cycles to rest them.
  await drag(page, 'osc2', 0, 1)
  await accepted(page)
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
  const pcm = await run(page, 'livePCM', 6_000)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Ready', { timeout: 10_000 })
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
})
