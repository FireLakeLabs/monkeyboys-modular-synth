import { SAMPLE_EDITS } from './fixtures'
import { beforeAll, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { parseSource } from '../reader/syntax'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { dropSound, replaceDrumRow, seatedResources, variantCount } from './crate'
import { FACTORY_PACKS, packKey } from './packs'
let runtime: Record<string, unknown>
beforeAll(async () => {
  runtime = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs'].map((p) => import(/* @vite-ignore */ p)),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(expression: string) {
  // Only repository-owned fixtures enter this pinned-engine query.
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(
    ...Object.keys(runtime),
    `return (${expression}).queryArc(0,4,{_cps:.5}).filter(h=>h.hasOnset()).map(h=>{const {orbit,...value}=h.value;return {begin:h.whole.begin.toString(),end:h.whole.end.toString(),value}})`,
  )(...Object.values(runtime))
}
function voice(source: string) {
  const scope = parseSource(source).scopes.find((scope) => scope.kind === 'voice')
  if (!scope) throw new Error('Missing voice')
  return source.slice(scope.start, scope.end)
}
const forms = [
  [
    'smpl',
    's("bd hh").begin(.1).end(.9).loop(1).loopBegin(.2).loopEnd(.8)',
    { begin: 0.1, end: 0.9, loop: 1, loopBegin: 0.2, loopEnd: 0.8 },
  ],
  ['smpl', 's("bd hh").loopb(.2).loope(.8)', { loopBegin: 0.2, loopEnd: 0.8 }],
  ['smpl', 'note("c3 e3").s("piano").n(1)', { sample: 'piano', n: 1 }],
  ['reverb', 's("bd").room(.5).roomsize(4).ir("hh:1")', { ir: 'hh:1' }],
  [
    'wavetable',
    's("wt_test:1").wt(.4).warp(.2).warpmode("spin")',
    { sample: 'wt_test:1', wt: 0.4, warp: 0.2, warpmode: 'spin' },
  ],
  ['wavetable', 'note("c3 e3").s("wt_test").wt(.4)', { sample: 'wt_test', wt: 0.4 }],
  ...['slice', 'splice', 'chop', 'striate'].flatMap((mode) => [
    [
      'splice',
      `s("breaks165").${mode}(${['slice', 'splice'].includes(mode) ? '4, "0 2 1 3"' : '4'})`,
      { mode, count: 4 },
    ] as const,
    [
      'splice',
      `s("breaks165 breaks125").${mode}(${['slice', 'splice'].includes(mode) ? '4, "0 2 1 3"' : '4'})`,
      { mode, count: 4 },
    ] as const,
  ]),
] as const
it.each(forms)(
  '%s reads %s with independent source, saved-rack and event proof',
  (type, expression, values) => {
    const source = `// retain 🐒\r\n$: ${expression} // retain\r\n`
    const document = read(source)
    expect(document.patch.modules.find((m) => m.type === type)?.values).toMatchObject(values)
    expect(document.patch.modules.filter((m) => m.type === 'code')).toHaveLength(0)
    expect(generate(document)).toBe(source)
    const saved = saveLayout(document)
    expect(read(saved.source).patch).toEqual(saved.patch)
    const generated = generate(document.patch)
    expect(read(generated).patch).toEqual(document.patch)
    expect(events(voice(generated))).toEqual(events(expression))
    expect(events(expression).length).toBeGreaterThan(0)
  },
)
it.each(['drums', 'smpl', 'reverb', 'wavetable', 'splice'])(
  'drops a variant on %s and reopens the full rack',
  (type) => {
    let patch = starterPatch()
    patch = setValue(patch, 'mix1', 'ch1', 1)
    patch = placeModule(patch, 'drums', 1)
    patch = setValue(patch, 'drums1', 'grid', '[bd ~]*2, hh*4')
    if (type === 'reverb') {
      patch = placeModule(patch, 'smpl', 3)
      patch = setValue(patch, 'smpl1', 'bank', '')
      patch = connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
    }
    if (type !== 'drums') {
      patch = placeModule(patch, type, 2)
      patch = connect(
        patch,
        { module: type === 'reverb' ? 'smpl1' : 'drums1', jack: 'out' },
        { module: `${type}1`, jack: type === 'wavetable' ? 'note' : 'in' },
      )
    }
    const target = type === 'drums' ? 'drums1' : `${type}1`
    // DRUMS needs the existing sampler boundary before reaching the mixer.
    if (type === 'drums') {
      patch = placeModule(patch, 'smpl', 2)
      patch = setValue(patch, 'smpl1', 'bank', '')
      patch = connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
    }
    patch = connect(
      patch,
      { module: type === 'drums' ? 'smpl1' : target, jack: 'out' },
      { module: 'mix1', jack: 'in1' },
    )
    const before = read(generate(patch))
    const next = dropSound(
      before.patch,
      target,
      { name: type === 'wavetable' ? 'wt_test' : 'hh', n: 1 },
      0,
    )
    const changed = editDocument(before, next)
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(generate(read(changed.source))).toBe(changed.source)
    const expected =
      type === 'drums'
        ? 's("[hh:1 ~]*2, hh*4")'
        : type === 'smpl'
          ? 's("[bd ~]*2, hh*4").s("hh:1")'
          : type === 'reverb'
            ? 's("[bd ~]*2, hh*4").room(.5).roomsize(4).ir("hh:1")'
            : type === 'wavetable'
              ? 's("[bd ~]*2, hh*4").s("wt_test:1").wt(.4).warp(.2).warpmode("spin")'
              : 's("[bd ~]*2, hh*4").s("hh:1").slice(4,"0 1 2 3")'
    expect(events(voice(changed.source))).toEqual(events(expected))
  },
)
it('replaces only the chosen row atoms and preserves all timing, rests and other rows', () => {
  expect(replaceDrumRow('[bd:2 ~ bd!2]*2, [sd ~]*4', 0, { name: 'hh', n: 1 })).toBe(
    '[hh:1 ~ hh:1!2]*2, [sd ~]*4',
  )
  expect(() =>
    dropSound(placeModule(starterPatch(), 'wavetable', 1), 'wavetable1', { name: 'bd', n: 0 }),
  ).toThrow('wt_')
})
it('edits imported tape literals in both directions without changing surrounding bytes', () => {
  const source = '// tape\n$: s("bd hh").begin(.1).end(.9).loop(1).loopBegin(.2).loopEnd(.8)\n'
  const document = saveLayout(read(source))
  const sampler = document.patch.modules.find((m) => m.type === 'smpl')
  if (!sampler) throw new Error('Missing sampler')
  const edited = editDocument(document, setValue(document.patch, sampler.id, 'loopBegin', 0.3))
  expect(sourceBody(edited.source)).toBe(source.replace('loopBegin(.2)', 'loopBegin(0.3)'))
  expect(read(edited.source).patch).toEqual(edited.patch)
  const external = read(edited.source.replace('.end(.9)', '.end(.7)'))
  expect(external.patch.modules.find((m) => m.id === sampler.id)?.values['end']).toBe(0.7)
  expect(events(voice(edited.source))).toEqual(
    events(voice(source.replace('loopBegin(.2)', 'loopBegin(.3)'))),
  )
})
it('keeps unseated session inventory out and counts pitched n variants per note', () => {
  const resource = {
    key: packKey(FACTORY_PACKS[0]),
    pack: FACTORY_PACKS[0],
    status: 'registered' as const,
    sounds: [],
    names: [],
    base: null,
    sampleCount: 0,
    error: null,
  }
  const old = { ...resource, key: 'old', pack: { source: 'https://old.test/strudel.json' } }
  expect(seatedResources(read(''), [resource, old])).toEqual([resource])
  expect(variantCount({ c3: ['a', 'b'], c4: ['c'] })).toBe(2)
})

it.each(SAMPLE_EDITS)(
  'edits $type.$control, preserving exact source, saved rack and events',
  (form) => {
    const source = `// keep\n$: ${form.source} // keep\n`
    const document = saveLayout(read(source))
    const module = document.patch.modules.find((module) => module.type === form.type)
    if (!module) throw new Error('Missing sample module')
    if (form.control === 'mode') {
      expect(() =>
        editDocument(document, setValue(document.patch, module.id, form.control, form.value)),
      ).toThrow('Cannot safely edit')
      const canonical = read(generate(document.patch))
      const edited = editDocument(
        canonical,
        setValue(canonical.patch, module.id, form.control, form.value),
      )
      expect(read(edited.source).patch).toEqual(edited.patch)
      expect(events(voice(edited.source))).toEqual(
        events(form.source.replace(form.before, form.after)),
      )
      return
    }
    const edited = editDocument(
      document,
      setValue(document.patch, module.id, form.control, form.value),
    )
    expect(sourceBody(edited.source)).toBe(source.replace(form.before, form.after))
    expect(read(edited.source).patch).toEqual(edited.patch)
    expect(events(voice(edited.source))).toEqual(
      events(form.source.replace(form.before, form.after)),
    )
  },
)
it.each(['slice(4,foo)', 'chop(foo)', 'splice(0,"0")', 'striate(0)'])(
  'does not invent a slicer for unsupported %s',
  (call) => {
    const source = `$: s("arpy").${call}\n`
    const document = read(source)
    expect(generate(document)).toBe(source)
    expect(document.patch.modules.some((module) => module.type === 'splice')).toBe(false)
    expect(document.patch.modules.some((module) => module.type === 'code')).toBe(true)
  },
)

it('drops on a banked DRUMS row without re-banking the chosen sound or changing other rows', () => {
  let patch = starterPatch()
  patch = placeModule(patch, 'drums', 1)
  patch = setValue(patch, 'drums1', 'grid', '[bd:2 ~]*2, hh*4')
  patch = placeModule(patch, 'smpl', 2)
  patch = connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
  patch = connect(patch, { module: 'smpl1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const next = dropSound(patch, 'drums1', { name: 'RolandTR808_sd', n: 1 }, 0)
  expect(events(voice(generate(next)))).toEqual(
    events('s("[RolandTR808_sd:1 ~]*2, RolandTR909_hh*4").postgain(.8)'),
  )
  expect(read(generate(next)).patch).toEqual(next)
})

it.each(['s("wt_test").wt(.4).warp(.2).warpmode("spin")', 's("arpy").splice(4,"0 1 2 3")'])(
  'retains previously saved CODE ownership for %s',
  (expression) => {
    let patch = starterPatch()
    patch = placeModule(patch, 'code', 1)
    patch = setValue(patch, 'code1', 'text', expression)
    patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    const source = generate(patch),
      document = read(source)
    expect(document.patch).toEqual(patch)
    expect(generate(document)).toBe(source)
    expect(document.patch.modules.some((module) => module.type === 'code')).toBe(true)
    expect(events(voice(generate(document.patch)))).toEqual(events(expression + '.postgain(.8)'))
  },
)
it('allows arbitrarily indexed sample cards without the manual N knob limiting the inventory', () => {
  let patch = placeModule(starterPatch(), 'smpl', 1)
  patch = dropSound(patch, 'smpl1', { name: 'samplebank', n: 150 })
  expect(patch.modules.find((module) => module.id === 'smpl1')?.values).toMatchObject({
    sample: 'samplebank:150',
    bank: '',
    n: 0,
  })
  expect(() =>
    setValue(placeModule(starterPatch(), 'wavetable', 1), 'wavetable1', 'sample', 'bd'),
  ).toThrow()
})

it('retains a saved slicing suffix CODE without introducing a default slicer in its receiver', () => {
  let patch = starterPatch()
  for (const [row, type] of ['drums', 'code', 'smpl'].entries())
    patch = placeModule(patch, type, row + 1)
  patch = setValue(patch, 'drums1', 'grid', 'arpy')
  patch = setValue(patch, 'code1', 'text', '.chop(4)')
  patch = setValue(patch, 'smpl1', 'bank', '')
  patch = connect(patch, { module: 'drums1', jack: 'out' }, { module: 'code1', jack: 'in' })
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
  patch = connect(patch, { module: 'smpl1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  const source = generate(patch),
    document = read(source)
  expect(document.patch).toEqual(patch)
  expect(generate(document)).toBe(source)
  expect(events(voice(generate(document.patch)))).toEqual(events('s("arpy").chop(4).postgain(.8)'))
})
