import { describe, expect, it } from 'vitest'
import type { SamplePackResource } from '../strudel/engine'
import { FACTORY_PACKS, packKey, type SamplePack } from './packs'
import { findSound, findSounds, parseToken, soundIndex, soundKind } from './soundIndex'

function resource(pack: SamplePack, sounds: Record<string, number>): SamplePackResource {
  return {
    key: packKey(pack),
    pack,
    status: 'registered',
    sounds: Object.entries(sounds).map(([name, count]) => ({
      name,
      bank: Array.from({ length: count }, (_, n) => `${name}/${n}.wav`),
    })),
    base: null,
    names: Object.keys(sounds),
    sampleCount: null,
    error: null,
  }
}
const [DIRT, MACHINES] = FACTORY_PACKS
const dirt = resource(DIRT, { 808: 6, '808bd': 25, kicklinn: 1, bd: 24, jazz: 8, sn: 52 })
const machines = resource(MACHINES, {
  RolandTR808_bd: 25,
  RolandTR808_sd: 25,
  RolandTR909_bd: 4,
  RolandTR909_oh: 2,
  OberheimDMX_: 1,
})
const packs = [dirt, machines]
const names = (query: Parameters<typeof findSounds>[1]) =>
  findSounds(soundIndex(packs), query).map((sound) => sound.name)

describe('sound kinds', () => {
  it('follow Strudel drum suffixes, a short Dirt list, and fall back to Other', () => {
    expect(
      [
        'RolandTR808_bd',
        'bd',
        '808bd',
        'sn',
        'RolandTR909_oh',
        'RolandTR808_misc',
        'OberheimDMX_',
        'jazz',
      ].map(soundKind),
    ).toEqual(['Kick', 'Kick', 'Kick', 'Snare', 'Open hat', 'Other', 'Other', 'Other'])
  })
})

describe('sound search', () => {
  it('ranks name prefixes, then the part after the bank, then anywhere in the name', () => {
    expect(names({ text: 'bd', kind: null, pack: null })).toEqual([
      'bd',
      'RolandTR808_bd',
      'RolandTR909_bd',
      '808bd',
    ])
    expect(names({ text: '808', kind: null, pack: null })).toEqual([
      '808',
      '808bd',
      'RolandTR808_bd',
      'RolandTR808_sd',
    ])
  })

  it('finds sounds by kind name after name matches', () => {
    expect(names({ text: 'kick', kind: null, pack: null })).toEqual([
      'kicklinn',
      '808bd',
      'bd',
      'RolandTR808_bd',
      'RolandTR909_bd',
    ])
  })

  it('narrows by kind, pack and a target prefix', () => {
    expect(names({ text: '', kind: 'Kick', pack: packKey(MACHINES) })).toEqual([
      'RolandTR808_bd',
      'RolandTR909_bd',
    ])
    expect(names({ text: '', kind: null, pack: null, prefix: 'wt_' })).toEqual([])
  })

  it('tells apart packs that share a label', () => {
    const first = resource({ source: 'https://example.test/a/strudel.json' }, { a: 1 })
    const second = resource({ source: 'https://example.test/b/strudel.json' }, { b: 1 })
    const index = soundIndex([first, second])
    expect(index.map((sound) => sound.pack)).toEqual(['example.test', 'example.test'])
    expect(findSounds(index, { text: '', kind: null, pack: second.key })).toEqual([
      expect.objectContaining({ name: 'b' }),
    ])
  })

  it('keeps one row per repeated name, the registration Strudel plays', () => {
    const later = resource({ source: 'https://example.test/strudel.json' }, { bd: 3 })
    const sounds = soundIndex([...packs, later]).filter((sound) => sound.name === 'bd')
    expect(sounds).toEqual([expect.objectContaining({ pack: 'example.test', count: 3 })])
  })

  it('leaves out sounds with no variants', () => {
    const empty = resource({ source: 'https://example.test/strudel.json' }, { silent: 0 })
    expect(soundIndex([empty])).toEqual([])
  })
})

describe('readout lookup', () => {
  it('names the bank for bank-prefixed sounds and the pack for the rest', () => {
    expect(findSound(packs, 'RolandTR808_bd')).toMatchObject({
      bank: 'RolandTR808',
      short: 'bd',
      count: 25,
    })
    expect(findSound(packs, '808bd')).toMatchObject({ bank: 'Dirt Samples', short: '808bd' })
    expect(findSound(packs, 'missing')).toBeUndefined()
  })

  it('reads name:n tokens only', () => {
    expect(parseToken('RolandTR808_bd:3')).toEqual({ name: 'RolandTR808_bd', n: 3 })
    expect(parseToken('bd')).toBeNull()
    expect(parseToken('<bd sd>:1')).toBeNull()
  })
})
