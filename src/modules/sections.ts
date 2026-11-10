import type { ModuleSpec } from './types'
import type { PlacedModule } from '../patch/types'
import { controlValue } from './values'

/** Decimal/scientific literal only. No expressions, coercion tricks or evaluation. */
export function sectionCycles(text: string): number | undefined {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) return undefined
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function sectionOrder(spec: ModuleSpec, module: PlacedModule) {
  const sections = spec.sections
  if (!sections) throw new Error('Expected a section module')
  const control = spec.controls.find((c) => c.id === sections.order)
  const text = control && controlValue(module, control)
  const order = typeof text === 'string' ? text.trim().split(/\s+/) : []
  if (
    order.length !== sections.inputs.length ||
    new Set(order).size !== order.length ||
    order.some((n) => !sections.inputs[Number(n) - 1] || !/^[1-9]\d*$/.test(n))
  )
    throw new Error('ORDER requires each section socket once, such as 1 2 3 4')
  return order.map((n) => {
    const input = sections.inputs[Number(n) - 1]
    if (!input) throw new Error('Missing section socket')
    return input
  })
}
