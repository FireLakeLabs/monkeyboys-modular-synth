import { getModuleSpec, VOICE_EFFECT_ORDER } from './catalog'
import { callMethod, controlEnabled } from './bindings'
import { controlValue } from './values'
import type { PlacedModule } from '../patch/types'

/** Rank active stage bindings, rather than maintaining a second list of module IDs. */
export function effectRanks(
  module: PlacedModule,
  active?: { patched: ReadonlySet<string> },
): number[] {
  const spec = getModuleSpec(module.type)
  const ranks = new Set<number>()
  for (const control of spec.controls) {
    if (!('call' in control) || !control.call || !controlEnabled(spec, module.values, control))
      continue
    const selectorValue = (id: string) => {
      const selector = spec.controls.find((c) => c.id === id)
      const value = selector && controlValue(module, selector)
      return typeof value === 'string' ? value : ''
    }
    if (control.call.when && selectorValue(control.call.when.control) !== control.call.when.value)
      continue
    if (
      active &&
      'omitAt' in control &&
      controlValue(module, control) === control.omitAt &&
      !active.patched.has(control.id)
    )
      continue
    const method = callMethod(control.call, (id) => {
      const selector = spec.controls.find((c) => c.id === id)
      const value = selector && controlValue(module, selector)
      return typeof value === 'string' ? value : ''
    })
    if (
      control.call.argument.kind === 'number' &&
      control.call.argument.optional &&
      selectorValue(control.call.argument.optional) === 'none'
    )
      continue
    const rank = VOICE_EFFECT_ORDER[method]
    if (rank !== undefined) ranks.add(rank)
  }
  return [...ranks].sort((a, b) => a - b)
}

export function effectRank(
  module: PlacedModule,
  active?: { patched: ReadonlySet<string> },
): number | undefined {
  return effectRanks(module, active)[0]
}
