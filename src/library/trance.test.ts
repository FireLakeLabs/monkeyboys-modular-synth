import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { validateRack, setLook, setValue } from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { readLibraryPatch } from './load'
import { libraryPatches } from './catalog'
import { activityPlan } from '../strudel/activity'
import source from './patches/switch-angel-trance-demo.strudel?raw'

describe('issue #46 supplied Switch Angel demo', () => {
  it('retains the issue source verbatim and reads setCpm as 140 BPM', async () => {
    // Digest of the requested code block in #46, including its final newline.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
    expect(
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    ).toBe('4c619da7a683db3f67b544b1ac01d2c53fa6c8b2681cfcfe875395e6d58bb997')
    const document = readLibraryPatch({ source })
    expect(generate(document)).toBe(source)
    expect(activityPlan(document).code).toBe(source)
    expect(document.patch.modules.find((module) => module.type === 'out')?.values.bpm).toBe(140)
  })

  it('ships the supplied variant locally with Switch Angel/cosimo attribution', () => {
    const entry = libraryPatches().find((entry) => entry.id === 'switch-angel-trance-demo')
    expect(entry?.source).toBe(source)
    expect(entry?.title).toBe('Switch Angel trance demo (cosimo transcription)')
    expect(entry?.attribution.author).toContain('Switch Angel')
    expect(entry?.attribution.author).toContain('cosimo')
    expect(entry?.attribution.url).toBe(
      'https://gist.github.com/cosimo/b0843897efb5f23b4594cb5082be1a85',
    )
  })

  it('keeps four voices within fixed rails and preserves opaque registrations and routing', () => {
    const document = readLibraryPatch({ source })
    expect(() => validateRack(document.patch)).not.toThrow()
    expect(new Set(document.patch.modules.map((module) => module.row)).size).toBeGreaterThan(2)
    const mixerInputs = document.patch.cables.filter(
      (cable) =>
        cable.to.jack.startsWith('in') &&
        document.patch.modules.some(
          (module) => module.id === cable.to.module && module.type === 'mix',
        ),
    )
    const voices = mixerInputs.filter(
      (cable) =>
        !document.patch.modules.some(
          (module) => module.id === cable.from.module && module.type === 'mix',
        ),
    )
    expect(voices).toHaveLength(4)
    expect(document.patch.modules.some((module) => module.type === 'code')).toBe(true)
    expect(generate(document).match(/\.orbit\(/g)).toEqual(['.orbit('])
    expect(generate(document)).toContain('pat.orbit(orbit)')
    expect(generate(document).match(/\.o\([234]\)/g)).toEqual(['.o(2)', '.o(3)', '.o(4)'])
    expect(generate(document).match(/register\('/g)).toHaveLength(4)
    expect(document.patch.modules).toHaveLength(29)
    expect(document.patch.modules.filter((module) => module.type === 'code')).toHaveLength(14)
    expect(document.patch.modules.filter((module) => module.type === 'quant')).toHaveLength(2)
    expect(document.patch.modules.find((module) => module.type === 'vca')?.values.level).toBe(1.4)
  })

  it('preserves source separately from saved rack identity through edits and reopen', () => {
    const document = saveLayout(readLibraryPatch({ source }))
    const out = document.patch.modules.find((module) => module.type === 'out')
    if (!out) throw new Error('Missing output')
    const looked = editDocument(document, setLook(document.patch, out.id, 'vintage'))
    const edited = editDocument(looked, setValue(looked.patch, out.id, 'vol', 0.35))
    expect(sourceBody(edited.source)).toBe(source)
    const reopened = read(edited.source)
    expect(reopened.layout).toBe('restored')
    expect(reopened.patch).toEqual(edited.patch)
    expect(generate(reopened)).toBe(edited.source)
    const tempo = editDocument(edited, setValue(edited.patch, out.id, 'bpm', 138))
    expect(sourceBody(tempo.source)).toBe(source.replace('setCpm(140/4)', 'setCpm(138/4)'))
    expect(readLibraryPatch({ source }).source).toBe(source)
  })
})
