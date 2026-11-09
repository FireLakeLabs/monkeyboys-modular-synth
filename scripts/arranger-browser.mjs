// Browser adapter for the #141 arranger lane acceptance. Served by Vite in the page.
import * as web from '@strudel/web'
import { generate } from '../src/codegen/generate.ts'
import { connect, placeModule, setValue, starterPatch } from '../src/rack/model.ts'
import { read } from '../src/reader/index.ts'
import { editorSource } from './editor-browser.mjs'

/** Two synth voices at one cycle per second, so a four-cycle song plays in four seconds. */
export function arrangerSong() {
  let patch = starterPatch(104)
  for (const [row, type] of ['seq', 'osc', 'seq', 'osc'].entries())
    patch = placeModule(patch, type, row + 1)
  patch = setValue(patch, 'out1', 'bpm', 240)
  patch = setValue(patch, 'seq1', 'steps', 'c3 eb3')
  patch = setValue(patch, 'seq2', 'steps', 'g4 bb4 c5 eb5')
  patch = setValue(patch, 'osc2', 'wave', 'square')
  for (const [from, to, jack] of [
    ['seq1', 'osc1', 'note'],
    ['osc1', 'mix1', 'in1'],
    ['seq2', 'osc2', 'note'],
    ['osc2', 'mix1', 'in2'],
  ])
    patch = connect(
      patch,
      { module: from, jack: from.startsWith('seq') ? 'note' : 'out' },
      { module: to, jack },
    )
  return generate(patch)
}

/** The accepted rack's lanes, keyed by MIX channel control. */
export function lanes() {
  const mix = read(editorSource()).patch.modules.find((module) => module.type === 'mix')
  return Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      `arr${n}`,
      typeof mix?.values[`arr${n}`] === 'string' ? mix.values[`arr${n}`] : '',
    ]),
  )
}

/** Records every scheduled trigger's cycle and orbit, through the pinned engine. */
export function installTriggerProbe() {
  const onTrigger = web.Pattern.prototype.onTrigger
  const triggers = []
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    return onTrigger.call(
      this,
      (hap, now, cps, target) => {
        triggers.push({ cycle: Number(hap.whole.begin), orbit: hap.value.orbit, cps })
        callback(hap, now, cps, target)
      },
      dominant,
    )
  }
  window.arrangerProbe = {
    read: () => structuredClone(triggers),
    restore: () => {
      web.Pattern.prototype.onTrigger = onTrigger
    },
  }
}

/** Peak and RMS of the master output over `ms`, measured from the live graph. */
export async function livePCM(ms = 1000) {
  const controller = web.getSuperdoughAudioController(),
    analyser = controller.audioContext.createAnalyser()
  controller.output.destinationGain.connect(analyser)
  let peak = 0,
    sum = 0,
    count = 0
  try {
    for (let elapsed = 0; elapsed < ms; elapsed += 25) {
      const frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      for (const value of frame) {
        peak = Math.max(peak, Math.abs(value))
        sum += value * value
        count++
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  } finally {
    controller.output.destinationGain.disconnect(analyser)
  }
  return { peak, rms: Math.sqrt(sum / count) }
}
