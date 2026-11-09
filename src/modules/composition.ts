import { getModuleSpec } from './catalog'
import { controlValue } from './values'
import type { PlacedModule } from '../patch/types'

/** The catalog owns composition modes and defaults for every panel size. */
export function compositionMode(module: PlacedModule): string | undefined {
  const spec = getModuleSpec(module.type)
  const control = spec.composition && spec.controls.find((c) => c.id === spec.composition?.mode)
  const value = control && controlValue(module, control)
  return typeof value === 'string' ? value : undefined
}

export function isStack(module: PlacedModule): boolean {
  const composition = getModuleSpec(module.type).composition
  return !!composition && compositionMode(module) === composition.stack
}
