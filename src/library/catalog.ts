import synth from './patches/enveloped-synth.strudel?raw'
import quant from './patches/quantized-sequence.strudel?raw'
import lfo from './patches/lfo-sweep.strudel?raw'
import env from './patches/filter-envelope.strudel?raw'
import drums from './patches/drum-machine.strudel?raw'
import effects from './patches/echo-room.strudel?raw'
import alien from './patches/iter-jux.strudel?raw'
import code from './patches/custom-helper.strudel?raw'
import layered from './patches/layered-sketch.strudel?raw'
import trance from './patches/switch-angel-trance-demo.strudel?raw'

export interface LibraryPatch {
  kind: 'patch'
  id: string
  title: string
  description: string
  source: string
  attribution: { author: string; url?: string }
  exercises: readonly string[]
}

export interface LibraryCollection {
  kind: 'collection'
  id: string
  title: string
  children: readonly LibraryNode[]
}

export type LibraryNode = LibraryPatch | LibraryCollection

const attribution = {
  author: 'MonkeyBoy’s Modular Synth contributors · MIT',
  url: 'https://github.com/FireLakeLabs/monkeyboys-modular-synth',
}

/** Repository-owned originals. Loading always reads source into a fresh document. */
export const PATCH_LIBRARY: readonly LibraryNode[] = [
  {
    kind: 'collection',
    id: 'synths',
    title: 'Synths',
    children: [
      {
        kind: 'collection',
        id: 'synth-basics',
        title: 'Basics',
        children: [
          {
            kind: 'patch',
            id: 'enveloped-synth',
            title: 'Enveloped synth',
            description:
              'Shape an eight-note sawtooth sequence with a filter and amplitude envelope. Try the ENV release, VCF cutoff and VCA level.',
            source: synth,
            attribution,
            exercises: ['seq', 'osc', 'vcf', 'vca', 'env', 'mix', 'out'],
          },
          {
            kind: 'patch',
            id: 'quantized-sequence',
            title: 'Quantized sequence',
            description:
              'Turn scale degrees into a D dorian melody. Change QUANT root/scale, SEQ rate and OSC tuning.',
            source: quant,
            attribution,
            exercises: ['seq', 'quant', 'osc', 'vca', 'mix', 'out'],
          },
        ],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'modulation',
    title: 'Modulation',
    children: [
      {
        kind: 'patch',
        id: 'lfo-sweep',
        title: 'LFO sweep and tremolo',
        description:
          'Two LFOs move the filter cutoff and amplifier level. Change their rates and depths to compare the two CV destinations.',
        source: lfo,
        attribution,
        exercises: ['seq', 'osc', 'vcf', 'vca', 'lfo', 'mix', 'out'],
      },
      {
        kind: 'patch',
        id: 'filter-envelope',
        title: 'Filter envelope',
        description:
          'An ENV opens a resonant low-pass filter on every note. Try ENV decay and VCF envelope amount.',
        source: env,
        attribution,
        exercises: ['seq', 'osc', 'vcf', 'vca', 'env', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'drums',
    title: 'Drums',
    children: [
      {
        kind: 'patch',
        id: 'drum-machine',
        title: '909 drum machine',
        description:
          'A three-row drum grid through the TR909 sampler. Try DRUMS drop, SMPL bank/speed and VCA level. Samples load on Play.',
        source: drums,
        attribution,
        exercises: ['drums', 'smpl', 'vca', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'effects',
    title: 'Effects',
    children: [
      {
        kind: 'patch',
        id: 'echo-room',
        title: 'Echo into room',
        description:
          'A quiet triangle sequence feeds delay and reverb. Compare echo time/feedback with room mix/size.',
        source: effects,
        attribution,
        exercises: ['seq', 'osc', 'vca', 'delay', 'reverb', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'alien',
    title: 'Alien',
    children: [
      {
        kind: 'patch',
        id: 'iter-jux',
        title: 'Iterate and juxtapose',
        description:
          'ITER rotates a melody each cycle; JUX transforms its right channel. Change the step count and right-channel switch.',
        source: alien,
        attribution,
        exercises: ['seq', 'osc', 'iter', 'jux', 'vca', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'cyber',
    title: 'Cyber',
    children: [
      {
        kind: 'patch',
        id: 'custom-helper',
        title: 'Custom helper',
        description:
          'A custom helper and chunk transform sit beside the recognized synth controls. Patch the rack freely; edit the helper in code.',
        source: code,
        attribution,
        exercises: ['seq', 'osc', 'code', 'vca', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'complete',
    title: 'Complete patches',
    children: [
      {
        kind: 'collection',
        id: 'trance',
        title: 'Trance',
        children: [
          {
            kind: 'patch',
            id: 'switch-angel-trance-demo',
            title: 'Switch Angel trance demo (cosimo transcription)',
            description:
              'The supplied 140 BPM, four-voice trance demo: kick, two gated supersaws and an FM pulse. Custom registrations and routing stay in source/CODE. Samples load on Play.',
            source: trance,
            attribution: {
              author: 'Switch Angel · transcription by cosimo · user-supplied variant',
              url: 'https://gist.github.com/cosimo/b0843897efb5f23b4594cb5082be1a85',
            },
            exercises: ['drums', 'code', 'out'],
          },
        ],
      },
      {
        kind: 'collection',
        id: 'layered',
        title: 'Layered',
        children: [
          {
            kind: 'patch',
            id: 'layered-sketch',
            title: 'Three-voice sketch',
            description:
              'Bass, melody and drums meet at MIX. Try individual channel levels, OUT tempo and master volume. Samples load on Play.',
            source: layered,
            attribution,
            exercises: ['seq', 'osc', 'drums', 'smpl', 'vcf', 'vca', 'mix', 'out'],
          },
        ],
      },
    ],
  },
]

export function libraryPatches(nodes: readonly LibraryNode[] = PATCH_LIBRARY): LibraryPatch[] {
  return nodes.flatMap((node) => (node.kind === 'patch' ? [node] : libraryPatches(node.children)))
}
