import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))

await test('bare n remains a control field while scale consumes it into note', async () => {
  const { module: runtime } = await runnerImport(`${root}docs/research/module-contexts-cases.mjs`, {
    configFile: false,
    resolve: {
      alias: [
        {
          find: /^@strudel\/core$/,
          replacement: `${root}src/reader/fixtures/strudel-kernel.mjs`,
        },
      ],
      noExternal: [/^@strudel\//],
    },
  })
  assert.ok(runtime && typeof runtime === 'object' && 'events' in runtime)
  const query = runtime.events
  assert.equal(typeof query, 'function')
  if (typeof query !== 'function') throw new Error('Missing pure event query')
  const values = (expression: string): object[] => {
    const result: unknown = query(expression)
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 8)
    return result.map((event: unknown) => {
      assert.ok(event && typeof event === 'object' && 'value' in event)
      assert.ok(event.value && typeof event.value === 'object')
      return event.value
    })
  }
  const bare = values('n("0 2").s("sawtooth")')
  const scaled = values('n("0 2").scale("C:major").s("sawtooth")')
  assert.ok(bare.every((value) => Object.hasOwn(value, 'n') && !Object.hasOwn(value, 'note')))
  assert.ok(scaled.every((value) => Object.hasOwn(value, 'note') && !Object.hasOwn(value, 'n')))
})
