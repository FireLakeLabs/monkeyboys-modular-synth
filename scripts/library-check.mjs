import { editorSource as source, replaceSource, enableAutoApply } from './editor-browser.mjs'
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
  await until(() => !library() || library().querySelector('.replace-prompt'))
  if (library()) button('Load patch', library()).click()
  await until(() => !library())
  assert(status() === 'Stopped', `${title}: load started audio`)
}
async function editSource(value) {
  enableAutoApply()
  replaceSource(value)
  await until(() => document.querySelector('.sync-status').textContent === 'Reading code…')
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
  await editSource(`// Library replacement guard fixture\n${source()}`)
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
  results.push('All entries load exact source and matching rack without autoplay')

  await load(helper.title)
  await editSource(source().replace('.gain(0.2)', '.gain(0.4)'))
  assert(
    sourceBody(source()) === sourceBody(helper.source).replace('.gain(0.2)', '.gain(0.4)'),
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
    sourceBody(saved) === sourceBody(helper.source).replace('.gain(0.2)', '.gain(0.4)'),
    'Export lost source',
  )
  await load(helper.title)
  assert(source() === helper.source, 'Reload did not restore built-in original')
  const transfer = new DataTransfer()
  transfer.items.add(new File([saved], 'library-export.strudel', { type: 'text/plain' }))
  const input = document.querySelector('input[type=file]')
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
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

/** #61: run on a fresh starter, before other suites edit the workspace. */
export async function verifyReplacementConfirmation() {
  const starter = source()
  const results = []
  async function loadClean(title) {
    await choose(title)
    button('Load patch…', library()).click()
    await until(() => !library() || library().querySelector('.replace-prompt'))
    assert(!library(), `${title}: clean workspace still asks for replacement`)
    assert(status() === 'Stopped', 'Clean replacement started audio')
  }
  function assertPrimary(action) {
    const primary = button(action, document.querySelector('.replace-prompt'))
    assert(
      getComputedStyle(primary).backgroundColor === 'rgb(244, 164, 98)',
      `${action}: confirming action lost orange primary style`,
    )
  }
  await loadClean('Enveloped synth')
  const original = source()
  await loadClean('Quantized sequence')
  button('New patch').click()
  await until(() => source() === starter || document.querySelector('.replace-prompt'))
  assert(!document.querySelector('.replace-prompt'), 'Unedited library → New asks for replacement')
  results.push('Starter → library → library → New skips confirmation and leaves scheduling stopped')

  await loadClean('Enveloped synth')
  const changed = `// keep my work\n${original}`
  await editSource(changed)
  const accepted = source()
  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  assert(
    document
      .querySelector('.replace-prompt')
      .textContent.includes('Starting a new patch stops playback'),
    'New warning names the wrong action',
  )
  assertPrimary('Replace patch')
  button('Cancel', document.querySelector('.replace-prompt')).click()
  await until(() => !document.querySelector('.replace-prompt'))
  assert(source() === accepted, 'New Cancel discarded edits')

  await choose('Enveloped synth')
  button('Load patch…', library()).click()
  await until(() => library().querySelector('.replace-prompt'))
  assert(
    library()
      .querySelector('.replace-prompt')
      .textContent.includes('Loading Enveloped synth stops playback'),
    'Library warning does not name the patch',
  )
  assertPrimary('Load patch')
  assert(
    (await exportedBy(() => button('Export current', library()).click())) === accepted,
    'Replacement export lost current work',
  )
  button('Cancel', library()).click()
  await until(() => !library().querySelector('.replace-prompt'))
  assert(source() === accepted, 'Library Cancel discarded edits')
  button('Load patch…', library()).click()
  await until(() => library().querySelector('.replace-prompt'))
  button('Load patch', library()).click()
  await until(() => !library())
  assert(source() === original, 'Confirmed load did not restore exact library source')
  results.push(
    'Edited code prompts; New/library copy and orange actions are correct; Cancel/Export preserve edits',
  )

  // A look changes only saved rack metadata, which is also work worth keeping.
  const panel = document.querySelector('.module-panel')
  panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 200 }))
  await until(() => document.querySelector('[aria-label="Look Vintage lab"]'))
  document.querySelector('[aria-label="Look Vintage lab"]').click()
  await until(() => source() !== original)
  const layoutEdit = source()
  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Cancel', document.querySelector('.replace-prompt')).click()
  await until(() => !document.querySelector('.replace-prompt'))
  assert(source() === layoutEdit, 'Cancel discarded saved rack layout')
  results.push('Presentation-only rack edits still require confirmation')

  replaceSource('$: note(')
  await until(
    () => document.querySelector('.sync-status').textContent === 'Rack shows previous code',
  )
  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Cancel', document.querySelector('.replace-prompt')).click()
  await until(() => !document.querySelector('.replace-prompt'))
  assert(source() === '$: note(', 'Cancel discarded invalid draft')
  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Replace patch').click()
  await until(() => source() === starter)
  await loadClean('Quantized sequence')
  results.push('Invalid draft remains protected; confirmed New establishes a clean starter again')
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

