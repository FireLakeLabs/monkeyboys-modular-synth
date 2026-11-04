// run: npx vitest run --config spike/vitest.config.ts
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { read } from '../src/reader/read'
import { generate } from '../src/codegen/generate'
import { buildTree } from './tree.mts'
import * as E from './edits.mts'

/** The literal's inner text and where it begins in the whole document. */
function parsed(source: string) {
  const result = read(source)
  if (result.kind === 'invalid') throw new Error(result.message)
  return 'document' in result ? result.document : result
}
function literal(doc: ReturnType<typeof parsed>, control: string) {
  const span = doc.bindings.flatMap((x) => (x.controls[control] ? [x.controls[control]] : []))[0]
  if (!span) throw new Error('No binding')
  const raw = doc.source.slice(span.start, span.end)
  const quoted = /^["`']/.test(raw)
  return { raw, inner: quoted ? raw.slice(1, -1) : raw, offset: span.start + (quoted ? 1 : 0) }
}
const sources = [
  ['imported SEQ', `// intro comment\nsetcpm(120/4)\n$: note("c2   [e2  g2]@2  <a2 b2>!2")  // keep me\n  .s('sawtooth')\n  .lpf(800) /* tail */\n`, 'steps', 'e2'],
  ['multi-line backtick SEQ', '$: note(`c2\n   [e2  g2]\n   a2`)\n  .s("sine")\n', 'steps', 'e2'],
  ['imported DRUMS', `$: s("bd*2  [~ sd]@3, hh*8")  // drums\n  .gain(0.9)\n`, 'grid', 'sd'],
] as const
it('splices inside the literal through the production reader', () => {
  const rows = sources.map(([name, source, control, token]) => {
    const before = parsed(source)
    let lit: ReturnType<typeof literal>
    try { lit = literal(before, control) } catch { return { name, bound: null, modules: before.patch.modules.map((m) => m.type) } }
    const tree = buildTree(lit.inner)
    const s = E.replaceAtom(E.atom(tree, token), 'f2')
    const next = source.slice(0, lit.offset + s.start) + s.text + source.slice(lit.offset + s.end)
    const after = parsed(next)
    const module = (d: typeof before) => d.patch.modules.find((m) => ['seq', 'drums'].includes(m.type))
    const a = module(before), b = module(after)
    return {
      name,
      bound: lit.raw,
      after: next,
      sameId: a?.id === b?.id,
      sameType: a?.type === b?.type,
      value: b?.values[control],
      bytesOutside: source.slice(0, lit.offset + s.start) === next.slice(0, lit.offset + s.start) && source.slice(lit.offset + s.end) === next.slice(lit.offset + s.start + s.text.length),
      generated: (() => { try { generate(after.patch); return true } catch { return false } })(),
    }
  })
  writeFileSync('spike/out-document.json', JSON.stringify(rows, null, 1))
})
it('prints bindings', () => {
  const d = read(`$: note("c2 [e2 g2]").s('sawtooth')\n`)
  writeFileSync('spike/out-bindings.json', JSON.stringify({ modules: d.patch.modules, bindings: d.bindings, diagnostics: d.diagnostics }, null, 1))
})
