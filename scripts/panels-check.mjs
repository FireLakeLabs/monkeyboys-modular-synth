import { connect, placeModule, setValue } from '../src/rack/model.ts'
import { generate } from '../src/codegen/generate.ts'
import { read } from '../src/reader/index.ts'
import { sourceBody } from '../src/workspace/document.ts'
import { panelCases, panelFixture as fixture } from '../src/testing/panelCases.ts'
import { editorSource, replaceSource } from './editor-browser.mjs'

export { panelCases }
export function load(patch) {
  replaceSource(generate(patch))
  return patch
}
export function loadCase(index) {
  const example = panelCases[index]
  return load(
    fixture(
      example.type,
      { ...example.settings, [example.control]: example.value },
      example.type === 'mix' ? Number(example.control.slice(-1)) : 1,
    ),
  )
}
export function current() {
  return read(editorSource())
}
export function source() {
  return sourceBody(editorSource())
}
export function crossfader() {
  let patch = fixture('osc', { wave: 'sine' })
  patch = setValue(patch, 'seq1', 'steps', 'c3*8')
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in2' })
  for (const [n, level, depth] of [
    [1, 0.2, 0.6],
    [2, 0.8, -0.6],
  ]) {
    patch = placeModule(patch, 'lfo', 6 + n)
    patch = connect(patch, { module: `lfo${n}`, jack: 'out' }, { module: 'mix1', jack: `cv${n}` })
    patch = setValue(patch, 'mix1', `ch${n}`, level)
    patch = setValue(patch, `lfo${n}`, 'depth', depth)
    patch = setValue(patch, 'mix1', `name${n}`, `voice${n}`)
  }
  return load(patch)
}
export async function pinnedLabels() {
  const web = await import('@strudel/web')
  const repl = await web.initStrudel()
  const result = []
  for (const source of [
    '$: note("c3").s("sine").orbit(1)\n_$: note("e3").s("sine").orbit(2)',
    'bass: note("c3").s("sine").orbit(1)\nS$: note("e3").s("sine").orbit(2)',
    '_Sbass: note("c3").s("sine").orbit(1)\nlead: note("e3").s("sine").orbit(2)',
  ]) {
    const pattern = await repl.evaluate(source, false)
    result.push(pattern.queryArc(0, 1).map((h) => h.value))
  }
  for (const label of ['_$', 'S$', 'bass']) {
    const source = `${label}: stack(note("c3").s("sine"),note("e3").s("sine"))\n$: note("g3").s("sine")`
    const original = await repl.evaluate(source, false)
    const expected = original
      .queryArc(0, 1)
      .map((h) => h.value.note)
      .sort()
    const regenerated = await repl.evaluate(generate(read(source).patch), false)
    const actual = regenerated
      .queryArc(0, 1)
      .map((h) => h.value.note)
      .sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Stack label ${label} changed events`)
  }
  for (const settings of [
    '.gain(.4).lpf(800).lpq(1).velocity(.6)',
    '.roomfade(2)',
    '.ftype("ladder")',
    '.channels("3:4").channels("1:2")',
    '.delay(.4).delayfeedback(.5).delaytime(.3).delaysync(.25)',
    '.delay(.4).delayfeedback(.5).delaysync(.25).delaytime(.3)',
  ]) {
    const source = `$: note("c3").s("sine")${settings}.orbit(3)`
    const original = await repl.evaluate(source, false)
    const expected = original.queryArc(0, 1).map((h) => h.value)
    const regenerated = await repl.evaluate(generate(read(source).patch), false)
    const actual = regenerated.queryArc(0, 1).map((h) => h.value)
    const stable = (value) =>
      JSON.stringify(value, (_key, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      )
    if (stable(actual) !== stable(expected))
      throw new Error(`Imported settings changed events: ${settings}`)
  }
  repl.stop()
  return result
}