/** Run after a real Play gesture on a loaded library patch, with the probe installed first. */
export async function verifyReplacementCancelPlayback(measure) {
  const { read } = await import('../src/reader/index.ts')
  await until(() => status() === 'Pattern scheduled')
  await editSource(`// Keep this playing\n${source()}`)
  await until(() => status() === 'Pattern scheduled')
  const original = source()
  const rack = JSON.stringify(read(original).patch)
  const before = await measure()
  assert(before.rms > 0.0001, 'Playback fixture has no signal before Cancel')
  button('New patch').click()
  await until(() => document.querySelector('.replace-prompt'))
  button('Cancel', document.querySelector('.replace-prompt')).click()
  await until(() => !document.querySelector('.replace-prompt'))
  await choose('Enveloped synth')
  button('Load patch…', library()).click()
  await until(() => library().querySelector('.replace-prompt'))
  button('Cancel', library()).click()
  await until(() => !library().querySelector('.replace-prompt'))
  button('Close library', library()).click()
  await until(() => !library())
  assert(source() === original, 'Cancel changed the playing source')
  assert(JSON.stringify(read(source()).patch) === rack, 'Cancel changed the playing rack')
  assert(status() === 'Pattern scheduled', 'Cancel stopped playback')
  const after = await measure()
  assert(after.rms > 0.0001, 'Cancel silenced playback')
  document.querySelector('.topbar .play[aria-label=Stop]').click()
  await until(() => status() === 'Stopped')
  return { before, after, sourceAndRackRetained: true, physicalListening: false }
}

/** Run after one real user/harness Play click has activated audio. */
export async function verifyPatchSignals(measure) {
  const { libraryPatches } = await import('../src/library/catalog.ts')
  const results = []
  const original = window.Pattern.prototype.onTrigger
  let pattern
  window.Pattern.prototype.onTrigger = function (callback, dominant) {
    pattern = this
    return original.call(this, callback, dominant)
  }
  try {
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
      const events = pattern.queryArc(0, 4).filter((event) => event.hasOnset())
      assert(events.length > 0, `${entry.id}: no Strudel events`)
      results.push({
        id: entry.id,
        ...pcm,
        events: events.length,
        sounds: [...new Set(events.map((event) => event.value.s))],
      })
      document.querySelector('.topbar .play[aria-label=Stop]').click()
      await until(() => status() === 'Stopped')
    }
    return results
  } finally {
    window.Pattern.prototype.onTrigger = original
  }
}

export async function verifyLibraryStopFailure() {
  const engine = await import('../src/strudel/engine.ts')
  const { read } = await import('../src/reader/index.ts')
  await editSource(`// Stop failure guard fixture\n${source()}`)
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
  document.querySelector('.topbar .play[aria-label=Stop]').click()
  await until(() => status() === 'Stopped')
  return 'Injected real-adapter Stop failure retains draft/rack and Export current; Cancel and Stop retry recover'
}

