import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { connect, placeModule, starterPatch } from '../rack/model'
import { fromPatch, sourceBody } from './document'
import { hasOutput, strudelUrl } from './transport'

describe('workspace transport', () => {
  it('distinguishes empty and incomplete paths from routed voices, including opaque imports', () => {
    let patch = placeModule(starterPatch(), 'osc', 0)
    expect(hasOutput(fromPatch(patch))).toBe(false)
    patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    expect(hasOutput(fromPatch(patch))).toBe(false)
    patch = placeModule(patch, 'seq', 0)
    patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
    expect(hasOutput(fromPatch(patch))).toBe(true)
    expect(hasOutput(read('$: myCustomVoice(42)\n'))).toBe(true)
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
})
