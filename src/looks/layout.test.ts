import { describe, expect, it } from 'vitest'
import { CATALOG } from '../modules/catalog'
import { looksFor } from '../modules/looks'
import { duplicateModule, placeModule, setLook, setValue, starterPatch } from '../rack/model'
import { editDocument, fromPatch, sourceBody } from '../workspace/document'
import { read } from '../reader'

describe('look and module actions', () => {
  it('saves every catalog module in every family look without changing source or positions', () => {
    let patch = starterPatch()
    for (const [index, spec] of CATALOG.entries())
      if (spec.id !== 'out' && spec.id !== 'mix') patch = placeModule(patch, spec.id, index + 1)
    let doc = fromPatch(patch)
    const sounding = sourceBody(doc.source)
    const positions = doc.patch.modules.map(({ id, row, hp }) => ({ id, row, hp }))
    for (const family of ['hardware', 'alien', 'cyber'] as const) {
      const module = doc.patch.modules.find(
        (m) => CATALOG.find((s) => s.id === m.type)?.family === family,
      )
      if (!module) throw new Error('Missing family')
      for (const look of looksFor(family)) {
        doc = editDocument(doc, setLook(doc.patch, module.id, look, true))
        expect(sourceBody(doc.source)).toBe(sounding)
        expect(doc.patch.modules.map(({ id, row, hp }) => ({ id, row, hp }))).toEqual(positions)
        expect(read(doc.source).patch).toEqual(doc.patch)
      }
    }
  })
  it('duplicates values and look into free space without adding cables or sharing values', () => {
    let patch = placeModule(starterPatch(), 'vcf', 0)
    patch = setValue(patch, 'vcf1', 'cutoff', 2400)
    patch = setLook(patch, 'vcf1', 'learner')
    const next = duplicateModule(patch, 'vcf1')
    expect(next.modules.find((m) => m.id === 'vcf2')).toMatchObject({
      look: 'learner',
      values: { cutoff: 2400 },
    })
    expect(next.cables).toEqual(patch.cables)
    expect(next.modules.find((m) => m.id === 'vcf2')?.hp).not.toBe(
      patch.modules.find((m) => m.id === 'vcf1')?.hp,
    )
    expect(() => duplicateModule(next, 'out1')).toThrow(/unique/)
    expect(() => setLook(next, 'vcf1', 'crystal')).toThrow(/family/)
  })
})
