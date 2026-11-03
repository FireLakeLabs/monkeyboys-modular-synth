import type { LookId } from '../modules/looks'

/**
 * The in-memory patch. See docs/patch-format.md.
 */

/** A step token, a grid, a number, a switch value or code text, depending on the control. */
export type ControlValue =
  number | string | readonly string[] | readonly { sample: string; steps: readonly (0 | 1)[] }[]

export interface PlacedModule {
  /** Module type plus a counter, e.g. 'vcf1'. */
  id: string
  /** Catalog id, e.g. 'vcf'. */
  type: string
  /** Rack row, from 0. */
  row: number
  /** Offset from the left of the row, in HP. */
  hp: number
  look: LookId
  /** One entry per control id; a missing entry means the catalog default. */
  values: Record<string, ControlValue>
}

export interface JackRef {
  module: string
  jack: string
}

export interface Cable {
  id: string
  /** Always an `out` jack. */
  from: JackRef
  /** Always an `in` jack. An `in` jack has at most one cable. */
  to: JackRef
}

export interface Patch {
  version: 1
  modules: PlacedModule[]
  cables: Cable[]
  /** Fan-out names, retained after reducing to one branch; keyed "moduleId:jackId". */
  names: Record<string, string>
  /** Optional saved rail count, including empty rows; old files derive it from modules. */
  rows?: number
}

export function emptyPatch(): Patch {
  return { version: 1, modules: [], cables: [], names: {} }
}
