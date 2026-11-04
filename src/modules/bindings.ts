import type { CallBinding, ModuleSpec } from './types'

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