/** #75: drive the actual rack controls, separately from pure graph tests. */
export async function verifyLibraryRackEditing() {
  const { libraryPatches } = await import('../src/library/catalog.ts')
  const { read } = await import('../src/reader/index.ts')
  const { generate } = await import('../src/codegen/generate.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  const patch = () => read(source()).patch
  const id = (type) =>
    patch()
      .modules.filter((module) => module.type === type)
      .at(-1).id
  const jack = (ref) => document.querySelector(`[data-jack="${ref.module}:${ref.jack}"]`)
  async function add(name) {
    const before = patch().modules.length
    document.querySelector(`[aria-label="Add ${name}"]`).click()
    await until(() => patch().modules.length > before)
  }
  async function cable(from, to, replacement = false, refused = false) {
    jack(from).scrollIntoView({ block: 'center' })
    jack(from).click()
    await pause(0)
    jack(to).scrollIntoView({ block: 'center' })
    const rect = jack(to).getBoundingClientRect()
    const before = source()
    jack(to).click()
    if (replacement) {
      await until(() => document.querySelector('.replace-prompt'))
      button('Replace', document.querySelector('.replace-prompt')).click()
    }
    await until(() =>
      refused ? document.querySelector('.rack-edit-refusal') : source() !== before,
    )
    return rect
  }
  const results = []
  for (const entry of libraryPatches().filter((entry) => entry.id !== 'switch-angel-trance-demo')) {
    await load(entry.title)
    assert(source() === entry.source, `${entry.id}: initial source differs`)
    await choose(entry.title)
    assert(
      library().querySelector('.patch-attribution').textContent.includes('contributors'),
      `${entry.id}: attribution missing`,
    )
    button('Close library', library()).click()
    await until(() => !library())
    await add('LFO')
    const lfo = id('lfo')
    for (const target of patch().modules.filter((module) => ['vcf', 'vca'].includes(module.type))) {
      const to = { module: target.id, jack: 'cv' }
      const occupied = patch().cables.some((c) => c.to.module === to.module && c.to.jack === 'cv')
      await cable({ module: lfo, jack: 'out' }, to, occupied)
      assert(
        patch().cables.some(
          (c) => c.from.module === lfo && c.to.module === target.id && c.to.jack === 'cv',
        ),
        `${entry.id}: CV missing`,
      )
    }
    await add('DELAY')
    const delay = id('delay'),
      mix = id('mix')
    const incoming = patch().cables.find((c) => c.to.module === mix)
    await cable(incoming.from, { module: delay, jack: 'in' })
    await cable({ module: delay, jack: 'out' }, incoming.to, true)
    const spare = ['in2', 'in3', 'in4'].find(
      (input) => !patch().cables.some((c) => c.to.module === mix && c.to.jack === input),
    )
    await cable(incoming.from, { module: mix, jack: spare })
    assert(!document.querySelector('.rack-edit-refusal'), `${entry.id}: refused rack edit`)
    assert(
      sourceBody(source()) === sourceBody(generate(patch())),
      `${entry.id}: lost rack ownership`,
    )
    const exported = await exportedBy(() => button('Export').click())
    assert(
      JSON.stringify(read(exported).patch) === JSON.stringify(patch()),
      `${entry.id}: export lost identity`,
    )
    results.push(
      `${entry.id}: CV, effect insertion, extra mixer channel and export identity passed`,
    )
  }

  const showcase = libraryPatches().find((entry) => entry.id === 'switch-angel-trance-demo')
  await load(showcase.title)
  assert(source() === showcase.source, 'Showcase was rewritten on load')
  await add('VCF')
  const filter = id('vcf'),
    mixer = id('mix')
  const voice = patch().cables.find((c) => c.to.module === mixer)
  const from = voice.from,
    to = { module: filter, jack: 'in' }
  const before = source(),
    beforePatch = JSON.stringify(patch())
  const target = await cable(from, to, false, true)
  const refusal = document.querySelector('.rack-edit-refusal')
  assert(
    refusal.textContent.includes('rewrites the code in MonkeyBoy’s style'),
    'Missing rewrite disclosure',
  )
  const bounds = refusal.getBoundingClientRect()
  assert(
    Math.abs(bounds.left - target.left) < 350 && Math.abs(bounds.top - target.bottom) < 310,
    'Refusal is far from jack',
  )
  assert(
    source() === before && JSON.stringify(patch()) === beforePatch,
    'Refusal changed accepted work',
  )
  button('Cancel', refusal).click()
  await until(() => !document.querySelector('.rack-edit-refusal'))
  assert(source() === before, 'Cancel changed source')
  await cable(from, to, false, true)
  await editSource(`// newer draft\n${source()}`)
  assert(!document.querySelector('.rack-edit-refusal'), 'New draft retained stale conversion')
  assert(
    !patch().cables.some(
      (c) => c.from.module === from.module && c.to.module === to.module && c.to.jack === to.jack,
    ),
    'Stale attempt was committed',
  )
  await cable(from, to, false, true)
  button('Make rack-editable', document.querySelector('.rack-edit-refusal')).click()
  await until(() => !document.querySelector('.rack-edit-refusal') && source() !== before)
  assert(
    patch().cables.some(
      (c) => c.from.module === from.module && c.to.module === to.module && c.to.jack === to.jack,
    ),
    'Conversion did not complete attempted edit',
  )
  assert(patch().prelude.match(/register\('/g).length === 4, 'Conversion lost registrations')
  assert(
    sourceBody(source()) === sourceBody(generate(patch())),
    'Conversion did not grant rack ownership',
  )
  assert(read(source()).layout === 'restored', 'Converted rack does not reopen')
  assert(status() === 'Stopped', 'Conversion started audio')
  await cable({ module: filter, jack: 'out' }, voice.to, true)
  await add('LFO')
  await cable({ module: id('lfo'), jack: 'out' }, { module: filter, jack: 'cv' })
  assert(!document.querySelector('.rack-edit-refusal'), 'Converted showcase refused subsequent CV')
  results.push(
    'Showcase exact load; jack-local refusal; atomic Cancel; explicit conversion retains registrations/CODE, completes pending cable and accepts subsequent CV and reopens rack-owned without autoplay',
  )
  return results
}

/** #79/#80: run at 1440 px before the signal group. */
export async function verifyOnRampUI() {
  const { PATCH_LIBRARY, libraryPatches } = await import('../src/library/catalog.ts')
  const { read } = await import('../src/reader/index.ts')
  const { generate } = await import('../src/codegen/generate.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  function type(input, value) {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const filter = document.querySelector('.module-filter input')
  type(filter, '')
  await until(() => document.querySelectorAll('.chip').length === 16)
  assert(
    [...document.querySelectorAll('.library h3')].map((e) => e.textContent).join('|') ===
      'Pattern|Sound|Shape|Modulate|Effects|Utility',
    'Wrong palette category order',
  )
  for (const chip of document.querySelectorAll('.chip')) {
    assert(chip.querySelector('.chip-family')?.textContent, 'Missing family badge')
    assert(chip.querySelector('.chip-call')?.textContent, 'Missing Strudel call')
    for (const text of chip.querySelectorAll('span, code')) {
      assert(text.scrollWidth <= text.clientWidth + 1, `Clipped chip text: ${text.textContent}`)
      assert(getComputedStyle(text).textOverflow !== 'ellipsis', 'Chip uses ellipsis')
    }
  }
  for (const [query, names] of [
    ['  seQ  ', ['Add SEQ', 'Add DRUMS']],
    ['.LPF()', ['Add VCF']],
    ['no-such-module', []],
  ]) {
    type(filter, query)
    await until(
      () =>
        JSON.stringify(
          [...document.querySelectorAll('.chip')].map((e) => e.getAttribute('aria-label')),
        ) === JSON.stringify(names),
    )
  }
  assert(document.querySelector('.library output'), 'Missing no-results message')
  type(filter, '')
  await until(() => document.querySelectorAll('.chip').length === 16)

  const entries = libraryPatches(PATCH_LIBRARY[0].children)
  const results = []
  for (const entry of entries) {
    await choose(entry.title)
    const first = library().querySelector('.patch-collections details')
    assert(first.querySelector('summary').textContent === 'Start here', 'Start here is not first')
    assert(
      [...first.querySelectorAll('button')].map((e) => e.textContent).join('|') ===
        '1 · First sounds|2 · First notes|3 · First effects|4 · Pattern effects',
      'Wrong lesson order',
    )
    assert(
      library().querySelector('.patch-try-this').textContent === `Try this: ${entry.tryThis}`,
      'Missing try-this',
    )
    assert(
      library().querySelector('.patch-attribution a').href === entry.attribution.url,
      'Missing workshop credit',
    )
    button('Close library', library()).click()
    await until(() => !library())
    await load(entry.title)
    assert(source() === entry.source, `${entry.id}: load rewrote source`)
    const before = source()
    if (entry.id === 'first-sounds') {
      document.querySelector('[aria-label="bd step 2"]').click()
    } else if (entry.id === 'first-notes') {
      const input = document.querySelector('.step-editor [aria-label="Step 1"]')
      type(input, 'd3')
      input.blur()
    } else {
      const label = entry.id === 'first-effects' ? 'CUTOFF' : 'RATE'
      document.querySelector(`[aria-label="Set ${label}"]`).click()
      await until(() => document.querySelector(`.module-panel input[aria-label="${label}"]`))
      const input = document.querySelector(`.module-panel input[aria-label="${label}"]`)
      type(input, entry.id === 'first-effects' ? '5000' : '1')
      await pause(0)
      input.blur()
    }
    await until(() => source() !== before)
    assert(!document.querySelector('.rack-edit-refusal'), `${entry.id}: try-this refused`)
    const current = read(source())
    assert(
      sourceBody(source()) === sourceBody(generate(current.patch)),
      `${entry.id}: lost rack ownership`,
    )
    const exported = await exportedBy(() => button('Export').click())
    assert(
      JSON.stringify(read(exported).patch) === JSON.stringify(current.patch),
      `${entry.id}: export identity differs`,
    )
    await load(entry.title)
    assert(source() === entry.source, `${entry.id}: reload did not reset original`)
    results.push(
      `${entry.id}: credit, try-this edit, stopped load, exact source, export identity and reset passed`,
    )
  }
  return {
    palette:
      'Six categories, 16 full chips, family badges, name/call filtering and empty results passed',
    entries: results,
  }
}
