import { describe, expect, it } from 'vitest'
import { CATALOG, VCF, SEQ } from '../modules/catalog'
import { demoPatch } from '../patch/demo'
import { generate, generateDocument } from '../codegen/generate'
import { emptyPatch, type Patch } from '../patch/types'
import {
  cableSignal,
  connect,
  depthControl,
  draggedValue,
  freePosition,
  placeModule,
  removeCable,
  removeModule,
  setValue,
  sequenceText,
  snap,
  starterPatch,
  validateRack,
} from './model'

const ref = (module: string, jack: string) => ({ module, jack })
function add(patch: Patch, type: string, row = 1) {
  return placeModule(patch, type, row)
}
const sounding = (patch: Patch) => generate(patch).split('// ── @monkeyboy')[0]

describe('rack editing', () => {
  it('converts only the sounding SEQ cells to text', () => {
    let patch = setValue(demoPatch(), 'seq1', 'len', 4)
    const before = sounding(patch)
    const seq = patch.modules.find((m) => m.id === 'seq1')
    const steps = seq?.values.steps
    if (
      !seq ||
      !Array.isArray(steps) ||
      !steps.every((step): step is string => typeof step === 'string')
    )
      throw new Error('Missing fixture')
    patch = setValue(patch, 'seq1', 'steps', sequenceText(seq, steps))
    expect(sounding(patch)).toBe(before)
  })
  it('includes displayed rests when SEQ LEN grows, retaining inactive notes on shrink', () => {
    let patch = setValue(demoPatch(), 'seq1', 'len', 16)
    expect(sounding(patch)).toContain('note("c2 c2 eb2 g2 c3 bb2 g2 eb2 ~ ~ ~ ~ ~ ~ ~ ~")')
    patch = setValue(patch, 'seq1', 'len', 4)
    expect(sounding(patch)).toContain('note("c2 c2 eb2 g2")')
    patch = setValue(patch, 'seq1', 'len', 16)
    expect(sounding(patch)).toContain('note("c2 c2 eb2 g2 c3 bb2 g2 eb2 ~ ~ ~ ~ ~ ~ ~ ~")')
  })
  it('starts silent and permits every catalog module with defaults and no overlaps', () => {
    let patch = starterPatch()
    expect(sounding(patch)).not.toContain('$:')
    expect(patch.cables).toEqual([{ id: 'c1', from: ref('mix1', 'out'), to: ref('out1', 'in') }])
    for (const [index, spec] of CATALOG.entries()) {
      if (spec.id !== 'out') patch = add(patch, spec.id, index + 1)
    }
    expect(patch.modules.map((m) => m.type)).toEqual(
      expect.arrayContaining(CATALOG.map((s) => s.id)),
    )
    expect(() => add(patch, 'out')).toThrow('Duplicate unique')
    expect(validateRack(patch)).toBe(patch)
  })
  it('chooses nearest free HP, rejects full rows, and moves without pushing neighbors', () => {
    let patch = add(emptyPatch(), 'mix', 0)
    patch = placeModule(patch, 'out', 0, 24)
    expect(freePosition(patch, 'vcf', 0, 20)).toBe(14)
    patch = placeModule(patch, 'vcf', 0, 20)
    expect(patch.modules.find((m) => m.id === 'vcf1')?.hp).toBe(14)
    expect(patch.modules.find((m) => m.id === 'out1')?.hp).toBe(24)
    patch = placeModule(patch, 'vcf', 1, 5, 'vcf1')
    expect(patch.modules.find((m) => m.id === 'vcf1')).toMatchObject({ row: 1, hp: 5 })
    for (let i = 0; i < 5; i++) patch = placeModule(patch, 'vcf', 2)
    expect(() => placeModule(patch, 'drums', 2)).not.toThrow() // 14 HP remaining
    patch = placeModule(patch, 'drums', 2)
    expect(freePosition(patch, 'osc', 2, 0)).toBeNull()
    expect(() => placeModule(patch, 'osc', 2)).toThrow('No room')
  })
  it('patches a voice and generates edits immediately, including folded mixer gain', () => {
    let patch = add(add(starterPatch(), 'seq'), 'osc')
    patch = connect(patch, ref('seq1', 'note'), ref('osc1', 'note'))
    patch = connect(patch, ref('osc1', 'out'), ref('mix1', 'in1'))
    expect(sounding(patch)).toContain('.s("sawtooth")')
    patch = setValue(patch, 'osc1', 'wave', 'square')
    patch = setValue(patch, 'mix1', 'ch1', 0.5)
    expect(sounding(patch)).toContain('.s("square")')
    expect(sounding(patch)).toContain('.postgain(0.5)')
    expect(() => setValue(patch, 'mix1', 'ch1', 2)).toThrow()
  })
  it('keeps occupied connections until explicit replacement; cancelling a reroute is a no-op', () => {
    const patch = add(demoPatch(), 'osc', 1)
    const before = structuredClone(patch)
    expect(() => connect(patch, ref('osc2', 'out'), ref('vcf1', 'in'))).toThrow('occupied')
    expect(patch).toEqual(before)
    const next = connect(patch, ref('osc2', 'out'), ref('vcf1', 'in'), true)
    expect(next.cables.filter((c) => c.to.module === 'vcf1')).toHaveLength(1)
    expect(next.cables.find((c) => c.to.module === 'vcf1')?.from.module).toBe('osc2')
  })
  it('blocks wrong directions, self links, cycles, signal conflicts through passthroughs and ENV misuse', () => {
    let patch = add(add(demoPatch(), 'iter'), 'env')
    expect(() => connect(patch, ref('vcf1', 'in'), ref('vca1', 'in'), true)).toThrow()
    expect(() => connect(patch, ref('vcf1', 'out'), ref('vcf1', 'in'), true)).toThrow('cycles')
    expect(() => connect(patch, ref('vca1', 'out'), ref('vcf1', 'in'), true)).toThrow('cycles')
    expect(() => connect(patch, ref('env1', 'out'), ref('iter1', 'in'))).toThrow('ENV')
    patch = connect(patch, ref('iter1', 'out'), ref('vcf1', 'in'), true)
    expect(() => connect(patch, ref('seq1', 'note'), ref('iter1', 'in'))).toThrow('signal')
    expect(() => connect(patch, ref('env1', 'out'), ref('vca1', 'cv'))).not.toThrow()
  })
  it('deletes incident cables and names without bridging a broken chain', () => {
    const patch = { ...demoPatch(), names: { 'vcf1:out': 'filter' } }
    const next = removeModule(patch, 'vcf1')
    expect(next.modules.some((m) => m.id === 'vcf1')).toBe(false)
    expect(next.cables.some((c) => c.from.module === 'vcf1' || c.to.module === 'vcf1')).toBe(false)
    expect(next.cables.some((c) => c.from.module === 'osc1' && c.to.module === 'vca1')).toBe(false)
    expect(next.names).toEqual({})
    expect(sounding(next)).not.toContain('$:')
  })
  it('uses target units and resets LFO depth when repatched, including passthroughs', () => {
    let patch = add(add(demoPatch(), 'lfo'), 'iter')
    patch = connect(patch, ref('lfo1', 'out'), ref('iter1', 'in'))
    patch = connect(patch, ref('iter1', 'out'), ref('vcf1', 'cv'))
    const lfo = patch.modules.find((m) => m.id === 'lfo1')
    const depth = CATALOG.find((s) => s.id === 'lfo')?.controls.find((c) => c.id === 'depth')
    if (!lfo || depth?.kind !== 'knob') throw new Error('Missing fixture')
    expect(depthControl(patch, lfo, depth)).toMatchObject({
      min: -10000,
      max: 10000,
      default: 1600,
      unit: 'Hz',
    })
    patch = setValue(patch, 'lfo1', 'depth', 2000)
    expect(sounding(patch)).toContain('.range(800, 2800)')
    const cable = patch.cables.find((c) => c.to.module === 'vcf1' && c.to.jack === 'cv')
    if (!cable) throw new Error('Missing fixture')
    patch = connect(patch, cable.from, ref('vca1', 'cv'), false, cable.id)
    expect(sounding(patch)).toContain('.range(0.3, -0.2)')
    expect(cableSignal(patch, ref('iter1', 'out'))).toBe('mod')
  })
  it('deleting the input to a chained CODE leaves its fragment silent and preserved', () => {
    let patch = add(demoPatch(), 'code')
    patch = setValue(patch, 'code1', 'text', '.chunk(8, x => x.hurry(2))')
    patch = connect(patch, ref('vca1', 'out'), ref('code1', 'in'))
    patch = connect(patch, ref('code1', 'out'), ref('out1', 'in'), true)
    patch = removeModule(patch, 'vca1')
    expect(sounding(patch)).not.toContain('$:')
    expect(patch.modules.find((m) => m.id === 'code1')).toBeDefined()
    expect(generate(patch)).toContain('.chunk(8, x => x.hurry(2))')
  })

  it('removes a single cable and retains disconnected module values', () => {
    const patch = demoPatch()
    const next = removeCable(patch, 'c1')
    expect(next.modules).toEqual(patch.modules)
    expect(next.cables).toHaveLength(patch.cables.length - 1)
  })
})

