// Browser verification: import this module from the Vite dev server in a browser.
// See docs/patch-library.md for the harness commands and listening limits.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function until(condition) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return
    await pause(25)
  }
  throw new Error('Timed out waiting for library UI')
}
function button(text, root = document) {
  const element = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}
const source = () => document.querySelector('.source-editor').value
const status = () => document.querySelector('.transport-status').textContent
const library = () => document.querySelector('.patch-library')
async function choose(title) {
  button('Patch library').focus()
  button('Patch library').click()
  await until(() => library()?.open)
  button(title, library()).click()
  await until(() => library().querySelector('h3')?.textContent === title)
}
async function load(title) {
  await choose(title)
  button('Load patch…', library()).click()
  await until(() => library().querySelector('.replace-prompt'))
  button('Load patch', library()).click()
  await until(() => !library())
  assert(status() === 'Stopped', `${title}: load started audio`)
}
async function editSource(value) {
  const element = document.querySelector('.source-editor')
  // oxlint-disable-next-line typescript/unbound-method -- Invoke the native setter with its textarea receiver below.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await until(() =>
    document.querySelector('.sync-status').textContent.startsWith('Rack matches code'),
  )
}
async function exportedBy(action) {
  const original = URL.createObjectURL.bind(URL)
  let exported
  URL.createObjectURL = (blob) => {
    exported = blob
    return original(blob)
  }
  try {
    action()
    assert(exported, 'No exported file')
    return await exported.text()
  } finally {
    URL.createObjectURL = original
  }
}

export async function verifyLibraryUI() {
  const { libraryPatches } = await import('../src/library/catalog.ts')
  const { read } = await import('../src/reader/index.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  const entries = libraryPatches()
  const initial = source()
  const initialRack = JSON.stringify(read(initial).patch)
  const results = []
  await choose('Custom helper')
  const synths = [...library().querySelectorAll('summary')].find((s) => s.textContent === 'Synths')
  synths.click()
  assert(!synths.parentElement.open, 'Collection did not collapse')
  synths.click()
  assert(synths.parentElement.open, 'Collection did not expand')
  assert(library().querySelector('.patch-path').textContent === 'Cyber', 'Wrong collection path')
  assert(
    library().querySelector('.patch-attribution a').textContent.includes('contributors'),
    'Missing attribution',
  )
  button('Load patch…', library()).click()
  await until(() => library().querySelector('.replace-prompt'))
  assert(
    (await exportedBy(() => button('Export current', library()).click())) === initial,
    'Export current changed draft',
  )
  button('Cancel', library()).click()
  await until(() => !library().querySelector('.replace-prompt'))
  button('Close library', library()).click()
  await until(() => !library())
  assert(document.activeElement === button('Patch library'), 'Close did not restore opener focus')
  assert(
    source() === initial && JSON.stringify(read(source()).patch) === initialRack,
    'Cancel replaced current work',
  )
  results.push(
    'Nested collections expand/collapse; attribution, exact Export current and Cancel retain current draft/rack',
  )

  // Corrupt the in-memory fixture only; the repository original is restored in finally.
  const helper = entries.find((entry) => entry.id === 'custom-helper')
  const originalHelper = helper.source
  try {
    helper.source = '$: note('
    await choose(helper.title)
    button('Load patch…', library()).click()
    await until(() => library().querySelector('.replace-prompt'))
    button('Load patch', library()).click()
    await until(() => library().querySelector('[role=alert]'))
    assert(
      source() === initial && JSON.stringify(read(source()).patch) === initialRack,
      'Failed load replaced current work',
    )
    assert(status() === 'Stopped', 'Failed parse changed transport')
    button('Close library', library()).click()
    await until(() => !library())
  } finally {
    helper.source = originalHelper
  }
  results.push('Malformed library source reports failure while retaining draft/rack')

  for (const entry of entries) {
    await load(entry.title)
    assert(source() === entry.source, `${entry.id}: source changed during load`)
    const expected = read(entry.source).patch
    assert(
      document.querySelectorAll('.module-panel').length === expected.modules.length,
      `${entry.id}: rack mismatch`,
    )
  }
  results.push('All nine entries load exact source and matching rack without autoplay')

  await load(helper.title)
  await editSource(source().replace('.gain(0.2)', '.gain(0.4)'))
  assert(
    sourceBody(source()) === helper.source.replace('.gain(0.2)', '.gain(0.4)'),
    'Edit lost opaque helper or comments',
  )
  const outId = read(source()).patch.modules.find((module) => module.type === 'out').id
  const out = document.querySelector(`[data-module="${outId}"]`)
  out.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 200 }))
  await until(() => document.querySelector('[aria-label="Look Vintage lab"]'))
  document.querySelector('[aria-label="Look Vintage lab"]').click()
  await until(() =>
    document.querySelector(`[data-module="${outId}"]`).classList.contains('look-vintage'),
  )
  const saved = await exportedBy(() => button('Export').click())
  const savedRack = read(saved).patch
  assert(savedRack.modules.find((m) => m.type === 'out').look === 'vintage', 'Export lost look')
  assert(
    sourceBody(saved) === helper.source.replace('.gain(0.2)', '.gain(0.4)'),
    'Export lost source',
  )
  await load(helper.title)
  assert(source() === helper.source, 'Reload did not restore built-in original')
  const transfer = new DataTransfer()
  transfer.items.add(new File([saved], 'library-export.strudel', { type: 'text/plain' }))
  const input = document.querySelector('input[type=file]')
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => document.querySelector('.replace-prompt'))
  button('Open patch').click()
  await until(() => source() === saved)
  assert(
    JSON.stringify(read(source()).patch) === JSON.stringify(savedRack),
    'Reopen lost rack state',
  )
  results.push(
    'Helper/CODE survives edits; reload restores original; export/reopen preserves source and changed rack look independently',
  )

  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Replace patch').click()
  await until(() => document.querySelectorAll('.module-panel').length === 2)
  assert(status() === 'Stopped', 'New patch started audio')
  results.push('Shared New confirmation installs silent MIX/OUT starter')
  return results
}

