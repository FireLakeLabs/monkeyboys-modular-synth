import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { assessConnection, connect, placeModule } from '../rack/model'
import { assessDocumentConnection } from './connections'
import { editDocument, makeRackEditable, RackEditRefused, sourceBody } from './document'

function fixture() {
  const imported = read(
    "// retain\nconst lead = note('c3').s('sine');\n$: lead.lpf(800).gain(.2);\n$: lead.gain(.1);\n",
  )
  return editDocument(imported, placeModule(imported.patch, 'lfo', 2))
}

describe('source-aware cable preview', () => {
  it('blocks graph-valid CV edits before committing, without changing source or saved rack', () => {
    const document = fixture()
    const before = structuredClone(document)
    const from = { module: 'lfo1', jack: 'out' }
    const to = { module: 'vcf1', jack: 'cv' }
    expect(assessConnection(document.patch, from, to).kind).toBe('valid')
    expect(() => editDocument(document, connect(document.patch, from, to))).toThrow(RackEditRefused)
    expect(assessDocumentConnection(document, from, to)).toMatchObject({
      kind: 'blocked',
      sourceRefused: true,
      message: expect.stringMatching(/came from code.*Add the cable in code.*rack.editable/),
    })
    expect(document).toEqual(before)

    const converted = makeRackEditable(document)
    expect(assessDocumentConnection(converted, from, to).kind).toBe('valid')
    const next = editDocument(converted, connect(converted.patch, from, to))
    expect(read(next.source).patch).toEqual(next.patch)
  })

  it('keeps supported imported replacements valid and incompatible signals blocked', () => {
    let document = fixture()
    document = editDocument(document, placeModule(document.patch, 'iter', 2))
    const incoming = document.patch.cables.find((cable) => cable.to.module === 'vcf1')
    if (!incoming) throw new Error('Missing filter input')
    document = editDocument(
      document,
      connect(document.patch, incoming.from, { module: 'iter1', jack: 'in' }),
    )
    const from = { module: 'iter1', jack: 'out' }
    const to = incoming.to
    expect(assessDocumentConnection(document, from, to).kind).toBe('valid')
    const next = editDocument(document, connect(document.patch, from, to, true))
    expect(sourceBody(next.source)).toContain('// retain')
    expect(read(next.source).patch).toEqual(next.patch)

    expect(assessDocumentConnection(next, from, { module: 'vcf1', jack: 'cv' }).kind).toBe(
      'blocked',
    )
    expect(assessDocumentConnection(next, { module: 'lfo1', jack: 'out' }, to).kind).toBe('blocked')
  })
})
