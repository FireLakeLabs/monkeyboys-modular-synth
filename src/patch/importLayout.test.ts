import { describe, expect, it } from 'vitest'
import { read } from '../reader/read'
import { saveLayout, sourceBody } from '../workspace/document'
import { validatePositions } from './layout'

describe('unsaved import placement', () => {
  it('packs multiple voices while retaining exact executable bytes and complete saved identity', () => {
    const source =
      '// retained attribution\n' +
      Array.from(
        { length: 8 },
        (_, i) => `$: note("c${(i % 4) + 2}").s("sine").lpf(800).gain(.1)\n`,
      ).join('')
    const document = read(source)
    expect(document.source).toBe(source)
    expect(document.patch.railHp).toBe(84)
    expect(document.patch.rows).toBeLessThan(8)
    expect(() => validatePositions(document.patch)).not.toThrow()
    const saved = saveLayout(document)
    expect(sourceBody(saved.source)).toBe(source)
    expect(read(saved.source).patch).toEqual(saved.patch)
  })
})
