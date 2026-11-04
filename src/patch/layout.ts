import { getModuleSpec } from '../modules/catalog'
import type { Patch, PlacedModule } from './types'

export const HP = 12
export const OUTPUT_PANEL_WIDTH = getModuleSpec('out').hp * HP + 16
export const ROW_HP = 64
export const RAIL_WIDTHS = [64, 84, 104] as const
export type RailHp = (typeof RAIL_WIDTHS)[number]
export function isRailHp(value: unknown): value is RailHp {
  return RAIL_WIDTHS.some((width) => width === value)
}
export function railWidth(patch: Patch): RailHp {
  return patch.railHp ?? ROW_HP
}

/** The case includes the pinned 8 HP output panel and frame padding. */
export function defaultRailWidth(windowWidth: number): RailHp {
  return (
    [...RAIL_WIDTHS]
      .reverse()
      .find((width) => width * HP + OUTPUT_PANEL_WIDTH + 72 <= windowWidth) ?? 64
  )
}

export function validateRailBounds(patch: Patch): void {
  for (const module of patch.modules.filter((m) => m.type !== 'out'))
    if (module.hp + getModuleSpec(module.type).hp > railWidth(patch))
      throw new Error('Module extends past the rail')
}

export function validatePositions(patch: Patch): void {
  validateRailBounds(patch)
  for (const module of patch.modules.filter((m) => m.type !== 'out')) {
    const end = module.hp + getModuleSpec(module.type).hp
    if (
      patch.modules.some(
        (other) =>
          other.type !== 'out' &&
          other.id !== module.id &&
          other.row === module.row &&
          module.hp < other.hp + getModuleSpec(other.type).hp &&
          other.hp < end,
      )
    )
      throw new Error('Modules cannot overlap')
  }
}

/** First free interval at or after the cursor, spilling onto another fixed rail. */
export function nextPosition(
  occupied: readonly PlacedModule[],
  type: string,
  row: number,
  hp = 0,
  railHp: RailHp = ROW_HP,
): { row: number; hp: number } {
  if (type === 'out') return { row: 0, hp: 0 }
  const width = getModuleSpec(type).hp
  if (width > railHp) throw new Error('Module is wider than the rail')
  for (;;) {
    if (hp + width > railHp) {
      row++
      hp = 0
    }
    const collision = occupied.find(
      (module) =>
        module.type !== 'out' &&
        module.row === row &&
        hp < module.hp + getModuleSpec(module.type).hp &&
        module.hp < hp + width,
    )
    if (!collision) return { row, hp }
    hp = collision.hp + getModuleSpec(collision.type).hp
  }
}
