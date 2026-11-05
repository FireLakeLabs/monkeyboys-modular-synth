import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarize } from './browser-report.mts'

await test('reports counts from the closing summary with the real exit code', () => {
  const output = '[1/3] a\n  1) suites › a ───\n\n  1 failed\n    suites › a\n  2 passed (1.5m)\n'
  assert.equal(summarize(output, 1), 'RESULT passed=2 failed=1 exit=1')
})

await test('reads a passing run through terminal colors', () => {
  assert.equal(
    summarize('\u001b[32m  72 passed\u001b[39m (12.6m)\n', 0),
    'RESULT passed=72 failed=0 exit=0',
  )
})

await test('never reports a run without a summary as passing', () => {
  assert.equal(
    summarize('Error: port 5173 is already used\n', 1),
    'RESULT passed=0 failed=0 exit=1',
  )
})
