import {
  arrangementCells,
  arrangementLength,
  formatArrangement,
  MAX_ARRANGEMENT_CYCLES,
  paintArrangement,
} from '../patch/arrangement'
import type { Patch } from '../patch/types'
import { routedModules, setValue } from './model'

/** One arranger row: a connected mixer channel and its lane. */
export interface ArrangerRow {
  mixer: string
  channel: number
  /** The control holding this lane, `arr1`…`arr4`. */
  control: string
  /** Channel NAME, or the module feeding the channel. */
  label: string
  /** Lane text; empty plays every cycle. */
  lane: string
  /** True when the channel reaches OUT, so its lane is heard. */
  routed: boolean
}

export const DEFAULT_SONG_CYCLES = 16

/** Rows for every connected MIX channel, in rack order. */
export function arrangerRows(patch: Patch): ArrangerRow[] {
  const routed = routedModules(patch)
  const mixers = patch.modules.filter((module) => module.type === 'mix')
  return mixers.flatMap((mixer) =>
    [1, 2, 3, 4].flatMap((channel) => {
      const cable = patch.cables.find(
        (item) => item.to.module === mixer.id && item.to.jack === `in${channel}`,
      )
      if (!cable) return []
      const control = `arr${channel}`
      const lane = mixer.values[control]
      const name = mixer.values[`name${channel}`]
      const text = typeof lane === 'string' ? lane : ''
      return [
        {
          mixer: mixer.id,
          channel,
          control,
          label: `${mixers.length > 1 ? `${mixer.id} · ` : ''}${
            typeof name === 'string' && name ? name : cable.from.module
          }`,
          lane: text,
          routed: routed.has(mixer.id),
        },
      ]
    }),
  )
}

/** The song the lane shows: its longest lane, or a default when every channel always plays. */
export function songCycles(rows: readonly Pick<ArrangerRow, 'lane'>[]): number {
  return Math.max(0, ...rows.map((row) => arrangementLength(row.lane))) || DEFAULT_SONG_CYCLES
}

/** Paints one row's cycles as a single rack edit. */
export function paintRow(
  patch: Patch,
  row: Pick<ArrangerRow, 'mixer' | 'control' | 'lane'>,
  paint: { length: number; from: number; to: number; on: boolean },
): Patch {
  return setValue(patch, row.mixer, row.control, paintArrangement(row.lane, paint))
}

/**
 * Sets every lane to `length` cycles. A longer song repeats lanes unchanged; a
 * shorter one cuts lanes that run past it, in one edit.
 */
export function resizeSong(patch: Patch, length: number): Patch {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_ARRANGEMENT_CYCLES)
    throw new Error(`Song length must be 1 to ${MAX_ARRANGEMENT_CYCLES} cycles`)
  return arrangerRows(patch)
    .filter((row) => arrangementLength(row.lane) > length)
    .reduce(
      (next, row) =>
        setValue(
          next,
          row.mixer,
          row.control,
          formatArrangement(arrangementCells(row.lane, length)),
        ),
      patch,
    )
}
