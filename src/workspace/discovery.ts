import { CATALOG, getModuleSpec } from '../modules/catalog'
import type { Jack } from '../modules/types'
import type { JackRef, Patch } from '../patch/types'
import type { SourceDocument } from '../reader/types'
import {
  connect,
  freePosition,
  placeModule,
  rackRows,
  type ConnectionAssessment,
} from '../rack/model'
import { assessDocumentConnection } from './connections'

export function jackSpec(patch: Patch, ref: JackRef): Jack | undefined {
  const module = patch.modules.find((module) => module.id === ref.module)
  return module && getModuleSpec(module.type).jacks.find((jack) => jack.id === ref.jack)
}

/** A gesture can start at either end; stored cables always point out → in. */
export function connectionEnds(patch: Patch, anchor: JackRef, other: JackRef) {
  const start = jackSpec(patch, anchor)
  const end = jackSpec(patch, other)
  if (!start || !end || start.direction === end.direction) return null
  return start.direction === 'out' ? { from: anchor, to: other } : { from: other, to: anchor }
}

export interface ModuleConnection {
  type: string
  jack: string
  position: { row: number; hp: number } | null
  assessment: Exclude<ConnectionAssessment, { kind: 'blocked' }>
}

/** Placement and wiring cross the workspace commit boundary together. */
export function addConnectedModule(
  patch: Patch,
  anchor: JackRef,
  choice: { type: string; jack: string; row: number; hp: number },
  moving?: string,
): Patch {
  const placed = placeModule(patch, choice.type, choice.row, choice.hp)
  const added = placed.modules.at(-1)
  if (!added) throw new Error('Missing new module')
  const ends = connectionEnds(placed, anchor, { module: added.id, jack: choice.jack })
  if (!ends) throw new Error('Choose an opposite-direction jack')
  return connect(placed, ends.from, ends.to, true, moving)
}

/** Offer catalog defaults that actually connect, without changing the document. */
export function discoverModules(
  document: SourceDocument,
  anchor: JackRef,
  position: { row: number; hp: number },
  moving?: string,
): ModuleConnection[] {
  const start = jackSpec(document.patch, anchor)
  if (!start) return []
  const choices: ModuleConnection[] = []
  for (const spec of CATALOG) {
    if (spec.unique && document.patch.modules.some((module) => module.type === spec.id)) continue
    const jacks = spec.jacks.filter((jack) => jack.direction !== start.direction)
    if (!jacks.length) continue
    const hp = freePosition(document.patch, spec.id, position.row, position.hp)
    // A full rail still lists electrically compatible modules, but disables placement.
    const target =
      hp === null ? { row: rackRows(document.patch), hp: 0 } : { row: position.row, hp }
    const placed = placeModule(document.patch, spec.id, target.row, target.hp)
    const added = placed.modules.at(-1)
    if (!added) continue
    for (const jack of jacks) {
      const ends = connectionEnds(placed, anchor, { module: added.id, jack: jack.id })
      if (!ends) continue
      const assessment = assessDocumentConnection(document, ends.from, ends.to, moving, placed)
      if (assessment.kind !== 'blocked')
        choices.push({
          type: spec.id,
          jack: jack.id,
          position: hp === null ? null : target,
          assessment,
        })
    }
  }
  return choices
}
