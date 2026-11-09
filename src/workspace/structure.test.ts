import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import {
  insertRow,
  connect,
  placeModule,
  removeCable,
  removeModule,
  setLook,
  setValue,
} from '../rack/model'
import type { Patch } from '../patch/types'
import { editDocument, saveLayout, sourceBody } from './document'

const fixture =
  "// exact 🐒\r\nconst helper = x => x.rev(); // unrelated\r\nconst lead = note('c3 e3').s('sine'); // shared\r\n$: lead.lpf(/* cutoff */ 800).gain(.25); // first\r\n$: lead.chunkBack(4, x => x.rev()).gain(.15).orbit(7); // opaque routing\r\n"
const id = (patch: Patch, type: string) => {
  const module = patch.modules.find((module) => module.type === type)
  if (!module) throw new Error(`Missing ${type}`)
  return module.id
}
const cable = (patch: Patch, module: string) => {
  const result = patch.cables.find((cable) => cable.to.module === module && cable.to.jack !== 'cv')
  if (!result) throw new Error('Missing input')
  return result
}

function prepared() {
  let original = saveLayout(read(fixture))
  original = editDocument(original, insertRow(original.patch, 0))
  original = editDocument(original, placeModule(original.patch, 'iter', 3))
  original = editDocument(
    original,
    setValue(original.patch, id(original.patch, 'iter'), 'steps', 2),
  )
  original = editDocument(original, setLook(original.patch, id(original.patch, 'iter'), 'monolith'))
  return original
}

