// Run through Vite in a fresh harness browser after a user gesture.
import * as strudel from '@strudel/web'
import { read } from '../src/reader/index.ts'
import { renameDocument } from '../src/workspace/naming.ts'
import { saveLayout } from '../src/workspace/document.ts'
import { editorSource, replaceSource } from './editor-browser.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function until(condition) {
  for (let attempt = 0; attempt < 800; attempt++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for Bounce')
}
function button(label) {
  const target = [...document.querySelectorAll('button')].find(
    (element) =>
      element.textContent.trim() === label || element.getAttribute('aria-label') === label,
  )
  if (!target) throw new Error(`Missing ${label}`)
  return target
}
const status = () => document.querySelector('.transport-status').textContent
async function open(source) {
  const input = document.querySelector('input[type="file"]')
  const transfer = new DataTransfer()
  transfer.items.add(new File([source], 'external.strudel', { type: 'text/plain' }))
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => editorSource() === source)
}
function inputValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function livePCM() {
  const context = strudel.getAudioContext()
  const analyser = context.createAnalyser()
  strudel.getSuperdoughAudioController().output.destinationGain.connect(analyser)
  let sum = 0,
    count = 0
  for (let i = 0; i < 40; i++) {
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    for (const value of data) {
      sum += value * value
      count++
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  analyser.disconnect()
  return Math.sqrt(sum / count)
}
async function wav(blob) {
  const buffer = await blob.arrayBuffer()
  const view = new DataView(buffer)
  const channels = view.getUint16(22, true)
  const rate = view.getUint32(24, true)
  const frames = view.getUint32(40, true) / (channels * 2)
  assert(new TextDecoder().decode(buffer.slice(0, 4)) === 'RIFF', 'Not a WAV')
  const hits = []
  for (let onset = 0; onset + 0.12 <= frames / rate; onset += 0.5) {
    let sum = 0,
      count = 0
    for (let frame = Math.floor(onset * rate); frame < Math.floor((onset + 0.12) * rate); frame++) {
      const value = view.getInt16(44 + frame * channels * 2, true) / 32768
      sum += value * value
      count++
    }
    hits.push(Math.sqrt(sum / count))
  }
  return {
    seconds: frames / rate,
    rate,
    channels,
    bits: view.getUint16(34, true),
    firstHitRMS: hits[0],
    hits,
  }
}

export async function verifyBounce() {
  const results = { checks: [], physicalListening: false }
  const uncaught = []
  const onError = (event) => uncaught.push(event.message)
  window.addEventListener('error', onError)
  const downloads = []
  let blob,
    lastDecoded = 0,
    renderedAt = 0,
    decodeCount = 0
  // oxlint-disable-next-line typescript/unbound-method -- Restore prototype methods after instrumentation.
  const decode = BaseAudioContext.prototype.decodeAudioData
  // oxlint-disable-next-line typescript/unbound-method -- Restore prototype methods after instrumentation.
  const render = OfflineAudioContext.prototype.startRendering
  const create = URL.createObjectURL.bind(URL)
  BaseAudioContext.prototype.decodeAudioData = async function (...args) {
    const decoded = await decode.apply(this, args)
    await new Promise((resolve) => setTimeout(resolve, 350))
    decodeCount++
    lastDecoded = performance.now()
    return decoded
  }
  OfflineAudioContext.prototype.startRendering = function () {
    renderedAt = performance.now()
    return render.call(this)
  }
  URL.createObjectURL = (value) => {
    if (value.type === 'audio/wav') {
      blob = value
      downloads.push(value)
    }
    return create(value)
  }
  try {
    const source = renameDocument(
      read('// cold sample hit at cycle zero\nsetcpm(30)\n$: s("bd*4").gain(0.5)\n'),
      'Café / drums.strudel',
    ).source
    await open(source)
    const rack = JSON.stringify(read(source).patch)
    const cycles = document.querySelector('[aria-label="Bounce cycles"]')
    inputValue(cycles, '0')
    await new Promise(requestAnimationFrame)
    assert(button('Bounce WAV').disabled, 'Invalid cycle count enabled Bounce')
    inputValue(cycles, '2')
    await new Promise(requestAnimationFrame)
    button('Bounce WAV').click()
    await until(() => status() === 'Bouncing WAV…')
    assert(!button('Stop').disabled, 'Stop unavailable during Bounce')
    await until(() => blob && status() === 'Ready')
    results.coldSample = await wav(blob)
    assert(results.coldSample.seconds === 4, 'Wrong cycle duration')
    assert(
      results.coldSample.hits.every((rms) => rms > 0.005),
      'Silent first or subsequent hit',
    )
    assert(
      decodeCount > 0 && renderedAt >= lastDecoded,
      'Rendering began before actual sample decoding',
    )
    results.decode = {
      count: decodeCount,
      completedBeforeRendering: renderedAt >= lastDecoded,
      artificialDelayMs: 350,
    }
    assert(editorSource() === source, 'Bounce changed exact source')
    assert(
      JSON.stringify(read(editorSource()).patch) === rack,
      'Bounce changed saved rack identity',
    )
    const events = strudel
      .getPattern()
      .queryArc(0, 2, { _cps: 0.5 })
      .filter((hap) => hap.hasOnset())
    assert(
      events.length === 8 && events.every((hap) => hap.value.s === 'bd'),
      'Bounce changed pattern events',
    )
    results.events = { count: events.length, sound: 'bd', range: [0, 2] }
    const live = strudel.getAudioContext()
    assert(live.state === 'running', 'Live context not restored')
    assert(
      strudel.getSuperdoughAudioController().output.destinationGain.context === live,
      'Wrong output context',
    )
    button('Play').click()
    await until(() => status() === 'Playing')
    results.afterBouncePCM = await livePCM()
    assert(results.afterBouncePCM > 0.001, 'Play after Bounce produced no PCM')
    assert(strudel.getAudioContext() === live, 'Live scheduler clock replaced')
    // Bounce while already playing must stop it and leave explicit Play available.
    blob = undefined
    button('Bounce WAV').click()
    await until(() => blob && status() === 'Ready')
    assert(editorSource() === source, 'Playing Bounce changed source')
    results.checks.push(
      'cold sample first hit, all hits, WAV duration, raw events, exact source and saved rack identity',
      'Bounce stops playback, restores the same live context/controller, subsequent Play produces PCM',
    )

    const coldTransition = saveLayout(read('setcpm(30)\n$: s("hh*8")')).source
    await open(coldTransition)
    button('Play').click()
    await until(() => status() === 'Playing')
    blob = undefined
    button('Bounce WAV').click()
    await until(() => blob && status() === 'Ready')
    assert(strudel.getAudioContext() === live, 'Cold transition replaced live clock')
    results.checks.push(
      'immediate Bounce while a cold live sample is still decoding drains output before swapping contexts',
    )

    const filtered = saveLayout(
      read('setcpm(120)\n$: note("c3*4").s("sawtooth").lpf(1000).release(0.01)'),
    ).source
    await open(filtered)
    button('Play').click()
    await until(() => status() === 'Playing')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    button('Stop').click()
    await until(() => status() === 'Ready')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    blob = undefined
    button('Bounce WAV').click()
    await until(() => blob && status() === 'Ready')
    results.filteredWAV = await wav(blob)
    assert(
      results.filteredWAV.seconds === 1 && results.filteredWAV.firstHitRMS > 0.001,
      'Filtered bounce is silent or wrong duration',
    )
    button('Play').click()
    await until(() => status() === 'Playing')
    results.filteredReplayPCM = await livePCM()
    assert(results.filteredReplayPCM > 0.001, 'Filtered replay is silent')
    button('Stop').click()
    await until(() => status() === 'Ready')
    results.checks.push(
      'pooled live filters cannot cross into offline output or back into replay; filtered WAV and replay both have nonzero PCM',
    )

    // A real pinned decoder failure is logged and swallowed by the upstream renderer.
    await strudel.samples({ bouncebroken: 'data:audio/wav;base64,YmFk' })
    const broken = saveLayout(read('setcpm(30)\n$: s("bouncebroken")')).source
    await open(broken)
    button('Bounce WAV').click()
    await until(() => status() === 'Audio error')
    assert(
      document.body.textContent.includes('Downloaded WAV may be incomplete'),
      'Swallowed decoder failure not surfaced',
    )
    assert(editorSource() === broken, 'Failure replaced source')
    assert(
      strudel.getAudioContext() === live && live.state === 'running',
      'Failure did not restore context',
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert(status() === 'Audio error', 'Failure auto-retried')
    const invalid = saveLayout(read('setcpm(30)\n$: s("sine").missingBounceMethod()')).source
    await open(invalid)
    const beforeFailure = downloads.length
    button('Bounce WAV').click()
    await until(() => status() === 'Audio error')
    assert(downloads.length === beforeFailure, 'Evaluation failure downloaded a WAV')
    assert(editorSource() === invalid, 'Evaluation failure replaced source')
    assert(strudel.getAudioContext() === live, 'Evaluation failure replaced the live context')
    const recovered = saveLayout(
      read('setcpm(30)\n$: note("c3*4").s("sine").sustain(1).release(0.01)'),
    ).source
    await open(recovered)
    button('Play').click()
    await until(() => status() === 'Playing')
    results.recoveredPCM = await livePCM()
    assert(results.recoveredPCM > 0.001, 'Explicit Play after failure is silent')
    button('Stop').click()
    await until(() => status() === 'Ready')
    results.checks.push(
      'real decode and evaluation failure banners with no invented source location, exact source retained, explicit recovery Play produces PCM',
    )
    replaceSource(recovered + '\n// unapplied')
    await until(() => button('Bounce WAV').disabled)
    assert(button('Bounce WAV').disabled, 'Unapplied draft can bounce')
    results.checks.push('invalid cycle count and unapplied draft disable Bounce')
    results.downloadCount = downloads.length
    assert(uncaught.length === 0, `Uncaught audio failure: ${uncaught.join('; ')}`)
    results.uncaughtErrors = uncaught.length
    return results
  } finally {
    window.removeEventListener('error', onError)
    BaseAudioContext.prototype.decodeAudioData = decode
    OfflineAudioContext.prototype.startRendering = render
    URL.createObjectURL = create
  }
}
