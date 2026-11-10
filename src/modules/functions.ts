import { CATALOG } from './catalog'
import type { ModuleSpec } from './types'
import type { PlacedModule } from '../patch/types'
import { controlValue } from './values'

export function loopMethod(spec: ModuleSpec, module: PlacedModule): string | undefined {
  const loop = spec.functionLoop
  if (!loop) return undefined
  const read = (id: string) => {
    const control = spec.controls.find((control) => control.id === id)
    return control ? controlValue(module, control) : undefined
  }
  if (loop.when && read(loop.when.control) !== loop.when.value) return undefined
  if (typeof loop.method === 'string') return loop.method
  const mode = read(loop.method.control)
  return typeof mode === 'string' ? loop.method.names[mode] : undefined
}

export function loopControls(spec: ModuleSpec, method: string): readonly string[] {
  return spec.functionLoop?.byMethod?.[method] ?? spec.functionLoop?.controls ?? []
}

export function loopRole(spec: ModuleSpec, module: PlacedModule): string {
  return (spec.functionLoop?.role ?? '').replace(/\{([^}]+)\}/g, (_match, id: string) => {
    const control = spec.controls.find((control) => control.id === id)
    const value = control && controlValue(module, control)
    return typeof value === 'string' || typeof value === 'number' ? String(value) : id
  })
}

export function isLoopChain(spec: ModuleSpec): boolean {
  return (
    spec.id === 'code' ||
    !!spec.functionLoop ||
    (!spec.source &&
      !spec.soundSource &&
      !spec.modSource &&
      !['seq', 'drums', 'osc', 'smpl', 'mix', 'out', 'lfo', 'env'].includes(spec.id) &&
      spec.controls.some((control) => 'call' in control && control.call))
  )
}

/** Names emitted as runtime identifiers, excluding rack-only routing adapters. */
export function patternRuntimeNames(): Set<string> {
  return new Set([
    ...CATALOG.filter((spec) => !['aux', 'duck', 'gates', 'switch'].includes(spec.id)).flatMap(
      (spec) => spec.strudel,
    ),
    'rev',
    'press',
    'orbit',
    'FX',
  ])
}