describe('planned imported structure', () => {
  it('connects and bypasses a transform without rewriting shared source, CODE or routing; reopens exact state', () => {
    const original = prepared()
    const filter = id(original.patch, 'vcf')
    const iter = id(original.patch, 'iter')
    const incoming = cable(original.patch, filter)
    let next = connect(original.patch, incoming.from, { module: iter, jack: 'in' })
    // A dangling branch is silent and may be saved without changing the source.
    const dangling = editDocument(original, next)
    expect(sourceBody(dangling.source)).toBe(fixture)
    next = connect(dangling.patch, { module: iter, jack: 'out' }, incoming.to, true)
    const inserted = editDocument(dangling, next)
    expect(sourceBody(inserted.source)).toBe(fixture.replace('lead.lpf', 'lead\n  .iter(2).lpf'))
    expect(read(inserted.source).patch).toEqual(next)
    expect(inserted.patch.modules.find((module) => module.id === iter)?.look).toBe('monolith')
    expect(inserted.patch.rows).toBe(4)
    const bypassed = editDocument(
      inserted,
      connect(inserted.patch, incoming.from, incoming.to, true),
    )
    expect(sourceBody(bypassed.source)).toBe(fixture.replace('lead.lpf', 'lead\n  .lpf'))
    expect(read(bypassed.source).patch).toEqual(bypassed.patch)
    const deleted = editDocument(bypassed, removeModule(bypassed.patch, iter))
    expect(read(deleted.source).patch).toEqual(deleted.patch)
  })

  it('disconnects and reconnects a supported voice, retaining its comments, saved modules and empty rows', () => {
    const original = saveLayout(
      read("// keep\n$: note('c3').s('sine').lpf(/* inside */ 800); // tail\n"),
    )
    const mix = id(original.patch, 'mix')
    const input = cable(original.patch, mix)
    const disconnected = editDocument(original, removeCable(original.patch, input.id))
    expect(sourceBody(disconnected.source)).toBe('// keep\n /* inside */  // tail\n')
    expect(read(disconnected.source).patch).toEqual(disconnected.patch)
    expect(disconnected.bindings.every((binding) => binding.role === 'tempo')).toBe(true)
    const connected = editDocument(disconnected, connect(disconnected.patch, input.from, input.to))
    expect(read(connected.source).patch).toEqual(connected.patch)
    expect(sourceBody(connected.source)).toContain('note("c3")')
    expect(sourceBody(connected.source)).toContain('/* inside */')
    expect(sourceBody(connected.source)).not.toContain('.orbit(')
  })

  it('keeps comments inside removed multi-call module settings', () => {
    const source =
      "$: note('c3').s('sine').delay(/* wet */ .4).delaytime(.25).delayfeedback(/* repeat */ .3).gain(.2)\n"
    const original = saveLayout(read(source))
    const delay = id(original.patch, 'delay')
    const amp = id(original.patch, 'vca')
    const upstream = cable(original.patch, delay)
    const next = connect(
      original.patch,
      upstream.from,
      { module: amp, jack: 'in' },
      true,
      upstream.id,
    )
    const result = editDocument(original, next)
    expect(sourceBody(result.source)).toBe(
      "$: note('c3').s('sine')/* wet */ /* repeat */ .gain(.2)\n",
    )
    expect(read(result.source).patch).toEqual(next)
  })

  it('deletes a connected module without bridging the voice', () => {
    const original = saveLayout(read("$: note('c3').s('sine').lpf(800) // tail\n"))
    const next = removeModule(original.patch, id(original.patch, 'vcf'))
    const removed = editDocument(original, next)
    expect(sourceBody(removed.source)).not.toContain('note(')
    expect(sourceBody(removed.source)).toContain('// tail')
    expect(read(removed.source).patch).toEqual(next)
  })

  it('retains identical call identities and reparses later literal edits after insertion', () => {
    const source = "$: note('c3').s('sine').lpf(800).lpf(800).gain(.2)\n"
    let original = saveLayout(read(source))
    const filters = original.patch.modules.filter((module) => module.type === 'vcf')
    const second = filters[1]
    if (!second) throw new Error('Missing second filter')
    original = editDocument(original, setLook(original.patch, second.id, 'vintage'))
    original = editDocument(original, placeModule(original.patch, 'reverb', 3))
    const room = id(original.patch, 'reverb')
    const incoming = cable(original.patch, second.id)
    const next = connect(
      connect(original.patch, incoming.from, { module: room, jack: 'in' }, false, incoming.id),
      { module: room, jack: 'out' },
      incoming.to,
    )
    const inserted = editDocument(original, next)
    const changed = editDocument(inserted, setValue(inserted.patch, second.id, 'cutoff', 1600))
    expect(sourceBody(changed.source)).toBe(
      source.replace('.lpf(800).lpf(800)', '.lpf(800)\n  .room(0.5)\n  .roomsize(4).lpf(1600)'),
    )
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(changed.patch.modules.find((module) => module.id === second.id)?.look).toBe('vintage')
  })

  it.each(['delay', 'room'])(
    'retains explicit inactive %s calls while editing the same or another voice',
    (effect) => {
      const source = `// keep\n$: note('c3').s('sine').${effect}(/* bypass */ 0); // untouched\n$: note('e3').s('square').gain(.2);\n`
      let original = saveLayout(read(source))
      original = editDocument(original, placeModule(original.patch, 'iter', 3))
      const iter = id(original.patch, 'iter')
      const mixerInputs = original.patch.cables.filter(
        (cable) => cable.to.module === id(original.patch, 'mix'),
      )
      for (const input of mixerInputs) {
        const next = connect(
          connect(original.patch, input.from, { module: iter, jack: 'in' }, false, input.id),
          { module: iter, jack: 'out' },
          input.to,
        )
        const result = editDocument(original, next)
        const end = input.to.jack === 'in1' ? `.${effect}(/* bypass */ 0)` : '.gain(.2)'
        expect(sourceBody(result.source)).toBe(source.replace(end, `${end}\n  .iter(4)`))
        expect(read(result.source).patch).toEqual(next)
      }
    },
  )

  it('keeps unchanged CV source and target groups exact around a normal chain insertion', () => {
    const source = "$: note('c3').s('sine').lpf(sine.range(/* keep */ 800,1200));\n"
    let original = saveLayout(read(source))
    original = editDocument(original, placeModule(original.patch, 'iter', 3))
    const iter = id(original.patch, 'iter')
    const input = cable(original.patch, id(original.patch, 'mix'))
    const next = connect(
      connect(original.patch, input.from, { module: iter, jack: 'in' }, false, input.id),
      { module: iter, jack: 'out' },
      input.to,
    )
    const result = editDocument(original, next)
    expect(sourceBody(result.source)).toBe(source.replace(';', '\n  .iter(4);'))
    expect(read(result.source).patch).toEqual(next)
    const mod = result.patch.cables.find((cable) => cable.to.jack === 'cv')
    if (!mod) throw new Error('Missing modulation')
    expect(() => editDocument(result, removeCable(result.patch, mod.id))).toThrow(/CV/)
  })

  it('refuses stack argument removal and root replacement rather than changing unrelated interpretation', () => {
    const stacked = saveLayout(read("stack(note('c3').s('sine'),note('e3').s('square'))\n"))
    const input = cable(stacked.patch, id(stacked.patch, 'mix'))
    expect(() => editDocument(stacked, removeCable(stacked.patch, input.id))).toThrow(
      /nested expression/,
    )
    let original = saveLayout(read("$: note('c3').s('sine')\n"))
    original = editDocument(original, placeModule(original.patch, 'seq', 3))
    const replacement = original.patch.modules.find(
      (module) => module.type === 'seq' && module.id !== 'seq1',
    )
    if (!replacement) throw new Error('Missing replacement sequence')
    expect(() =>
      editDocument(
        original,
        connect(
          original.patch,
          { module: replacement.id, jack: 'note' },
          { module: id(original.patch, 'osc'), jack: 'note' },
          true,
        ),
      ),
    ).toThrow(/root/)
  })

  it('refuses opaque voice removal, shared-declaration changes, CV edits and ambiguous branches atomically', () => {
    const original = saveLayout(read(fixture))
    const snapshot = JSON.stringify(original)
    const opaque = id(original.patch, 'code')
    expect(() => editDocument(original, removeModule(original.patch, opaque))).toThrow(/opaque/)
    const shared = id(original.patch, 'osc')
    expect(() => editDocument(original, removeModule(original.patch, shared))).toThrow(
      /declaration|scope/,
    )
    expect(JSON.stringify(original)).toBe(snapshot)
    const cv = saveLayout(read("$: note('c3').s('sine').lpf(sine.range(800,1200))\n"))
    const mod = cv.patch.cables.find((cable) => cable.to.jack === 'cv')
    if (!mod) throw new Error('Missing CV')
    expect(() => editDocument(cv, removeCable(cv.patch, mod.id))).toThrow()
    const repeats = saveLayout(read("const lead = note('c3').s('sine');\n$: lead;\n$: lead;\n"))
    const input = cable(repeats.patch, id(repeats.patch, 'mix'))
    expect(() => editDocument(repeats, removeCable(repeats.patch, input.id))).toThrow(/ambiguous/)
  })
})

