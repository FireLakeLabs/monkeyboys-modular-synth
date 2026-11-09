import { test, expect } from 'playwright/test'
import { mkdir } from 'node:fs/promises'

const EVIDENCE = 'docs/evidence/sound-picker'

/** A short decaying tone, so auditions decode real audio without the network. */
function wav() {
  const rate = 8000
  const samples = 800
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(Math.round(Math.sin(i / 4) * 8000 * (1 - i / samples)), 44 + i * 2)
  return buffer
}
const files = (folder, count) => Array.from({ length: count }, (_, n) => `${folder}/${n}.wav`)
// Small stand-ins for the two factory packs, plus a third pack with a wavetable.
const MANIFESTS = {
  'Dirt-Samples': { bd: files('bd', 2), '808bd': files('808bd', 3), kicklinn: files('kl', 1) },
  'tidal-drum-machines': {
    RolandTR808_bd: files('tr808bd', 4),
    RolandTR808_sd: files('tr808sd', 2),
    SequentialCircuitsDrumtracks_bd: files('sqbd', 1),
  },
  'picker.example': { jazz: files('jazz', 3), wt_fixture: files('wt', 1) },
}

async function setup(page, { wavetables = true } = {}) {
  const fetched = []
  await page.route(/^https:\/\/(raw\.githubusercontent\.com|picker\.example)\//, (route) => {
    const url = route.request().url()
    if (url.endsWith('.wav')) {
      fetched.push(new URL(url).pathname.split('/').slice(-2).join('/'))
      return route.fulfill({ body: wav(), contentType: 'audio/wav' })
    }
    const pack = Object.keys(MANIFESTS).find((name) => url.includes(name))
    if (!pack) return route.abort()
    const json = { ...MANIFESTS[pack] }
    if (!wavetables) delete json.wt_fixture
    return route.fulfill({ json: pack === 'picker.example' ? { _base: url, ...json } : json })
  })
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    let patch = {
      ...m.starterPatch(104),
      cartridges: [{ source: 'https://picker.example/strudel.json' }],
    }
    for (const [type, hp] of [
      ['smpl', 0],
      ['reverb', 10],
      ['splice', 20],
      ['wavetable', 34],
    ])
      patch = m.placeModule(patch, type, 0, hp)
    patch = m.setValue(patch, 'splice1', 'sample', 'jazz:1')
    patch = m.connect(patch, { module: 'smpl1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
  })
  await page.getByLabel('Rack zoom').selectOption('1')
  return fetched
}
const editorSource = (page) =>
  page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource())
/** The playable code, without the saved rack layout that follows it. */
const code = async (page) => (await editorSource(page)).split('// ── @monkeyboy rack')[0]
const slot = (page, id) => page.locator(`[data-module="${id}"] .sample-slot`)
const readout = (page, id) => slot(page, id).locator('.sample-readout')
const picker = (page, id) => page.getByRole('dialog', { name: `Choose sound for ${id}` })
const optionLabels = (dialog) =>
  dialog
    .getByRole('option')
    .evaluateAll((options) => options.map((option) => option.getAttribute('aria-label')))

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true })
})

test('search, flip variants with sound, choose with Enter and undo in one step', async ({
  page,
}) => {
  const fetched = await setup(page)
  expect(await page.locator('.sample-slot select, .sample-slot option').count()).toBe(0)
  await expect(readout(page, 'smpl1')).toHaveAccessibleName('Sound for smpl1: none')
  await expect(readout(page, 'smpl1')).toHaveText('Choose sound')
  const before = await editorSource(page)

  await readout(page, 'smpl1').click()
  const dialog = picker(page, 'smpl1')
  const search = dialog.getByRole('combobox', { name: 'Search sounds' })
  await expect(search).toBeFocused()
  // The first view lists what the patch already uses, then sounds in pack order.
  await expect
    .poll(async () => (await optionLabels(dialog)).slice(0, 3))
    .toEqual([
      'jazz:1, In this patch, variant 2 of 3',
      'bd:0, Dirt Samples, variant 1 of 2',
      '808bd:0, Dirt Samples, variant 1 of 3',
    ])
  await expect(dialog.getByRole('option')).toHaveCount(9)
  await page.screenshot({ path: `${EVIDENCE}/home.png` })

  await search.fill('808')
  await expect
    .poll(() => optionLabels(dialog))
    .toEqual([
      '808bd:0, Dirt Samples, variant 1 of 3',
      'RolandTR808_bd:0, Drum Machines, variant 1 of 4',
      'RolandTR808_sd:0, Drum Machines, variant 1 of 2',
    ])
  await page.keyboard.press('ArrowDown')
  const active = await search.getAttribute('aria-activedescendant')
  await expect(page.locator(`[id="${active}"]`)).toHaveAccessibleName(/^RolandTR808_bd:0,/)

  // Three quick flips play only the variant they stop on.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator(`[id="${active}"]`)).toHaveAccessibleName(/^RolandTR808_bd:3,/)
  await expect.poll(() => fetched, { timeout: 20_000 }).toContain('tr808bd/3.wav')
  await page.waitForTimeout(500)
  expect(fetched.filter((file) => file.startsWith('tr808bd/'))).toEqual(['tr808bd/3.wav'])
  await page.screenshot({ path: `${EVIDENCE}/search.png` })

  // Space plays the active row again; the row above plays when chosen with Space.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press(' ')
  await expect.poll(() => fetched).toContain('808bd/0.wav')
  await expect(search).toHaveValue('808')
  await page.keyboard.press('ArrowDown')

  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', 'RolandTR808_bd:3')
  await expect(readout(page, 'smpl1')).toHaveText('RolandTR808bd:3')
  await expect(readout(page, 'smpl1')).toBeFocused()
  expect(await code(page)).toContain('s("RolandTR808_bd:3")')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', '')
  expect(await editorSource(page)).toBe(before)

  // Recent remembers the choice for the next picker.
  await readout(page, 'reverb1').click()
  expect((await optionLabels(picker(page, 'reverb1'))).slice(0, 2)).toEqual([
    'jazz:1, In this patch, variant 2 of 3',
    'RolandTR808_bd:3, Recent, variant 4 of 4',
  ])
})