export function installAudioProbe() {
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the AudioNode receiver below.
  const connect = AudioNode.prototype.connect
  const probes = []
  AudioNode.prototype.connect = function (...args) {
    const result = connect.apply(this, args)
    if (args[0] instanceof AudioDestinationNode) {
      const analyser = this.context.createAnalyser()
      connect.call(this, analyser)
      probes.push(analyser)
    }
    return result
  }
  return async function measure() {
    let sum = 0,
      count = 0
    for (let i = 0; i < 60; i++) {
      for (const analyser of probes) {
        const samples = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(samples)
        for (const value of samples) {
          sum += value * value
          count++
        }
      }
      await pause(30)
    }
    return { rms: count ? Math.sqrt(sum / count) : 0, samples: count }
  }
}

/** Run after one real user/harness Play click has activated audio. */
export async function verifyPatchSignals(measure) {
  const { libraryPatches } = await import('../src/library/catalog.ts')
  const results = []
  for (const entry of libraryPatches()) {
    await load(entry.title)
    const transport = document.querySelector('.topbar .play')
    assert(transport.getAttribute('aria-label') === 'Play', 'Load left transport running')
    transport.click()
    await until(() => status() === 'Pattern scheduled' || status().includes('error'))
    assert(status() === 'Pattern scheduled', `${entry.id}: evaluation failed`)
    // Allow lazy sample fetch/decode, then sample multiple events.
    await pause(2000)
    const pcm = await measure()
    assert(pcm.rms > 0.0001, `${entry.id}: no nonzero output (${pcm.rms})`)
    results.push({ id: entry.id, ...pcm })
    button('Stop scheduling').click()
    await until(() => status() === 'Stopped')
  }
  return results
}

export async function verifyLibraryStopFailure() {
  const engine = await import('../src/strudel/engine.ts')
  const { read } = await import('../src/reader/index.ts')
  const original = source()
  const rack = JSON.stringify(read(original).patch)
  // Inject a rejecting Stop via the real adapter's observer boundary, then remove it.
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'activity-clear') throw new Error('Library Stop failure fixture')
  })
  try {
    await choose('Quantized sequence')
    button('Load patch…', library()).click()
    await until(() => library().querySelector('.replace-prompt'))
    button('Load patch', library()).click()
    await until(() => library().querySelector('[role=alert]'))
    assert(source() === original, 'Stop failure replaced the current draft')
    assert(JSON.stringify(read(source()).patch) === rack, 'Stop failure replaced the current rack')
    assert(
      library().querySelector('[role=alert]').textContent.includes('not stopped'),
      'Missing Stop failure',
    )
    assert(
      (await exportedBy(() => button('Export current', library()).click())) === original,
      'Stop failure lost export',
    )
    button('Cancel', library()).click()
    await until(() => !library().querySelector('.replace-prompt'))
    button('Close library', library()).click()
    await until(() => !library())
  } finally {
    unsubscribe()
  }
  button('Stop scheduling').click()
  await until(() => status() === 'Stopped')
  return 'Injected real-adapter Stop failure retains draft/rack and Export current; Cancel and Stop retry recover'
}
