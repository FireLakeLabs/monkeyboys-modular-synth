import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { sourceBody } from '../workspace/document'
import { arrangerRows, paintRow, resizeSong, songCycles } from './arranger'
import { connect, placeModule, setValue, starterPatch } from './model'

function twoVoices() {
  let patch = starterPatch(104)
  patch = placeModule(patch, 'drums', 1)
  patch = placeModule(patch, 'smpl', 1, 20)
  patch = placeModule(patch, 'seq', 2)
  patch = placeModule(patch, 'osc', 2, 20)
  patch = connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
  patch = connect(patch, { module: 'smpl1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  return connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in3' })
}

describe('arranger rows', () => {
  it('lists connected channels, named by NAME or the module feeding them', () => {
    const patch = setValue(twoVoices(), 'mix1', 'name3', 'bass')
    expect(
      arrangerRows(patch).map(({ channel, label, lane, routed }) => [channel, label, lane, routed]),
    ).toEqual([
      [1, 'smpl1', '', true],
      [3, 'bass', '', true],
    ])
    expect(songCycles(arrangerRows(patch))).toBe(16)
  })

  it('paints one channel as one mask on that voice only', () => {
    const patch = twoVoices()
    const [, bass] = arrangerRows(patch)
    if (!bass) throw new Error('Missing row')
    const next = paintRow(patch, bass, { length: 8, from: 0, to: 3, on: false })
    expect(arrangerRows(next)[1]?.lane).toBe('<0!4 1!4>')
    expect(sourceBody(generate(next)).match(/\.mask\("<0!4 1!4>"\)/g)).toHaveLength(1)
    expect(songCycles(arrangerRows(next))).toBe(8)
  })

  it('cuts only lanes longer than a shorter song, keeping their opening cycles', () => {
    let patch = setValue(twoVoices(), 'mix1', 'arr1', '<1!2 0!6>')
    patch = setValue(patch, 'mix1', 'arr3', '<0 1>')
    const shorter = resizeSong(patch, 4)
    expect(arrangerRows(shorter).map((row) => row.lane)).toEqual(['<1!2 0!2>', '<0 1>'])
    expect(resizeSong(patch, 12)).toBe(patch)
    expect(() => resizeSong(patch, 0)).toThrow(/1 to 256/)
  })
})
