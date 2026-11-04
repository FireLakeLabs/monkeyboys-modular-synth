import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { getModuleSpec } from '../modules/catalog'
import { validateRack } from '../rack/model'
import { saveLayout, sourceBody } from '../workspace/document'
import { read } from './read'
import source from './fixtures/issue-44.strudel?raw'

describe('issue #44 long imported voices', () => {
  it('places the complete voice within fixed rails without overlap', () => {
    const document = read(source)
    expect(() => validateRack(document.patch)).not.toThrow()
    expect(new Set(document.patch.modules.map((module) => module.row)).size).toBeGreaterThan(2)
    expect(document.patch.modules.some((module) => module.type === 'lfo')).toBe(true)
    expect(document.patch.modules.some((module) => module.type === 'delay')).toBe(true)
    expect(document.patch.modules.find((module) => module.type === 'rev')?.values.mode).toBe(
      'palindrome',
    )
    for (const module of document.patch.modules)
      expect(module.hp + getModuleSpec(module.type).hp).toBeLessThanOrEqual(64)
  })

  it('preserves the exact executable source separately from placement', () => {
    const document = read(source)
    expect(generate(document)).toBe(source)
    expect(sourceBody(saveLayout(document).source)).toBe(source)
  })

  it('reopens the saved rack with identical state', () => {
    const saved = saveLayout(read(source))
    const reopened = read(saved.source)
    expect(reopened.layout).toBe('restored')
    expect(reopened.patch).toEqual(saved.patch)
    expect(() => validateRack(reopened.patch)).not.toThrow()
  })

  it('spills unmatched modules around retained positions after a code edit', () => {
    const saved = saveLayout(read(source))
    const edited = read(saved.source.replace('.room(.6)', '.room(.6).chunk(4,x=>x.rev()).iter(4)'))
    expect(edited.layout).toBe('reconciled')
    expect(() => validateRack(edited.patch)).not.toThrow()
    for (const original of saved.patch.modules.filter(
      (module) => module.type !== 'mix' && module.type !== 'out',
    )) {
      const retained = edited.patch.modules.find((module) => module.id === original.id)
      expect(retained).toMatchObject({ row: original.row, hp: original.hp, look: original.look })
    }
    expect(read(saveLayout(edited).source).patch).toEqual(edited.patch)
  })

  it('keeps later voices and overflowing mixer buses on free rails', () => {
    const document = read(
      `${source};\n${Array.from({ length: 18 }, () => '$: s("bd")').join('\n')}`,
    )
    expect(() => validateRack(document.patch)).not.toThrow()
    expect(read(saveLayout(document).source).patch).toEqual(document.patch)
  })
})
