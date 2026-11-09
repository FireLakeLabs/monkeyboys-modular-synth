import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from './read'
import { baselineFor, measurePatch, regressions, summarize } from './coverage'

describe('production reader corpus measurement', () => {
  it('counts each outer chain call once, including grouped ENV and CV owners', () => {
    const patch = measurePatch(
      'cv',
      '$: note("c3").s("sawtooth").attack(.01).decay(.2).sustain(.5).release(.3).gain(.5)',
    )
    expect(patch).toMatchObject({
      calls: 7,
      mappedCalls: 7,
      voices: 1,
      readableVoices: 1,
      codeBlocks: 0,
      patchesWithoutCode: 1,
    })
    expect(
      measurePatch('lfo', '$: note("c3").s("sawtooth").lpf(sine.range(200, 800))'),
    ).toMatchObject({ calls: 3, mappedCalls: 3, readableVoices: 1 })
  })

  it('ranks opaque whole roots and suffixes using their outer calls, not nested callback calls', () => {
    const patch = measurePatch(
      'mixed',
      '$: mystery().zebra().alpha().gain(.5)\n$: s("bd").alpha(x => x.zebra())',
    )
    expect(patch).toMatchObject({
      calls: 6,
      mappedCalls: 2,
      voices: 2,
      readableVoices: 0,
      patchesWithoutCode: 0,
    })
    expect(summarize([patch]).unmapped).toEqual([
      { name: 'alpha', count: 2 },
      { name: 'mystery', count: 1 },
      { name: 'zebra', count: 1 },
    ])
  })

  it('tracks shared opaque declarations once and marks every dependent voice unreadable', () => {
    const source =
      'const unused = unusedHelper(); const riff = s("bd").unknown(); $: riff.gain(.5); $: riff.gain(.4); $: s("hh")'
    expect(measurePatch('shared', source)).toMatchObject({
      calls: 5,
      mappedCalls: 4,
      voices: 3,
      readableVoices: 1,
      codeBlocks: 1,
      unmapped: { unknown: 1 },
    })
    expect(measurePatch('bare', 'const riff = s("bd").unknown(); $: riff')).toMatchObject({
      voices: 1,
      readableVoices: 0,
    })
  })

  it('counts Stack as one first-class voice, retains zero-call CODE, and never executes setup', () => {
    expect(
      measurePatch('stack', 'throw new Error("must not run"); stack(s("bd"), s("hh").unknown())'),
    ).toMatchObject({ voices: 1, readableVoices: 0, calls: 1, mappedCalls: 1 })
    expect(measurePatch('opaque', '$: things["pattern"]()')).toMatchObject({
      calls: 0,
      voices: 1,
      readableVoices: 0,
      codeBlocks: 1,
    })
  })

  it('excludes only proven generator routing and respects saved CODE ownership', () => {
    const original = read('$: s("bd").gain(.5)')
    const generated = generate(original.patch)
    expect(measurePatch('generated', generated)).toMatchObject({
      calls: 2,
      mappedCalls: 2,
      codeBlocks: 0,
      readableVoices: 1,
    })
    expect(measurePatch('imported', '$: s("bd").orbit(1)')).toMatchObject({
      calls: 2,
      mappedCalls: 1,
      unmapped: { orbit: 1 },
      readableVoices: 0,
    })
    const code = read('$: s("bd").unknown()')
    const block = code.patch.modules.find((module) => module.type === 'code')
    if (!block) throw new Error('Missing CODE fixture')
    block.values['text'] = '.gain(.5)'
    expect(measurePatch('saved-code', generate(code.patch))).toMatchObject({
      calls: 2,
      mappedCalls: 1,
      codeBlocks: 1,
      unmapped: { gain: 1 },
      readableVoices: 0,
    })
  })

  it('reports parse failures separately, with no fabricated zero-CODE success', () => {
    const invalid = measurePatch('invalid', '$: note(')
    expect(invalid).toMatchObject({ parseFailures: 1, patchesWithoutCode: 0, calls: 0, voices: 0 })
    expect(invalid.failure).toContain('Unexpected token')
    expect(summarize([invalid]).shares).toEqual({
      mappedCalls: null,
      readableVoices: null,
      patchesWithoutCode: 0,
    })
  })

  it('is deterministic and exposes empty corpus denominators', () => {
    const source = '$: s("bd").unknown()'
    expect(measurePatch('same', source)).toEqual(measurePatch('same', source))
    expect(summarize([]).shares).toEqual({
      mappedCalls: null,
      readableVoices: null,
      patchesWithoutCode: null,
    })
  })
})

describe('committed coverage gate', () => {
  const good = measurePatch('fixture', '$: s("bd").gain(.5)')
  const bad = measurePatch('fixture', '$: s("bd").gain(dynamic)')

  it('rejects regressions and accepts reviewed baseline updates and improvements', () => {
    const failures = regressions([bad], baselineFor([good]))
    expect(failures).toContain('fixture: mappedCallShare 1 -> 0.5')
    expect(failures).toContain('fixture: unmapped:gain 0 -> 1')
    expect(regressions([bad], baselineFor([bad]))).toEqual([])
    expect(regressions([good], baselineFor([bad]))).toEqual([])
    expect(regressions([measurePatch('fixture', '$: s(')], baselineFor([good]))).toContain(
      'fixture: parseFailures 0 -> 1',
    )
  })

  it('rejects per-patch degradation even when another patch offsets it', () => {
    const otherGood = { ...good, id: 'other' },
      otherBad = { ...bad, id: 'other' }
    expect(regressions([bad, otherGood], baselineFor([good, otherBad]))).toContain(
      'fixture: mappedCallShare 1 -> 0.5',
    )
  })

  it('requires explicit acceptance of corpus membership changes and malformed baselines', () => {
    expect(regressions([], baselineFor([good]))).toContain('fixture: corpus membership changed')
    expect(() => regressions([good], { fixture: {} })).toThrow('Missing baseline metric')
    expect(() => regressions([good], null)).toThrow('Invalid coverage baseline')
  })
})
