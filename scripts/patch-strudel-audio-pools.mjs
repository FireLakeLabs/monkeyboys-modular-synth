// Pinned upstream fixes for #140. Remove when Strudel pools/cleanup enforce context ownership.
// @strudel/web bundles Superdough, so patch its shipped bundle as well as Superdough.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const fixes = [
  {
    path: '@strudel/web/dist/index.mjs',
    original: '50beb01abd04589333a10e078dce182c82e2de75b43e9bbe81a34bd069948931',
    patched: '7ccf4e104845c6d9d3ccfa507d66b276eb8886ef34515e8b3e37e9e529f0ff65',
    replacements: [
      ['s != null && HD(s)', 's != null && s.context === ve() && HD(s)'],
      [
        'const i = new ConstantSourceNode(e), r = je(0);',
        'const i = new ConstantSourceNode(e), r = new GainNode(e, { gain: 0 });',
      ],
    ],
  },
  {
    path: 'superdough/dist/index.mjs',
    original: '7827b297afe9aa883395573b528fb44a06fbb9130060d8650b5c0308b1531a13',
    patched: 'c160c10c158481bc8d38de77a7164497c3024bf12fe5c994afc8fe78266cde8e',
    replacements: [
      ['o != null && Gn(o)', 'o != null && o.context === z() && Gn(o)'],
      [
        'const a = new ConstantSourceNode(e), c = T(0);',
        'const a = new ConstantSourceNode(e), c = new GainNode(e, { gain: 0 });',
      ],
    ],
  },
  {
    path: 'superdough/helpers.mjs',
    original: 'fdf90a09bc67b3cdebb812d9ca8eb8c45b8b6b66fe311e2467ef54b57ea6fadd',
    patched: 'cbfaa56d30c646c83bb58e67c336c1bccfca2beadc121bb269438864b42cdcaf',
    replacements: [
      [
        'const zeroGain = gainNode(0);',
        'const zeroGain = new GainNode(audioContext, { gain: 0 });',
      ],
    ],
  },
  {
    path: 'superdough/nodePools.mjs',
    original: 'a6954ac74a0de8a7f4da64102d5ad3791836face8ac0bac442e9041d386a7fe3',
    patched: '1581e01b3849b388c5443edbad86cb42a1a148864824f31072600413777f581d',
    replacements: [
      [
        'const nodePools = new Map();',
        "import { getAudioContext } from './audioContext.mjs';\n\nconst nodePools = new Map();",
      ],
      [
        'node != null && isNodeAlive(node)',
        'node != null && node.context === getAudioContext() && isNodeAlive(node)',
      ],
    ],
  },
]
const digest = (source) => createHash('sha256').update(source).digest('hex')

for (const fix of fixes) {
  const file = new URL(`../node_modules/${fix.path}`, import.meta.url)
  let source = await readFile(file, 'utf8')
  if (digest(source) === fix.patched) continue
  if (digest(source) !== fix.original)
    throw new Error(
      `Unexpected ${fix.path}; review the pinned audio-pool fix before updating Strudel.`,
    )
  for (const [before, after] of fix.replacements) source = source.replace(before, after)
  if (digest(source) !== fix.patched) throw new Error(`Could not patch ${fix.path}`)
  await writeFile(file, source)
}
process.stdout.write('Verified Strudel audio-node pool context ownership.\n')
