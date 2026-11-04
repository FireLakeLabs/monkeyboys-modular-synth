/** Measures layout options against real panel geometry. Run with node. */
import { writeFileSync } from 'node:fs'
import { buildTree, type Layer } from './tree.mts'
import { idioms, repoCorpus, upstreamCorpus } from './corpus.mts'

// Measured in Chromium at 100% zoom, Instrument look (see docs/nested-step-editor.md).
const SEQ = { width: 104, lines: 4 }
const DRUM = { width: 109, lines: 1 }
const CHAR = 7.2 // 12 px JetBrains Mono, the panel readout minimum.
interface Leaf { share: number; local: number; depth: number; label: number }
function leaves(layers: Layer[], share: number, depth: number, out: Leaf[]) {
  for (const layer of layers) {
    const total = layer.cells.reduce((sum, c) => sum + c.weight, 0)
    for (const c of layer.cells) {
      const part = c.weight / total
      const here = share * part
      if (c.layers) {
        // `<>` shows one alternative at a time, so each keeps the whole slot.
        const inner = c.shape === 'alt' ? c.layers.flatMap((l) => l.cells.map((x) => ({ span: x.span, cells: [x] }))) : c.layers
        leaves(inner, here, depth + 1, out)
      } else if (c.shape === 'atom') {
        out.push({ share: here, local: part, depth, label: (c.text?.length ?? 1) * CHAR + 2 })
      }
    }
  }
}
const quantile = (values: number[], q: number) => {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0
}
const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10
/** Up to four equal shares of the cycle, starting each line on a cell boundary when possible. */
function lineCount(cells: { weight: number }[], max: number): number {
  const total = cells.reduce((sum, c) => sum + c.weight, 0)
  for (let lines = max; lines > 1; lines--) {
    let at = 0
    const edges = new Set(cells.map((c) => (at += c.weight)))
    if (Array.from({ length: lines - 1 }, (_, i) => (total * (i + 1)) / lines).every((edge) => edges.has(edge))) return lines
  }
  return max
}
function measure(strings: string[], panel: typeof SEQ) {
  const rows = strings.map((s) => {
    const tree = buildTree(s)
    const out: Leaf[] = []
    leaves(tree.root, 1, 0, out)
    const lanes = tree.join === 'stack' ? tree.root.length : 1
    const max = Math.max(1, Math.floor(panel.lines / lanes))
    return { s, out, lines: Math.max(...tree.root.map((l) => lineCount(l.cells, max))) }
  })
  const all = rows.flatMap((r) => r.out.map((l) => ({ ...l, lines: r.lines })))
  const strip = all.map((l) => ({ px: panel.width * l.share, label: l.label }))
  const wrapped = all.map((l) => ({ px: panel.width * l.lines * l.share, label: l.label }))
  const focus = all.map((l) => ({ px: panel.width * l.local * (l.depth === 0 ? l.lines : 1), label: l.label }))
  const report = (xs: { px: number; label: number }[]) => ({
    median: Math.round(quantile(xs.map((x) => x.px), 0.5) * 10) / 10,
    p10: Math.round(quantile(xs.map((x) => x.px), 0.1) * 10) / 10,
    min: Math.round(Math.min(...xs.map((x) => x.px)) * 10) / 10,
    labelFits: pct(xs.filter((x) => x.px >= x.label).length, xs.length),
    atLeast8: pct(xs.filter((x) => x.px >= 8).length, xs.length),
  })
  return {
    strings: strings.length,
    leaves: all.length,
    depthHistogram: Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, all.filter((l) => l.depth === d).length])),
    proportionalStrip: report(strip),
    proportionalWrapped: report(wrapped),
    focusPerLevel: report(focus),
  }
}
const repo = repoCorpus().filter((s) => !/^[A-Za-z]+:[a-z]+$/.test(s) && !/^[a-z]+$/.test(s))
// Sequencer-sized worst cases: real step counts with one and two levels of split.
const stress = [
  'c2 c2 eb2 g2 c3 bb2 g2 eb2',
  'c2 [c2 eb2] g2 c3 bb2 [g2 eb2] c2 g2',
  'c2 c2 eb2 g2 c3 bb2 g2 eb2 c2 c2 eb2 g2 c3 bb2 g2 eb2',
  'c2 [c2 eb2] eb2 g2 c3 [bb2 [g2 eb2]] g2 eb2 c2 c2 eb2 g2 c3 bb2 g2 eb2',
]
const results = {
  stressAtSeq: Object.fromEntries(stress.map((s) => [s, measure([s], SEQ)])),
  panels: { SEQ, DRUM, CHAR },
  repoAtSeq: measure(repo, SEQ),
  idiomsAtSeq: measure(idioms, SEQ),
  upstreamAtSeq: measure(upstreamCorpus(), SEQ),
  repoAtDrum: measure(repo, DRUM),
  idiomsAtDrum: measure(idioms, DRUM),
}
writeFileSync('spike/out-layout.json', JSON.stringify(results, null, 1))
for (const [k, v] of Object.entries(results)) console.log(k, JSON.stringify(v))
