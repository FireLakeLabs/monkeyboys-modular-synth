import { describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { generate } from '../codegen/generate'
import { libraryPatches } from '../library/catalog'
import { read } from '../reader'
import { connect, placeModule, renameOutput, setValue } from '../rack/model'
import { editDocument, makeRackEditable, RackEditRefused, sourceBody } from './document'

const fixture =
  "// original\nconst turn = x => x.hurry(2);\nsetcpm(110/4)\n$: note('c3 e3').s('triangle').chunk(4, turn).lpf(800).lpq(1).gain(.2);\n"

function proposedCV(source = fixture) {
  let document = read(source)
  const row = Math.max(...document.patch.modules.map((module) => module.row)) + 1
  document = editDocument(document, placeModule(document.patch, 'lfo', row))
  const lfo = document.patch.modules.find((module) => module.type === 'lfo')
  const filter = document.patch.modules.find((module) => module.type === 'vcf')
  if (!lfo || !filter) throw new Error('Missing modulation modules')
  const next = connect(
    document.patch,
    { module: lfo.id, jack: 'out' },
    { module: filter.id, jack: 'cv' },
  )
  return { document, next }
}

describe('explicit rack conversion', () => {
  it('refuses atomically, then completes the same edit while keeping setup, CODE and rack identity', () => {
    const { document, next } = proposedCV()
    const original = structuredClone(document)
    expect(() => editDocument(document, next)).toThrow(RackEditRefused)
    expect(document).toEqual(original)
    const converted = makeRackEditable(document, next)
    expect(converted.patch).toEqual({ ...next, prelude: 'const turn = x => x.hurry(2);' })
    expect(sourceBody(converted.source)).toContain('.chunk(4, turn)')
    expect(sourceBody(converted.source)).toContain('.lfo({ c: "lpf"')
    expect(sourceBody(converted.source)).toBe(sourceBody(generate(converted.patch)))
    expect(read(converted.source).patch).toEqual(converted.patch)
    const out = converted.patch.modules.find((module) => module.type === 'out')
    if (!out) throw new Error('Missing output')
    const changed = editDocument(converted, setValue(converted.patch, out.id, 'bpm', 114))
    expect(changed.patch.prelude).toBe(converted.patch.prelude)
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(document).toEqual(original)
  })

  it('keeps showcase registrations and opaque calls through conversion and later rack edits', () => {
    const entry = libraryPatches().find((entry) => entry.id === 'switch-angel-trance-demo')
    if (!entry) throw new Error('Missing showcase')
    const original = read(entry.source)
    const converted = makeRackEditable(original)
    expect(converted.patch.prelude?.match(/register\('/g)).toHaveLength(4)
    expect(sourceBody(converted.source)).toContain('.o(2)')
    expect(sourceBody(converted.source)).toContain('.o(3)')
    expect(sourceBody(converted.source)).toContain('.o(4)')
    const row = Math.max(...converted.patch.modules.map((module) => module.row)) + 1
    const changed = editDocument(converted, placeModule(converted.patch, 'vcf', row))
    expect(read(changed.source).patch).toEqual(changed.patch)
    expect(original.source).toBe(entry.source)
  })

  it('rejects output names that shadow retained setup dependencies', () => {
    const entry = libraryPatches().find((entry) => entry.id === 'switch-angel-trance-demo')
    if (!entry) throw new Error('Missing showcase')
    const converted = makeRackEditable(read(entry.source))
    const sampler = converted.patch.modules.find((module) => module.type === 'smpl')
    if (!sampler) throw new Error('Missing sampler')
    expect(() => renameOutput(converted.patch, `${sampler.id}:out`, 'register')).toThrow(
      /colliding/,
    )
    expect(() => renameOutput(converted.patch, `${sampler.id}:out`, 'kick')).not.toThrow()
  })

  it('rejects malformed, voice-containing and incorrectly typed saved preludes', () => {
    const converted = makeRackEditable(read(fixture))
    expect(() => generate({ ...converted.patch, prelude: 'const = (' })).toThrow()
    expect(() => generate({ ...converted.patch, prelude: '$: s("bd")' })).toThrow()
    expect(
      read(converted.source.replace('"prelude": "const turn = x => x.hurry(2);"', '"prelude": 42'))
        .layout,
    ).toBe('invalid')
    const altered = converted.source.replace(
      'const turn = x => x.hurry(2);\n',
      'const turn = x => x.hurry(3);\n',
    )
    expect(read(altered).layout).toBe('reconciled')
    expect(read(altered).patch.prelude).toBeUndefined()
  })
})

it('checks real Strudel events separately from source and reopened identity', async () => {
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
    // Trusted regression fixtures only. Ignore the deliberate generator bus allocation.
    // oxlint-disable-next-line typescript/no-implied-eval
    const run = new Function(
      ...Object.keys(runtime),
      `const voices = [];\n${body}\nreturn voices.map(voice => voice.queryArc(0, 4).map(event => { const { orbit, ...value } = event.value; return { value, begin: String(event.part.begin), end: String(event.part.end) } }));`,
    )
    return run(...Object.values(runtime))
  }
  const original = read(fixture)
  const converted = makeRackEditable(original)
  expect(events(converted.source)).toEqual(events(fixture))
  const { document, next } = proposedCV()
  const modulated = makeRackEditable(document, next)
  expect(events(modulated.source)).toEqual(
    events(
      fixture.replace(
        '.lpf(800)',
        '.lpf(800).lfo({ c: "lpf", sync: .25, depthabs: 1600, dc: 0, shape: "sine", skew: .5 })',
      ),
    ),
  )
  expect(events(modulated.source)).not.toEqual(events(fixture))
})