it('produces the intended real Strudel event values and times independently of source and metadata checks', async () => {
  const controlsEntry = '@strudel/core/controls.mjs',
    patternsEntry = '@strudel/core/pattern.mjs',
    signalsEntry = '@strudel/core/signal.mjs'
  const controls: Record<string, unknown> = await import(/* @vite-ignore */ controlsEntry)
  const patterns: Record<string, unknown> = await import(/* @vite-ignore */ patternsEntry)
  const signals: Record<string, unknown> = await import(/* @vite-ignore */ signalsEntry)
  function events(source: string): unknown {
    let body = sourceBody(source)
    for (const statement of [...parse(body, { ecmaVersion: 'latest' }).body].reverse())
      if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
        body =
          body.slice(0, statement.start) +
          `voices.push(${body.slice(statement.body.expression.start, statement.body.expression.end)});` +
          body.slice(statement.end)
    const runtime = { ...patterns, ...signals, ...controls, setcpm: () => {} }
    // Executes trusted fixtures only; production editing never evaluates code.
    // oxlint-disable-next-line typescript/no-implied-eval
    const run = new Function(
      ...Object.keys(runtime),
      `const voices = [];\n${body}\nreturn voices.map(voice => voice.queryArc(0, 4).map(event => ({ value: event.value, begin: String(event.part.begin), end: String(event.part.end) })));`,
    )
    return run(...Object.values(runtime))
  }
  const source =
    "const lead = note('c3').s('sine');\n$: lead;\n$: lead.chunkBack(4,x=>x.rev()).gain(.15).orbit(7);\n"
  let original = saveLayout(read(source))
  original = editDocument(original, placeModule(original.patch, 'delay', 3))
  const delay = id(original.patch, 'delay')
  const incoming = cable(original.patch, id(original.patch, 'mix'))
  const next = connect(
    connect(original.patch, incoming.from, { module: delay, jack: 'in' }),
    { module: delay, jack: 'out' },
    incoming.to,
    true,
  )
  const inserted = editDocument(original, next)
  expect(events(inserted.source)).toEqual(
    events(source.replace('$: lead;', '$: lead.delay(.4).delaytime(.375).delayfeedback(.5);')),
  )
  expect(events(inserted.source)).not.toEqual(events(source))
  const bypassed = editDocument(inserted, connect(inserted.patch, incoming.from, incoming.to, true))
  expect(events(bypassed.source)).toEqual(events(source))
  const voice = saveLayout(read("$: note('c3').s('sine').gain(.2)\n"))
  const input = cable(voice.patch, id(voice.patch, 'mix'))
  const silent = editDocument(voice, removeCable(voice.patch, input.id))
  expect(events(silent.source)).toEqual([])
  const restored = editDocument(silent, connect(silent.patch, input.from, input.to))
  expect(events(restored.source)).toEqual(events(voice.source))
})

it('removes a transform and reconnects an imported CHORD branch without rewriting its source', () => {
  const source =
    '// keep\n$: chord("<Cm7 Fm7 G7>").voicing().arp("0 1 2 1").rev().s("sine") // tail\n'
  const original = saveLayout(read(source))
  const arp = id(original.patch, 'arp')
  const osc = id(original.patch, 'osc')
  const next = connect(
    removeModule(original.patch, id(original.patch, 'rev')),
    { module: arp, jack: 'out' },
    { module: osc, jack: 'note' },
  )
  const edited = editDocument(original, next)
  expect(sourceBody(edited.source)).toBe(source.replace('.rev()', ''))
  expect(read(edited.source).layout).toBe('restored')
  expect(read(edited.source).patch).toEqual(next)
})
