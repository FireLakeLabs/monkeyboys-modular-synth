import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { demoPatch } from '../patch/demo'
import { fromPatch } from './document'
import { sourceSegments, sourceTreatments } from './highlighting'

describe('source presentation', () => {
  it('keeps exact source and does not highlight a neighboring Cyber fragment', () => {
    const document = read(
      `// 🐒 keep spacing\n$: note('c3').s('sine').lpf(800).chunkBack(4, x => x.rev()).lpq(2)\n`,
    )
    const vcf = document.patch.modules.find((m) => m.type === 'vcf')
    const segments = sourceSegments(document.source, sourceTreatments(document), vcf?.id ?? null)
    expect(segments.map((s) => s.text).join('')).toBe(document.source)
    expect(
      segments
        .filter((s) => s.className.includes('source-selected'))
        .map((s) => s.text)
        .join(''),
    ).toBe('.lpf(800)')
    expect(segments.find((s) => s.text.includes('chunk'))?.className).toContain('source-cyber')
  })
  it('highlights every current CV span of a shared modulation module', () => {
    const document = read(`const wave = sine.slow(2);
$: note('c3').s('sine').lpf(wave.range(800, 2400))
$: note('e3').s('sine').lpf(wave.range(800, 2400))
`)
    const lfo = document.patch.modules.find((m) => m.type === 'lfo')
    const segments = sourceSegments(document.source, sourceTreatments(document), lfo?.id ?? null)
    expect(
      segments
        .filter((s) => s.className.includes('source-selected'))
        .map((s) => s.text)
        .join(''),
    ).toBe('sine.slow(2)wave.range(800, 2400)wave.range(800, 2400)')
  })
  it('styles family/category code and named declaration/references without changing source', () => {
    const document = read(`const lead = note('c3').s('sine');\n$: lead.iter(4)\n$: lead.jux(rev)\n`)
    const segments = sourceSegments(document.source, sourceTreatments(document), null)
    expect(segments.map((s) => s.text).join('')).toBe(document.source)
    expect(segments.filter((s) => s.className.includes('source-named')).map((s) => s.text)).toEqual(
      ['lead', 'lead', 'lead'],
    )
    expect(segments.some((s) => s.className.includes('source-alien'))).toBe(true)
    expect(segments.some((s) => s.className.includes('cat-sound'))).toBe(true)
  })
  it('gives disconnected modules and unreadable drafts no stale selection', () => {
    const patch = demoPatch()
    patch.cables = []
    const document = fromPatch(patch)
    expect(
      sourceSegments(document.source, sourceTreatments(document), 'seq1').some((s) =>
        s.className.includes('source-selected'),
      ),
    ).toBe(false)
    expect(sourceSegments('note(', [], 'seq1')).toEqual([
      { start: 0, text: 'note(', className: '' },
    ])
  })
})

it('uses teal lambda ink while preserving the CODE fallback treatment inside a loop', () => {
  const doc = read('$: note("c3").s("sine").chunk(4,p=>p.iter(3).rev()).off(.25,q=>q.color("red"))')
  const segments = sourceSegments(doc.source, sourceTreatments(doc), null)
  expect(segments.find((s) => s.text.includes('.iter(3)'))?.className).toContain('source-function')
  expect(segments.find((s) => s.text.includes('.color('))?.className).toContain('source-cyber')
})
