import { parse } from 'acorn'
import { beforeAll, describe, expect, it } from 'vitest'
import { getModuleSpec } from '../modules/catalog'
import { connect, placeModule, renameOutput, setValue, starterPatch } from '../rack/model'
import { read } from '../reader'
import { resizeSong } from '../rack/arranger'
import type { Patch } from '../patch/types'
import { applyRackEdit, editDocument, saveLayout, sourceBody } from '../workspace/document'
import { generate } from './generate'

let runtime: Record<string, unknown>
beforeAll(async () => {
  const loaded = await Promise.all(
    ['@strudel/core', '@strudel/mini/mini.mjs'].map(
      async (entry) => import(/* @vite-ignore */ entry),
    ),
  )
  runtime = Object.assign({}, ...loaded)
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
})

interface Onset {
  cycle: number
  at: number
  begin: string
  s: string
  note: string
  orbit: string
}
/** Onsets per labelled voice from the pinned core, for repository-owned fixtures only. */
function onsets(source: string, cycles: number): Onset[][] {
  let body = sourceBody(source)
  for (const statement of [...parse(body, { ecmaVersion: 'latest' }).body].reverse()) {
    if (statement.type !== 'LabeledStatement' || statement.body.type !== 'ExpressionStatement')
      continue
    body =
      body.slice(0, statement.start) +
      `voices.push(${body.slice(statement.body.expression.start, statement.body.expression.end)})` +
      body.slice(statement.end)
  }
  // oxlint-disable-next-line typescript/no-implied-eval
  const voices: unknown = new Function(
    ...Object.keys(runtime),
    `const voices = []; const setcpm = () => {}; ${body}; return voices.map(voice => voice.queryArc(0, ${cycles}).filter(h => h.hasOnset()).map(h => ({ cycle: Math.floor(h.whole.begin.valueOf()), at: h.whole.begin.valueOf(), begin: h.whole.begin.toFraction(), s: String(h.value.s), note: String(h.value.note ?? ''), orbit: String(h.value.orbit) })).sort((a, b) => a.at - b.at))`,
  )(...Object.values(runtime))
  if (!Array.isArray(voices)) throw new Error('Missing voices')
  return voices as Onset[][]
}

/** Connects a module's output to another's first chain input, or a named jack. */
function link(patch: Patch, from: string, to: string, jack?: string): Patch {
  const type = (id: string) => patch.modules.find((module) => module.id === id)?.type ?? ''
  const output = getModuleSpec(type(from)).jacks.find((item) => item.direction === 'out')
  const input =
    jack ??
    getModuleSpec(type(to)).jacks.find((item) => item.direction === 'in' && !item.cvTarget)?.id
  if (!output || !input) throw new Error('Missing test jack')
  return connect(patch, { module: from, jack: output.id }, { module: to, jack: input })
}

const cycles = (events: Onset[]) => [...new Set(events.map((event) => event.cycle))]
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

/** A three-voice song: drums throughout, bass from cycle 4, lead in the second half. */
function song(): Patch {
  let patch = starterPatch(104)
  for (const [row, type] of ['drums', 'smpl', 'seq', 'osc', 'seq', 'osc'].entries())
    patch = placeModule(patch, type, row + 1)
  patch = setValue(patch, 'drums1', 'grid', 'bd hh sd hh')
  patch = setValue(patch, 'seq1', 'steps', '<c2 eb2 g2>')
  patch = setValue(patch, 'seq2', 'steps', 'c4 eb4 g4')
  patch = setValue(patch, 'osc2', 'wave', 'square')
  patch = link(link(patch, 'drums1', 'smpl1'), 'smpl1', 'mix1', 'in1')
  patch = link(link(patch, 'seq1', 'osc1'), 'osc1', 'mix1', 'in2')
  patch = link(link(patch, 'seq2', 'osc2'), 'osc2', 'mix1', 'in3')
  patch = setValue(patch, 'mix1', 'arr2', '<0!4 1!12>')
  patch = setValue(patch, 'mix1', 'arr3', '<0!8 1!8>')
  return patch
}

const ARRANGE_FORM = `setcpm(120/4)

const drums = s("bd hh sd hh").orbit(1)
const bass = note("<c2 eb2 g2>").s("sawtooth").orbit(2)
const lead = note("c4 eb4 g4").s("square").orbit(3)

$: arrange([4, drums], [4, stack(drums, bass)], [8, stack(drums, bass, lead)])
`

