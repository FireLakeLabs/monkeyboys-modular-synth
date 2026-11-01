import type { ModuleSpec, SwitchOption } from './types'

/**
 * The v1 module catalog. Machine-readable form of docs/module-spec.md.
 * Once the app consumes this, it is the source of truth; keep the doc in step.
 */

const opts = (...values: string[]): SwitchOption[] => values.map((value) => ({ value, label: value }))

export const SEQ: ModuleSpec = {
  id: 'seq',
  name: 'SEQ',
  title: 'Sequencer',
  family: 'hardware',
  category: 'pattern',
  hp: 10,
  controls: [
    { kind: 'steps', id: 'steps', label: 'STEPS', maxSteps: 16, default: ['c2', 'c2', 'eb2', 'g2', 'c3', 'bb2', 'g2', 'eb2'] },
    { kind: 'knob', id: 'len', label: 'LEN', min: 1, max: 16, step: 1, default: 8 },
    { kind: 'switch', id: 'mode', label: 'MODE', options: [{ value: 'note', label: 'NOTE' }, { value: 'degree', label: 'DEGREE' }], default: 'note' },
    { kind: 'knob', id: 'rate', label: 'RATE', min: 0.25, max: 4, step: 0.25, default: 1, unit: '×', detents: [0.25, 0.5, 1, 2, 3, 4], omitAt: 1 },
  ],
  jacks: [{ id: 'note', label: 'NOTE', direction: 'out', signal: 'pattern' }],
  strudel: ['note', 'n', 'fast', 'slow'],
  orderSensitive: true,
}

export const DRUMS: ModuleSpec = {
  id: 'drums',
  name: 'DRUMS',
  title: 'Trigger sequencer',
  family: 'hardware',
  category: 'pattern',
  hp: 14,
  controls: [
    {
      kind: 'grid',
      id: 'grid',
      label: 'GRID',
      stepCounts: [8, 16],
      default: [
        { sample: 'bd', steps: [1, 0, 1, 0, 1, 0, 1, 0] },
        { sample: 'sd', steps: [0, 0, 1, 0, 0, 0, 1, 0] },
        { sample: 'hh', steps: [0, 1, 0, 1, 0, 1, 0, 1] },
      ],
    },
    { kind: 'knob', id: 'drop', label: 'DROP', min: 0, max: 0.9, step: 0.05, default: 0, unit: '%', omitAt: 0 },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'pattern' }],
  strudel: ['s', 'degradeBy'],
  orderSensitive: true,
}

export const QUANT: ModuleSpec = {
  id: 'quant',
  name: 'QUANT',
  title: 'Quantizer',
  family: 'hardware',
  category: 'pattern',
  hp: 8,
  controls: [
    { kind: 'switch', id: 'root', label: 'ROOT', options: opts('C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'), default: 'C' },
    { kind: 'switch', id: 'scale', label: 'SCALE', options: opts('major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'), default: 'minor' },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'pattern' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'pattern' },
  ],
  strudel: ['scale'],
  orderSensitive: true,
}

