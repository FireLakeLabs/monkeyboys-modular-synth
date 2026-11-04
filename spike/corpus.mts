import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
}
const CALLS = 'note|n|s|sound|chord|struct|mask|arp|scale|euclid|ply|bank|vowel|degradeBy|lpf|hpf|gain|pan|room|speed|begin|end|cut|shape|delay|crush|coarse|clip|legato'
/** Mini strings actually used by repository patches. */
export function repoCorpus(): string[] {
  const roots = ['src/library', 'src/patch/demo.ts', 'src/reader/fixtures', 'docs/trance-demo.md']
  const paths = roots.flatMap((r) => r.includes('.') ? [r] : files(r)).filter((p) => !p.endsWith('.mjs'))
  const out = new Set<string>()
  const re = new RegExp(`\\b(?:${CALLS})\\(\\s*(?:"([^"\\\\]*)"|\`([^\`\\\\$]*)\`)`, 'g')
  for (const p of paths) for (const m of readFileSync(p, 'utf8').matchAll(re)) out.add(m[1] ?? m[2] ?? '')
  return [...out].filter((s) => s.trim())
}
/** Mini strings in the pinned upstream parser's own test-suite. */
export function upstreamCorpus(): string[] {
  const src = readFileSync('node_modules/@strudel/mini/test/mini.test.mjs', 'utf8')
  const out = new Set<string>()
  for (const m of src.matchAll(/\b(?:minS|minV|mini|m)\(\s*'([^'\\]*)'/g)) out.add(m[1]!)
  for (const m of src.matchAll(/\b(?:minS|minV|mini|m)\(\s*"([^"\\]*)"/g)) out.add(m[1]!)
  return [...out].filter((s) => s.trim())
}
/** Idioms named by #146 plus shapes the sequencers will hold. */
export const idioms = [
  'c2 [e2 g2] a2 c3', 'c2 [e2 [g2 a2]] c3 ~', 'bd*2 sd', 'c2/2 e2', 'c2!3 e2', 'c2@3 e2', 'c2 _ _ e2', 'c2? e2?0.3',
  'c2|e2|g2', '[c2 e2 | g2 a2 b2] c3', '[c2,e2,g2] [d2,f2]', 'c2 e2, g3 a3 b3', '<c2 e2> g2', '<c2 <e2 f2>> g2', '<[c2 e2] g2>!2 a2',
  'bd(3,8)', 'bd(3,8,2) sd', 'bd(<3 5>,8)', 'bd:3 sd:1', 'bd:3*2 ~ sd:1?', '~ - ~ c2', 'c#2 eb2 f#3', '0 2 4 7', '0.25 0.5 0.75 1', '400 800 1200',
  'Cm7 Fm7 G7', 'C^7 F#m7b5 Bb7', '<Cm7 Fm7 G7>', 'x ~ x x ~ x ~ x', 'x*4', '[x ~]*4', 'bd hh . sd hh hh', '{a b c}%4', '{a b, c d e}', '0 .. 3', '^a b c', 'bd*<2 3> sd',
  'bd [~ sd]@3 hh!2 [cp <rim ht>]?', '[bd ~ [sd sd]]*2, hh*8, [~ cp]/2',
]
