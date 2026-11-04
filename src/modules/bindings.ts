import type { CallBinding, ModuleSpec } from './types'

export function tupleControls(binding: CallBinding, method: string): readonly string[] {
  return binding.argument.kind === 'tuple'
    ? (binding.argument.byMethod?.[method] ?? binding.argument.controls)
    : []
}

export function callMethod(binding: CallBinding, value: (id: string) => string): string {
  const method = binding.method
  if (typeof method === 'string') return method
  const name = method.names[value(method.control)]
  if (!name) throw new Error(`Missing call variant: ${method.control}`)
  return name
}

/** Match canonical calls; aliases and source/chained context are handled by the reader. */
export function matchControlCall(spec: ModuleSpec, name: string) {
  for (const control of spec.controls) {
    if (!('call' in control) || !control.call) continue
    const binding = control.call
    const method = binding.method
    if (typeof method === 'string') {
      if (method === name) return { control, binding, values: {} }
    } else {
      const variant = Object.entries(method.names).find(([, call]) => call === name)
      if (variant) return { control, binding, values: { [method.control]: variant[0] } }
    }
  }
  return undefined
}

// Pattern-time fractions must retain their timing, rather than round away part of a cycle.
export function patternNumber(value: number): string {
  for (let denominator = 2; denominator <= 64; denominator++) {
    const numerator = value * denominator
    if (Number.isInteger(numerator) && String(value).length > 6)
      return `${numerator}/${denominator}`
  }
  return String(value)
}

/** Shared by the panel and writer; hidden settings remain saved rack state. */
export function controlEnabled(
  spec: ModuleSpec,
  values: Readonly<Record<string, unknown>>,
  control: ModuleSpec['controls'][number],
): boolean {
  if (!('when' in control) || !control.when) return true
  return control.when.every((condition) => {
    const selector = spec.controls.find((item) => item.id === condition.control)
    const value = values[condition.control] ?? selector?.default
    return typeof value === 'string' && condition.values.includes(value)
  })
}

/** Fixed main-chain stages in superdough 1.3.0; repeated setters share one stage. */
export const FIXED_EFFECT_STAGES = [
  { label: 'SHIFT', methods: ['stretch'] },
  { label: 'transient', methods: ['transient'] },
  { label: 'DJ filter', methods: ['djf'] },
  { label: 'low-pass', methods: ['lpf'] },
  { label: 'high-pass', methods: ['hpf'] },
  { label: 'band-pass', methods: ['bpf'] },
  { label: 'FORMANT', methods: ['vowel'] },
  { label: 'decimator', methods: ['coarse'] },
  { label: 'bitcrusher', methods: ['crush'] },
  { label: 'legacy shape', methods: ['shape'] },
  {
    label: 'waveshaper',
    methods: ['soft', 'hard', 'cubic', 'diode', 'asym', 'sinefold', 'chebyshev', 'fold'],
  },
  { label: 'compressor', methods: ['compressor'] },
  { label: 'PAN', methods: ['pan'] },
  { label: 'PHASER', methods: ['phaser'] },
  { label: 'DELAY', methods: ['delay'] },
  { label: 'REVERB', methods: ['room'] },
] as const

export function fixedEffectStages(
  spec: ModuleSpec,
  values: Readonly<Record<string, unknown>>,
): number[] {
  const value = (id: string) => values[id] ?? spec.controls.find((c) => c.id === id)?.default
  return [
    ...new Set(
      spec.controls.flatMap((control) => {
        if (
          !('call' in control) ||
          !control.call ||
          !controlEnabled(spec, values, control) ||
          ('omitAt' in control && control.omitAt === value(control.id))
        )
          return []
        const binding = control.call
        if (
          binding.argument.kind === 'number' &&
          binding.argument.optional &&
          value(binding.argument.optional) === 'none'
        )
          return []
        if (binding.when && value(binding.when.control) !== binding.when.value) return []
        const method = callMethod(binding, (id) => {
          const selector = value(id)
          return typeof selector === 'string' ? selector : ''
        })
        const stage = FIXED_EFFECT_STAGES.findIndex((stage) =>
          stage.methods.some((name) => name === method),
        )
        return stage < 0 ? [] : [stage]
      }),
    ),
  ].sort((a, b) => a - b)
}
