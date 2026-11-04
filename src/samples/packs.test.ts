import { expect, it } from 'vitest'
import { packLabel, sampleCalls, userPack } from './packs'
import { sampleInventory } from './manifest'

it('follows the pinned engine github shortcut semantics and rejects executable input', () => {
  expect(userPack(' github:person/pack ')).toEqual({ source: 'github:person/pack' })
  expect(packLabel(userPack('github:person/pack'))).toEqual({
    name: 'pack',
    branch: 'follows main',
  })
  expect(packLabel(userPack('github:person/pack/dev/subdir'))).toEqual({
    name: 'pack',
    branch: 'follows dev',
  })
  expect(userPack('https://example.com/samples/strudel.json')).toEqual({
    source: 'https://example.com/samples/strudel.json',
  })
  expect(() => userPack('javascript:alert(1)')).toThrow()
  expect(() => userPack("github:p/repo');hush()//")).toThrow()
  expect(
    sampleCalls("// samples('github:fake/pack')\nsamples('github:p/repo');\n$: s('bd')"),
  ).toMatchObject([{ pack: { source: 'github:p/repo' } }])
})
it('counts files and exposes sound names in string, array and pitched sample banks', () => {
  expect(
    sampleInventory({
      _base: 'https://example.com/',
      kick: 'a.wav',
      snare: ['b.wav', 'c.wav'],
      piano: { C3: ['c3.wav', 'c3-soft.wav'], G3: 'g3.wav' },
    }),
  ).toEqual({
    names: ['kick', 'snare', 'piano'],
    sounds: [
      { name: 'kick', bank: ['a.wav'] },
      { name: 'snare', bank: ['b.wav', 'c.wav'] },
      { name: 'piano', bank: { C3: ['c3.wav', 'c3-soft.wav'], G3: ['g3.wav'] } },
    ],
    sampleCount: 6,
  })
  expect(() => sampleInventory({ invalid: 4 })).toThrow(/bank/)
  expect(() => sampleInventory(null)).toThrow(/manifest/)
})

it('links static inline source-owned maps to runtime inventory without executing dynamic setup', () => {
  expect(sampleCalls("samples({bd: ['kick.wav', 'soft.wav']});")[0]?.pack).toEqual({
    source: 'inline:{"bd":["kick.wav","soft.wav"]}',
  })
  expect(sampleCalls('samples(getPack());')[0]?.pack).toBeUndefined()
})
