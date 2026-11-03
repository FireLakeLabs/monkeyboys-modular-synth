import { expect, it } from 'vitest'
import { RACK_MARKER } from '../codegen/layout'
import { tryRead } from './read'

const metadata = `\n\n${RACK_MARKER}\n// {\n//   "version": 999\n// }\n`

it('reports the missing lpq closer at its line-eight opener, before saved metadata', () => {
  const code = `setcpm(30)\n\n// filter voice\n$: note("c3")\n  .s("sawtooth")\n  .gain(0.2)\n  .lpf(800)\n  .lpq(8\n  .room(0.2)`
  expect(tryRead(code + metadata)).toMatchObject({
    kind: 'invalid',
    offset: code.lastIndexOf('(8'),
    line: 8,
    column: 6,
    message: "Unclosed '(' (8:6)",
  })
})

it.each([
  ['(', '$: note(\n  "c3"', 7],
  ['[', 'const notes = [\n  "c3"', 14],
  ['{', 'const settings = {\n  gain: 0.2', 17],
])('reports the unclosed %s at its opener', (bracket, code, offset) => {
  expect(tryRead(code + metadata)).toMatchObject({
    kind: 'invalid',
    offset,
    line: 1,
    column: offset,
    message: `Unclosed '${bracket}' (1:${offset})`,
  })
})

it('ignores brackets and rack markers inside strings, templates, regexps and comments', () => {
  const code = `const text = ${JSON.stringify(RACK_MARKER + ' [')};\nconst template = \`( [ \${1 + 2}\`;\nconst regex = /[({]/;\n/* [ { */\n$: note(\n"c3"`
  expect(tryRead(code + metadata)).toMatchObject({
    kind: 'invalid',
    offset: code.lastIndexOf('('),
    line: 5,
    column: 7,
  })
})

it('points to an unclosed inner bracket when a different closer is encountered', () => {
  expect(tryRead('$: note(["c3")' + metadata)).toMatchObject({
    kind: 'invalid',
    offset: 8,
    line: 1,
    column: 8,
    message: "Unclosed '[' (1:8)",
  })
})

it.each([
  ['$: note(,)', 8, 1, 8],
  ['const n = ;\n$: note("c3")', 10, 1, 10],
  ['const n = {\n  gain: ,\n}', 20, 2, 8],
])('keeps other syntax errors at their code token: %s', (code, offset, line, column) => {
  expect(tryRead(code + metadata)).toMatchObject({ kind: 'invalid', offset, line, column })
})
