import { describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { validateRack, setValue } from '../rack/model'
import type { Patch } from '../patch/types'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { libraryPatches, PATCH_LIBRARY } from './catalog'
import { readLibraryPatch } from './load'
import source from './patches/war-pigs-doom-instrument.strudel?raw'

function budget(patch: Patch) {
  validateRack(patch)
  const rail = patch.modules.filter((m) => m.type !== 'out')
  const hp = rail.reduce((total, m) => total + getModuleSpec(m.type).hp, 0)
  if (patch.modules.length > 20 || hp > 189) throw new Error('Doom module/HP budget exceeded')
  return {
    hp,
    rows: [0, 1, 2].map((row) =>
      rail.filter((m) => m.row === row).reduce((n, m) => n + getModuleSpec(m.type).hp, 0),
    ),
  }
}

describe('War Pigs Doom instrument #210', () => {
  it('ships one attributed arrangement under Complete patches / War Pigs experiments', () => {
    const complete = PATCH_LIBRARY.find((node) => node.id === 'complete')
    if (!complete || complete.kind !== 'collection') throw new Error('Missing Complete patches')
    const collection = complete.children.find((node) => node.id === 'war-pigs-experiments')
    if (!collection || collection.kind !== 'collection') throw new Error('Missing War Pigs')
    const entry = libraryPatches(collection.children).find(
      (patch) => patch.id === 'war-pigs-doom-instrument',
    )
    expect(entry?.source).toBe(source)
    expect(entry?.attribution.author).toContain('Black Sabbath')
    expect(entry?.attribution.author).toContain('Jake Brown')
    expect(entry?.attribution.author).not.toContain('MIT')
    expect(entry?.attribution.url).toBe(
      'https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414',
    )
    expect(entry?.tryThis).toMatch(/CUTOFF.*DRIVE.*MIX/)
    expect([...(entry?.exercises ?? [])].sort()).toEqual(
      [...new Set(read(source).patch.modules.map((m) => m.type))].sort(),
    )
  })

  it('fits all 20 active modules in three valid medium rails with explicit straight CLOCKs', () => {
    const { patch } = read(source)
    expect(patch).toMatchObject({ railHp: 84, rows: 3 })
    expect(budget(patch)).toEqual({ hp: 189, rows: [71, 61, 57] })
    const counts = Object.fromEntries(
      [...new Set(patch.modules.map((m) => m.type))].map((type) => [
        type,
        patch.modules.filter((m) => m.type === type).length,
      ]),
    )
    expect(counts).toEqual({
      seq: 3,
      clock: 3,
      osc: 3,
      vcf: 1,
      drive: 1,
      vca: 3,
      env: 3,
      mix: 1,
      lfo: 1,
      out: 1,
    })
    for (const module of patch.modules.filter((m) => m.type === 'clock'))
      expect(module.values).toMatchObject({ division: 6, swingMode: 'off', offset: 0 })
    for (const module of patch.modules.filter((m) => m.type === 'seq')) {
      expect(typeof module.values.steps).toBe('string')
      expect(module.values.rate).toBe(1)
    }
    expect(patch.modules.find((m) => m.type === 'out')?.values).toEqual({ bpm: 56, vol: 0.8 })
    expect(source.match(/\.slow\(6\)/g)).toHaveLength(3)
    expect(sourceBody(source)).not.toMatch(
      /swingBy|\.late|\.fast|unison|\.noise|\.delay|\.room|\.bus/,
    )
  })

  it('rejects an otherwise valid over-budget rack', () => {
    const patch = structuredClone(read(source).patch)
    patch.modules.push({
      id: 'vca4',
      type: 'vca',
      row: 0,
      hp: 71,
      look: 'instrument',
      values: { level: 0.1 },
    })
    expect(() => validateRack(patch)).not.toThrow()
    expect(() => budget(patch)).toThrow(/budget/)
  })

  it('retains executable bytes and full saved identity, including one ENV at both amp and filter', () => {
    const document = readLibraryPatch({ source })
    expect(document.layout).toBe('restored')
    expect(generate(document.patch)).toBe(source)
    expect(generate(document)).toBe(source)
    expect(document.patch.cables.filter((c) => c.from.module === 'env1').map((c) => c.to)).toEqual([
      { module: 'vcf1', jack: 'cv' },
      { module: 'vca1', jack: 'cv' },
    ])
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(sourceBody(source))
    expect(read(saved.source).patch).toEqual(document.patch)
    const edit = editDocument(document, setValue(document.patch, 'env1', 'rel', 0.2))
    expect(sourceBody(edit.source)).toContain('.lprelease(0.2)')
    expect(sourceBody(edit.source)).toContain('.release(0.2)')
    expect(read(edit.source).patch).toEqual(edit.patch)
    expect(read(source).patch).toEqual(document.patch)
  })
})
