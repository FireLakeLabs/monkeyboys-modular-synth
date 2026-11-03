import { expect, it } from 'vitest'
import { RACK_MARKER } from '../codegen/layout'
import { tryRead } from './read'
import { rackMetadata } from './metadata'
import { readLayout } from './layout'

it.each([
  `const marker = ${JSON.stringify(RACK_MARKER)};\n$: s("bd")`,
  `const marker = \`\n${RACK_MARKER}\n// {}\n\`;\n$: s("bd")`,
  `/*\n${RACK_MARKER}\n// {}\n*/\n$: s("bd")`,
  `${RACK_MARKER}\n// {}\n$: s("bd")`,
  `$: s("bd")\n${RACK_MARKER}\n// {}\n// comment\n$: s("hh")`,
])('does not hide marker-like text or comments before executable code: %s', (source) => {
  expect(rackMetadata(source)).toBeNull()
})

it('uses the reader boundary after earlier marker-like text and retains unknown metadata', () => {
  const prefix = `const marker = ${JSON.stringify(RACK_MARKER)};\n${RACK_MARKER}\n// earlier\n$: s("bd")\n`
  const source = `${prefix}${RACK_MARKER}\n// {"version":999}\n`
  expect(rackMetadata(source)).toEqual({ start: prefix.length, end: source.length })
  expect(readLayout(source).kind).toBe('invalid')
})

it('reports an unfinished expression at the end of code, before trailing rack metadata', () => {
  const source = `setcpm(30)\n$: note(\n\n${RACK_MARKER}\n// {\n//   "version": 999\n// }\n`
  expect(tryRead(source)).toMatchObject({
    kind: 'invalid',
    source,
    offset: 19,
    line: 2,
    column: 8,
    message: 'Unexpected token (2:8)',
  })
})

it('leaves errors within the code at their original line and column', () => {
  expect(tryRead(`$: note(,)\n${RACK_MARKER}\n// {}\n`)).toMatchObject({
    kind: 'invalid',
    offset: 8,
    line: 1,
    column: 8,
  })
})
