import { getModuleSpec } from './catalog'
import type { Control } from './types'
import type { PlacedModule } from '../patch/types'

/** Missing values in older v1 files retain their original behavior. */
export function controlValue(module: PlacedModule, control: Control) {
  return (
    module.values[control.id] ??
    getModuleSpec(module.type).legacyDefaults?.[control.id] ??
    control.default
  )
}
