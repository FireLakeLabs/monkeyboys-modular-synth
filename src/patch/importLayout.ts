import { getModuleSpec } from '../modules/catalog'
import { nextPosition, RAIL_WIDTHS } from './layout'
import type { Patch } from './types'

/** Initial placement only: callers must establish that saved layout is absent. */
export function packImported(patch: Patch): Patch {
  const candidates = RAIL_WIDTHS.map((railHp) => {
    const modules: Patch['modules'] = []
    let row = 0
    let hp = 0
    for (const module of patch.modules) {
      const position = nextPosition(modules, module.type, row, hp, railHp)
      modules.push({ ...module, ...position })
      if (module.type !== 'out') {
        row = position.row
        hp = position.hp + getModuleSpec(module.type).hp
      }
    }
    return { ...patch, modules, railHp, rows: row + 1 }
  })
  // Fewer rows first; equal row counts keep the narrower case.
  return candidates.reduce((best, candidate) => (candidate.rows < best.rows ? candidate : best))
}
