import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from 'playwright/test'

const execute = promisify(execFile)

// These suites already own their browser contexts and assertions. Retain their
// partial JSON/screenshots and stdout/stderr even when a child exits with failure.
for (const script of ['workspace-errors', 'feedback-check', 'autosave-check']) {
  test(script, async ({ baseURL }, info) => {
    const output = info.outputPath('evidence')
    try {
      const result = await execute(process.execPath, [`scripts/${script}.mjs`, baseURL, output], {
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

for (const [script, verify] of [
  ['connection-check', 'verifyConnectionTargets'],
  ['grid-check', 'verifyGrids'],
  ['library-check', 'verifyReplacementConfirmation'],
  ['library-check', 'verifyLibraryUI'],
  ['library-check', 'verifyLibraryRackEditing'],
]) {
  test(verify, async ({ page }, info) => {
    const result = await page.evaluate(
      async ({ script, verify }) => {
        const suite = await import(`/scripts/${script}.mjs`)
        return suite[verify]()
      },
      { script, verify },
    )
    await record(info, result)
  })
}

test('library audio, replacement Cancel and Stop recovery', async ({ page }, info) => {
  await page.evaluate(async () => {
    const suite = await import('/scripts/library-check.mjs')
    await suite.verifyReplacementConfirmation()
    window.measureLibrary = suite.installAudioProbe()
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.transport-status')).toHaveText('Pattern scheduled', {
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
  await expect(page.locator('.transport-status')).toHaveText('Pattern scheduled', {
    timeout: 30_000,
  })
  await record(
    info,
    await page.evaluate(async () => (await import('/scripts/trance-check.mjs')).verifyTrance()),
  )
})
