// Pinned upstream fix for #140. Remove when Strudel pools enforce context ownership.
// @strudel/web bundles Superdough, so patch its shipped bundle as well as Superdough.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const fixes = [
  {
    path: '@strudel/web/dist/index.mjs',
    original: '50beb01abd04589333a10e078dce182c82e2de75b43e9bbe81a34bd069948931',
    patched: '100faaa0e48b2e340ac5aef5a90418aa91dba623f58f4284a507ff63b91fa8d8',
    replacements: [['s != null && HD(s)', 's != null && s.context === ve() && HD(s)']],
  },
  {
    path: 'superdough/dist/index.mjs',
    original: '7827b297afe9aa883395573b528fb44a06fbb9130060d8650b5c0308b1531a13',
    patched: '5818d73898139cb08d337114d271c775c2d89ce45cbe4d9ea3a3b4f0d11a6461',
    replacements: [['o != null && Gn(o)', 'o != null && o.context === z() && Gn(o)']],
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
