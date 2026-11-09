import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { applyRackEdit, editDocument, fromPatch, sourceBody } from './document'
import { createDocumentHistory } from './history'
import { addConnectedModule, connectionEnds, discoverModules } from './discovery'

const position = { row: 1, hp: 12 }

describe('connected module discovery', () => {
  it('finds default-compatible jack pairs in either direction without editing the document', () => {
    let patch = placeModule(starterPatch(), 'osc', 1)
    patch = placeModule(patch, 'gates', 2)
    const document = fromPatch(patch)
    const before = structuredClone(document)
    const note = discoverModules(document, { module: 'osc1', jack: 'note' }, position)
    expect(note.some((choice) => choice.type === 'seq' && choice.jack === 'note')).toBe(true)
    expect(note.some((choice) => choice.type === 'lfo')).toBe(false)
    const gate = discoverModules(document, { module: 'gates1', jack: 'out' }, position)
    expect(gate.map((choice) => [choice.type, choice.jack])).toEqual([['seq', 'gate']])
    const fm = discoverModules(document, { module: 'osc1', jack: 'fm' }, position)
    expect(fm.map((choice) => [choice.type, choice.jack])).toEqual([['fmop', 'out']])
    expect(document).toEqual(before)
  })

  it('honors active source mode and never offers a second unique OUT', () => {
    let patch = placeModule(starterPatch(), 'lfo', 1)
    const smooth = discoverModules(fromPatch(patch), { module: 'lfo1', jack: 'out' }, position)
    expect(smooth.some((choice) => choice.type === 'vcf' && choice.jack === 'cv')).toBe(true)
    expect(smooth.some((choice) => choice.type === 'iter')).toBe(false)
    patch = setValue(patch, 'lfo1', 'mode', 'STEP')
    const step = discoverModules(fromPatch(patch), { module: 'lfo1', jack: 'out' }, position)
    expect(step.some((choice) => choice.type === 'iter' && choice.jack === 'in')).toBe(true)
    expect(step.some((choice) => choice.type === 'out')).toBe(false)
  })

  it('places and replaces an occupied input atomically with one-step exact undo/redo and reopen', () => {
    let patch = placeModule(starterPatch(), 'osc', 0)
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const original = fromPatch(patch)
    const anchor = { module: 'mix1', jack: 'in1' }
    const offers = discoverModules(original, anchor, position)
    const offer = offers.find((choice) => choice.type === 'noise')
    expect(offer?.assessment.message).toContain('Replaces the cable')
    expect(original.patch.cables.some((cable) => cable.from.module === 'osc1')).toBe(true)
    const next = editDocument(
      original,
      addConnectedModule(patch, anchor, { type: 'noise', jack: 'out', ...position }),
    )
    expect(next.patch.modules.find((module) => module.id === 'noise1')).toMatchObject(position)
    expect(
      next.patch.cables.filter((cable) => cable.to.module === 'mix1' && cable.to.jack === 'in1'),
    ).toEqual([expect.objectContaining({ from: { module: 'noise1', jack: 'out' } })])
    expect(read(next.source).patch).toEqual(next.patch)
    const history = createDocumentHistory(original)
    history.accept(next)
    expect(history.step('undo')?.source).toBe(original.source)
    expect(history.canUndo).toBe(false)
    expect(history.step('redo')?.patch).toEqual(next.patch)
  })

  it('adds a downstream module with a cable while preserving credits and saved identity', () => {
    const original = read("// @title keep this exactly\n$: note('c3').s('sine');\n")
    const patch = addConnectedModule(
      original.patch,
      { module: 'osc1', jack: 'out' },
      { type: 'vcf', jack: 'in', ...position },
    )
    const next = applyRackEdit(original, patch).document
    expect(sourceBody(next.source)).toContain('// @title keep this exactly')
    expect(
      next.patch.cables.some((cable) => cable.from.module === 'osc1' && cable.to.module === 'vcf1'),
    ).toBe(true)
    expect(read(next.source).patch).toEqual(next.patch)
  })

  it('marks imported rewrites and CODE uncertainty before selection', () => {
    const original = read(
      "// retain\nconst lead = note('c3').s('sine');\n$: lead.lpf(800).gain(.2);\n$: lead.gain(.1);\n",
    )
    const offers = discoverModules(original, { module: 'vcf1', jack: 'cv' }, position)
    const lfo = offers.find((choice) => choice.type === 'lfo')
    expect(lfo?.assessment).toMatchObject({
      kind: 'warning',
      message: expect.stringMatching(/rewrites it in rack style/),
    })
    const document = fromPatch(placeModule(starterPatch(), 'code', 1))
    const opaque = discoverModules(document, { module: 'code1', jack: 'out' }, { row: 2, hp: 0 })
    expect(
      opaque.find((choice) => choice.type === 'vcf' && choice.jack === 'in')?.assessment.kind,
    ).toBe('unresolved')
  })

  it('does not offer a connection whose required source conversion cannot be saved', () => {
    const original = read(
      '$: note("c3").s("sine").custom(x => {\n// @title First\nreturn x;\n})\n// @title Second\n',
    )
    const before = structuredClone(original)
    const offers = discoverModules(original, { module: 'osc1', jack: 'tune' }, position)
    expect(offers.some((choice) => choice.type === 'lfo')).toBe(false)
    expect(original).toEqual(before)
  })

  it('reports no rail space without silently spilling and rejects invalid direction atomically', () => {
    let patch = starterPatch()
    patch = placeModule(patch, 'drums', 1, 0)
    patch = placeModule(patch, 'drums', 1, 14)
    patch = placeModule(patch, 'drums', 1, 28)
    patch = placeModule(patch, 'drums', 1, 42)
    patch = placeModule(patch, 'vca', 1, 56)
    const original = structuredClone(patch)
    const offers = discoverModules(
      fromPatch(patch),
      { module: 'mix1', jack: 'in1' },
      { row: 1, hp: 10 },
    )
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((choice) => choice.position === null)).toBe(true)
    expect(() =>
      addConnectedModule(
        patch,
        { module: 'mix1', jack: 'out' },
        { type: 'noise', jack: 'out', row: 2, hp: 0 },
      ),
    ).toThrow()
    expect(
      connectionEnds(patch, { module: 'mix1', jack: 'out' }, { module: 'mix1', jack: 'out' }),
    ).toBeNull()
    expect(patch).toEqual(original)
  })
})
