import { expect, it } from 'vitest'
import { patchCredits } from './credits'
import { patchName, patchFilename, renameDocument } from './naming'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { editDocument, saveLayout, sourceBody, makeRackEditable } from './document'
import { setValue } from '../rack/model'

const comments =
  '//  @title  Café <&>  \r\n// @by Alice\r\n// @by Bob\r\n// @license CC BY-SA 4.0\r\n// @url javascript:never-run()\r\n// @custom Preserve Me\r\n'
const source = `${comments}$: note("c3 e3").s("sine").gain(.2)\r\n`
it('reads only real line comments, preserving repeats, unknown tags and exact source separately', () => {
  expect(patchCredits(`${comments}const fake = "// @by Fake"; /* @by Hidden */`)).toEqual([
    { tag: 'title', value: 'Café <&>' },
    { tag: 'by', value: 'Alice' },
    { tag: 'by', value: 'Bob' },
    { tag: 'license', value: 'CC BY-SA 4.0' },
    { tag: 'url', value: 'javascript:never-run()' },
    { tag: 'custom', value: 'Preserve Me' },
  ])
  expect(generate(read(source))).toBe(source)
})
it('uses @title only as an unstored name fallback and preserves credits through save/edit/rename/reopen', () => {
  let document = read(source)
  expect(document.patch.name).toBeUndefined()
  expect(patchName(document.patch, document.source)).toBe('Café <&>')
  expect(patchFilename(document.patch, 'strudel', document.source)).toBe('Café -&-.strudel')
  expect(renameDocument(document, 'Café <&>')).toBe(document)
  document = saveLayout(document)
  const vca = document.patch.modules.find((m) => m.type === 'vca')
  if (!vca) throw new Error('Missing VCA')
  document = editDocument(document, setValue(document.patch, vca.id, 'level', 0.4))
  document = renameDocument(document, 'Local name')
  expect(patchName(document.patch, document.source)).toBe('Local name')
  expect(sourceBody(document.source)).toBe(source.replace('gain(.2)', 'gain(0.4)'))
  expect(read(document.source).patch).toEqual(document.patch)
  expect(patchCredits(document.source)).toEqual(patchCredits(source))
})
it('keeps original credit comment bytes on explicit rack conversion', () => {
  expect(makeRackEditable(read(source)).source).toContain(comments)
})

it('does not swallow setup when preserving a final credit with no newline', () => {
  const document = makeRackEditable(
    read('const helper = 1;\n$: note("c3").s("sine")\n// @by Last credit'),
  )
  // Repository-owned conversion fixture: the retained setup still executes.
  // oxlint-disable-next-line typescript/no-implied-eval
  const helper: unknown = new Function(`${document.patch.prelude}\nreturn helper`)()
  expect(helper).toBe(1)
  expect(patchCredits(document.source)).toEqual([{ tag: 'by', value: 'Last credit' }])
  expect(read(document.source).patch).toEqual(document.patch)
})

it.each([
  'const helper = (\n// @by Inner setup\n1);\n// @title Later\n$: note("c3").s("sine")',
  '$: note("c3").s("sine").custom(x => {\n// @by Inner CODE\nreturn x;\n})',
])('retains credits inside setup/CODE once during conversion: %s', (source) => {
  const converted = makeRackEditable(read(source))
  expect(patchCredits(converted.source)).toEqual(patchCredits(source))
  expect(read(converted.source).patch).toEqual(converted.patch)
})

it('refuses conversion atomically when CODE credit order would change the fallback title', () => {
  const source =
    '$: note("c3").s("sine").custom(x => {\n// @title First\nreturn x;\n})\n// @title Second\n'
  const document = read(source)
  expect(patchName(document.patch, document.source)).toBe('First')
  expect(() => makeRackEditable(document)).toThrow(/credit order/i)
  expect(generate(document)).toBe(source)
  expect(patchName(document.patch, document.source)).toBe('First')
})
