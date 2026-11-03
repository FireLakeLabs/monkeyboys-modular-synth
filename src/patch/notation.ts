import type { GridControl, GridRow, StepsControl } from '../modules/types'

type GridView<T> = { kind: 'grid'; value: T } | { kind: 'text'; reason: string }

const atom = /^(?![_.]+$)(?:[\w#.:+-]+|~)$/

/** Deliberately recognizes only tokens whose timing fits one cell. Never evaluates source. */
export function stepView(text: string, control: StepsControl): GridView<readonly string[]> {
  const tokens = text.trim().match(/<[^<>]*>|[^\s]+/g) ?? []
  if (
    !tokens.length ||
    tokens.join(' ').replace(/\s+/g, ' ') !== text.trim().replace(/\s+/g, ' ') ||
    tokens.some((token) => {
      if (atom.test(token)) return false
      if (!token.startsWith('<') || !token.endsWith('>')) return true
      const alternatives = token.slice(1, -1).trim().split(/\s+/)
      return !alternatives.every((part) => atom.test(part))
    })
  )
    return {
      kind: 'text',
      reason: 'This notation uses timing or grouping the step grid cannot show.',
    }
  if (tokens.length > control.maxSteps)
    return { kind: 'text', reason: `The step grid holds at most ${control.maxSteps} steps.` }
  return { kind: 'grid', value: tokens }
}

/** Flat rows plus the exact repetition forms emitted by the rack generator. */
export function drumView(text: string, control: GridControl): GridView<readonly GridRow[]> {
  const rows: GridRow[] = []
  for (const layer of text.split(',')) {
    const trimmed = layer.trim()
    const repeated = /^(?:\[([^[\]]+)\]|([\w#.:+-]+|~))\*(\d+)$/.exec(trimmed)
    const tokens = (repeated?.[1] ?? repeated?.[2] ?? trimmed).trim().split(/\s+/)
    const repeats = repeated ? Number(repeated[3]) : 1
    const count = tokens.length * repeats
    if (!tokens.every((token) => atom.test(token)))
      return {
        kind: 'text',
        reason: 'This notation uses timing or grouping the drum grid cannot show.',
      }
    if (!control.stepCounts.includes(count))
      return {
        kind: 'text',
        reason: `The drum grid needs ${control.stepCounts.join(' or ')} steps per row.`,
      }
    const samples = [...new Set(tokens.filter((token) => token !== '~'))]
    if (samples.length > 1)
      return { kind: 'text', reason: 'The drum grid needs one sample per row.' }
    if (rows[0] && rows[0].steps.length !== count)
      return { kind: 'text', reason: 'The drum grid needs rows with the same step count.' }
    rows.push({
      sample: samples[0] ?? 'bd',
      steps: Array.from({ length: count }, (_, i) => (tokens[i % tokens.length] === '~' ? 0 : 1)),
    })
  }
  return { kind: 'grid', value: rows }
}

export function drumText(rows: readonly GridRow[]): string {
  return (
    rows
      .flatMap(({ sample, steps }) => {
        if (!steps.includes(1)) return []
        if (steps.every((step) => step === 1)) return `${sample}*${steps.length}`
        let period = steps.length
        for (let p = 1; p < steps.length; p++) {
          if (steps.length % p === 0 && steps.every((step, i) => step === steps[i % p])) {
            period = p
            break
          }
        }
        const tokens = steps
          .slice(0, period)
          .map((step) => (step ? sample : '~'))
          .join(' ')
        return period === steps.length ? tokens : `[${tokens}]*${steps.length / period}`
      })
      .join(', ') || '~'
  )
}
