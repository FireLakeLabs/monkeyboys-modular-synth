import { describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { setValue, validateRack } from '../rack/model'
import type { Patch } from '../patch/types'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { libraryPatches, PATCH_LIBRARY } from './catalog'
import { readLibraryPatch } from './load'
import source from './patches/war-pigs-dub-afterimage.strudel?raw'

function budget(patch: Patch) {
  validateRack(patch)
  const rail = patch.modules.filter((m) => m.type !== 'out')
  const hp = rail.reduce((n, m) => n + getModuleSpec(m.type).hp, 0)
  if (patch.modules.length > 20 || hp > 189) throw new Error('Dub module/HP budget exceeded')
  return {
    hp,
    rows: [0, 1, 2].map((row) =>
      rail.filter((m) => m.row === row).reduce((n, m) => n + getModuleSpec(m.type).hp, 0),
    ),
  }
}

describe('War Pigs Dub afterimage #212', () => {
  it('ships one custom-attributed entry in the shared collection with next-onset guidance', () => {
    const complete = PATCH_LIBRARY.find((n) => n.id === 'complete')
    if (!complete || complete.kind !== 'collection') throw new Error('Missing Complete')
    const collections = complete.children.filter((n) => n.id === 'war-pigs-experiments')
    expect(collections).toHaveLength(1)
    const entry = libraryPatches(collections).find((e) => e.id === 'war-pigs-dub-afterimage')
    expect(entry?.source).toBe(source)
    expect(entry?.attribution.author).toContain('Black Sabbath')
    expect(entry?.attribution.author).toContain('Jake Brown')
    expect(entry?.attribution.author).not.toContain('MIT')
    expect(entry?.attribution.url).toBe(
      'https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414',
    )
    expect(entry?.tryThis).toMatch(/Mute afterimage.*DELAY MIX.*next reply onset/)
    expect([...(entry?.exercises ?? [])].sort()).toEqual(
      ['seq', 'clock', 'osc', 'vcf', 'vca', 'env', 'pan', 'delay', 'mix', 'out'].sort(),
    )
  })

  it('fits exactly 20 catalog modules / 189 rail HP on the specified three rails', () => {
    const { patch } = read(source)
    expect(patch).toMatchObject({ railHp: 84, rows: 3 })
    expect(budget(patch)).toEqual({ hp: 189, rows: [49, 79, 61] })
    expect(
      Object.fromEntries(
        [...new Set(patch.modules.map((m) => m.type))].map((type) => [
          type,
          patch.modules.filter((m) => m.type === type).length,
        ]),
      ),
    ).toEqual({
      seq: 3,
      clock: 3,
      osc: 3,
      vcf: 1,
      vca: 3,
      env: 3,
      pan: 1,
      delay: 1,
      mix: 1,
      out: 1,
    })
    for (const m of patch.modules.filter((m) => m.type === 'clock'))
      expect(m.values).toMatchObject({ division: 6, swingMode: 'off', offset: 0 })
    for (const m of patch.modules.filter((m) => m.type === 'seq')) {
      expect(typeof m.values.steps).toBe('string')
      expect(m.values.rate).toBe(1)
    }
    expect(patch.modules.find((m) => m.type === 'out')?.values).toEqual({ bpm: 56, vol: 0.8 })
    expect(patch.modules.find((m) => m.type === 'delay')?.values).toMatchObject({
      mode: 'sync',
      sync: 0.125,
      mix: 0.2,
      fdbk: 0.25,
    })
    expect(patch.modules.find((m) => m.type === 'mix')?.values).toMatchObject({
      name1: 'anchor',
      name2: 'afterimage',
      name3: 'low',
    })
    expect(sourceBody(source)).not.toMatch(
      /\.FX|\.room|\.bus|\.fm|\.noise|unison|\.distort|\.shape|\.off\(|\.echo|\.layer|\.jux|swingBy|\.late|\.fast/,
    )
    for (const bpm of [40, 56, 240]) expect(0.125 / (bpm / 240)).toBeLessThanOrEqual(0.75)
  })

  it('rejects an otherwise valid extra module rather than raising the budget', () => {
    const patch = structuredClone(read(source).patch)
    patch.modules.push({
      id: 'vca4',
      type: 'vca',
      row: 0,
      hp: 49,
      look: 'instrument',
      values: { level: 0.1 },
    })
    expect(() => validateRack(patch)).not.toThrow()
    expect(() => budget(patch)).toThrow(/budget/)
  })

  it('preserves executable bytes, complete saved identity and the shared filter/amp envelope', () => {
    const document = readLibraryPatch({ source })
    expect(document.layout).toBe('restored')
    expect(generate(document.patch)).toBe(source)
    expect(generate(document)).toBe(source)
    expect(document.patch.cables.filter((c) => c.from.module === 'env2').map((c) => c.to)).toEqual([
      { module: 'vcf1', jack: 'cv' },
      { module: 'vca2', jack: 'cv' },
    ])
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(sourceBody(source))
    expect(read(saved.source).patch).toEqual(document.patch)
    const edited = editDocument(document, setValue(document.patch, 'env2', 'rel', 0.1))
    expect(sourceBody(edited.source)).toContain('.bprelease(0.1)')
    expect(sourceBody(edited.source)).toContain('.release(0.1)')
    expect(read(edited.source).patch).toEqual(edited.patch)
  })
})

it('preserves pinned-engine onsets and both ENV destinations independently of source/layout', async () => {
  const { parseSource } = await import('../reader/syntax')
  const runtime: Record<string, unknown> = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs', '@strudel/tonal/index.mjs'].map(
        (p) => import(/* @vite-ignore */ p),
      ),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
  const events = (text: string): unknown =>
    parseSource(text)
      .scopes.filter((s) => s.kind === 'voice')
      .map((s) => {
        // Only the committed bundled patch enters this real pinned-engine query.
        // oxlint-disable-next-line typescript/no-implied-eval
        return new Function(
          ...Object.keys(runtime),
          `return (${text.slice(s.start, s.end)}).queryArc(0,18,{_cps:56/240}).filter(h=>h.hasOnset()).map(h=>({begin:Number(h.whole.begin),end:Number(h.whole.end),value:h.value}))`,
        )(...Object.values(runtime))
      })
  const document = readLibraryPatch({ source })
  expect(events(generate(read(saveLayout(document).source).patch))).toEqual(events(source))
  const edited = editDocument(document, setValue(document.patch, 'env2', 'rel', 0.1))
  expect(events(edited.source)).toEqual(
    events(
      source
        .replaceAll('.bprelease(0.15)', '.bprelease(0.1)')
        .replaceAll('.release(0.15)', '.release(0.1)'),
    ),
  )
  expect(events(edited.source)).not.toEqual(events(source))
})
