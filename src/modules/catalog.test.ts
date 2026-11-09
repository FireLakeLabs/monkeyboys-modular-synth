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
  'samplehold',
  'attenuverter',
  'modmix',
  'cvseq',
  'delay',
  'reverb',
  'mix',
  'out',
  'iter',
  'jux',
  'code',
]

describe('module catalog', () => {
  it('retains the v1 modules and ships the twelve pattern/time modules', () => {
    expect(CATALOG.map((m) => m.id).sort()).toEqual(
      [
        ...V1_MODULES,
        'add',
        'gates',
        'switch',
        'aux',
        'duck',
        'noise',
        'harmonic',
        'fmop',
        'drive',
        'folder',
        'lofi',
        'formant',
        'comp',
        'phaser',
        'pan',
        'shift',
        'scope',
        'clock',
        'euclid',
        'ratchet',
        'chance',
        'chord',
        'arp',
        'rev',
        'shuffle',
        'ribbon',
        'time-lens',
        'warp',
        'echo',
        'chunk',
        'every',
        'sometimes',
        'off',
        'layer',
        'splice',
        'wavetable',
        'bytebeat',
        'chip',
        'speak',
      ].sort(),
    )
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

  it('keeps call bindings and their dependencies within the owning module', () => {
    for (const spec of CATALOG) {
      const control = (id: string) => spec.controls.find((item) => item.id === id)
      if (spec.source) {
        expect(control(spec.source.control)?.kind, spec.id).toBe('text')
        for (const name of [spec.source.method, ...spec.source.suffix])
          expect(spec.strudel).toContain(name)
      }
      for (const item of spec.controls) {
        if (!('call' in item) || !item.call) continue
        const binding = item.call
        const where = `${spec.id}.${item.id}`
        if (typeof binding.method === 'string') {
          // s() has separate source/chained ownership for DRUMS and OSC.
          expect(
            [
              ...spec.strudel,
              ...(spec.id === 'osc' || spec.soundSource
                ? ['s', ...(['smpl', 'bytebeat'].includes(spec.id) ? ['n'] : [])]
                : spec.id === 'smpl'
                  ? ['n']
                  : ['seq', 'drums'].includes(spec.id)
                    ? ['velocity']
                    : []),
            ],
            where,
          ).toContain(binding.method)
        } else {
          const selector = control(binding.method.control)
          expect(selector?.kind, where).toBe('switch')
          if (selector?.kind === 'switch')
            expect(Object.keys(binding.method.names).sort(), where).toEqual(
              selector.options
                .filter(
                  (option) =>
                    !('when' in item) ||
                    !item.when ||
                    item.when.every(
                      (condition) =>
                        condition.control !== selector.id ||
                        condition.values.includes(option.value),
                    ),
                )
                .map((option) => option.value)
                .sort(),
            )
          for (const name of Object.values(binding.method.names))
            expect(spec.strudel, where).toContain(name)
        }
        if (binding.argument.kind !== 'tuple')
          expect(binding.argument.kind === 'number', where).toBe(item.kind === 'knob')
        else {
          for (const id of [
            ...binding.argument.controls,
            ...Object.values(binding.argument.byMethod ?? {}).flat(),
          ])
            expect(['knob', 'text', 'switch'], where).toContain(control(id)?.kind)
        }
        if (binding.argument.kind === 'scale')
          expect(control(binding.argument.root)?.kind, where).toBe('switch')
        if (binding.argument.kind === 'transform' && item.kind === 'switch')
          expect(Object.keys(binding.argument.expressions).sort(), where).toEqual(
            item.options.map((option) => option.value).sort(),
          )
        if (binding.when) {
          const selector = control(binding.when.control)
          expect(selector?.kind, where).toBe('switch')
          if (selector?.kind === 'switch')
            expect(selector.options.map((option) => option.value)).toContain(binding.when.value)
        }
        for (const [id, value] of Object.entries(binding.selects ?? {})) {
          const selected = control(id)
          expect(selected?.kind, where).toBe('switch')
          if (selected?.kind === 'switch')
            expect(
              selected.options.map((option) => option.value),
              where,
            ).toContain(value)
        }
        if (binding.enabledBy) expect(control(binding.enabledBy), where).toHaveProperty('omitAt')
        if (binding.withEnvelope)
          expect(
            spec.jacks.find((jack) => jack.id === binding.withEnvelope),
            where,
          ).toHaveProperty('cvTarget')
      }
      for (const [id, value] of Object.entries(spec.readDefaults ?? {})) {
        const item = control(id)
        if (item?.kind === 'knob') {
          expect(value).toBeGreaterThanOrEqual(item.min)
          expect(value).toBeLessThanOrEqual(item.max)
        } else expect(item, `${spec.id}.${id}`).toBeDefined()
      }
    }
  })

  it('points every CV jack at an existing knob', () => {
    for (const m of CATALOG) {
      for (const j of m.jacks.filter((jack) => jack.cvTarget)) {
        const target = m.controls.find((c) => c.id === j.cvTarget)
        expect(target?.kind, `${m.id}:${j.id}`).toBe('knob')
        if (target?.kind === 'knob') {
          expect(target.call?.argument.kind, `${m.id}:${j.id}`).toBe('number')
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
        for (const [alias, canonical] of Object.entries(c.aliases ?? {})) {
          expect(
            c.options.map((o) => o.value),
            `${m.id}.${c.id}:${alias}`,
          ).toContain(canonical)
          expect(
            c.options.map((o) => o.value),
            `${m.id}.${c.id}:${alias}`,
          ).not.toContain(alias)
        }
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
      for (const fn of [...m.strudel, ...Object.keys(m.strudelAliases ?? {})]) {
        expect(owner.get(fn), `${fn} claimed by ${owner.get(fn)} and ${m.id}`).toBeUndefined()
        owner.set(fn, m.id)
      }
    }
  })

  it('aliases refer to functions owned by the same module', () => {
    for (const module of CATALOG)
      for (const name of Object.values(module.strudelAliases ?? {}))
        expect(module.strudel).toContain(name)
    expect(paletteModules('mod', 'lpd').map((module) => module.id)).toEqual(['env'])
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
    expect(find('transpose')).toEqual(['quant', 'osc'])
    expect(find('no-such-module')).toEqual([])
  })
})
