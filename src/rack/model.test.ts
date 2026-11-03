import { describe, expect, it } from 'vitest'
import { CATALOG, VCF, SEQ } from '../modules/catalog'
import { demoPatch } from '../patch/demo'
import { generate, generateDocument } from '../codegen/generate'
import { read } from '../reader'
import { emptyPatch, type Patch } from '../patch/types'
import {
  cableSignal,
  connect,
  depthControl,
  draggedValue,
  keyboardValue,
  freePosition,
  placeModule,
  placementPosition,
  removeCable,
  removeModule,
  setValue,
  sequenceText,
  snap,
  starterPatch,
  validateRack,
  assessConnection,
  cableWarnings,
  removeRow,
  addRow,
  routedModules,
} from './model'

const ref = (module: string, jack: string) => ({ module, jack })
function add(patch: Patch, type: string, row = 1) {
  return placeModule(patch, type, row)
}
const sounding = (patch: Patch) => generate(patch).split('// ── @monkeyboy')[0]

describe('rack editing', () => {
  it('adds a sequence, oscillator and filter before the starter mixer and output without moving neighbors', () => {
    let patch = starterPatch()
    const original = structuredClone(patch.modules)
    for (const type of ['seq', 'osc', 'vcf']) patch = placeModule(patch, type, 0)
    expect([...patch.modules].sort((a, b) => a.hp - b.hp).map((m) => m.type)).toEqual([
      'seq',
      'osc',
      'vcf',
      'mix',
      'out',
    ])
    expect(patch.modules.filter((m) => ['mix', 'out'].includes(m.type))).toEqual(original)
  })
  it('marks modules routed to OUT active even when unity controls emit no source call', () => {
    let patch = placeModule(placeModule(placeModule(starterPatch(), 'seq', 0), 'osc', 0), 'vcf', 1)
    patch = connect(patch, ref('seq1', 'note'), ref('osc1', 'note'))
    patch = connect(patch, ref('osc1', 'out'), ref('mix1', 'in1'))
    patch = setValue(patch, 'mix1', 'ch1', 1)
    expect(generateDocument(patch).ranges['mix1']).toBeUndefined()
    expect(routedModules(patch)).toEqual(new Set(['out1', 'mix1', 'osc1', 'seq1']))
    const cable = patch.cables.find((c) => c.to.module === 'mix1')
    if (!cable) throw new Error('Missing fixture')
    expect(routedModules(removeCable(patch, cable.id))).toEqual(new Set(['out1', 'mix1']))
  })
  it('keeps the final empty rail when deleting from an older v1 file without rows', () => {
    const patch = starterPatch()
    patch.modules.push({ id: 'vcf1', type: 'vcf', row: 1, hp: 0, look: 'instrument', values: {} })
    const next = removeModule(read(generate(patch)).patch, 'vcf1')
    expect(next.rows).toBe(2)
    expect(read(generate(next)).patch).toEqual(next)
  })

  it('protects OUT and removes only explicitly chosen empty rows', () => {
    const patch = placeModule(starterPatch(), 'vcf', 2, 6)
    expect(() => removeModule(patch, 'out1')).toThrow('OUT')
    expect(() => removeRow(patch, 0)).toThrow('empty')
    const next = removeRow(patch, 1)
    expect(next.modules.find((m) => m.id === 'vcf1')).toMatchObject({ row: 1, hp: 6 })
    expect(next.cables).toEqual(patch.cables)
    expect(patch.modules.find((m) => m.id === 'vcf1')?.row).toBe(2)
  })
  it('saves empty rows and retains them after deleting their last module', () => {
    let patch = addRow(starterPatch())
    expect(patch.rows).toBe(2)
    patch = placeModule(patch, 'vcf', 1, 0)
    patch = removeModule(patch, 'vcf1')
    expect(read(generate(patch)).patch).toEqual(patch)
    expect(patch.rows).toBe(2)
    expect(removeRow(patch, 1).rows).toBe(1)
    expect(() => generate({ ...patch, rows: 0 })).toThrow('row')
    expect(() => generate({ ...patch, rows: 1.5 })).toThrow('row')
  })
  it('explains fixed FX order even with a module between the effects', () => {
    let patch = placeModule(
      placeModule(placeModule(demoPatch(), 'reverb', 1), 'iter', 1),
      'delay',
      1,
    )
    patch = connect(patch, ref('vca1', 'out'), ref('reverb1', 'in'))
    patch = connect(patch, ref('reverb1', 'out'), ref('iter1', 'in'))
    expect(assessConnection(patch, ref('iter1', 'out'), ref('delay1', 'in'))).toMatchObject({
      kind: 'warning',
      message: expect.stringContaining('delay before reverb'),
    })
    patch = removeCable(patch, patch.cables.find((c) => c.to.module === 'iter1')?.id ?? '')
    patch = connect(patch, ref('iter1', 'out'), ref('delay1', 'in'))
    expect(assessConnection(patch, ref('reverb1', 'out'), ref('iter1', 'in'))).toMatchObject({
      kind: 'warning',
    })
  })
  it('previews warnings and unresolved signals without mutating the committed patch', () => {
    let patch = placeModule(demoPatch(), 'mix', 1)
    patch = connect(patch, ref('vca1', 'out'), ref('mix1', 'in1'))
    const before = structuredClone(patch)
    expect(assessConnection(patch, ref('vca1', 'out'), ref('mix1', 'in2'))).toMatchObject({
      kind: 'warning',
      signal: 'audio',
    })
    expect(assessConnection(patch, ref('seq1', 'note'), ref('mix1', 'in2')).kind).toBe('blocked')
    expect(patch).toEqual(before)
    patch = placeModule(patch, 'iter', 2)
    expect(assessConnection(patch, ref('iter1', 'out'), ref('mix1', 'in2')).kind).toBe('unresolved')
    patch = placeModule(patch, 'code', 2)
    patch = connect(patch, ref('vca1', 'out'), ref('code1', 'in'))
    expect(assessConnection(patch, ref('code1', 'out'), ref('mix1', 'in2'))).toMatchObject({
      kind: 'unresolved',
      signal: 'audio',
    })
    const split = connect(patch, ref('vca1', 'out'), ref('mix1', 'in2'))
    const cable = split.cables.at(-1)
    if (!cable) throw new Error('Missing fixture')
    expect(cableWarnings(split, cable)).toContain(
      'Audio split plays each connected branch; levels add.',
    )
  })
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
  it('previews and places onto the next rail when the selected rail is full', () => {
    let patch = starterPatch()
    patch = placeModule(patch, 'seq', 0)
    patch = placeModule(patch, 'osc', 0)
    patch = placeModule(patch, 'vcf', 0)
    patch = placeModule(patch, 'vcf', 0)
    const before = structuredClone(patch.modules)
    const position = placementPosition(patch, 'drums', 0, 20)
    expect(position).toEqual({ row: 1, hp: 0 })
    const placed = placeModule(patch, 'drums', position.row, position.hp)
    expect(placed.modules.slice(0, -1)).toEqual(before)
    expect(placed.modules.at(-1)).toMatchObject({ type: 'drums', row: 1, hp: 0 })
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
  it('steps knobs with the catalog scale, fine movement, detents and range keys', () => {
    const cutoff = VCF.controls.find((c) => c.id === 'cutoff')
    const rate = SEQ.controls.find((c) => c.id === 'rate')
    const level = CATALOG.find((s) => s.id === 'vca')?.controls[0]
    if (cutoff?.kind !== 'knob' || rate?.kind !== 'knob' || level?.kind !== 'knob')
      throw new Error('Missing fixture')
    expect(keyboardValue(cutoff, 800, 'ArrowUp')).toBe(857)
    expect(keyboardValue(cutoff, 800, 'ArrowUp', true)).toBe(806)
    expect(keyboardValue(cutoff, 20, 'ArrowDown')).toBe(20)
    expect(keyboardValue(cutoff, 800, 'Home')).toBe(20)
    expect(keyboardValue(cutoff, 800, 'End')).toBe(20000)
    expect(keyboardValue(cutoff, 1200, 'Backspace')).toBe(800)
    expect(keyboardValue(rate, 1, 'ArrowRight')).toBe(2)
    expect(keyboardValue(rate, 1, 'ArrowLeft', true)).toBe(0.5)
    expect(keyboardValue(level, 0.8, 'ArrowUp')).toBe(0.85)
    expect(keyboardValue(level, 0.8, 'ArrowDown', true)).toBe(0.75)
    expect(keyboardValue(level, 1, 'ArrowUp')).toBe(1)
    expect(keyboardValue(level, 0.8, 'Tab')).toBeNull()
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
