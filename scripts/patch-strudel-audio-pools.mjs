// Pinned upstream fixes for #140 and #136. Remove when Strudel pools enforce context ownership and bus cleanup tolerates reset and DUCK handles silent targets.
// @strudel/web bundles Superdough, so patch its shipped bundle as well as Superdough.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const fixes = [
  {
    path: 'superdough/superdoughoutput.mjs',
    original: 'c2093819e1dc9ce4c46dcae3fbb74e5374d17fc694a6d2b3d4caed03a4139314',
    patched: 'b509f7762f24fb37d659ce45a8c7b6fa23664e7034bb24d7b2dcf26c93523f4f',
    replacements: [
      [
        "      const orbit = this.nodes[target];\n\n      if (orbit == null) {\n        errorLogger(new Error(`duck target orbit ${target} does not exist`), 'superdough');\n        return;\n      }",
        '      // Ducking can precede the first audible note. Keep its envelope running;\n      // getOrbit attaches the real target channel pair when that voice arrives.\n      const orbit = this.nodes[target] ??= new Orbit(this.audioContext);',
      ],
      [
        '    if (this.nodes[orbitNum] == null) {\n      this.nodes[orbitNum] = new Orbit(this.audioContext);\n      this.output.connectToDestination(this.nodes[orbitNum].output, channels);\n    }\n    return this.nodes[orbitNum];',
        '    const orbit = this.nodes[orbitNum] ??= new Orbit(this.audioContext);\n    if (!orbit.__monkeyboyOutputConnected) {\n      this.output.connectToDestination(orbit.output, channels);\n      orbit.__monkeyboyOutputConnected = true;\n    }\n    return orbit;',
      ],
    ],
  },
  {
    path: 'superdough/synth.mjs',
    original: 'd4d80b02bc6eff38faa953dfa2c55ebc2da06b415bcd0cb7577b6b90eb7d27d2',
    patched: '6c2cf14ca21b87b5168b09c957becff88318622a06da5878022f1d3fbfdb56fa',
    replacements: [
      [
        '          bus.disconnect(envGain);',
        "          try {\n            bus.disconnect(envGain);\n          } catch (error) {\n            // A structural controller reset already disconnected this old return.\n            if (error?.name !== 'InvalidAccessError') throw error;\n          }",
      ],
    ],
  },

  {
    path: '@strudel/web/dist/index.mjs',
    original: '50beb01abd04589333a10e078dce182c82e2de75b43e9bbe81a34bd069948931',
    previous: [
      '7ccf4e104845c6d9d3ccfa507d66b276eb8886ef34515e8b3e37e9e529f0ff65',
      '46d1c75948486b43ce27b7a286b408261e99a27049720cd1b03e099df195cbbc',
    ],
    patched: 'cb4622f876bcf804b57733334c579ddd29bcd216532d489fc99314d7c89c02a7',
    replacements: [
      [
        '      const m = this.nodes[l];\n      if (m == null) {\n        Pi(new Error(`duck target orbit ${l} does not exist`), "superdough");\n        return;\n      }',
        '      const m = this.nodes[l] ??= new SS(this.audioContext);',
      ],
      [
        '    return this.nodes[t] == null && (this.nodes[t] = new SS(this.audioContext), this.output.connectToDestination(this.nodes[t].output, n)), this.nodes[t];',
        '    const orbit = this.nodes[t] ??= new SS(this.audioContext);\n    if (!orbit.__monkeyboyOutputConnected) {\n      this.output.connectToDestination(orbit.output, n);\n      orbit.__monkeyboyOutputConnected = true;\n    }\n    return orbit;',
      ],
      [
        'l.disconnect(p), n();',
        'try { l.disconnect(p); } catch (error) { if (error?.name !== "InvalidAccessError") throw error; } n();',
      ],
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
    previous: [
      'c160c10c158481bc8d38de77a7164497c3024bf12fe5c994afc8fe78266cde8e',
      'd64a139921fd19e25a3f6e29ee9945afcf136781b7764327a4dc1051402c5911',
    ],
    patched: 'c56108448ff19d0c88e3cc33f12bf05691966d2e378314bfc46152112368820f',
    replacements: [
      [
        '      const h = this.nodes[p];\n      if (h == null) {\n        ct(new Error(`duck target orbit ${p} does not exist`), "superdough");\n        return;\n      }',
        '      const h = this.nodes[p] ??= new ro(this.audioContext);',
      ],
      [
        '    return this.nodes[t] == null && (this.nodes[t] = new ro(this.audioContext), this.output.connectToDestination(this.nodes[t].output, n)), this.nodes[t];',
        '    const orbit = this.nodes[t] ??= new ro(this.audioContext);\n    if (!orbit.__monkeyboyOutputConnected) {\n      this.output.connectToDestination(orbit.output, n);\n      orbit.__monkeyboyOutputConnected = true;\n    }\n    return orbit;',
      ],
      [
        'p.disconnect(r), n();',
        'try { p.disconnect(r); } catch (error) { if (error?.name !== "InvalidAccessError") throw error; } n();',
      ],
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
  if (digest(source) !== fix.original && !fix.previous?.includes(digest(source)))
    throw new Error(
      `Unexpected ${fix.path}; review the pinned audio cleanup fixes before updating Strudel.`,
    )
  for (const [before, after] of fix.replacements) source = source.replace(before, after)
  if (digest(source) !== fix.patched) throw new Error(`Could not patch ${fix.path}`)
  await writeFile(file, source)
}
process.stdout.write('Verified Strudel audio pool ownership and reset-safe routing cleanup.\n')
