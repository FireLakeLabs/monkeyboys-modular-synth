// Research only: served by Vite at /scripts/engine-spike.html, not part of the app build.
import { play, stop } from '../src/strudel/engine.ts'
import * as web from '@strudel/web'

const result = document.querySelector('#result')
const run = document.querySelector('#run')
const audio = document.querySelector('#audio')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const activity =
  '.onTrigger((hap, now, cps, t) => globalThis.__mmsEvents.push({value: hap.value, now, t}), false)'
globalThis.__mmsEvents = []
globalThis.engineSpike = { results: [], recording: [] }

function report(value) {
  globalThis.engineSpike.results.push(value)
  result.textContent = JSON.stringify(globalThis.engineSpike.results, null, 2)
}

function synth(cutoff = 800, bpm = 120) {
  return `setcpm(${bpm}/4)
const lead = note("c3*8").s("sawtooth").attack(.01).release(.02).gain(.15)
$: lead.lpf(${cutoff}).orbit(1)${activity}
$: note("g3*8").s("sine").gain(.05).orbit(2)${activity}`
}

async function record() {
  const context = web.getAudioContext()
  const processorName = `mms-capture-${Date.now()}`
  const url = URL.createObjectURL(
    new Blob(
      [
        `
    registerProcessor('${processorName}', class extends AudioWorkletProcessor {
      process(inputs) {
        if (inputs[0]?.[0]) this.port.postMessage(inputs[0][0].slice());
        return true;
      }
    });
  `,
      ],
      { type: 'text/javascript' },
    ),
  )
  await context.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const capture = new AudioWorkletNode(context, processorName)
  capture.port.onmessage = ({ data }) => globalThis.engineSpike.recording.push(data)
  const output = web.getSuperdoughAudioController().output.destinationGain
  output.connect(capture)
  capture.connect(context.destination) // capture processor outputs silence; normal output is unchanged
  return () => {
    output.disconnect(capture)
    capture.disconnect()
    const chunks = globalThis.engineSpike.recording
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)
    const text = (offset, value) =>
      [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, context.sampleRate, true)
    view.setUint32(28, context.sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, length * 2, true)
    let index = 44
    for (const chunk of chunks)
      for (const value of chunk) {
        view.setInt16(index, Math.max(-1, Math.min(1, value)) * 32767, true)
        index += 2
      }
    audio.href = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    audio.hidden = false
    return { frames: length, sampleRate: context.sampleRate }
  }
}

function pcmSummary(begin) {
  let frames = 0,
    energy = 0,
    silent = 0,
    longestSilence = 0,
    maxDelta = 0,
    previous
  for (const chunk of globalThis.engineSpike.recording.slice(begin))
    for (const value of chunk) {
      frames++
      energy += value * value
      silent = Math.abs(value) < 0.000001 ? silent + 1 : 0
      longestSilence = Math.max(longestSilence, silent)
      if (previous !== undefined) maxDelta = Math.max(maxDelta, Math.abs(value - previous))
      previous = value
    }
  return { frames, rms: Math.sqrt(energy / frames), longestSilence, maxDelta }
}

async function checkRun() {
  run.disabled = true
  globalThis.engineSpike.results = []
  globalThis.engineSpike.recording = []
  let finishRecording
  try {
    // The first play follows this button's trusted click.
    await play(synth())
    report({ firstPlay: web.getAudioContext().state, browser: navigator.userAgent })
    finishRecording = await record()
    for (const bpm of [90, 120, 160]) {
      await play(synth(2680, bpm))
      await wait(400)
      const baselineBegin = globalThis.engineSpike.recording.length
      await wait(2300)
      const baseline = pcmSummary(baselineBegin)
      const editsBegin = globalThis.engineSpike.recording.length
      globalThis.__mmsEvents = []
      for (let edit = 0; edit < 60; edit++) {
        await play(synth(400 + (edit % 20) * 120, bpm))
        await wait(30)
      }
      await wait(500)
      const times = globalThis.__mmsEvents.filter((e) => e.value.orbit === 1).map((e) => e.t)
      const intervals = times.slice(1).map((t, i) => t - times[i])
      report({
        bpm,
        edits: 60,
        events: times.length,
        intervals,
        baseline,
        edited: pcmSummary(editsBegin),
      })
    }
    for (const code of ['note("c3"', 'note("c3").missingMethod()']) {
      const before = globalThis.__mmsEvents.length
      let error
      try {
        await play(code)
      } catch (e) {
        error = String(e)
      }
      await wait(600)
      report({ code, error, eventsAfterFailure: globalThis.__mmsEvents.length - before })
    }
    // A failing edit can have already executed global side effects.
    try {
      await play('setcpm(60/4)\nnote("c3").missingMethod()')
    } catch (e) {
      report({ partialSideEffectError: String(e) })
    }
    globalThis.__mmsEvents = []
    await wait(1200)
    report({
      sideEffectIntervals: globalThis.__mmsEvents
        .filter((e) => e.value.orbit === 1)
        .map((e) => e.t),
    })
    for (const bank of ['', 'RolandTR808', 'RolandTR909']) {
      const begin = globalThis.engineSpike.recording.length
      await play(
        `setcpm(120/4)\ns("bd hh sd hh")${bank ? `.bank('${bank}')` : ''}.gain(.2)${activity}`,
      )
      await wait(2600) // repeat once after lazy audio-file decoding
      const pcm = globalThis.engineSpike.recording.slice(begin).flatMap((chunk) => [...chunk])
      report({
        bank: bank || 'default',
        audioState: web.getAudioContext().state,
        rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length),
      })
    }
    await play(`setcpm(120/4)
$: s("sine*4").delay(.4).delaytime(.125).delayfeedback(.2).room(.3).roomsize(2).orbit(3)${activity}
$: s("sine*4").delay(.5).delaytime(.5).delayfeedback(.6).room(.4).roomsize(6).orbit(4)${activity}`)
    await wait(1200)
    const nodes = web.getSuperdoughAudioController().nodes
    report({
      orbits: [3, 4].map((id) => ({
        id,
        delay: nodes[id]?.delayNode?.delayTime.value,
        feedback: nodes[id]?.delayNode?.feedback.value,
        roomsize: nodes[id]?.reverbNode?.duration,
      })),
    })
    await stop()
    const count = globalThis.__mmsEvents.length
    await wait(1800)
    report({ stopNewEvents: globalThis.__mmsEvents.length - count })
  } finally {
    if (finishRecording) report({ capture: finishRecording() })
    await stop()
    run.disabled = false
  }
}

run.addEventListener('click', () => {
  checkRun().catch((error) => report({ failure: String(error) }))
})
document.querySelector('#stop').addEventListener('click', () => {
  stop().catch((error) => report({ failure: String(error) }))
})