export const OSC: ModuleSpec = {
  id: 'osc',
  name: 'OSC',
  title: 'Oscillator',
  family: 'hardware',
  category: 'sound',
  hp: 9,
  controls: [
    { kind: 'switch', id: 'wave', label: 'WAVE', options: opts('sawtooth', 'square', 'triangle', 'sine', 'supersaw'), default: 'sawtooth' },
    { kind: 'knob', id: 'tune', label: 'TUNE', min: -24, max: 24, step: 1, default: 0, unit: 'st', omitAt: 0 },
  ],
  jacks: [
    { id: 'note', label: 'NOTE', direction: 'in', signal: 'pattern' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  // `.s()` is shared with DRUMS' `s("…")` source form; the reader tells them apart by position
  // (a chained `.s(...)` after a note source is OSC; a bare `s(...)` source is DRUMS).
  strudel: ['transpose'],
  orderSensitive: false,
}

export const SMPL: ModuleSpec = {
  id: 'smpl',
  name: 'SMPL',
  title: 'Sampler',
  family: 'hardware',
  category: 'sound',
  hp: 8,
  controls: [
    { kind: 'switch', id: 'bank', label: 'BANK', options: [{ value: '', label: 'default' }, ...opts('RolandTR909', 'RolandTR808')], default: 'RolandTR909' },
    { kind: 'knob', id: 'speed', label: 'SPEED', min: 0.25, max: 2, step: 0.05, default: 1, unit: '×', omitAt: 1 },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'pattern' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['bank', 'speed'],
  orderSensitive: false,
}

export const VCF: ModuleSpec = {
  id: 'vcf',
  name: 'VCF',
  title: 'Filter',
  family: 'hardware',
  category: 'shape',
  hp: 10,
  controls: [
    { kind: 'switch', id: 'mode', label: 'MODE', options: [{ value: 'lp', label: 'LP' }, { value: 'hp', label: 'HP' }, { value: 'bp', label: 'BP' }], default: 'lp' },
    { kind: 'knob', id: 'cutoff', label: 'CUTOFF', min: 20, max: 20000, step: 1, default: 800, unit: 'Hz', taper: 'log' },
    { kind: 'knob', id: 'res', label: 'RES', min: 0, max: 20, step: 0.5, default: 1 },
    { kind: 'knob', id: 'envAmt', label: 'ENV AMT', min: 0, max: 8, step: 0.5, default: 4 },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'cv', label: 'CV', direction: 'in', signal: 'mod', cvTarget: 'cutoff' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['lpf', 'hpf', 'bpf', 'lpq', 'hpq', 'bpq', 'lpenv', 'hpenv', 'bpenv'],
  orderSensitive: false,
}

export const VCA: ModuleSpec = {
  id: 'vca',
  name: 'VCA',
  title: 'Amplifier',
  family: 'hardware',
  category: 'shape',
  hp: 8,
  controls: [{ kind: 'knob', id: 'level', label: 'LEVEL', min: 0, max: 1, step: 0.05, default: 0.8 }],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'cv', label: 'CV', direction: 'in', signal: 'mod', cvTarget: 'level' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['gain'],
  orderSensitive: false,
}

export const ENV: ModuleSpec = {
  id: 'env',
  name: 'ENV',
  title: 'Envelope',
  family: 'hardware',
  category: 'mod',
  hp: 10,
  controls: [
    { kind: 'knob', id: 'atk', label: 'ATK', min: 0, max: 2, step: 0.01, default: 0.01, unit: 's' },
    { kind: 'knob', id: 'dec', label: 'DEC', min: 0, max: 2, step: 0.01, default: 0.2, unit: 's' },
    { kind: 'knob', id: 'sus', label: 'SUS', min: 0, max: 1, step: 0.05, default: 0.5 },
    { kind: 'knob', id: 'rel', label: 'REL', min: 0, max: 4, step: 0.05, default: 0.1, unit: 's' },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'mod' }],
  strudel: [
    'attack', 'decay', 'sustain', 'release',
    'lpattack', 'lpdecay', 'lpsustain', 'lprelease',
    'hpattack', 'hpdecay', 'hpsustain', 'hprelease',
    'bpattack', 'bpdecay', 'bpsustain', 'bprelease',
  ],
  orderSensitive: false,
}

export const LFO: ModuleSpec = {
  id: 'lfo',
  name: 'LFO',
  title: 'Low-frequency oscillator',
  family: 'hardware',
  category: 'mod',
  hp: 8,
  controls: [
    { kind: 'switch', id: 'shape', label: 'SHAPE', options: opts('sine', 'tri', 'saw', 'isaw', 'square', 'perlin', 'rand'), default: 'sine' },
    { kind: 'knob', id: 'rate', label: 'RATE', min: 0.25, max: 16, step: 0.25, default: 4, unit: 'cyc', detents: [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16], omitAt: 1 },
    // DEPTH takes the units of whatever it is patched into; the range below is only the
    // normalised fallback. The app rescales it per target (see docs/module-spec.md#lfo).
    { kind: 'knob', id: 'depth', label: 'DEPTH', min: -1, max: 1, step: 0.01, default: 0.5 },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'mod' }],
  strudel: ['sine', 'tri', 'saw', 'isaw', 'square', 'perlin', 'rand', 'range'],
  orderSensitive: false,
}

export const DELAY: ModuleSpec = {
  id: 'delay',
  name: 'DELAY',
  title: 'Echo',
  family: 'hardware',
  category: 'fx',
  hp: 10,
  controls: [
    { kind: 'knob', id: 'mix', label: 'MIX', min: 0, max: 1, step: 0.05, default: 0.4, omitAt: 0 },
    { kind: 'knob', id: 'time', label: 'TIME', min: 0.01, max: 2, step: 0.005, default: 0.375, unit: 's' },
    { kind: 'knob', id: 'fdbk', label: 'FDBK', min: 0, max: 0.95, step: 0.05, default: 0.5 },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['delay', 'delaytime', 'delayfeedback'],
  orderSensitive: false,
}

export const REVERB: ModuleSpec = {
  id: 'reverb',
  name: 'REVERB',
  title: 'Room',
  family: 'hardware',
  category: 'fx',
  hp: 8,
  controls: [
    { kind: 'knob', id: 'room', label: 'ROOM', min: 0, max: 1, step: 0.05, default: 0.5, omitAt: 0 },
    { kind: 'knob', id: 'size', label: 'SIZE', min: 0, max: 10, step: 0.5, default: 4 },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['room', 'roomsize'],
  orderSensitive: false,
}

export const MIX: ModuleSpec = {
  id: 'mix',
  name: 'MIX',
  title: 'Mixer',
  family: 'hardware',
  category: 'util',
  hp: 12,
  controls: [1, 2, 3, 4].map((n) => ({
    kind: 'knob' as const,
    id: `ch${n}`,
    label: `CH ${n}`,
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.8,
    omitAt: 1,
  })),
  jacks: [
    ...[1, 2, 3, 4].map((n) => ({ id: `in${n}`, label: String(n), direction: 'in' as const, signal: 'audio' as const })),
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['postgain', 'stack'],
  orderSensitive: false,
}

export const OUT: ModuleSpec = {
  id: 'out',
  name: 'OUT',
  title: 'Output',
  family: 'hardware',
  category: 'util',
  hp: 8,
  controls: [
    { kind: 'knob', id: 'bpm', label: 'BPM', min: 40, max: 240, step: 1, default: 120 },
    // App master volume. Not written to the code.
    { kind: 'knob', id: 'vol', label: 'VOL', min: 0, max: 1, step: 0.05, default: 0.8 },
  ],
  jacks: [{ id: 'in', label: 'IN', direction: 'in', signal: 'audio' }],
  strudel: ['setcpm', 'setcps'],
  orderSensitive: false,
  unique: true,
}

export const ITER: ModuleSpec = {
  id: 'iter',
  name: 'ITER',
  title: 'Iterate',
  family: 'alien',
  category: 'alien',
  hp: 10,
  controls: [{ kind: 'knob', id: 'steps', label: 'STEPS', min: 1, max: 16, step: 1, default: 4 }],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
  ],
  strudel: ['iter'],
  orderSensitive: true,
}

export const JUX: ModuleSpec = {
  id: 'jux',
  name: 'JUX',
  title: 'Juxtapose',
  family: 'alien',
  category: 'alien',
  hp: 10,
  controls: [
    {
      kind: 'switch',
      id: 'right',
      label: 'RIGHT',
      options: [
        { value: 'rev', label: 'REV' },
        { value: 'fast2', label: 'FAST ×2' },
        { value: 'press', label: 'PRESS' },
        { value: 'iter4', label: 'ITER 4' },
      ],
      default: 'rev',
    },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
  ],
  strudel: ['jux'],
  orderSensitive: true,
}

export const CODE: ModuleSpec = {
  id: 'code',
  name: 'CODE',
  title: 'Code block',
  family: 'cyber',
  category: 'cyber',
  hp: 14,
  controls: [{ kind: 'text', id: 'text', label: 'TEXT', default: '.chunk(4, x => x.hurry(2))' }],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
  ],
  // CODE claims no functions: it is the fallback for anything no other module claims.
  strudel: [],
  orderSensitive: true,
}

/** Every v1 module, in library order. */
export const CATALOG: readonly ModuleSpec[] = [
  SEQ, DRUMS, QUANT,
  OSC, SMPL,
  VCF, VCA,
  ENV, LFO,
  DELAY, REVERB,
  MIX, OUT,
  ITER, JUX,
  CODE,
]

const byId = new Map(CATALOG.map((m) => [m.id, m]))

export function getModuleSpec(id: string): ModuleSpec {
  const spec = byId.get(id)
  if (!spec) throw new Error(`Unknown module type: ${id}`)
  return spec
}
