import { getModuleSpec } from '../modules/catalog'
import type { PlacedModule } from './types'

export const ROW_HP = 64

/** First free interval at or after the cursor, spilling onto another fixed rail. */
export function nextPosition(
  occupied: readonly PlacedModule[],
  type: string,
  row: number,
  hp = 0,
): { row: number; hp: number } {
  const width = getModuleSpec(type).hp
  if (width > ROW_HP) throw new Error('Module is wider than the rail')
  for (;;) {
    if (hp + width > ROW_HP) {
      row++
      hp = 0
    }
    const collision = occupied.find(
      (module) =>
        module.row === row &&
        hp < module.hp + getModuleSpec(module.type).hp &&
        module.hp < hp + width,
    )
    if (!collision) return { row, hp }
    hp = collision.hp + getModuleSpec(collision.type).hp
  }
}
