import patternHardware from './patches/pattern-hardware.strudel?raw'
import patternAlien from './patches/pattern-alien.strudel?raw'
import firstSounds from './patches/first-sounds.strudel?raw'
import firstNotes from './patches/first-notes.strudel?raw'
import firstEffects from './patches/first-effects.strudel?raw'
import patternEffects from './patches/pattern-effects.strudel?raw'
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
  tryThis?: string
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
    id: 'start-here',
    title: 'Start here',
    children: [
      {
        kind: 'patch',
        id: 'first-sounds',
        title: '1 · First sounds',
        description: 'Build a beat with drum sounds and rests. Samples load on Play.',
        tryThis: 'Turn one unlit DRUMS step on, then press Play.',
        source: firstSounds,
        attribution: {
          author:
            'Original exercise by MonkeyBoy’s Modular Synth contributors · MIT; inspired by the Strudel workshop',
          url: 'https://strudel.cc/workshop/first-sounds/',
        },
        exercises: ['drums', 'smpl', 'vca', 'mix', 'out'],
      },
      {
        kind: 'patch',
        id: 'first-notes',
        title: '2 · First notes',
        description: 'Play a four-note melody with a triangle oscillator.',
        tryThis: 'Change the first SEQ note from c3 to d3.',
        source: firstNotes,
        attribution: {
          author:
            'Original exercise by MonkeyBoy’s Modular Synth contributors · MIT; inspired by the Strudel workshop',
          url: 'https://strudel.cc/workshop/first-notes/',
        },
        exercises: ['seq', 'osc', 'vca', 'mix', 'out'],
      },
      {
        kind: 'patch',
        id: 'first-effects',
        title: '3 · First effects',
        description: 'Shape a sawtooth melody with a low-pass filter and a room.',
        tryThis: 'Raise VCF CUTOFF from 800 to 5000 Hz.',
        source: firstEffects,
        attribution: {
          author:
            'Original exercise by MonkeyBoy’s Modular Synth contributors · MIT; inspired by the Strudel workshop',
          url: 'https://strudel.cc/workshop/first-effects/',
        },
        exercises: ['seq', 'osc', 'vcf', 'vca', 'reverb', 'mix', 'out'],
      },
      {
        kind: 'patch',
        id: 'pattern-effects',
        title: '4 · Pattern effects',
        description: 'Speed up a melody and reverse its right channel with JUX.',
        tryThis: 'Change SEQ RATE from 2 to 1 to hear the pattern slow down.',
        source: patternEffects,
        attribution: {
          author:
            'Original exercise by MonkeyBoy’s Modular Synth contributors · MIT; inspired by the Strudel workshop',
          url: 'https://strudel.cc/workshop/pattern-effects/',
        },
        exercises: ['seq', 'osc', 'jux', 'vca', 'mix', 'out'],
      },
    ],
  },
  {
    kind: 'collection',
    id: 'pattern-time',
    title: 'Pattern and time',
    children: [
      {
        kind: 'patch',
        id: 'pattern-hardware',
        title: 'Chords, clocks and gates',
        description:
          'Arpeggiate voiced chords alongside a swung, Euclidean ratchet with seeded chance.',
        source: patternHardware,
        attribution,
        exercises: ['chord', 'arp', 'clock', 'euclid', 'ratchet', 'chance'],
      },
      {
        kind: 'patch',
        id: 'pattern-alien',
        title: 'A ribbon of time',
        description:
          'Reverse and shuffle a melody, loop a ribbon, zoom into it, then warp and echo its events.',
        source: patternAlien,
        attribution,
        exercises: ['rev', 'shuffle', 'ribbon', 'time-lens', 'warp', 'echo'],
      },
    ],
  },
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
