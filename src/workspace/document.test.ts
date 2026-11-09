import { describe, expect, it } from 'vitest'
import { demoPatch } from '../patch/demo'
import { generate } from '../codegen/generate'
import { read, tryRead } from '../reader'
import {
  connect,
  insertRow,
  removeRow,
  removeCable,
  placeModule,
  renameOutput,
  setLook,
  setValue,
  starterPatch,
} from '../rack/model'
import { editDocument, fromPatch, replaceLayout, saveLayout, sourceBody } from './document'

describe('source-owned workspace', () => {
  it('keeps executable text exact when changing looks or layout and reopens all rack state', () => {
    const original = read("// keep me\r\n$: note('c3 e3').s('sine').lpf(800) // tail\r\n")
    const filter = original.patch.modules.find((m) => m.type === 'vcf')
    if (!filter) throw new Error('Missing filter')
    const changed = editDocument(original, setLook(original.patch, filter.id, 'vintage'))
    expect(sourceBody(changed.source)).toBe(original.source)
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(read(changed.source).patch.modules.find((m) => m.id === filter.id)?.look).toBe('vintage')
  })
  it('saves empty rails as presentation metadata without touching imported source', () => {
    const original = saveLayout(
      read("// exact 🐒\r\n$: note('c3').s('sine').chunk(4,x=>x.rev()) /* tail */\r\n"),
    )
    const changed = editDocument(original, insertRow(original.patch, 0))
    expect(sourceBody(changed.source)).toBe(sourceBody(original.source))
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(changed.patch.rows).toBe(2)
    const removed = editDocument(changed, removeRow(changed.patch, 1))
    expect(sourceBody(removed.source)).toBe(sourceBody(original.source))
    const invalid = changed.source.replace('"rows": 2', '"rows": "2"')
    expect(read(invalid).layout).toBe('invalid')
    expect(generate(read(invalid))).toBe(invalid)
    expect(read(changed.source.replace('"rows": 2', '"rows": 0')).layout).toBe('invalid')
    expect(read(changed.source.replace('"rows": 2', '"rows": 0.5')).layout).toBe('invalid')
  })
  it('splices imported literal values without dropping quotes, comments, unsupported code, or identity', () => {
    const original = saveLayout(
      read("// hello 🐒\r\n$: note('c3').s('sine').lpf(800) /* filter */.chunk(4,x=>x.rev())\r\n"),
    )
    const filter = original.patch.modules.find((m) => m.type === 'vcf')
    if (!filter) throw new Error('Missing filter')
    const changed = editDocument(original, setValue(original.patch, filter.id, 'cutoff', 1200))
    expect(sourceBody(changed.source)).toBe(
      sourceBody(original.source).replace('lpf(800)', 'lpf(1200)'),
    )
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(changed.patch.modules.find((m) => m.id === filter.id)?.values.cutoff).toBe(1200)
  })
  it.each([
    {
      type: 'seq',
      control: 'steps',
      source: "note('c2 e2 g2').s('sine')",
      value: ['d2', 'e2', 'g2'],
      expected: `note('d2 e2 g2').s('sine')`,
    },
    {
      type: 'drums',
      control: 'grid',
      source: "s('[bd ~]*4').bank('RolandTR808')",
      value: [{ sample: 'bd', steps: [1, 0, 1, 0, 1, 0, 1, 1] }],
      expected: `s('bd ~ bd ~ bd ~ bd bd').bank('RolandTR808')`,
    },
  ] as const)(
    'splices $type grid edits into source and restores exact rack identity',
    ({ type, control, source, value, expected }) => {
      const original = saveLayout(
        read(`// keep 🐒\r\n$: ${source} /* tail */.chunk(4,x=>x.rev())\r\n`),
      )
      const module = original.patch.modules.find((m) => m.type === type)
      if (!module) throw new Error('Missing source module')
      const next = setValue(original.patch, module.id, control, value)
      const changed = editDocument(original, next)
      expect(sourceBody(changed.source)).toBe(sourceBody(original.source).replace(source, expected))
      expect(read(changed.source).patch).toEqual(next)
    },
  )
  it('preserves imported declarations and references when renaming a named fan-out', () => {
    const original = saveLayout(
      read(
        "// preserve\nconst lead = note('c3').s('sine');\n$: lead.lpf(800);\n$: lead.gain(0.5);\n",
      ),
    )
    const key = Object.keys(original.patch.names)[0]
    if (!key) throw new Error('Missing name')
    const changed = editDocument(original, renameOutput(original.patch, key, 'melody'))
    expect(sourceBody(changed.source)).toBe(
      sourceBody(original.source).replaceAll('lead', 'melody'),
    )
    expect(read(changed.source).patch.names[key]).toBe('melody')
    expect(() => editDocument(changed, renameOutput(changed.patch, key, 'note'))).toThrow()
  })
  it('does not rename opaque references or regenerate imported structures', () => {
    const original = saveLayout(
      read("const lead = note('c3').s('sine');\n$: lead;\n$: lead.jux(x => lead);\n"),
    )
    const key = Object.keys(original.patch.names)[0]
    if (!key) throw new Error('Missing name')
    expect(() => editDocument(original, renameOutput(original.patch, key, 'melody'))).toThrow(
      /CODE references/,
    )
    const cable = original.patch.cables[0]
    if (!cable) throw new Error('Missing cable')
    expect(() => editDocument(original, removeCable(original.patch, cable.id))).toThrow(
      /structural/,
    )
    expect(sourceBody(editDocument(original, placeModule(original.patch, 'vcf', 3)).source)).toBe(
      sourceBody(original.source),
    )
    expect(generate(original)).toBe(original.source)
  })
  it('writes and restores disconnected values, looks, and cables after canonical structural edits', () => {
    const original = fromPatch(starterPatch())
    const changed = editDocument(original, placeModule(original.patch, 'vcf', 1))
    const filter = changed.patch.modules.find((m) => m.type === 'vcf')
    if (!filter) throw new Error('Missing filter')
    const value = editDocument(changed, setValue(changed.patch, filter.id, 'cutoff', 1500))
    expect(read(value.source).patch).toEqual(value.patch)
  })
  it('keeps invalid drafts out of the reader and refuses unknown metadata replacement', () => {
    const original = fromPatch(starterPatch())
    expect(tryRead('$: note(').kind).toBe('invalid')
    const invalid = read(original.source.replace('"version": 1', '"version": 2'))
    expect(() => saveLayout(invalid)).toThrow(/explicitly/)
    expect(generate(invalid)).toBe(invalid.source)
  })
  it('rejects forged source metadata rather than restoring another sounding graph', () => {
    const original = saveLayout(read("$: note('c3').s('sine').lpf(800)\n"))
    const forged = original.source.replace('"cutoff": 800', '"cutoff": 1800')
    const loaded = read(forged)
    expect(loaded.layout).toBe('invalid')
    expect(loaded.patch.modules.find((m) => m.type === 'vcf')?.values.cutoff).toBe(800)
  })
})

