import { describe, expect, it, vi } from 'vitest'
import type { ModuleSpec } from '../modules/types'
import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { read } from '../reader'
import { generate } from './generate'

// A catalog-only extension proves that call/CV handling does not depend on module IDs.
vi.mock('../modules/catalog', async (importOriginal) => {
  const catalog = await importOriginal<typeof import('../modules/catalog')>()
  const spec: ModuleSpec = {
    ...catalog.VCA,
    id: 'bound',
    controls: [
      {
        kind: 'knob',
        id: 'amount',
        label: 'AMOUNT',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.2,
        omitAt: 0,
        call: { method: 'pan', argument: { kind: 'number' } },
        modulation: { min: -1, max: 1, default: 0.4 },
      },
    ],
    jacks: [
      { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
      { id: 'amount-mod', label: 'CV', direction: 'in', signal: 'mod', cvTarget: 'amount' },
      { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
    ],
    strudel: ['pan'],
  }
  return {
    ...catalog,
    CATALOG: [...catalog.CATALOG.filter((item) => item.id !== 'pan'), spec],
    getModuleSpec: (id: string) => (id === spec.id ? spec : catalog.getModuleSpec(id)),
  }
})

function fixture() {
  let patch = starterPatch()
  for (const type of ['seq', 'osc', 'bound', 'lfo']) patch = placeModule(patch, type, 1)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'bound1', jack: 'in' })
  return connect(patch, { module: 'bound1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
}

describe('catalog-only call extension', () => {
  it('writes and reads a bound control without a module adapter', () => {
    const patch = fixture()
    const source = generate(patch)
    expect(source).toContain('.pan(0.2)')
    const plain = read('$: note("c3").s("sine").pan(0.7)')
    expect(plain.patch.modules.find((module) => module.type === 'bound')?.values.amount).toBe(0.7)
    expect(plain.patch.modules.some((module) => module.type === 'code')).toBe(false)
    expect(read(source).patch).toEqual(patch)
    expect(generate(setValue(patch, 'bound1', 'amount', 0))).not.toContain('.pan(')
  })

  it('uses the catalog CV jack and target for generation, projection and saved ownership', () => {
    const patch = connect(
      setValue(fixture(), 'lfo1', 'mode', 'STEP'),
      { module: 'lfo1', jack: 'out' },
      { module: 'bound1', jack: 'amount-mod' },
    )
    const source = generate(patch)
    expect(source).toContain('.pan(sine.slow(4).range(0.2, 0.6))')
    expect(read(source).patch).toEqual(patch)
    const plain = read('$: note("c3").s("sine").pan(sine.slow(4).range(0.2, 0.6))')
    expect(plain.patch.cables).toContainEqual(
      expect.objectContaining({ to: { module: 'bound1', jack: 'amount-mod' } }),
    )
    expect(plain.bindings).toContainEqual(
      expect.objectContaining({
        role: 'cv',
        target: { module: 'bound1', jack: 'amount-mod', control: 'amount' },
      }),
    )
    expect(plain.patch.modules.some((module) => module.type === 'code')).toBe(false)
  })
})

it.each(['SMOOTH', 'STEP', 'ENV', 'CV SEQ'])(
  'uses catalog-only CV bindings for %s, including omitted base values',
  (mode) => {
    let patch = setValue(fixture(), 'bound1', 'amount', 0)
    const source = mode === 'ENV' ? 'env' : mode === 'CV SEQ' ? 'cvseq' : 'lfo'
    if (source !== 'lfo') patch = placeModule(patch, source, 2)
    if (source === 'lfo') patch = setValue(patch, 'lfo1', 'mode', mode)
    if (source === 'cvseq') patch = setValue(patch, 'cvseq1', 'steps', '<0 .5 1>')
    patch = connect(
      patch,
      { module: `${source}1`, jack: 'out' },
      { module: 'bound1', jack: 'amount-mod' },
    )
    const code = generate(patch)
    expect(read(code).patch).toEqual(patch)
    if (mode === 'SMOOTH') expect(code).toContain('.pan(0)\n  .lfo({ c: "pan"')
    if (mode === 'ENV') expect(code).toContain('.pan(0)\n  .env({ c: "pan"')
    if (mode === 'CV SEQ') expect(code).toContain('.pan("<0 .5 1>")')
  },
)

it('orders repeated stages from catalog-owned bindings without a module adapter', () => {
  let patch = placeModule(fixture(), 'bound', 2)
  patch = connect(patch, { module: 'bound1', jack: 'out' }, { module: 'bound2', jack: 'in' })
  patch = connect(patch, { module: 'bound2', jack: 'out' }, { module: 'mix1', jack: 'in1' }, true)
  const code = generate(patch)
  expect(code).toContain('.FX(pan(0.2))\n  .FX(pan(0.2))')
  expect(read(code).patch).toEqual(patch)
  const imported = read('$: note("c3").s("sine").FX(pan(.2),pan(.7))')
  expect(
    imported.patch.modules.filter((m) => m.type === 'bound').map((m) => m.values.amount),
  ).toEqual([0.2, 0.7])
  expect(imported.patch.modules.some((m) => m.type === 'code')).toBe(false)
})
