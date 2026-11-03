// Import from the Vite dev server in the harness browser. See docs/trance-demo.md.
import { read } from '../src/reader/index.ts'
import { HP, ROW_HEIGHT, validateRack } from '../src/rack/model.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { libraryPatches } from '../src/library/catalog.ts'
import { editorSource as source } from './editor-browser.mjs'

const entry = libraryPatches().find((patch) => patch.id === 'switch-angel-trance-demo')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const status = () => document.querySelector('.transport-status').textContent
const library = () => document.querySelector('.patch-library')
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function until(condition) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return
    await pause(25)
  }
  throw new Error('Timed out waiting for trance demo')
}
function button(text, root = document) {
  const element = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
  assert(element, `Missing button ${text}`)
  return element
}

export async function loadTrance() {
  button('Patch library').click()
  await until(() => library()?.open)
  button(entry.title, library()).click()
  await until(() => library().querySelector('h3')?.textContent === entry.title)
  assert(
    library().querySelector('.patch-path').textContent === 'Complete patches / Trance',
    'Wrong collection',
  )
  button('Load patch…', library()).click()
  await until(() => !library() || library().querySelector('.replace-prompt'))
  if (library()) button('Load patch', library()).click()
  await until(() => !library())
  assert(status() === 'Stopped', 'Library load started audio')
  assert(source() === entry.source, 'Load changed supplied source')
  const patch = read(source()).patch
  validateRack(patch)
  assert(patch.modules.find((m) => m.type === 'out').values.bpm === 140, 'Rack tempo is not 140')
  assert(
    document.querySelectorAll('.module-panel').length === patch.modules.length,
    'Rack not updated',
  )
  return { modules: patch.modules.length, rows: Math.max(...patch.modules.map((m) => m.row)) + 1 }
}

async function exported() {
  const original = URL.createObjectURL.bind(URL)
  let blob
  URL.createObjectURL = (value) => {
    blob = value
    return original(value)
  }
  try {
    button('Export').click()
    assert(blob, 'No exported file')
    return await blob.text()
  } finally {
    URL.createObjectURL = original
  }
}

async function signal() {
  const controller = window.getSuperdoughAudioController()
  const nodes = [
    controller.output.destinationGain,
    ...[1, 2, 3, 4].map((id) => controller.nodes[id]?.output),
  ]
  assert(nodes.every(Boolean), 'Missing a sounding orbit')
  const probes = nodes.map((node) => {
    const analyser = controller.audioContext.createAnalyser()
    node.connect(analyser)
    return { node, analyser, sum: 0, samples: 0 }
  })
  try {
    for (let i = 0; i < 90; i++) {
      for (const probe of probes) {
        const data = new Float32Array(probe.analyser.fftSize)
        probe.analyser.getFloatTimeDomainData(data)
        for (const value of data) {
          probe.sum += value * value
          probe.samples++
        }
      }
      await pause(30)
    }
    return probes.map((p, index) => ({
      output: ['master', 'orbit1', 'orbit2', 'orbit3', 'orbit4'][index],
      rms: Math.sqrt(p.sum / p.samples),
      samples: p.samples,
    }))
  } finally {
    for (const probe of probes) probe.node.disconnect(probe.analyser)
  }
}

