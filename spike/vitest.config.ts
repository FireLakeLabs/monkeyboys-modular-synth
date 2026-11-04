import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: [{ find: /^@strudel\/core$/, replacement: fileURLToPath(new URL('../src/reader/fixtures/strudel-kernel.mjs', import.meta.url)) }] },
  test: { include: ['spike/*.test.ts'], server: { deps: { inline: [/@strudel\/(mini|tonal)/] } } },
})