describe('canonical workspace names and metadata', () => {
  it('keeps a chosen declaration after reducing fan-out to a single cable', () => {
    let patch = placeModule(starterPatch(), 'seq', 1)
    patch = placeModule(patch, 'osc', 1)
    patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in2' })
    let doc = fromPatch(patch)
    doc = editDocument(doc, renameOutput(doc.patch, 'osc1:out', 'lead'))
    const cable = doc.patch.cables.find((c) => c.to.module === 'mix1' && c.to.jack === 'in2')
    if (!cable) throw new Error('Missing cable')
    doc = editDocument(doc, removeCable(doc.patch, cable.id))
    expect(sourceBody(doc.source)).toContain('const lead =')
    expect(read(doc.source).patch.names['osc1:out']).toBe('lead')
    const looked = editDocument(doc, setLook(doc.patch, 'osc1', 'vintage'))
    expect(read(looked.source).patch).toEqual(looked.patch)
  })
  it('retains complete saved state through metadata-only changes on the silent starter', () => {
    const original = fromPatch(starterPatch())
    const looked = editDocument(original, setLook(original.patch, 'mix1', 'learner', true))
    expect(sourceBody(looked.source)).toBe(sourceBody(original.source))
    expect(read(looked.source).patch).toEqual(looked.patch)
    expect(looked.patch.cables).toHaveLength(1)
  })
})

it('reconciles external edits, rewrites current bindings, and reopens their layout', () => {
  const original = fromPatch(demoPatch())
  const source = original.source.replace('.lpf(800)', '.lpf(1400)')
  const readBack = read(source)
  expect(readBack.layout).toBe('reconciled')
  const saved = saveLayout(readBack)
  expect(sourceBody(saved.source)).toBe(sourceBody(source))
  expect(read(saved.source).patch).toEqual(saved.patch)
  expect(saved.patch.modules.find((m) => m.id === 'vcf1')?.values.cutoff).toBe(1400)
})