/** Run after the first real user/harness Play has initialized the actual engine. */
export async function verifyTrance() {
  assert(typeof window.Pattern === 'function', 'Activate the engine with a real Play gesture first')
  // Observe the real adapter's existing callback without changing source or disabling audio.
  const original = window.Pattern.prototype.onTrigger
  let pattern
  const triggers = []
  window.Pattern.prototype.onTrigger = function (callback, dominant) {
    pattern = this
    return original.call(
      this,
      (hap, now, cps, target) => {
        if (triggers.length < 1000) triggers.push({ value: hap.value, cps, target })
        callback(hap, now, cps, target)
      },
      dominant,
    )
  }
  const events = () =>
    pattern
      .queryArc(0, 4)
      .filter((hap) => hap.hasOnset())
      .map((hap) => ({
        begin: hap.whole.begin.valueOf(),
        end: hap.whole.end.valueOf(),
        value: hap.value,
      }))
  const eventSnapshot = (values) =>
    JSON.stringify(values, (_key, value) =>
      typeof value === 'bigint' ? { bigint: String(value) } : value,
    )
  async function play() {
    triggers.length = 0
    document.querySelector('.topbar .play').click()
    await until(() => status() === 'Pattern scheduled' || status().includes('error'))
    assert(status() === 'Pattern scheduled', 'Demo evaluation failed')
    await pause(2500)
    const pcm = await signal()
    assert(
      pcm.every((p) => p.rms > 0.0001),
      'One or more voices produced no output',
    )
    assert(
      triggers.length > 0 && triggers.every((t) => Math.abs(t.cps - 140 / 240) < 1e-10),
      'Scheduler tempo differs from 140 BPM',
    )
    const expected = new Set(['bd:default', 'supersaw:2', 'supersaw:3', 'pulse:4'])
    for (const trigger of triggers)
      expected.delete(`${trigger.value.s}:${trigger.value.orbit ?? 'default'}`)
    assert(expected.size === 0, 'Not all four voices triggered')
    return pcm
  }
  try {
    const layout = await loadTrance()
    assert((await exported()) === entry.source, 'Untouched export changed source')
    const firstPCM = await play()
    const firstEvents = events()
    const groups = firstEvents.reduce((result, event) => {
      const key = `${event.value.s}:${event.value.orbit ?? 'default'}`
      result[key] = (result[key] ?? 0) + 1
      return result
    }, {})
    assert(
      groups['bd:default'] === 16 && groups['pulse:4'] === 64,
      'Kick/pulse event counts differ from mini notation',
    )
    assert(groups['supersaw:2'] > 0 && groups['supersaw:3'] > 0, 'Missing gated supersaw events')
    assert(
      firstEvents.filter((e) => e.value.s === 'bd').every((e) => e.value.n === 2),
      'bd sample index changed',
    )
    const saw2 = firstEvents.filter((e) => e.value.orbit === 2)
    const saw3 = firstEvents.filter((e) => e.value.orbit === 3)
    assert(
      saw2.every(
        (e) =>
          Math.abs(e.value.cutoff - (0.539 * 12) ** 4) < 1e-7 &&
          e.value.gain === 1.4 &&
          e.value.clip === 0.8,
      ),
      'rlpf/gain/trancegate changed',
    )
    assert(
      saw3.every(
        (e) => Math.abs(e.value.cutoff - (0.925 * 12) ** 4) < 1e-7 && e.value.delay === 0.4,
      ),
      'Second supersaw filter/delay changed',
    )
    assert(new Set(saw3.map((e) => e.value.pan)).size > 1, 'Random pan is not modulating')
    assert(
      window.s('sine').rhpf(0.5).queryArc(0, 1)[0].value.hcutoff === 1296,
      'Unused rhpf registration incompatible',
    )
    const pulse = firstEvents.filter((e) => e.value.orbit === 4)
    assert(
      new Set(pulse.map((e) => Number(e.value.fmi))).size > 1 &&
        new Set(pulse.map((e) => Number(e.value.fmh))).size > 1,
      'Time-based FM is not modulating',
    )
    assert(
      ['rlpf', 'rhpf', 'o', 'trancegate'].every(
        (name) => typeof window.Pattern.prototype[name] === 'function',
      ),
      'Missing custom registration',
    )
    document.querySelector('.topbar .play[aria-label=Stop]').click()
    await until(() => status() === 'Stopped')
    const stoppedCount = triggers.length
    await pause(1000)
    assert(triggers.length === stoppedCount, 'Stop left scheduler triggering')

    const patch = read(source()).patch
    const outId = patch.modules.find((m) => m.type === 'out').id
    document
      .querySelector(`[data-module="${outId}"]`)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 200 }))
    await until(() => document.querySelector('[aria-label="Look Vintage lab"]'))
    document.querySelector('[aria-label="Look Vintage lab"]').click()
    await until(() =>
      document.querySelector(`[data-module="${outId}"]`).classList.contains('look-vintage'),
    )
    const saved = await exported()
    assert(sourceBody(saved) === entry.source, 'Rack edit changed exact source')
    const savedRack = read(saved).patch
    await loadTrance()
    const secondPCM = await play()
    assert(
      eventSnapshot(events()) === eventSnapshot(firstEvents),
      'Repeated load/Play changed events',
    )
    document.querySelector('.topbar .play[aria-label=Stop]').click()
    await until(() => status() === 'Stopped')

    const transfer = new DataTransfer()
    transfer.items.add(new File([saved], 'switch-angel.strudel', { type: 'text/plain' }))
    const input = document.querySelector('input[type=file]')
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => source() === saved || document.querySelector('.replace-prompt'))
    if (document.querySelector('.replace-prompt')) button('Open patch').click()
    await until(() => source() === saved)
    await until(() =>
      document.querySelector('.sync-status').textContent.startsWith('Rack matches code'),
    )
    assert(
      JSON.stringify(read(source()).patch) === JSON.stringify(savedRack),
      'Reopen lost saved rack identity',
    )
    assert(
      document.querySelector(`[data-module="${outId}"]`).classList.contains('look-vintage'),
      'Reopen did not restore the visible OUT look',
    )
    const rendered = [...document.querySelectorAll('.module-panel')]
      .map((panel) => ({
        id: panel.dataset.module,
        left: panel.style.left,
        top: panel.style.top,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const expected = savedRack.modules
      .map((module) => ({
        id: module.id,
        left: `${module.hp * HP}px`,
        top: `${module.row * ROW_HEIGHT + 20}px`,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    assert(
      JSON.stringify(rendered) === JSON.stringify(expected),
      'Reopened panels do not match saved rack identities and positions',
    )
    const reopenedPCM = await play()
    assert(
      eventSnapshot(events()) === eventSnapshot(firstEvents),
      'Export/reopen changed sound events',
    )
    document.querySelector('.topbar .play[aria-label=Stop]').click()
    await until(() => status() === 'Stopped')
    return {
      status: 'passed',
      ...layout,
      cycles: 4,
      events: groups,
      bpm: 140,
      firstPCM,
      secondPCM,
      reopenedPCM,
      exactSource: true,
      savedRackIdentity: true,
      renderedRackIdentity: true,
      physicalListening: false,
    }
  } finally {
    window.Pattern.prototype.onTrigger = original
  }
}
