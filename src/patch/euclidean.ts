/** Bjorklund grouping, with the pinned engine's left rotation convention. */
export function euclidean(pulses: number, steps: number, rotation = 0): boolean[] {
  if (
    !Number.isSafeInteger(steps) ||
    steps < 1 ||
    steps > 4096 ||
    !Number.isSafeInteger(pulses) ||
    Math.abs(pulses) > steps
  )
    return []
  let a: boolean[][] = Array.from({ length: Math.abs(pulses) }, () => [true])
  let b: boolean[][] = Array.from({ length: steps - Math.abs(pulses) }, () => [false])
  while (Math.min(a.length, b.length) > 1) {
    const paired = a.slice(0, b.length).map((part, index) => [...part, ...(b[index] ?? [])])
    if (a.length > b.length) {
      b = a.slice(b.length)
      a = paired
    } else {
      b = b.slice(a.length)
      a = paired
    }
  }
  const pattern = [...a.flat(), ...b.flat()].map((hit) => (pulses < 0 ? !hit : hit))
  const shift = ((-rotation % steps) + steps) % steps
  return [...pattern.slice(shift), ...pattern.slice(0, shift)]
}