it('splices tempo units without removing comments inside the expression', () => {
  const original = saveLayout(
    read("// tempo\nsetcpm(120 /* keep */ / 4)\n$: note('c3').s('sine')\n"),
  )
  const out = original.patch.modules.find((m) => m.type === 'out')
  if (!out) throw new Error('Missing output')
  const changed = editDocument(original, setValue(original.patch, out.id, 'bpm', 140))
  expect(sourceBody(changed.source)).toBe(
    sourceBody(original.source).replace('120 /* keep */', '140 /* keep */'),
  )
  const cps = saveLayout(read("setcps(0.5) // 120 BPM\n$: note('c3').s('sine')\n"))
  const output = cps.patch.modules.find((m) => m.type === 'out')
  if (!output) throw new Error('Missing output')
  expect(
    sourceBody(editDocument(cps, setValue(cps.patch, output.id, 'bpm', 180)).source),
  ).toContain('setcps(0.75) // 120 BPM')
})

describe('review regressions', () => {
  it('saves identical anonymous voices and retains their distinct identities within the unchanged snapshot', () => {
    const original = saveLayout(read("$: s('bd')\n$: s('bd')\n"))
    const drums = original.patch.modules.filter((module) => module.type === 'drums')
    expect(drums).toHaveLength(2)
    const first = drums[0],
      second = drums[1]
    if (!first || !second) throw new Error('Missing drums')
    expect(first.id).not.toBe(second.id)
    const changed = editDocument(original, setLook(original.patch, second.id, 'vintage'))
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(changed.patch.modules.find((m) => m.id === first.id)?.look).toBe('instrument')
    expect(changed.patch.modules.find((m) => m.id === second.id)?.look).toBe('vintage')
    const source = changed.source.replace("s('bd')", "s('sd')")
    const edited = read(source)
    expect(edited.layout).toBe('reconciled')
    expect(
      edited.patch.modules
        .filter((m) => m.type === 'drums')
        .every((m) => m.id !== first.id && m.id !== second.id),
    ).toBe(true)
  })
  it('accepts valid source after declarations shift the generated scope IDs', () => {
    const original = fromPatch(demoPatch())
    const source = `const x = 1;\n${original.source}`
    const saved = saveLayout(read(source))
    expect(sourceBody(saved.source)).toBe(sourceBody(source))
    expect(read(saved.source).patch).toEqual(saved.patch)
  })

  it('accepts deleting the first generated voice while preserving the remaining orbit', () => {
    let patch = starterPatch()
    for (const row of [1, 2]) {
      patch = placeModule(patch, 'seq', row)
      patch = placeModule(patch, 'osc', row)
      patch = connect(
        patch,
        { module: `seq${row}`, jack: 'note' },
        { module: `osc${row}`, jack: 'note' },
      )
      patch = connect(
        patch,
        { module: `osc${row}`, jack: 'out' },
        { module: 'mix1', jack: `in${row}` },
      )
    }
    patch = setValue(patch, 'osc2', 'wave', 'sine')
    const original = fromPatch(patch)
    const source = original.source.replace(/\$:[\s\S]*?(?=\$:)/, '')
    const saved = saveLayout(read(source))
    expect(sourceBody(saved.source)).toBe(sourceBody(source))
    expect(sourceBody(saved.source)).toContain('.orbit(2)')
    expect(read(saved.source).patch).toEqual(saved.patch)
  })

  it('splices imported envelope amount even without a connected ENV module', () => {
    const original = saveLayout(read("$: note('c3').s('sine').lpf(800).lpenv(2)\n"))
    const filter = original.patch.modules.find((m) => m.type === 'vcf')
    if (!filter) throw new Error('Missing filter')
    const next = editDocument(original, setValue(original.patch, filter.id, 'envAmt', 6))
    expect(sourceBody(next.source)).toBe("$: note('c3').s('sine').lpf(800).lpenv(6)\n")
    expect(read(next.source).patch.modules.find((m) => m.id === filter.id)?.values.envAmt).toBe(6)
    const forged = original.source.replace('"envAmt": 2', '"envAmt": 6')
    const restored = read(forged)
    expect(restored.layout).toBe('invalid')
    expect(restored.patch.modules.find((m) => m.type === 'vcf')?.values.envAmt).toBe(2)
  })

  it('replaces invalid metadata without discarding statements or comments after it', () => {
    const original = fromPatch(demoPatch())
    const tail = "// keep this voice\n$: note('c4').s('sine')\n"
    const source = `${original.source}${tail}`
    const doc = read(source)
    expect(doc.layout).toBe('invalid')
    expect(sourceBody(source)).toBe(`${sourceBody(original.source)}${tail}`)
    const replaced = replaceLayout(doc)
    expect(sourceBody(replaced.source)).toBe(`${sourceBody(original.source)}${tail}`)
    expect(replaced.patch.modules.filter((m) => m.type === 'seq')).toHaveLength(2)
    expect(read(replaced.source).patch).toEqual(replaced.patch)
  })
})
