import { describe, expect, it } from 'vitest'
import { generate, generateDocument } from '../codegen/generate'
import { writeLayout } from '../codegen/layout'
import { getModuleSpec } from '../modules/catalog'
import { read } from '../reader'
import { nextPosition, defaultRailWidth, railWidth, RAIL_WIDTHS } from './layout'
import {
  placeModule,
  placementPosition,
  setRailWidth,
  starterPatch,
  validateRack,
} from '../rack/model'
import { editDocument, fromPatch, saveLayout, sourceBody } from '../workspace/document'
import legacy from '../reader/fixtures/pre-133-output.strudel?raw'
import longVoice from '../reader/fixtures/issue-44.strudel?raw'

describe('per-patch rails and pinned output (#133)', () => {
  it('chooses the widest complete case that fits, with 64 HP as the fallback', () => {
    expect([700, 1100, 1280, 1440, 1920].map(defaultRailWidth)).toEqual([64, 64, 84, 104, 104])
    expect(railWidth(read('$: s("bd")').patch)).toBe(64)
  })

  it.each(RAIL_WIDTHS)('uses %i HP for placement and spill without moving neighbors', (width) => {
    const patch = starterPatch(width)
    const original = structuredClone(patch.modules)
    const position = placementPosition(patch, 'vcf', 0, width - 10)
    expect(position).toEqual({ row: 0, hp: width - 22 })
    const next = placeModule(patch, 'vcf', position.row, position.hp)
    expect(next.modules.slice(0, 2)).toEqual(original)
    expect(read(generate(next)).patch).toEqual(next)
    expect(nextPosition([], 'vcf', 2, width - 9, width)).toEqual({ row: 3, hp: 0 })
    expect(nextPosition(patch.modules, 'code', 0, width - 14, width)).toEqual({ row: 1, hp: 0 })
  })

  it('frees OUT space, forbids moving OUT, and refuses width reductions without reflow', () => {
    let patch = placeModule(starterPatch(104), 'vcf', 0, 80)
    expect(() => setRailWidth(patch, 84)).toThrow('past the rail')
    expect(patch.railHp).toBe(104)
    expect(() => placeModule(patch, 'out', 3, 0, 'out1')).toThrow('pinned')
    patch = placeModule(patch, 'vcf', 1, 0)
    expect(patch.modules.at(-1)).toMatchObject({ row: 1, hp: 0 })
  })

  it('retains legacy source exactly while restamping OUT without a position', () => {
    const document = read(legacy)
    expect(document.layout).toBe('restored')
    expect(generate(document)).toBe(legacy)
    expect(railWidth(document.patch)).toBe(64)
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(sourceBody(legacy))
    const output = generateDocument(saved.patch).layout.modules.find((m) => m.type === 'out')
    expect(output).toMatchObject({ id: 'out2', row: 0, hp: 0 })
    const json = JSON.parse(
      saved.source
        .split('// ── @monkeyboy rack v1 ──\n')[1]
        ?.split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3))
        .join('\n') ?? '',
    )
    expect(json.modules.find((m: { type: string }) => m.type === 'out')).not.toHaveProperty('row')
    expect(json.modules.find((m: { type: string }) => m.type === 'out')).not.toHaveProperty('hp')
    expect(read(saved.source).patch).toEqual(saved.patch)
  })

  it.each(RAIL_WIDTHS)('auto-places and reconciles a long import within saved %i HP', (width) => {
    const document = read(longVoice)
    const saved = editDocument(saveLayout(document), setRailWidth(document.patch, width))
    const editedSource = saved.source.replace('.room(.6)', '.room(.6).chunk(4,x=>x.rev()).iter(4)')
    const edited = read(editedSource)
    expect(edited.layout).toBe('reconciled')
    expect(edited.patch.railHp).toBe(width)
    expect(() => validateRack(edited.patch)).not.toThrow()
    for (const module of edited.patch.modules.filter((m) => m.type !== 'out'))
      expect(module.hp + getModuleSpec(module.type).hp).toBeLessThanOrEqual(width)
    expect(read(saveLayout(edited).source).patch).toEqual(edited.patch)
  })

  it('places a newly imported effect after retained positions beyond 64 HP on the same wide rail', () => {
    let patch = placeModule(starterPatch(104), 'mix', 1, 0, 'mix1')
    patch = placeModule(patch, 'seq', 0, 0)
    patch = placeModule(patch, 'osc', 0, 12)
    patch = placeModule(patch, 'vcf', 0, 70)
    patch.cables.push(
      { id: 'c2', from: { module: 'seq1', jack: 'note' }, to: { module: 'osc1', jack: 'note' } },
      { id: 'c3', from: { module: 'osc1', jack: 'out' }, to: { module: 'vcf1', jack: 'in' } },
      { id: 'c4', from: { module: 'vcf1', jack: 'out' }, to: { module: 'mix1', jack: 'in1' } },
    )
    patch.prelude = 'const tone = "sine";'
    const source = generate(patch).replace('.lpq(1)', '.lpq(1).room(0.4).roomsize(4)')
    const document = read(source)
    expect(document.layout).toBe('reconciled')
    expect(document.patch.modules.find((m) => m.type === 'reverb')).toMatchObject({
      row: 0,
      hp: 80,
    })
    expect(() => validateRack(document.patch)).not.toThrow()
    expect(sourceBody(saveLayout(document).source)).toBe(sourceBody(source))
  })

  it('rejects invalid widths and off-rail metadata while retaining executable bytes', () => {
    const document = fromPatch(placeModule(starterPatch(104), 'vcf', 0, 80))
    const bad = read(document.source.replace('"railHp": 104', '"railHp": 64'))
    expect(bad.layout).toBe('invalid')
    expect(sourceBody(bad.source)).toBe(sourceBody(document.source))
    expect(railWidth(bad.patch)).toBe(64)
    for (const width of [0, 65, 84.5, '84', null]) {
      const layout = generateDocument(starterPatch()).layout
      const source = `${sourceBody(document.source)}${writeLayout(layout).replace('"railHp": 64', `"railHp": ${JSON.stringify(width)}`)}`
      expect(read(source).layout).toBe('invalid')
    }
  })
})
