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
