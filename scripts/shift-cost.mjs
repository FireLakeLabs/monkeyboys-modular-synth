// CPU-only execution of the exact bundled processor shipped by pinned superdough.
// This excludes WebAudio scheduling/node construction; browser PCM is a separate proof.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { cpus } from 'node:os'
import { createHash } from 'node:crypto'
const bundle = readFileSync(
  new URL('../node_modules/superdough/dist/index.mjs', import.meta.url),
  'utf8',
)
const encoded = bundle.match(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/)?.[1]
assert(encoded, 'Missing pinned worklet')
const code = Buffer.from(encoded, 'base64').toString()
const processors = new Map()
runInNewContext(code, {
  sampleRate: 48000,
  currentTime: 0,
  console,
  AudioWorkletProcessor: class {
    constructor() {
      this.port = { postMessage() {} }
    }
  },
  registerProcessor: (name, processor) => processors.set(name, processor),
})
const Processor = processors.get('phase-vocoder-processor')
assert(Processor)
const sampleRate = 48000,
  seconds = 8,
  blocks = (sampleRate * seconds) / 128
const input = Array.from(
  { length: blocks },
  (_, i) =>
    new Float32Array(
      Array.from(
        { length: 128 },
        (_, j) => 0.2 * Math.sin((2 * Math.PI * 220 * (i * 128 + j)) / sampleRate),
      ),
    ),
)
function run(voices, shift) {
  const nodes = Array.from(
    { length: voices },
    () => new Processor({ numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {} }),
  )
  const outputs = nodes.map(() => [[new Float32Array(128)]])
  const parameters = { pitchFactor: new Float32Array([1.5]) }
  let energy = 0,
    samples = 0,
    errors = 0
  const cpuStart = process.cpuUsage()
  const begin = performance.now()
  for (const frame of input)
    for (let i = 0; i < voices; i++) {
      const output = outputs[i]
      if (shift) assert.equal(nodes[i].process([[frame]], output, parameters), true)
      else output[0][0].set(frame)
      for (const value of output[0][0]) {
        if (!Number.isFinite(value)) errors++
        energy += value * value
        samples++
      }
    }
  const elapsedMs = performance.now() - begin,
    cpu = process.cpuUsage(cpuStart)
  assert.equal(errors, 0)
  assert.equal(samples, voices * seconds * sampleRate)
  assert(energy > 1)
  return {
    voices,
    shift,
    elapsedMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    msPerVoiceSecond: (cpu.user + cpu.system) / 1000 / voices / seconds,
    samples,
    rms: Math.sqrt(energy / samples),
    errors,
  }
}
run(1, true)
run(1, false) // warm JIT, FFT tables, buffers
const runs = []
for (let repeat = 0; repeat < 5; repeat++)
  for (const voices of [1, 4])
    for (const shift of [false, true]) runs.push({ ...run(voices, shift), repeat })
const groups = []
for (const voices of [1, 4])
  for (const shift of [false, true]) {
    const values = runs
      .filter((r) => r.voices === voices && r.shift === shift)
      .map((r) => r.msPerVoiceSecond)
      .sort((a, b) => a - b)
    groups.push({
      voices,
      shift,
      median: values[2],
      min: values[0],
      max: values[4],
      unit: 'CPU ms / voice / second of audio',
    })
  }
const result = {
  node: process.version,
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  sampleRate,
  channels: 1,
  blockFrames: 128,
  seconds,
  stretch: 1.5,
  workletSHA256: createHash('sha256').update(code).digest('hex'),
  groups,
  runs,
}
const output = process.argv[2] ?? '/tmp/monkeyboy-shift-cost.json'
writeFileSync(output, JSON.stringify(result, null, 2))
process.stdout.write(JSON.stringify({ output, groups }, null, 2) + '\n')