describe('#141 spike: per-voice mask lanes against arrange() sections', () => {
  const lanes = generate(song())

  it('writes one mask per arranged channel, before routing, keeping one orbit per voice', () => {
    const body = sourceBody(lanes)
    expect(body).toContain('.mask("<0!4 1!12>")\n  .postgain(0.8)\n  .orbit(2)')
    expect(body).toContain('.mask("<0!8 1!8>")\n  .postgain(0.8)\n  .orbit(3)')
    expect(body.match(/\.mask\(/g)).toHaveLength(2)
    expect(body.match(/^\$: /gm)).toHaveLength(3)
  })

  it('plays each voice only in its lane cycles, in global song time, then loops', () => {
    const [drums = [], bass = [], lead = []] = onsets(lanes, 32)
    expect(cycles(drums)).toEqual(range(0, 32))
    expect(cycles(bass)).toEqual([...range(4, 16), ...range(20, 32)])
    expect(cycles(lead)).toEqual([...range(8, 16), ...range(24, 32)])
    // The alternation keeps its own cycle count: cycle 8 is still the third bass note.
    expect(bass.find((event) => event.cycle === 8)?.note).toBe('g2')
    expect([drums, bass, lead].map((voice) => [...new Set(voice.map((e) => e.orbit))])).toEqual([
      ['1'],
      ['2'],
      ['3'],
    ])
  })

  it('arrange() restarts section time, so the same song changes notes and folds voices', () => {
    const [arranged = []] = onsets(ARRANGE_FORM, 32)
    const masked = onsets(lanes, 32).flat()
    const key = (e: Onset) => `${e.begin} ${e.s} ${e.note} ${e.orbit}`
    // Same onset times and orbits; only the bass alternation's phase differs.
    expect(arranged.map((e) => `${e.begin} ${e.s} ${e.orbit}`).toSorted()).toEqual(
      masked.map((e) => `${e.begin} ${e.s} ${e.orbit}`).toSorted(),
    )
    const differing = arranged.filter((e) => !masked.map(key).includes(key(e)))
    // 24 of 200 onsets: bass notes in the drop and in the second pass of the song.
    expect(differing).toHaveLength(24)
    expect(differing.every((e) => e.s === 'sawtooth')).toBe(true)
    expect(arranged.find((e) => e.s === 'sawtooth' && e.cycle === 8)?.note).toBe('c2')
  })

  it('reads the lane form back as rack controls with exact source and saved identity', () => {
    const doc = read(lanes)
    expect(doc.layout).toBe('restored')
    expect(generate(doc)).toBe(lanes)
    expect(doc.patch).toEqual(song())
    const plain = read(sourceBody(lanes))
    expect(generate(plain)).toBe(sourceBody(lanes))
    const mix = plain.patch.modules.find((module) => module.type === 'mix')
    expect([mix?.values.arr1, mix?.values.arr2, mix?.values.arr3]).toEqual([
      undefined,
      '<0!4 1!12>',
      '<0!8 1!8>',
    ])
    expect(plain.patch.modules.filter((module) => module.type === 'code')).toHaveLength(3)
    expect(
      plain.patch.modules
        .filter((module) => module.type === 'code')
        .every(
          ({ values: { text } }) => typeof text === 'string' && /^\.orbit\(\d\)$/.test(text.trim()),
        ),
    ).toBe(true)
  })

  it('now projects static sections (#244), retaining exact bytes and inner orbit CODE', () => {
    const doc = read(ARRANGE_FORM)
    expect(generate(doc)).toBe(ARRANGE_FORM)
    expect(doc.patch.modules.some((module) => module.type === 'sections')).toBe(true)
    expect(doc.patch.modules.some((module) => module.type === 'seq')).toBe(true)
    expect(doc.patch.modules.filter((module) => module.type === 'code')).toHaveLength(3)
    expect(
      doc.patch.modules
        .filter((module) => module.type === 'code')
        .every(
          (m) => typeof m.values.text === 'string' && /^\.orbit\(\d\)$/.test(m.values.text.trim()),
        ),
    ).toBe(true)
    const saved = saveLayout(doc)
    expect(sourceBody(saved.source)).toBe(ARRANGE_FORM)
  })
})

describe('arranger lanes on mixer channels', () => {
  it('masks each fan-out branch independently, keeping labels, names and orbits', () => {
    let patch = starterPatch(104)
    patch = placeModule(patch, 'seq', 1)
    patch = placeModule(patch, 'osc', 1, 20)
    patch = link(link(patch, 'seq1', 'osc1'), 'osc1', 'mix1', 'in1')
    patch = link(patch, 'osc1', 'mix1', 'in2')
    patch = renameOutput(patch, 'osc1:out', 'lead')
    patch = setValue(patch, 'mix1', 'arr1', '<1 0>')
    patch = setValue(patch, 'mix1', 'name1', 'verse')
    patch = setValue(patch, 'mix1', 'mute2', 'on')
    patch = setValue(patch, 'mix1', 'arr2', '<0 1>')
    const source = generate(patch)
    const body = sourceBody(source)
    expect(body).toContain('verse: lead\n  .mask("<1 0>")\n  .postgain(0.8)\n  .orbit(1)')
    expect(body).toContain('_$: lead\n  .mask("<0 1>")\n  .postgain(0.8)\n  .orbit(2)')
    const [first = [], second = []] = onsets(source, 4)
    expect(cycles(first)).toEqual([0, 2])
    expect(cycles(second)).toEqual([1, 3])
    const doc = read(source)
    expect(doc.layout).toBe('restored')
    expect(doc.patch).toEqual(patch)
  })

  it('composes nested bus lanes as successive masks and restores the saved rack', () => {
    let patch = starterPatch(104)
    patch = placeModule(patch, 'drums', 1)
    patch = placeModule(patch, 'smpl', 1, 20)
    patch = placeModule(patch, 'mix', 2)
    patch = link(link(patch, 'drums1', 'smpl1'), 'smpl1', 'mix2', 'in1')
    patch = link(patch, 'mix2', 'mix1', 'in1')
    patch = setValue(patch, 'mix2', 'arr1', '<1!2 0!2>')
    patch = setValue(patch, 'mix1', 'arr1', '<1 0>')
    const source = generate(patch)
    expect(sourceBody(source)).toContain('.mask("<1!2 0!2>")\n  .mask("<1 0>")')
    expect(cycles(onsets(source, 8)[0] ?? [])).toEqual([0, 4])
    const doc = read(source)
    expect(doc.layout).toBe('restored')
    expect(doc.patch).toEqual(patch)
  })

  it('follows code edits to a saved rack: changed, added and removed masks', () => {
    const saved = generate(song())
    const lanesOf = (source: string) => {
      const doc = saveLayout(read(source))
      expect(read(doc.source).layout).toBe('restored')
      const mix = doc.patch.modules.find((module) => module.type === 'mix')
      return [mix?.values.arr1 ?? '', mix?.values.arr2 ?? '', mix?.values.arr3 ?? '']
    }
    expect(lanesOf(saved.replace('"<0!8 1!8>"', '"<1 0!15>"'))).toEqual([
      '',
      '<0!4 1!12>',
      '<1 0!15>',
    ])
    expect(lanesOf(saved.replace('.mask("<0!4 1!12>")\n  ', ''))).toEqual(['', '', '<0!8 1!8>'])
    expect(
      lanesOf(saved.replace('.bank("RolandTR909")\n', '.bank("RolandTR909")\n  .mask("<1 0>")\n')),
    ).toEqual(['<1 0>', '<0!4 1!12>', '<0!8 1!8>'])
  })

  it('refuses a lane the reader could not read back', () => {
    expect(() => setValue(song(), 'mix1', 'arr1', '1 0 1 1')).toThrow(/one 0 or 1 per cycle/)
  })
})

describe('imported lanes', () => {
  const imported = `// my song
$: s("bd*4").mask("<1!2 0!2>") // drums enter
$: note("c e").s("sine").mask("<1 0>").lpf(800)
$: s("hh*8").mask("1 0 1 1")
`

  it('reads only final cycle masks; others stay exact CODE', () => {
    const doc = read(imported)
    expect(generate(doc)).toBe(imported)
    const mix = doc.patch.modules.find((module) => module.type === 'mix')
    expect(mix?.values.arr1).toBe('<1!2 0!2>')
    expect(mix?.values.arr2).toBeUndefined()
    expect(mix?.values.arr3).toBeUndefined()
    expect(doc.patch.modules.filter((m) => m.type === 'code').map((m) => m.values.text)).toEqual([
      '.mask("<1 0>")',
      '.mask("1 0 1 1")',
    ])
  })

  it('edits an imported lane literal in place, keeping comments and other bytes', () => {
    const doc = read(imported)
    const next = editDocument(doc, setValue(doc.patch, 'mix1', 'arr1', '<0 1!3>'))
    expect(sourceBody(next.source)).toBe(imported.replace('"<1!2 0!2>"', '"<0 1!3>"'))
    expect(read(next.source).layout).toBe('restored')
    expect(read(next.source).patch).toEqual(next.patch)
  })

  it.each([
    ['inline', '$: s("bd*4").mask("<1 0>") // kick\n', '$: s("bd*4") // kick\n'],
    [
      'on its own line',
      '$: note("c e")\n  .s("sine")\n  // rests\n  .mask("<0 1>")\n  .postgain(0.5)\n',
      '$: note("c e")\n  .s("sine")\n  // rests\n  .postgain(0.5)\n',
    ],
    [
      'after a line comment',
      '$: s("bd") // kick\n  .mask("<1 0>").postgain(0.5)\n',
      '$: s("bd") // kick\n  .postgain(0.5)\n',
    ],
    [
      'with a comment inside',
      '$: s("bd").mask(/* .mask */ "<1 0>").postgain(0.5)\n',
      '$: s("bd").postgain(0.5)\n',
    ],
  ])('clears an imported lane %s by removing only its mask call', (_case, source, cleared) => {
    const doc = read(source)
    const mix = doc.patch.modules.find((module) => module.type === 'mix')
    if (!mix) throw new Error('Missing mixer')
    expect(mix.values.arr1).toBe(source.includes('<1 0>') ? '<1 0>' : '<0 1>')
    const { document, converted } = applyRackEdit(doc, setValue(doc.patch, 'mix1', 'arr1', ''))
    expect(converted).toBe(false)
    expect(sourceBody(document.source)).toBe(cleared)
    expect(read(document.source).layout).toBe('restored')
    expect(read(document.source).patch).toEqual(document.patch)
  })

  it('adds a lane to an imported voice by converting the code, with the lane audible', () => {
    const source = `$: s("bd*4")\n$: s("hh*8")\n`
    const doc = read(source)
    const { document, converted } = applyRackEdit(doc, setValue(doc.patch, 'mix1', 'arr2', '<0 1>'))
    expect(converted).toBe(true)
    expect(sourceBody(document.source)).toContain('.mask("<0 1>")')
    const [kick = [], hats = []] = onsets(document.source, 4)
    expect(cycles(kick)).toEqual([0, 1, 2, 3])
    expect(cycles(hats)).toEqual([1, 3])
    expect(read(document.source).patch).toEqual(document.patch)
  })
})

describe('#230 song length edits', () => {
  it('pads imported literals in place and independently restores complete saved identity', () => {
    const source = `// keep my song\n$: note("<c2 eb2 g2>").s("sine").mask(/* verse */ '<0!4 1!12>') // bass\n$: note("g4").s("square").mask("<1!2 0!2>")\n$: s("hh*4")\n`
    const doc = saveLayout(read(source))
    const patch = resizeSong(doc.patch, 32)
    const { document, converted } = applyRackEdit(doc, patch)
    expect(converted).toBe(false)
    expect(sourceBody(document.source)).toBe(
      source.replace("'<0!4 1!12>'", '"<0!4 1!28>"').replace('"<1!2 0!2>"', '"<1!2 0!30>"'),
    )
    expect(generate(read(document.source))).toBe(document.source)
    expect(read(document.source).layout).toBe('restored')
    expect(read(document.source).patch).toEqual(patch)
  })

  it('extends the final step in pinned-engine events over two new song lengths', () => {
    const patch = song()
    const before = onsets(generate(patch), 64)
    const after = onsets(generate(resizeSong(patch, 32)), 64)
    expect(after[0]).toEqual(before[0]) // the unmasked drums are unchanged
    expect(cycles(after[1] ?? [])).toEqual([...range(4, 32), ...range(36, 64)])
    expect(cycles(after[2] ?? [])).toEqual([...range(8, 32), ...range(40, 64)])
    // Extending the final step deliberately changes later repeats, per the owner decision.
    expect(after[1]?.filter((e) => e.cycle < 16)).toEqual(before[1]?.filter((e) => e.cycle < 16))
    expect(after[1]?.find((e) => e.cycle === 20)?.note).toBe('g2')
    expect(before[1]?.some((e) => e.cycle === 16)).toBe(false)
    expect(after[1]?.some((e) => e.cycle === 16)).toBe(true)
  })
})
