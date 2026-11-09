import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

for (const file of ['@strudel/web/dist/index.mjs', 'superdough/dist/index.mjs'])
  await test(`${file}: a bad formula reports its failure once and silences the failed processor`, async () => {
    const bundle = await readFile(new URL(`../node_modules/${file}`, import.meta.url), 'utf8')
    const payloads = [...bundle.matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g)].map(
      (match) => Buffer.from(match[1] ?? '', 'base64').toString(),
    )
    const payload = payloads.find((source) => source.includes('byte-beat-processor'))
    assert(payload, 'Missing installed worklet')
    const processors = new Map<
      string,
      new () => {
        port: { onmessage: (event: unknown) => void }
        process: (...args: unknown[]) => boolean
      }
    >()
    const messages: unknown[] = []
    const context = vm.createContext({
      sampleRate: 48000,
      currentTime: 0.01,
      currentFrame: 480,
      registerProcessor: (
        name: string,
        processor: new () => {
          port: { onmessage: (event: unknown) => void }
          process: (...args: unknown[]) => boolean
        },
      ) => processors.set(name, processor),
      AudioWorkletProcessor: class {
        port = {
          postMessage: (message: unknown) => messages.push(message),
          onmessage: (_event: unknown) => {},
        }
      },
    })
    vm.runInContext(payload, context)
    const Processor = processors.get('byte-beat-processor')
    assert(Processor)
    const processor = new Processor()
    processor.port.onmessage({
      data: { codeText: 'missingBytebeatFunction(t)', byteBeatStartTime: 0 },
    })
    const output = [new Float32Array(128), new Float32Array(128)]
    const params = { begin: [0], end: [1], frequency: [220], detune: [0] }
    assert.doesNotThrow(() => processor.process([], [output], params))
    assert.equal(messages.length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
      type: 'monkeyboy-bytebeat-error',
      message: 'ReferenceError: missingBytebeatFunction is not defined',
    })
    assert(output.every((channel) => channel.every((sample) => sample === 0)))
    assert.equal(processor.process([], [output], params), false)
    assert.equal(messages.length, 1)
    const healthy = new Processor()
    healthy.port.onmessage({ data: { codeText: 't', byteBeatStartTime: 0 } })
    const healthyOutput = [new Float32Array(128), new Float32Array(128)]
    assert.equal(healthy.process([], [healthyOutput], params), true)
    assert(healthyOutput[0]?.some((sample) => sample !== 0))
    assert(healthyOutput.every((channel) => channel.every(Number.isFinite)))
    assert.equal(messages.length, 1)
  })
