import type { Span } from '../reader/types'

/** Validate upstream hap locations and map evaluated UTF-16 offsets to saved source. */
export function sourceLocations(
  hap: unknown,
  sourceLength: number,
  sourceOffset: (offset: number) => number | null,
): Span[] {
  const context: unknown =
    hap && typeof hap === 'object' && 'context' in hap ? hap.context : undefined
  const locations: unknown =
    context && typeof context === 'object' && 'locations' in context ? context.locations : undefined
  if (!Array.isArray(locations)) return []
  return locations.flatMap((location: unknown) => {
    if (!location || typeof location !== 'object' || !('start' in location) || !('end' in location))
      return []
    if (!Number.isSafeInteger(location.start) || !Number.isSafeInteger(location.end)) return []
    if (typeof location.start !== 'number' || typeof location.end !== 'number') return []
    const start = sourceOffset(location.start)
    const end = sourceOffset(location.end)
    return start !== null && end !== null && start >= 0 && end > start && end <= sourceLength
      ? [{ start, end }]
      : []
  })
}