test('kinds, packs, empty results, outside click, Esc and Clear slot', async ({ page }) => {
  await setup(page)
  const before = await editorSource(page)
  await readout(page, 'smpl1').click()
  const dialog = picker(page, 'smpl1')
  await dialog.getByRole('button', { name: 'Kick', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Search sounds' })).toBeFocused()
  await expect
    .poll(() => optionLabels(dialog))
    .toEqual([
      'bd:0, Dirt Samples, variant 1 of 2',
      '808bd:0, Dirt Samples, variant 1 of 3',
      'kicklinn:0, Dirt Samples, variant 1 of 1',
      'RolandTR808_bd:0, Drum Machines, variant 1 of 4',
      'SequentialCircuitsDrumtracks_bd:0, Drum Machines, variant 1 of 1',
    ])
  // Three seated packs bring the pack filter.
  await dialog.getByRole('button', { name: 'Drum Machines', exact: true }).click()
  await expect
    .poll(() => optionLabels(dialog))
    .toEqual([
      'RolandTR808_bd:0, Drum Machines, variant 1 of 4',
      'SequentialCircuitsDrumtracks_bd:0, Drum Machines, variant 1 of 1',
    ])
  await page.screenshot({ path: `${EVIDENCE}/kinds.png` })
  await dialog.getByRole('combobox', { name: 'Search sounds' }).fill('zzz')
  await expect(dialog.getByText('No sounds match.')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(readout(page, 'smpl1')).toBeFocused()
  await readout(page, 'smpl1').click()
  await expect(dialog).toBeVisible()
  await page.locator('.rack-frame').click({ position: { x: 900, y: 700 } })
  await expect(dialog).toBeHidden()
  expect(await editorSource(page)).toBe(before)

  // Clicking a row chooses it; Clear slot empties the slot again.
  await readout(page, 'smpl1').click()
  await dialog.getByRole('combobox', { name: 'Search sounds' }).fill('kick')
  await dialog.getByRole('option', { name: /^kicklinn:0,/ }).click()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', 'kicklinn:0')
  await readout(page, 'smpl1').click()
  await dialog.getByRole('button', { name: 'Clear slot', exact: true }).click()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', '')
  expect(await code(page)).toBe(before.split('// ── @monkeyboy rack')[0])
})

test('WAVETABLE offers only wt_ sounds and says when there are none', async ({ page }) => {
  await setup(page)
  await readout(page, 'wavetable1').click()
  const dialog = picker(page, 'wavetable1')
  // Its first view lists every wavetable, and drum kinds do not apply.
  await expect
    .poll(() => optionLabels(dialog))
    .toEqual(['wt_fixture:0, picker.example, variant 1 of 1'])
  await expect(dialog.getByRole('group', { name: 'Kind' })).toHaveCount(0)
  await expect(dialog.getByRole('combobox')).toHaveAttribute('placeholder', 'Search 1 wavetable')
  await page.keyboard.press('Enter')
  await expect(slot(page, 'wavetable1')).toHaveAttribute('data-value', 'wt_fixture:0')

  const empty = await page.context().newPage()
  await setup(empty, { wavetables: false })
  await readout(empty, 'wavetable1').click()
  const none = picker(empty, 'wavetable1')
  await expect(
    none.getByText(
      'This slot takes wavetables, sounds named wt_…, and none of the seated packs has any.',
    ),
  ).toBeVisible()
  await empty.screenshot({ path: `${EVIDENCE}/wavetable-empty.png` })
  await none.getByRole('button', { name: 'Open Packs', exact: true }).click()
  await expect(empty.getByRole('tab', { name: 'Packs' })).toHaveAttribute('aria-selected', 'true')
})

test('Browse all hands the search to a pick mode in the Sounds dock', async ({ page }) => {
  await setup(page)
  await readout(page, 'smpl1').click()
  await picker(page, 'smpl1').getByRole('combobox', { name: 'Search sounds' }).fill('808')
  await picker(page, 'smpl1').getByRole('button', { name: 'Browse all in Sounds ›' }).click()

  await expect(page.getByRole('tab', { name: 'Sounds', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const crate = page.getByRole('region', { name: 'Sound crate' })
  await expect(crate.getByText('Choosing for smpl1')).toBeVisible()
  await expect(crate.getByRole('searchbox', { name: 'Search sounds' })).toHaveValue('808')
  await expect(crate.getByRole('searchbox', { name: 'Search sounds' })).toBeFocused()
  await expect(page.locator('[data-module="smpl1"]')).toHaveAttribute('data-sound-target', 'true')
  await expect(page.locator('[data-module="reverb1"]')).toHaveAttribute(
    'data-sound-target',
    'false',
  )
  await expect(readout(page, 'smpl1')).toContainText('choosing…')
  const use = crate.getByRole('button', { name: 'Use RolandTR808_bd:0 for smpl1' })
  await expect(use).toBeVisible()
  await page.screenshot({ path: `${EVIDENCE}/pick-mode.png` })

  await use.click()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', 'RolandTR808_bd:0')
  // Pick mode stays on so you can try another.
  await crate.getByRole('button', { name: 'Use 808bd:0 for smpl1' }).click()
  await expect(slot(page, 'smpl1')).toHaveAttribute('data-value', '808bd:0')
  await page.keyboard.press('Escape')
  await expect(crate.getByText('Choosing for smpl1')).toBeHidden()
  await expect(page.locator('[data-module="smpl1"]')).not.toHaveAttribute('data-sound-target')
  await expect(crate.getByRole('button', { name: /^Use / })).toHaveCount(0)

  await readout(page, 'splice1').click()
  await picker(page, 'splice1').getByRole('button', { name: 'Browse all in Sounds ›' }).click()
  await expect(crate.getByText('Choosing for splice1')).toBeVisible()
  await crate.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(crate.getByText('Choosing for splice1')).toBeHidden()

  await readout(page, 'reverb1').click()
  await picker(page, 'reverb1').getByRole('button', { name: 'Browse all in Sounds ›' }).click()
  await expect(crate.getByText('Choosing for reverb1')).toBeVisible()
  await page.locator('[data-module="splice1"] .module-header').click()
  await expect(crate.getByText('Choosing for reverb1')).toBeHidden()

  // Any route that selects another module ends pick mode, including the module menu.
  await readout(page, 'smpl1').click()
  await picker(page, 'smpl1').getByRole('button', { name: 'Browse all in Sounds ›' }).click()
  await expect(crate.getByText('Choosing for smpl1')).toBeVisible()
  await page.locator('[data-module="reverb1"] .module-header').click({ button: 'right' })
  await expect(crate.getByText('Choosing for smpl1')).toBeHidden()
  await expect(crate.getByRole('button', { name: /^Use / })).toHaveCount(0)
})

test('readouts fit an 8 HP panel for long, missing and empty values', async ({ page }) => {
  await setup(page)
  await page.evaluate(async () => {
    const m = await import('/src/rack/model.ts')
    const { read } = await import('/src/reader/index.ts')
    const { generate } = await import('/src/codegen/generate.ts')
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    let patch = read(editorSource()).patch
    patch = m.setValue(patch, 'smpl1', 'sample', 'SequentialCircuitsDrumtracks_bd:0')
    patch = m.setValue(patch, 'reverb1', 'ir', 'nosuch:2')
    await (await import('/scripts/rack-feel-check.mjs')).load(generate(patch))
  })
  // Packs load on first use. Until then no slot claims its sound is missing.
  await expect(readout(page, 'splice1')).toHaveAccessibleName('Sound for splice1: jazz:1')
  await expect(readout(page, 'reverb1')).toHaveAccessibleName('Sound for reverb1: nosuch:2')
  await expect(page.locator('.sample-slot[data-state="missing"]')).toHaveCount(0)
  // Opening a picker loads the seated packs, so the readouts can tell what is missing.
  await readout(page, 'wavetable1').click()
  await page.keyboard.press('Escape')
  await expect(readout(page, 'smpl1')).toHaveAccessibleName(
    'Sound for smpl1: SequentialCircuitsDrumtracks_bd:0',
  )
  await expect(readout(page, 'reverb1')).toHaveAccessibleName(
    'Sound for reverb1: nosuch:2, not loaded',
  )
  await expect(slot(page, 'reverb1')).toHaveAttribute('data-state', 'missing')
  await expect(readout(page, 'wavetable1')).toHaveText('Choose wt_ sound')
  for (const id of ['smpl1', 'reverb1', 'splice1', 'wavetable1']) {
    const box = await readout(page, id).evaluate((element) => ({
      overflow: element.scrollWidth - element.clientWidth,
      inside:
        element.getBoundingClientRect().right <=
        element.closest('.module-panel').getBoundingClientRect().right,
    }))
    expect(box, id).toEqual({ overflow: 0, inside: true })
  }
  await page.locator('[data-module="smpl1"]').screenshot({ path: `${EVIDENCE}/readout-long.png` })
  await page.locator('.rack-surface').screenshot({ path: `${EVIDENCE}/readouts.png` })
})
