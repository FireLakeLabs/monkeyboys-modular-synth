import { withFactoryPacks } from './cartridges'
import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { connect, placeModule, starterPatch } from '../rack/model'
import { fromPatch, sourceBody } from './document'
import { mayHaveOutput, strudelUrl } from './transport'

describe('workspace transport', () => {
  it('distinguishes empty and incomplete paths from routed voices, including opaque imports', () => {
    let patch = placeModule(starterPatch(), 'osc', 0)
    expect(mayHaveOutput(fromPatch(patch))).toBe(false)
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    expect(mayHaveOutput(fromPatch(patch))).toBe(false)
    patch = placeModule(patch, 'seq', 0)
    patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
    expect(mayHaveOutput(fromPatch(patch))).toBe(true)
    expect(mayHaveOutput(read('$: myCustomVoice(42)\n'))).toBe(true)
  })

  it('shares executable source with Unicode and preserves comments beyond rack metadata', () => {
    const source = "// MonkeyBoy’s · 音 🎵\nsetcpm(120/4)\n$: s('bd')\n"
    const document = fromPatch(starterPatch())
    const imported = read(
      `${source}${document.source.slice(document.source.indexOf('// ──'))}\n// user’s tail\n`,
    )
    const url = new URL(strudelUrl(imported))
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(decodeURIComponent(url.hash.slice(1))), (c) => c.charCodeAt(0)),
    )
    expect(url.origin).toBe('https://strudel.cc')
    expect(decoded).toBe(`${source}\n// user’s tail\n`)
    expect(decoded).toBe(sourceBody(imported.source))
    expect(decoded).not.toContain('@monkeyboy rack')
  })

  it('keeps a reopened factory-only patch silent until a voice reaches OUT', () => {
    expect(mayHaveOutput(withFactoryPacks(fromPatch(starterPatch())))).toBe(false)
  })

  it.each(["const lead = sound('bd'); lead", "drums: sound('bd')", 'new Promise(() => {})'])(
    'allows unclassified executable source to reach the engine: %s',
    (source) => {
      expect(mayHaveOutput(read(source))).toBe(true)
    },
  )
})
