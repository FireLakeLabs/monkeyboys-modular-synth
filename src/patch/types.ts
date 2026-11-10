import type { SamplePack } from '../samples/packs'
import type { RailHp } from './layout'
import type { LookId } from '../modules/looks'

/**
 * The in-memory patch. See docs/patch-format.md.
 */

/** A step token, a grid, a number, a switch value or code text, depending on the control. */
export type ControlValue =
  | number
  | string
  | readonly number[]
  | readonly string[]
  | readonly { sample: string; steps: readonly (0 | 1)[] }[]

export interface PlacedModule {
  /** Module type plus a counter, e.g. 'vcf1'. */
  id: string
  /** Catalog id, e.g. 'vcf'. */
  type: string
  /** Rack row, from 0. OUT uses a canonical 0 outside the rails. */
  row: number
  /** Offset from the left of the row, in HP. OUT uses a canonical 0. */
  hp: number
  /** Explicit imported FX stage; retained even when its order could use native calls. */
  fx?: true | 'native'
  look: LookId
  /** One entry per control id; a missing entry means the catalog default. */
  values: Record<string, ControlValue>
  /** Imported callback identifier; preserves references inside opaque loop bodies. */
  functionParameter?: string
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
  /** Optional display name, saved only in rack metadata. */
  name?: string
  modules: PlacedModule[]
  cables: Cable[]
  /** Fan-out names (callback-local for function members), retained after reducing to one branch; keyed "moduleId:jackId". */
  names: Record<string, string>
  /** Opaque setup statements retained by an explicit rack conversion. */
  prelude?: string
  /** Bay-owned setup, proven against executable source before restoration. */
  cartridges?: SamplePack[]
  /** Optional saved rail count, including empty rows; old files derive it from modules. */
  rows?: number
  /** Rail width in HP; older files default to 64. */
  railHp?: RailHp
}

export function emptyPatch(): Patch {
  return { version: 1, modules: [], cables: [], names: {} }
}
