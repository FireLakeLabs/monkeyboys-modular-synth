/**
 * Arranger lane values (#141): which cycles a mixer channel plays in.
 *
 * A lane is written as a one-cycle-per-step mask, `.mask("<1!4 0!4>")`: 1 plays
 * that cycle, 0 silences it, and the mask repeats after its total length. An
 * empty value is a channel that always plays, so it writes no call.
 */

/** The longest lane, in cycles, that the arranger writes or reads. */
export const MAX_ARRANGEMENT_CYCLES = 256

const STEP = /^([01])(?:!([1-9]\d*))?$/

/**
 * One boolean per cycle, or `undefined` for text the lane does not own.
 * The empty string is an always-playing channel and returns an empty array.
 */
export function parseArrangement(text: string): readonly boolean[] | undefined {
  if (text === '') return []
  const body = /^<\s*([^<>]*?)\s*>$/.exec(text)?.[1]
  if (!body) return undefined
  const cycles: boolean[] = []
  for (const token of body.split(/\s+/)) {
    const step = STEP.exec(token)
    if (!step) return undefined
    const count = Number(step[2] ?? 1)
    if (cycles.length + count > MAX_ARRANGEMENT_CYCLES) return undefined
    for (let i = 0; i < count; i++) cycles.push(step[1] === '1')
  }
  return cycles
}

export function isArrangement(text: string): boolean {
  return parseArrangement(text) !== undefined
}

/** Canonical text for cycles: runs as `1!n`, and an always-playing lane as ''. */
export function formatArrangement(cycles: readonly boolean[]): string {
  if (cycles.length > MAX_ARRANGEMENT_CYCLES) throw new Error('Arrangement is too long')
  if (cycles.every(Boolean)) return ''
  const runs: string[] = []
  let index = 0
  while (index < cycles.length) {
    const on = cycles[index]
    let count = 1
    while (cycles[index + count] === on) count++
    runs.push(`${on ? 1 : 0}${count > 1 ? `!${count}` : ''}`)
    index += count
  }
  return `<${runs.join(' ')}>`
}

/** The cycles a lane plays across `length` cycles, repeating it as the engine does. */
export function arrangementCells(text: string, length: number): boolean[] {
  const cycles = parseArrangement(text)
  if (!cycles) throw new Error(`Not an arranger lane: ${text}`)
  return Array.from({ length }, (_, i) =>
    cycles.length ? (cycles[i % cycles.length] ?? true) : true,
  )
}

/** Length of a lane's repeat, in cycles; an always-playing lane has none. */
export function arrangementLength(text: string): number {
  return parseArrangement(text)?.length ?? 0
}

/**
 * Sets cycles `from`..`to` (inclusive, in either order) to play or rest over a
 * song of `length` cycles, and returns the lane's canonical text.
 */
export function paintArrangement(
  text: string,
  { length, from, to, on }: { length: number; from: number; to: number; on: boolean },
): string {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_ARRANGEMENT_CYCLES)
    throw new Error('Song length must be 1 to 256 cycles')
  const cells = arrangementCells(text, length)
  const [start, end] = from <= to ? [from, to] : [to, from]
  for (let i = Math.max(0, start); i <= Math.min(length - 1, end); i++) cells[i] = on
  return formatArrangement(cells)
}
