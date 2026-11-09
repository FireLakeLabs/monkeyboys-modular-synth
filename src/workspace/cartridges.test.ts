import { parse } from 'acorn'
import { beforeAll, describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { demoPatch } from '../patch/demo'
import { read } from '../reader'
import { setValue, setLook, insertRow } from '../rack/model'
import { FACTORY_PACKS, packSetup, packStatement, sampleCalls, userPack } from '../samples/packs'
import {
  cartridges,
  ejectPack,
  ownedPacks,
  packUsers,
  seatPack,
  withFactoryPacks,
} from './cartridges'
import { editDocument, fromPatch, makeRackEditable, saveLayout, sourceBody } from './document'
import { createDocumentHistory } from './history'

const pack = userPack('github:someone/drums/dev')
const imported =
  "// keep 🐒\r\nsamples('github:other/sounds'); // source-owned\r\nconst helper = 2;\r\n$: s('bd*2').gain(.3) /* tail */\r\n"

describe('sample cartridge ownership', () => {
  it('seats/ejects one owned call without rewriting imported setup, comments, or the rack', () => {
    const original = saveLayout(read(imported))
    const seated = seatPack(original, pack)
    expect(sourceBody(seated.source)).toBe(packSetup([pack]) + sourceBody(original.source))
    expect(seated.patch).toEqual({ ...original.patch, cartridges: [pack] })
    expect(ownedPacks(read(seated.source))).toEqual([pack])
    expect(generate(read(seated.source))).toBe(seated.source)
    expect(read(seated.source).patch).toEqual(seated.patch)
    expect(seatPack(seated, pack)).toBe(seated)
    const ejected = ejectPack(seated, pack)
    expect(sourceBody(ejected.source)).toBe(sourceBody(original.source))
    expect(ejected.patch).toEqual(original.patch)
    expect(
      cartridges(ejected).find((entry) => entry.pack?.source === 'github:other/sounds')?.ownership,
    ).toBe('source')
    expect(() => ejectPack(ejected, { source: 'github:other/sounds' })).toThrow(/source-owned/)
  })

  it('preserves layout, values, helpers and ownership across rack edits, conversion, undo and reopen', () => {
    const original = fromPatch({ ...demoPatch(), prelude: 'const helper = 2;', rows: 5 })
    const seated = seatPack(original, pack)
    const edited = editDocument(
      seated,
      setLook(setValue(seated.patch, 'vcf1', 'cutoff', 1200), 'osc1', 'vintage'),
    )
    const row = editDocument(edited, insertRow(edited.patch, 0))
    const converted = makeRackEditable(row)
    expect(
      sampleCalls(sourceBody(converted.source)).filter((call) => call.pack?.source === pack.source),
    ).toHaveLength(1)
    expect(read(converted.source).patch).toEqual(converted.patch)
    expect(ownedPacks(converted)).toEqual([pack])
    expect(converted.patch.prelude).toBe('const helper = 2;')
    expect(ejectPack(converted, pack).patch.modules).toEqual(converted.patch.modules)
    const history = createDocumentHistory(original)
    history.accept(seated)
    expect(history.step('undo')?.source).toBe(original.source)
    expect(history.step('redo')?.source).toBe(seated.source)
  })

  it('does not acquire ownership from a plain imported call or stale/forged saved claims', () => {
    const source = `${packStatement(pack)}\n$: s('bd')\n`
    const plain = saveLayout(read(source))
    expect(ownedPacks(plain)).toEqual([])
    expect(cartridges(plain).at(-1)?.ownership).toBe('source')
    const seated = seatPack(fromPatch(demoPatch()), pack)
    const changed = read(seated.source.replace(pack.source, 'github:someone/other'))
    expect(ownedPacks(changed)).toEqual([])
    const voiceEdit = read(seated.source.replace('.lpf(800)', '.lpf(900)'))
    expect(ownedPacks(voiceEdit)).toEqual([pack])
    expect(ownedPacks(seatPack(voiceEdit, { source: 'github:other/pack' }))).toHaveLength(2)
    expect(generate(changed)).toBe(changed.source)
    const forged = read(
      seated.source.replace('"cartridges": [', '"cartridges": [{"source":"github:forged/pack"},'),
    )
    expect(forged.layout).toBe('reconciled')
    expect(ownedPacks(forged)).toEqual([])
    expect(generate(forged)).toBe(forged.source)
  })

  it('preserves proven setup through formatting changes without duplicate conversion or truncation', () => {
    const seated = seatPack(fromPatch(demoPatch()), pack)
    const formatted = read('//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n' + seated.source)
    expect(formatted.layout).toBe('restored')
    expect(ownedPacks(formatted)).toEqual([pack])
    const converted = makeRackEditable(formatted)
    expect(
      sampleCalls(sourceBody(converted.source)).filter((call) => call.pack?.source === pack.source),
    ).toHaveLength(1)
    expect(generate(formatted)).toBe(formatted.source)
    const newlySeated = seatPack(formatted, { source: 'github:another/pack' })
    expect(sourceBody(newlySeated.source).replace("samples('github:another/pack');\n", '')).toBe(
      sourceBody(formatted.source),
    )
    expect(
      cartridges(newlySeated).find((entry) => entry.pack?.source === pack.source)?.ownership,
    ).toBe('bay')
    expect(() => withFactoryPacks(formatted)).not.toThrow()
  })

  it('exports the two pinned factory packs once and reopens the complete saved rack', () => {
    const original = seatPack(fromPatch({ ...demoPatch(), rows: 5 }), pack)
    const exported = withFactoryPacks(original)
    expect(sampleCalls(sourceBody(exported.source)).map((call) => call.pack)).toEqual([
      ...FACTORY_PACKS,
      pack,
    ])
    expect(withFactoryPacks(read(exported.source)).source).toBe(exported.source)
    expect(read(exported.source).patch).toEqual(exported.patch)
    expect(exported.patch.modules).toEqual(original.patch.modules)
    expect(exported.patch.cables).toEqual(original.patch.cables)
    for (const factory of FACTORY_PACKS) {
      expect(
        sampleCalls(sourceBody(exported.source)).filter(
          (call) => call.pack?.source === factory.source,
        ),
      ).toHaveLength(1)
      expect(() => ejectPack(exported, factory)).toThrow(/stay seated/)
    }
    const plain = read(`${packStatement(FACTORY_PACKS[0])}\n${imported}`)
    const result = withFactoryPacks(plain)
    expect(
      sampleCalls(sourceBody(result.source)).filter(
        (call) => call.pack?.source === FACTORY_PACKS[0].source,
      ),
    ).toHaveLength(1)
    expect(sourceBody(result.source)).toContain(plain.source)
    expect(ownedPacks(result)).not.toContainEqual(FACTORY_PACKS[0])
  })

  it('warns for active/default sample names, banked names and opaque CODE before ejection', () => {
    expect(packUsers(read('$: s("bd*4").bank("RolandTR909")'), ['RolandTR909_bd'])).toContain(
      'drums1',
    )
    expect(packUsers(read('$: s("bd*4")'), ['unrelated'])).toEqual([])
    expect(packUsers(read('$: s("bd*4")'), [])).toContain('drums1')
    expect(packUsers(read('$: s("bd").unknown()'), ['unrelated'])).toContain('code1')
  })
})

let runtime: Record<string, unknown>
beforeAll(async () => {
  const entries = ['@strudel/core', '@strudel/mini/mini.mjs']
  runtime = Object.assign(
    {},
    ...(await Promise.all(entries.map((entry) => import(/* @vite-ignore */ entry)))),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})
function events(source: string): unknown {
  const statement = parse(source, { ecmaVersion: 'latest' }).body.find(
    (node) => node.type === 'LabeledStatement',
  )
  if (statement?.type !== 'LabeledStatement' || statement.body.type !== 'ExpressionStatement')
    throw new Error('Missing voice')
  const voice = source.slice(statement.body.expression.start, statement.body.expression.end)
  // Repository-owned fixture only; compare pinned-engine events independently of source/rack checks.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    ...Object.keys(runtime),
    `return (${voice}).queryArc(0, 2).map(h => ({ value:h.value, begin:h.whole.begin.toString(), end:h.whole.end.toString() }))`,
  )
  return run(...Object.values(runtime))
}
it('retains exact pinned-engine voice events through seat, export, reopen and eject', () => {
  const original = read(imported)
  const exported = withFactoryPacks(seatPack(original, pack))
  const reopened = read(exported.source)
  const ejected = ejectPack(reopened, pack)
  expect(events(original.source)).toHaveLength(4)
  expect(events(exported.source)).toEqual(events(original.source))
  expect(events(reopened.source)).toEqual(events(original.source))
  expect(events(ejected.source)).toEqual(events(original.source))
})
