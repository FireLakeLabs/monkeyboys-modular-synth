import { describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { validateRack, setValue } from '../rack/model'
import type { Patch } from '../patch/types'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { libraryPatches, PATCH_LIBRARY } from './catalog'
import { readLibraryPatch } from './load'
import source from './patches/war-pigs-industrial-triplets.strudel?raw'

function budget(patch: Patch) {
  validateRack(patch)
  const rail = patch.modules.filter((m) => m.type !== 'out')
  const hp = rail.reduce((total, m) => total + getModuleSpec(m.type).hp, 0)
  if (patch.modules.length > 20 || hp > 192) throw new Error('Industrial module/HP budget exceeded')
  return {
    hp,
    rows: [0, 1, 2].map((row) =>
      rail.filter((m) => m.row === row).reduce((n, m) => n + getModuleSpec(m.type).hp, 0),
    ),
  }
}

describe('War Pigs Industrial triplet machine #211', () => {
  it('ships one attributed arrangement under Complete patches / War Pigs experiments', () => {
    const complete = PATCH_LIBRARY.find((node) => node.id === 'complete')
    if (!complete || complete.kind !== 'collection') throw new Error('Missing Complete patches')
    const collection = complete.children.find((node) => node.id === 'war-pigs-experiments')
    if (!collection || collection.kind !== 'collection') throw new Error('Missing War Pigs')
    const entry = libraryPatches(collection.children).find(
      (patch) => patch.id === 'war-pigs-industrial-triplets',
    )
    expect(entry?.source).toBe(source)
    expect(entry?.attribution.author).toContain('Black Sabbath')
    expect(entry?.attribution.author).toContain('Jake Brown')
    expect(entry?.attribution.author).not.toContain('MIT')
    expect(entry?.attribution.url).toBe(
      'https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414',
    )
    expect(entry?.tryThis).toMatch(/machinery.*FM INDEX/)
    expect([...(entry?.exercises ?? [])].sort()).toEqual(
      ['clock', 'env', 'fmop', 'mix', 'noise', 'osc', 'out', 'seq', 'vca', 'vcf'].sort(),
    )
  })

  it('fits all 20 modules on three 84 HP rails with explicit straight CLOCKs and steady FM', () => {
    const { patch } = read(source)
    expect(patch).toMatchObject({ railHp: 84, rows: 3 })
    expect(budget(patch)).toEqual({ hp: 192, rows: [71, 60, 61] })
    const counts = Object.fromEntries(
      [...new Set(patch.modules.map((m) => m.type))].map((type) => [
        type,
        patch.modules.filter((m) => m.type === type).length,
      ]),
    )
    expect(counts).toEqual({
      seq: 3,
      clock: 3,
      osc: 2,
      fmop: 1,
      noise: 1,
      vcf: 2,
      vca: 3,
      env: 3,
      mix: 1,
      out: 1,
    })
    for (const module of patch.modules.filter((m) => m.type === 'clock'))
      expect(module.values).toMatchObject({ division: 6, swingMode: 'off', offset: 0 })
    for (const module of patch.modules.filter((m) => m.type === 'seq')) {
      expect(typeof module.values.steps).toBe('string')
      expect(module.values.rate).toBe(1)
    }
    expect(patch.modules.find((m) => m.type === 'out')?.values).toEqual({ bpm: 56, vol: 0.8 })
    expect(patch.modules.find((m) => m.type === 'fmop')?.values).toMatchObject({
      attackMode: 'off',
      decayMode: 'off',
    })
    expect(patch.modules.find((m) => m.type === 'mix')?.values).toMatchObject({
      name1: 'anchor',
      name2: 'machinery',
      name3: 'low',
    })
    const body = sourceBody(source)
    expect(body.match(/\.slow\(6\)/g)).toHaveLength(3)
    expect(body).not.toMatch(
      /fmattack|fmdecay|fmsustain|swingBy|\.late|\.fast|\.ply|\.degrade|\.sometimes|rand|unison|\.noise|\.delay|\.room|\.bus|\.soft|\.distort|\.shape/,
    )
  })

  it('rejects an otherwise valid rack over the module or rail budget', () => {
    const patch = structuredClone(read(source).patch)
    patch.modules.push({
      id: 'vca4',
      type: 'vca',
      row: 1,
      hp: 60,
      look: 'instrument',
      values: { level: 0.1 },
    })
    expect(() => validateRack(patch)).not.toThrow()
    expect(() => budget(patch)).toThrow(/budget/)
  })

  it('retains executable bytes and saved identity through both ENV fan-outs', () => {
    const document = readLibraryPatch({ source })
    expect(document.layout).toBe('restored')
    expect(generate(document.patch)).toBe(source)
    expect(generate(document)).toBe(source)
    const fanOut = (env: string) =>
      document.patch.cables.filter((c) => c.from.module === env).map((c) => c.to)
    expect(fanOut('env1')).toEqual([
      { module: 'vcf1', jack: 'cv' },
      { module: 'vca1', jack: 'cv' },
    ])
    expect(fanOut('env2')).toEqual([
      { module: 'vcf2', jack: 'cv' },
      { module: 'vca2', jack: 'cv' },
    ])
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(sourceBody(source))
    expect(read(saved.source).patch).toEqual(document.patch)
    const anchor = editDocument(document, setValue(document.patch, 'env1', 'rel', 0.1))
    expect(sourceBody(anchor.source)).toContain('.lprelease(0.1)')
    expect(sourceBody(anchor.source)).toContain('.release(0.1)')
    expect(read(anchor.source).patch).toEqual(anchor.patch)
    const noise = editDocument(document, setValue(document.patch, 'env2', 'rel', 0.1))
    expect(sourceBody(noise.source)).toContain('.bprelease(0.1)')
    expect(sourceBody(noise.source)).toContain('.release(0.1)')
    expect(read(noise.source).patch).toEqual(noise.patch)
    expect(read(source).patch).toEqual(document.patch)
  })
})
