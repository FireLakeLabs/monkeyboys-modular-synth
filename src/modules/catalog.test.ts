import { describe, expect, it } from 'vitest'
import { CATALOG, getModuleSpec, PALETTE_CATEGORIES, paletteModules } from './catalog'
import { DEFAULT_LOOK, LOOKS } from './looks'

const V1_MODULES = [
  'seq',
  'drums',
  'quant',
  'osc',
  'smpl',
  'vcf',
  'vca',
  'env',
  'lfo',
  'delay',
  'reverb',
  'mix',
  'out',
  'iter',
  'jux',
  'code',
]

describe('module catalog', () => {
  it('contains exactly the v1 modules', () => {
    expect(CATALOG.map((m) => m.id).sort()).toEqual([...V1_MODULES].sort())
  })

  it('has unique module ids', () => {
    const ids = CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('looks modules up by id', () => {
    expect(getModuleSpec('vcf').name).toBe('VCF')
    expect(() => getModuleSpec('nope')).toThrow()
  })

  it('keeps family and category consistent', () => {
    for (const m of CATALOG) {
      if (m.family === 'alien') expect(m.category, m.id).toBe('alien')
      if (m.family === 'cyber') expect(m.category, m.id).toBe('cyber')
      if (m.family === 'hardware') expect(['alien', 'cyber'], m.id).not.toContain(m.category)
    }
  })

  it('gives every module a positive whole-number width', () => {
    for (const m of CATALOG) {
      expect(Number.isInteger(m.hp) && m.hp > 0, m.id).toBe(true)
    }
  })

  it('gives every module at least one jack, with unique ids', () => {
    for (const m of CATALOG) {
      expect(m.jacks.length, m.id).toBeGreaterThan(0)
      const ids = m.jacks.map((j) => j.id)
      expect(new Set(ids).size, m.id).toBe(ids.length)
    }
  })

  it('gives every module unique control ids', () => {
    for (const m of CATALOG) {
      const ids = m.controls.map((c) => c.id)
      expect(new Set(ids).size, m.id).toBe(ids.length)
    }
  })

  it('points every CV jack at an existing knob', () => {
    for (const m of CATALOG) {
      for (const j of m.jacks.filter((jack) => jack.cvTarget)) {
        const target = m.controls.find((c) => c.id === j.cvTarget)
        expect(target?.kind, `${m.id}:${j.id}`).toBe('knob')
        if (target?.kind === 'knob') {
          expect(target.modulation?.default).toBeGreaterThanOrEqual(
            target.modulation?.min ?? Infinity,
          )
          expect(target.modulation?.default).toBeLessThanOrEqual(
            target.modulation?.max ?? -Infinity,
          )
        }
        expect(j.direction, `${m.id}:${j.id}`).toBe('in')
        expect(j.signal, `${m.id}:${j.id}`).toBe('mod')
      }
    }
  })

  it('keeps knob defaults, detents and omit values inside their ranges', () => {
    for (const m of CATALOG) {
      for (const c of m.controls) {
        if (c.kind !== 'knob') continue
        const where = `${m.id}.${c.id}`
        expect(c.min, where).toBeLessThan(c.max)
        expect(c.step, where).toBeGreaterThan(0)
        expect(c.default, where).toBeGreaterThanOrEqual(c.min)
        expect(c.default, where).toBeLessThanOrEqual(c.max)
        for (const d of c.detents ?? []) {
          expect(d, where).toBeGreaterThanOrEqual(c.min)
          expect(d, where).toBeLessThanOrEqual(c.max)
        }
        if (c.omitAt !== undefined) {
          expect(c.omitAt, where).toBeGreaterThanOrEqual(c.min)
          expect(c.omitAt, where).toBeLessThanOrEqual(c.max)
        }
      }
    }
  })

  it('keeps switch defaults among their options', () => {
    for (const m of CATALOG) {
      for (const c of m.controls) {
        if (c.kind !== 'switch') continue
        expect(
          c.options.map((o) => o.value),
          `${m.id}.${c.id}`,
        ).toContain(c.default)
      }
    }
  })

  it('keeps step and grid defaults within their limits', () => {
    for (const m of CATALOG) {
      for (const c of m.controls) {
        if (c.kind === 'steps')
          expect(c.default.length, `${m.id}.${c.id}`).toBeLessThanOrEqual(c.maxSteps)
        if (c.kind === 'grid') {
          for (const row of c.default)
            expect(c.stepCounts, `${m.id}.${c.id}.${row.sample}`).toContain(row.steps.length)
        }
      }
    }
  })

  it('assigns each Strudel function to at most one module', () => {
    const owner = new Map<string, string>()
    for (const m of CATALOG) {
      for (const fn of m.strudel) {
        expect(owner.get(fn), `${fn} claimed by ${owner.get(fn)} and ${m.id}`).toBeUndefined()
        owner.set(fn, m.id)
      }
    }
  })

  it('marks every alien and cyber module as order-sensitive', () => {
    for (const m of CATALOG.filter((x) => x.family !== 'hardware')) {
      expect(m.orderSensitive, m.id).toBe(true)
    }
  })

  it("has a default look in every family that is one of that family's looks", () => {
    for (const family of ['hardware', 'alien', 'cyber'] as const) {
      expect(LOOKS[family] as readonly string[]).toContain(DEFAULT_LOOK[family])
    }
  })
})

describe('module palette', () => {
  it('groups every module once in the six categories, independent of family', () => {
    expect(PALETTE_CATEGORIES.map((category) => category.label)).toEqual([
      'Pattern',
      'Sound',
      'Shape',
      'Modulate',
      'Effects',
      'Utility',
    ])
    const modules = PALETTE_CATEGORIES.flatMap((category) => paletteModules(category.id, ''))
    expect(modules.map((module) => module.id).sort()).toEqual(
      CATALOG.map((module) => module.id).sort(),
    )
    expect(paletteModules('pattern', '').map((module) => module.id)).toContain('jux')
    expect(paletteModules('util', '').map((module) => module.id)).toContain('code')
    for (const module of modules) expect(module.paletteCall.trim(), module.id).not.toBe('')
  })

  it('filters names, long names and Strudel calls case-insensitively', () => {
    const find = (query: string) =>
      PALETTE_CATEGORIES.flatMap((category) =>
        paletteModules(category.id, query).map((module) => module.id),
      )
    expect(find('  vCf  ')).toEqual(['vcf'])
    expect(find('low-frequency')).toEqual(['lfo'])
    expect(find('.LPF()')).toEqual(['vcf'])
    expect(find('note("')).toEqual(['seq'])
    expect(find('transpose')).toEqual(['osc'])
    expect(find('no-such-module')).toEqual([])
  })
})
