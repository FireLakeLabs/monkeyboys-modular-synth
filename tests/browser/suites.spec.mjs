import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from 'playwright/test'

const execute = promisify(execFile)

// These suites already own their browser contexts and assertions. Retain their
// partial JSON/screenshots and stdout/stderr even when a child exits with failure.
for (const script of [
  'workspace-errors',
  'feedback-check',
  'autosave-check',
  'metadata-check',
  'code-application-check',
  'history-check',
  'sounding-tokens-check',
  'module-behavior-check',
  'rack-visuals-check',
  'output-panel-browser',
  'panels-browser',
  'sound-effects-browser',
  'nested-steps-browser',

  'function-loops-browser',
]) {
  test(script, async ({ baseURL }, info) => {
    const output = info.outputPath('evidence')
    try {
      const args = [`scripts/${script}.mjs`, baseURL, output]
      if (script === 'code-application-check' || script === 'history-check') args.push('--real')
      const result = await execute(process.execPath, args, {
        timeout: 280_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      await info.attach('suite-log', {
        body: result.stdout + result.stderr,
        contentType: 'text/plain',
      })
    } catch (error) {
      await info.attach('suite-log', {
        body: `${error.stdout ?? ''}${error.stderr ?? ''}\n${error.message}`,
        contentType: 'text/plain',
      })
      throw error
    }
  })
}

async function record(info, result) {
  await info.attach('results', {
    body: JSON.stringify({ result, physicalListening: false }, null, 2),
    contentType: 'application/json',
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.locator('.cm-content').waitFor()
})

test('WAV bounce and live audio recovery', async ({ page }, info) => {
  // Sticky user activation, without initializing the silent starter rack.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const downloads = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  const result = await page.evaluate(async () =>
    (await import('/scripts/bounce-check.mjs')).verifyBounce(),
  )
  expect(downloads[0]).toBe('Café - drums.wav')
  await record(info, { ...result, filenames: downloads })
})

for (const [script, verify] of [
  ['connection-check', 'verifyConnectionTargets'],
  ['grid-check', 'verifyGrids'],
  ['library-check', 'verifyReplacementConfirmation'],
  ['library-check', 'verifyLibraryUI'],
  ['library-check', 'verifyLibraryRackEditing'],
  ['library-check', 'verifyOnRampUI'],
  ['literal-identity-check', 'verifyLiteralIdentity'],
  ['error-positions-browser', 'checkErrorPositions'],
  ['editor-status-browser', 'checkEditorStatus'],
  ['code-conversion-check', 'verifyCodeConversion'],
  ['code-conversion-check', 'verifyConversionPlayback'],
  ['patch-names-check', 'verifyPatchNames'],
  ['rack-feel-check', 'verifyPanels'],
]) {
  test(verify, async ({ page }, info) => {
    const result = await page.evaluate(
      async ({ script, verify }) => {
        if (verify === 'verifyPanels')
          (await import('/scripts/editor-browser.mjs')).enableAutoApply()
        const suite = await import(`/scripts/${script}.mjs`)
        return suite[verify]()
      },
      { script, verify },
    )
    await record(info, result)
  })
}

for (const width of [1024, 900]) {
  test(`mid-width workspace at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 768 })
    await record(
      info,
      await page.evaluate(async () =>
        (await import('/scripts/mid-width-check.mjs')).verifyMidWidth(),
      ),
    )
  })
}

test('library audio, replacement Cancel and Stop recovery', async ({ page }, info) => {
  await page.evaluate(async () => {
    const suite = await import('/scripts/library-check.mjs')
    await suite.verifyReplacementConfirmation()
    window.measureLibrary = suite.installAudioProbe()
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', {
    timeout: 30_000,
  })
  const result = await page.evaluate(async () => {
    const suite = await import('/scripts/library-check.mjs')
    const cancel = await suite.verifyReplacementCancelPlayback(window.measureLibrary)
    const signals = await suite.verifyPatchSignals(window.measureLibrary)
    const stop = await suite.verifyLibraryStopFailure()
    return { cancel, signals, stop }
  })
  await record(info, result)
})

test('trance playback, events and export/reopen', async ({ page }, info) => {
  await page.evaluate(async () => (await import('/scripts/trance-check.mjs')).loadTrance())
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', {
    timeout: 30_000,
  })
  await record(
    info,
    await page.evaluate(async () => (await import('/scripts/trance-check.mjs')).verifyTrance()),
  )
})

// #132: each supported call reaches the actual pinned browser engine.
test('pattern and time module forms, source, rack identity and PCM', async ({ page }, info) => {
  const prepared = await page.evaluate(async () =>
    (await import('/scripts/pattern-time-check.mjs')).preparePatternProof(),
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', { timeout: 30_000 })
  const forms = []
  try {
    for (let index = 0; index < prepared.forms; index++)
      forms.push(
        await page.evaluate(
          async (index) =>
            (await import('/scripts/pattern-time-check.mjs')).verifyPatternForm(index),
          index,
        ),
      )
  } finally {
    await page.evaluate(async () =>
      (await import('/scripts/pattern-time-check.mjs')).finishPatternProof(),
    )
    await record(info, { forms, physicalListening: false })
  }
})

test('pattern module numeric and text controls preserve imported source', async ({
  page,
}, info) => {
  const source = '$: note("c3 e3").s("sine").euclidRot(3, 8, 2).ply("<1 2 4>")\n'
  await page.evaluate(async (source) => {
    ;(await import('/scripts/editor-browser.mjs')).enableAutoApply()
    await (await import('/scripts/rack-feel-check.mjs')).load(source)
  }, source)
  const euclid = page.locator('[data-module="euclid1"]')
  await euclid.getByRole('button', { name: 'Set PULSES', exact: true }).click()
  await euclid.getByRole('textbox', { name: 'PULSES', exact: true }).fill('5')
  await euclid.getByRole('textbox', { name: 'PULSES', exact: true }).press('Enter')
  const ratchet = page.locator('[data-module="ratchet1"]')
  await ratchet.getByRole('textbox', { name: 'REPEATS', exact: true }).fill('<2 3>')
  await ratchet.getByRole('button', { name: 'Apply', exact: true }).click()
  const result = await page.evaluate(async () => {
    const source = (await import('/scripts/editor-browser.mjs')).editorSource()
    const { read } = await import('/src/reader/index.ts')
    const { sourceBody, saveLayout } = await import('/src/workspace/document.ts')
    const document = read(source)
    const saved = saveLayout(document)
    return {
      source: sourceBody(source),
      identity:
        read(saved.source).layout === 'restored' &&
        JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
    }
  })
  expect(result.source).toBe(
    source.replace('euclidRot(3', 'euclidRot(5').replace('<1 2 4>', '<2 3>'),
  )
  expect(result.identity).toBe(true)
  await page.evaluate(
    async (source) => {
      await (await import('/scripts/rack-feel-check.mjs')).load(source)
    },
    source.replace('<1 2 4>', '<4 5>'),
  )
  await expect(ratchet.getByRole('textbox', { name: 'REPEATS', exact: true })).toHaveValue('<4 5>')
  await record(info, result)
})

test('imported CHORD branch accepts native deletion and keyboard reconnection', async ({
  page,
}, info) => {
  test.setTimeout(30_000)
  const source =
    '// keep\n$: chord("<Cm7 Fm7 G7>").voicing().arp("0 1 2 1").rev().s("sine") // tail\n'
  await page.evaluate(async (source) => {
    ;(await import('/scripts/editor-browser.mjs')).enableAutoApply()
    await (await import('/scripts/rack-feel-check.mjs')).load(source)
  }, source)
  await page.getByRole('button', { name: 'Select rev1', exact: true }).click()
  await page.getByRole('button', { name: 'Delete rev1 and attached cables', exact: true }).click()
  await page.getByRole('button', { name: 'Delete module', exact: true }).click()
  await page.locator('[data-jack="arp1:out"]').press('Enter')
  await page.locator('[data-jack="osc1:note"]').press('Enter')
  await page.waitForFunction(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource().includes('.arp('),
  )
  const result = await page.evaluate(async () => {
    const source = (await import('/scripts/editor-browser.mjs')).editorSource()
    const { read } = await import('/src/reader/index.ts')
    const { sourceBody, saveLayout } = await import('/src/workspace/document.ts')
    const document = read(source)
    const saved = saveLayout(document)
    return {
      source: sourceBody(source),
      restored: read(saved.source).layout,
      identity: JSON.stringify(read(saved.source).patch) === JSON.stringify(saved.patch),
      types: document.patch.modules.map((m) => m.type),
    }
  })
  expect(result.source).toContain('// keep')
  expect(result.source).toContain('// tail')
  expect(result.source).toContain('.arp("0 1 2 1")')
  expect(result.source).not.toContain('.rev()')
  expect(result.restored).toBe('restored')
  expect(result.identity).toBe(true)
  expect(result.types).not.toContain('rev')
  await record(info, result)
})

test('generalized modulation controls and within-note PCM', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.evaluate(async () => {
    const editor = await import('/scripts/editor-browser.mjs')
    const suite = await import('/scripts/modulation-browser.mjs')
    const { generate } = await import('/src/codegen/generate.ts')
    editor.enableAutoApply()
    await editor.replaceSource(generate(suite.sustainedPatch()))
  })
  const lfo = page.locator('[data-module="lfo1"]')
  await expect(lfo.getByLabel('MODE', { exact: true })).toHaveValue('SMOOTH')
  await lfo.getByLabel('MODE', { exact: true }).selectOption('STEP')
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toContain('.gain(sine.fast(2).range(0.2, 0.6))')
  await lfo.getByLabel('MODE', { exact: true }).selectOption('SMOOTH')
  await lfo.getByRole('button', { name: 'Set SKEW', exact: true }).click()
  await lfo.getByRole('textbox', { name: 'SKEW', exact: true }).fill('0.25')
  await lfo.getByRole('textbox', { name: 'SKEW', exact: true }).press('Enter')
  expect(
    await page.evaluate(async () => (await import('/scripts/editor-browser.mjs')).editorSource()),
  ).toContain('skew: 0.25')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', { timeout: 30_000 })
  const proof = await page.evaluate(async () => {
    const suite = await import('/scripts/modulation-browser.mjs')
    return [
      await suite.measureSustained('SMOOTH', 0.4),
      await suite.measureSustained('SMOOTH', -0.15),
      await suite.measureSustained('STEP', 0.4),
    ]
  })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(async () => {
    const editor = await import('/scripts/editor-browser.mjs')
    const { default: source } =
      await import('/src/library/patches/modulation-utilities.strudel?raw')
    await editor.replaceSource(source)
  })
  const sequence = page.locator('[data-module="cvseq1"]')
  await sequence.getByRole('button', { name: 'Text mode', exact: true }).click()
  await sequence.getByRole('textbox', { name: 'Step notation', exact: true }).fill('<0 400>')
  await sequence.getByRole('textbox', { name: 'Step notation', exact: true }).press('Enter')
  const saved = await page.evaluate(async () => {
    const { editorSource } = await import('/scripts/editor-browser.mjs')
    const { read } = await import('/src/reader/read.ts')
    const { saveLayout } = await import('/src/workspace/document.ts')
    const doc = read(editorSource())
    return {
      layout: read(saveLayout(doc).source).layout,
      steps: doc.patch.modules.find((m) => m.type === 'cvseq')?.values.steps,
      source: editorSource().split('// ──')[0],
    }
  })
  expect(saved.layout).toBe('restored')
  expect(saved.steps).toBe('<0 400>')
  expect(saved.source).toContain(".add(mini('<0 400>'))")
  await record(info, { proof, saved, controls: ['MODE', 'SKEW', 'CV SEQ Step 1'] })
})

test('mixer generalized CV preserves nested gain and within-note PCM', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const results = []
  for (const [mode, depth, source] of [
    ['SMOOTH', 0.4, 'lfo'],
    ['SMOOTH', -0.15, 'lfo'],
    ['STEP', 0.4, 'lfo'],
    ['STEP', 0.4, 'env'],
    ['STEP', 0.4, 'cvseq'],
  ]) {
    results.push(
      await page.evaluate(
        async ({ mode, depth, source }) =>
          (await import('/scripts/modulation-browser.mjs')).measureSustained(mode, depth, {
            target: 'mix',
            nested: true,
            source,
          }),
        { mode, depth, source },
      ),
    )
  }
  process.stdout.write(
    `MIX PCM ${JSON.stringify(results.map(({ mode, source, depth, low, high, ratio, sampleRate }) => ({ mode, source, depth, low, high, ratio, sampleRate })))}\n`,
  )
  await record(info, results)
})

test('ordered FX chains preserve rack/source and schedule real audio', async ({ page }, info) => {
  await page.evaluate(async () =>
    (await import('/scripts/effects-check.mjs')).prepareEffectsProof(),
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const result = await page.evaluate(async () =>
    (await import('/scripts/effects-check.mjs')).verifyEffectsProof(),
  )
  await page.locator('.rack-note').scrollIntoViewIfNeeded()
  await expect(page.locator('.rack-note')).toBeVisible()
  await info.attach('ordered-filters', { body: await page.screenshot(), contentType: 'image/png' })
  await record(info, result)
})

test('nested cell deletion retains keyboard focus on the surviving neighbor', async ({
  page,
}, info) => {
  await page.evaluate(async () => {
    const e = await import('/scripts/editor-browser.mjs')
    e.enableAutoApply()
    e.replaceSource('note("c3 e3").s("sine")\n')
  })
  const last = page.locator('[data-module="seq1"] .mini-cell[aria-label="Step e3"]')
  await last.focus()
  await last.press('Backspace')
  await page.waitForFunction(async () =>
    (await import('/scripts/editor-browser.mjs')).editorSource().includes('note("c3")'),
  )
  await expect(page.locator('[data-module="seq1"] .mini-cell').first()).toBeFocused()
  await record(info, { neighborFocus: true })
})

test('simultaneous nested drum rows and chord lanes retain every sounding flash', async ({
  page,
}, info) => {
  await page.evaluate(async () => {
    const e = await import('/scripts/editor-browser.mjs')
    e.enableAutoApply()
    e.replaceSource(
      'setcpm(30)\n$: s("sine,triangle").gain(.1)\n$: note("c3,e3").s("sine").gain(.1)\n',
    )
  })
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.mini-editor').length === 2 &&
      document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Playing', { timeout: 30000 })
  await page.waitForFunction(
    () =>
      ['drums1', 'seq1'].every(
        (id) =>
          new Set(
            [...document.querySelectorAll(`[data-module="${id}"] .mini-cell`)]
              .filter((c) => c.getAnimations().length)
              .map((c) => c.dataset.miniStart),
          ).size === 2,
      ),
    undefined,
    { timeout: 5000 },
  )
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await record(info, { simultaneousRows: 2, simultaneousChordLanes: 2 })
})