describe('numeric gestures and source ownership', () => {
  it('snaps to detents or catalog steps and uses log drag response', () => {
    const rate = SEQ.controls.find((c) => c.id === 'rate')
    const cutoff = VCF.controls.find((c) => c.id === 'cutoff')
    const time = CATALOG.find((s) => s.id === 'delay')?.controls.find((c) => c.id === 'time')
    if (rate?.kind !== 'knob' || cutoff?.kind !== 'knob' || time?.kind !== 'knob')
      throw new Error('Missing fixture')
    expect(snap(rate, 0.8)).toBe(1)
    expect(snap(time, 0.378)).toBe(0.38)
    expect(draggedValue(cutoff, 0.5)).toBe(632)
    expect(draggedValue(cutoff, -1)).toBe(20)
    expect(draggedValue(cutoff, 2)).toBe(20000)
  })
  it('maps selection to exact generated calls for repeated modules, CV, tempo and mixer gain', () => {
    let patch = add(add(demoPatch(), 'env'), 'mix', 2)
    patch = connect(patch, ref('env1', 'out'), ref('vcf1', 'cv'))
    patch = connect(patch, ref('vca1', 'out'), ref('mix1', 'in1'))
    patch = connect(patch, ref('mix1', 'out'), ref('out1', 'in'), true)
    const doc = generateDocument(patch)
    const owned = (id: string) =>
      doc.ranges[id]?.map((r) => doc.code.slice(r.start, r.end)).join('\n') ?? ''
    expect(doc.code).toBe(generate(patch))
    expect(owned('out1')).toBe('setcpm(120/4)')
    expect(owned('vcf1')).toContain('.lpf(800)')
    expect(owned('vcf1')).not.toContain('.s(')
    expect(owned('env1')).toContain('.lpattack(0.01)')
    expect(owned('mix1')).toContain('.postgain(0.8)')
    expect(owned('mix2')).toBe('')
  })
})
