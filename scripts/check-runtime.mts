import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function checkRuntime(actual = process.versions.node): string | undefined {
  const expected = readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim()
  if (actual !== expected) return `Use Node ${expected} from .node-version; running ${actual}.`
  return undefined
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const error = checkRuntime()
  if (error) {
    console.error(error)
    process.exitCode = 1
  }
}
