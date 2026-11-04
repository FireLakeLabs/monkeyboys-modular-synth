import type { Control, ModuleSpec, PaletteCategory, SwitchOption } from './types'

/**
 * The v1 module catalog. Machine-readable form of docs/module-spec.md.
 * Once the app consumes this, it is the source of truth; keep the doc in step.
 */

const opts = (...values: string[]): SwitchOption[] =>
  values.map((value) => ({ value, label: value }))

const numericCall = (
  id: string,
  label: string,
  method: string,
  min: number,
  max: number,
  step: number,
  defaultValue: number,
  extra: Partial<Extract<Control, { kind: 'knob' }>> = {},
): Control => ({
  kind: 'knob',
  id,
  label,
  min,
  max,
  step,
  default: defaultValue,
  omitAt: defaultValue,
  call: { method, argument: { kind: 'number' }, read: 'companion' },
  ...extra,
})
const accent: Control = {
  kind: 'text',
  id: 'accent',
  label: 'ACCENT',
  default: '1',
  omitAt: '1',
  call: { method: 'velocity', argument: { kind: 'string' }, read: 'merge' },
}

export const SEQ: ModuleSpec = {
  id: 'seq',
  name: 'SEQ',
  title: 'Sequencer',
  family: 'hardware',
  category: 'pattern',
  hp: 10,
  paletteCall: 'note("…")',
  controls: [
    {
      kind: 'steps',
      id: 'steps',
      label: 'STEPS',
      maxSteps: 16,
      default: ['c2', 'c2', 'eb2', 'g2', 'c3', 'bb2', 'g2', 'eb2'],
    },
    { kind: 'knob', id: 'len', label: 'LEN', min: 1, max: 16, step: 1, default: 8 },
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: [
        { value: 'note', label: 'NOTE' },
        { value: 'degree', label: 'DEGREE' },
      ],
      default: 'note',
    },
    {
      kind: 'knob',
      id: 'rate',
      label: 'RATE',
      min: 0.25,
      max: 4,
      step: 0.25,
      default: 1,
      unit: '×',
      detents: [0.25, 0.5, 1, 2, 3, 4],
      omitAt: 1,
    },
    accent,
  ],
  jacks: [{ id: 'note', label: 'NOTE', direction: 'out', signal: 'pattern' }],
  strudel: ['note', 'n', 'fast'],
  orderSensitive: true,
}

export const DRUMS: ModuleSpec = {
  id: 'drums',
  name: 'DRUMS',
  title: 'Trigger sequencer',
  family: 'hardware',
  category: 'pattern',
  hp: 14,
  paletteCall: 's("…")',
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
    {
      kind: 'knob',
      id: 'drop',
      label: 'DROP',
      min: 0,
      max: 0.9,
      step: 0.05,
      default: 0,
      unit: '%',
      omitAt: 0,
    },
    accent,
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'pattern' }],
  strudel: ['s'],
  orderSensitive: true,
}

export const QUANT: ModuleSpec = {
  id: 'quant',
  name: 'QUANT',
  title: 'Quantizer',
  family: 'hardware',
  category: 'pattern',
  hp: 8,
  paletteCall: '.scale()',
  controls: [
    {
      kind: 'switch',
      id: 'root',
      label: 'ROOT',
      options: opts('C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'),
      default: 'C',
    },
    {
      kind: 'switch',
      id: 'scale',
      call: { method: 'scale', argument: { kind: 'scale', root: 'root' } },
      label: 'SCALE',
      options: opts(
        'major',
        'minor',
        'dorian',
        'phrygian',
        'lydian',
        'mixolydian',
        'locrian',
        'minor pentatonic',
        'major pentatonic',
        'harmonic minor',
        'melodic minor',
        'major blues',
        'minor blues',
      ),
      default: 'minor',
    },
    numericCall('shift', 'SHIFT', 'scaleTranspose', -14, 14, 1, 0),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
  ],
  strudel: ['scale', 'scaleTranspose'],
  orderSensitive: true,
}

export const OSC: ModuleSpec = {
  id: 'osc',
  name: 'OSC',
  title: 'Oscillator',
  family: 'hardware',
  category: 'sound',
  hp: 9,
  paletteCall: '.s("…")',
  controls: [
    { kind: 'switch', id: 'mode', label: 'PITCH', options: opts('note', 'freq'), default: 'note' },
    {
      kind: 'switch',
      id: 'wave',
      call: { method: 's', argument: { kind: 'string' }, read: 'merge' },
      label: 'WAVE',
      options: opts('sawtooth', 'square', 'triangle', 'sine', 'supersaw', 'pulse'),
      default: 'sawtooth',
    },
    {
      kind: 'knob',
      id: 'tune',
      call: { method: 'transpose', argument: { kind: 'number' }, read: 'merge' },
      label: 'TUNE',
      min: -24,
      max: 24,
      step: 1,
      default: 0,
      unit: 'st',
      omitAt: 0,
      modulation: { min: -24, max: 24, default: 2, pitch: true },
    },
    numericCall('pw', 'PW', 'pw', 0, 1, 0.01, 0.5, {
      when: [{ control: 'wave', values: ['pulse'] }],
    }),
    numericCall('voices', 'VOICES', 'unison', 1, 100, 1, 5, {
      when: [{ control: 'wave', values: ['supersaw'] }],
    }),
    numericCall('detune', 'DETUNE', 'detune', 0, 24, 0.01, 0.18, {
      unit: 'st',
      when: [{ control: 'wave', values: ['supersaw'] }],
    }),
    numericCall('spread', 'SPREAD', 'spread', 0, 1, 0.01, 0.6, {
      when: [{ control: 'wave', values: ['supersaw'] }],
    }),
    numericCall('noise', 'NOISE', 'noise', 0, 1, 0.01, 0, {
      when: [{ control: 'wave', values: ['sawtooth', 'square', 'triangle', 'sine'] }],
    }),
    numericCall('oct', 'OCT', 'octave', -2, 2, 1, 0),
    {
      kind: 'knob',
      id: 'freq',
      label: 'FREQ',
      min: 20,
      max: 20000,
      step: 1,
      default: 110,
      unit: 'Hz',
      taper: 'log',
      when: [{ control: 'mode', values: ['freq'] }],
      call: {
        method: 'freq',
        argument: { kind: 'number' },
        read: 'companion',
        selects: { mode: 'freq' },
      },
    },
  ],
  jacks: [
    { id: 'note', label: 'NOTE', direction: 'in', signal: 'pattern' },
    { id: 'tune', label: 'TUNE', direction: 'in', signal: 'mod', cvTarget: 'tune' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  // `.s()` is shared with DRUMS' `s("…")` source form; the reader tells them apart by position
  // (a chained `.s(...)` after a note source is OSC; a bare `s(...)` source is DRUMS).
  strudel: ['transpose', 'pw', 'unison', 'detune', 'spread', 'noise', 'octave', 'freq'],
  orderSensitive: false,
}

export const SMPL: ModuleSpec = {
  id: 'smpl',
  name: 'SMPL',
  title: 'Sampler',
  family: 'hardware',
  category: 'sound',
  hp: 8,
  paletteCall: '.bank()',
  readDefaults: { bank: '', speed: 1 },
  controls: [
    {
      kind: 'switch',
      id: 'bank',
      omitAt: '',
      call: { method: 'bank', argument: { kind: 'string' }, read: 'merge' },
      label: 'BANK',
      options: [{ value: '', label: 'default' }, ...opts('RolandTR909', 'RolandTR808')],
      default: 'RolandTR909',
    },
    {
      kind: 'knob',
      id: 'speed',
      call: { method: 'speed', argument: { kind: 'number' }, read: 'merge' },
      label: 'SPEED',
      min: 0.25,
      max: 2,
      step: 0.05,
      default: 1,
      unit: '×',
      omitAt: 1,
    },
    // A new SMPL uses neutral readDefaults, so these calls may establish its boundary.
    ...[
      numericCall('n', 'N', 'n', 0, 127, 1, 0),
      numericCall('begin', 'BEGIN', 'begin', 0, 1, 0.01, 0),
      numericCall('end', 'END', 'end', 0, 1, 0.01, 1),
      numericCall('loop', 'LOOP', 'loop', 0, 1, 1, 0),
      numericCall('cut', 'CUT', 'cut', 0, 32, 1, 0),
    ].map((control) => ({
      ...control,
      ...('call' in control && control.call
        ? { call: { ...control.call, read: 'merge' as const } }
        : {}),
    })),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'pattern' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['bank', 'speed', 'begin', 'end', 'loop', 'cut'],
  orderSensitive: false,
}

export const VCF: ModuleSpec = {
  id: 'vcf',
  name: 'VCF',
  title: 'Filter',
  family: 'hardware',
  category: 'shape',
  hp: 10,
  paletteCall: '.lpf()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: [
        { value: 'lp', label: 'LP' },
        { value: 'hp', label: 'HP' },
        { value: 'bp', label: 'BP' },
        { value: 'dj', label: 'DJ' },
      ],
      default: 'lp',
    },
    {
      kind: 'knob',
      id: 'cutoff',
      call: {
        method: { control: 'mode', names: { lp: 'lpf', hp: 'hpf', bp: 'bpf' } },
        argument: { kind: 'number' },
      },
      when: [{ control: 'mode', values: ['lp', 'hp', 'bp'] }],
      label: 'CUTOFF',
      min: 20,
      max: 20000,
      step: 1,
      default: 800,
      unit: 'Hz',
      taper: 'log',
      modulation: { min: -10000, max: 10000, default: 1600 },
    },
    {
      kind: 'knob',
      id: 'res',
      call: {
        method: { control: 'mode', names: { lp: 'lpq', hp: 'hpq', bp: 'bpq' } },
        argument: { kind: 'number' },
        read: 'merge',
      },
      when: [{ control: 'mode', values: ['lp', 'hp', 'bp'] }],
      label: 'RES',
      min: 0,
      max: 20,
      step: 0.5,
      default: 1,
    },
    {
      kind: 'knob',
      id: 'envAmt',
      call: {
        method: { control: 'mode', names: { lp: 'lpenv', hp: 'hpenv', bp: 'bpenv' } },
        argument: { kind: 'number' },
        read: 'merge',
        withEnvelope: 'cv',
        envelope: 'after',
      },
      when: [{ control: 'mode', values: ['lp', 'hp', 'bp'] }],
      label: 'ENV AMT',
      min: 0,
      max: 8,
      step: 0.5,
      default: 4,
    },
    {
      kind: 'switch',
      id: 'type',
      label: 'TYPE',
      options: opts('12db', 'ladder', '24db'),
      default: '12db',
      omitAt: '12db',
      call: { method: 'ftype', argument: { kind: 'string' }, read: 'companion' },
      when: [{ control: 'mode', values: ['lp', 'hp', 'bp'] }],
    },
    numericCall('drive', 'DRIVE', 'drive', 0, 4, 0.01, 0.69, {
      when: [
        { control: 'type', values: ['ladder'] },
        { control: 'mode', values: ['lp', 'hp', 'bp'] },
      ],
    }),
    numericCall('anchor', 'ANCHOR', 'fanchor', 0, 1, 0.01, 0, {
      when: [{ control: 'mode', values: ['lp', 'hp', 'bp'] }],
    }),
    numericCall('dj', 'DJ', 'djf', 0, 1, 0.01, 0.5, {
      when: [{ control: 'mode', values: ['dj'] }],
      call: { method: 'djf', argument: { kind: 'number' }, selects: { mode: 'dj' } },
    }),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'cv', label: 'CV', direction: 'in', signal: 'mod', cvTarget: 'cutoff' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: [
    'lpf',
    'hpf',
    'bpf',
    'lpq',
    'hpq',
    'bpq',
    'lpenv',
    'hpenv',
    'bpenv',
    'ftype',
    'drive',
    'fanchor',
    'djf',
  ],
  orderSensitive: false,
}

export const VCA: ModuleSpec = {
  id: 'vca',
  name: 'VCA',
  title: 'Amplifier',
  family: 'hardware',
  category: 'shape',
  hp: 8,
  paletteCall: '.gain()',
  controls: [
    {
      kind: 'knob',
      id: 'level',
      call: { method: 'gain', argument: { kind: 'number' }, envelope: 'before' },
      label: 'LEVEL',
      min: 0,
      max: 2,
      step: 0.05,
      default: 0.8,
      modulation: { min: -1, max: 1, default: -0.5 },
    },
    numericCall('vel', 'VEL', 'velocity', 0, 1, 0.01, 1),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'cv', label: 'CV', direction: 'in', signal: 'mod', cvTarget: 'level' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['gain', 'velocity'],
  orderSensitive: false,
}

export const ENV: ModuleSpec = {
  id: 'env',
  name: 'ENV',
  title: 'Envelope',
  family: 'hardware',
  category: 'mod',
  hp: 10,
  paletteCall: '.attack()',
  controls: [
    { kind: 'knob', id: 'atk', label: 'ATK', min: 0, max: 2, step: 0.01, default: 0.01, unit: 's' },
    { kind: 'knob', id: 'dec', label: 'DEC', min: 0, max: 2, step: 0.01, default: 0.2, unit: 's' },
    { kind: 'knob', id: 'sus', label: 'SUS', min: 0, max: 1, step: 0.05, default: 0.5 },
    { kind: 'knob', id: 'rel', label: 'REL', min: 0, max: 4, step: 0.05, default: 0.1, unit: 's' },
    { kind: 'knob', id: 'depth', label: 'DEPTH', min: -1, max: 1, step: 0.01, default: 0.5 },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'mod' }],
  strudel: [
    'env',
    'penv',
    'pattack',
    'pdecay',
    'psustain',
    'prelease',
    'attack',
    'decay',
    'sustain',
    'release',
    'lpattack',
    'lpdecay',
    'lpsustain',
    'lprelease',
    'hpattack',
    'hpdecay',
    'hpsustain',
    'hprelease',
    'bpattack',
    'bpdecay',
    'bpsustain',
    'bprelease',
  ],
  strudelAliases: {
    att: 'attack',
    dec: 'decay',
    sus: 'sustain',
    rel: 'release',
    lpa: 'lpattack',
    lpd: 'lpdecay',
    lps: 'lpsustain',
    lpr: 'lprelease',
    hpa: 'hpattack',
    hpd: 'hpdecay',
    hps: 'hpsustain',
    hpr: 'hprelease',
    bpa: 'bpattack',
    bpd: 'bpdecay',
    bps: 'bpsustain',
    bpr: 'bprelease',
  },
  orderSensitive: false,
}

export const LFO: ModuleSpec = {
  id: 'lfo',
  name: 'LFO',
  title: 'Low-frequency oscillator',
  family: 'hardware',
  category: 'mod',
  hp: 8,
  paletteCall: '.lfo()',
  legacyDefaults: { mode: 'STEP' },
  smoothShapes: { sine: 'sine', tri: 'tri', saw: 'ramp', isaw: 'saw', square: 'square' },
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('SMOOTH', 'STEP'),
      default: 'SMOOTH',
    },
    { kind: 'knob', id: 'skew', label: 'SKEW', min: 0, max: 1, step: 0.01, default: 0.5 },
    {
      kind: 'switch',
      id: 'shape',
      label: 'SHAPE',
      options: opts('sine', 'tri', 'saw', 'isaw', 'square', 'perlin', 'rand'),
      default: 'sine',
    },
    {
      kind: 'knob',
      id: 'rate',
      label: 'RATE',
      min: 0.25,
      max: 16,
      step: 0.25,
      default: 4,
      unit: 'cyc',
      detents: [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16],
      omitAt: 1,
    },
    // DEPTH takes the units of whatever it is patched into; the range below is only the
    // normalised fallback. The app rescales it per target (see docs/module-spec.md#lfo).
    { kind: 'knob', id: 'depth', label: 'DEPTH', min: -1, max: 1, step: 0.01, default: 0.5 },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'mod' }],
  strudel: [
    'sine',
    'tri',
    'saw',
    'isaw',
    'square',
    'perlin',
    'rand',
    'range',
    'lfo',
    'vib',
    'vibmod',
  ],
  orderSensitive: false,
}

/** Mod utilities operate on pattern signals; their inputs are not control CV jacks. */
export const SAMPLE_HOLD: ModuleSpec = {
  id: 'samplehold',
  name: 'S&H',
  title: 'Sample and hold',
  family: 'hardware',
  category: 'mod',
  hp: 8,
  paletteCall: '.segment()',
  modSource: 'sampleHold',
  controls: [{ kind: 'knob', id: 'rate', label: 'STEPS', min: 1, max: 64, step: 1, default: 8 }],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'mod' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'mod' },
  ],
  strudel: ['segment'],
  orderSensitive: true,
}
export const ATTENUVERTER: ModuleSpec = {
  id: 'attenuverter',
  name: 'ATTENUVERTER',
  title: 'Modulation attenuverter',
  family: 'hardware',
  category: 'mod',
  hp: 10,
  paletteCall: '.mul().range()',
  modSource: 'attenuverter',
  controls: [
    { kind: 'knob', id: 'amount', label: 'AMOUNT', min: -2, max: 2, step: 0.01, default: 1 },
    { kind: 'knob', id: 'min', label: 'MIN', min: -20000, max: 20000, step: 0.01, default: 0 },
    { kind: 'knob', id: 'max', label: 'MAX', min: -20000, max: 20000, step: 0.01, default: 1 },
    {
      kind: 'switch',
      id: 'scale',
      label: 'SCALE',
      options: opts('LINEAR', 'EXP'),
      default: 'LINEAR',
    },
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'mod' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'mod' },
  ],
  strudel: ['mul', 'rangex'],
  orderSensitive: true,
}
export const MOD_MIX: ModuleSpec = {
  id: 'modmix',
  name: 'MOD MIX',
  title: 'Modulation mixer',
  family: 'hardware',
  category: 'mod',
  hp: 8,
  paletteCall: '.add()',
  modSource: 'mix',
  controls: [],
  jacks: [
    { id: 'in', label: 'A', direction: 'in', signal: 'mod' },
    { id: 'in2', label: 'B', direction: 'in', signal: 'mod' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'mod' },
  ],
  strudel: ['add'],
  orderSensitive: true,
}
export const CV_SEQ: ModuleSpec = {
  id: 'cvseq',
  name: 'CV SEQ',
  title: 'Control value sequencer',
  family: 'hardware',
  category: 'mod',
  hp: 10,
  paletteCall: '.lpf("<400 800 1200>")',
  modSource: 'sequence',
  controls: [
    { kind: 'steps', id: 'steps', label: 'STEPS', maxSteps: 16, default: ['400', '800', '1200'] },
  ],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'mod' }],
  strudel: ['mini'],
  orderSensitive: true,
}

export const DELAY: ModuleSpec = {
  id: 'delay',
  name: 'DELAY',
  title: 'Echo',
  family: 'hardware',
  category: 'fx',
  hp: 10,
  paletteCall: '.delay()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'TIME/SYNC',
      options: opts('time', 'sync'),
      default: 'time',
    },
    {
      kind: 'knob',
      id: 'mix',
      call: { method: 'delay', argument: { kind: 'number' } },
      label: 'MIX',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.4,
      omitAt: 0,
    },
    {
      kind: 'knob',
      id: 'time',
      call: {
        method: 'delaytime',
        argument: { kind: 'number' },
        read: 'merge',
        enabledBy: 'mix',
        selects: { mode: 'time' },
      },
      when: [{ control: 'mode', values: ['time'] }],
      label: 'TIME',
      min: 0.01,
      max: 2,
      step: 0.005,
      default: 0.375,
      unit: 's',
    },
    {
      kind: 'knob',
      id: 'fdbk',
      call: {
        method: 'delayfeedback',
        argument: { kind: 'number' },
        read: 'merge',
        enabledBy: 'mix',
      },
      label: 'FDBK',
      min: 0,
      max: 0.95,
      step: 0.05,
      default: 0.5,
    },
    numericCall('sync', 'SYNC', 'delaysync', 0.015625, 4, 0.015625, 0.1875, {
      unit: 'cyc',
      when: [{ control: 'mode', values: ['sync'] }],
      call: {
        method: 'delaysync',
        selects: { mode: 'sync' },
        argument: { kind: 'number', precision: 6 },
        read: 'companion',
        enabledBy: 'mix',
      },
    }),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['delay', 'delaytime', 'delayfeedback', 'delaysync'],
  orderSensitive: false,
}

export const REVERB: ModuleSpec = {
  id: 'reverb',
  name: 'REVERB',
  title: 'Room',
  family: 'hardware',
  category: 'fx',
  hp: 8,
  paletteCall: '.room()',
  controls: [
    {
      kind: 'knob',
      id: 'room',
      call: { method: 'room', argument: { kind: 'number' } },
      label: 'ROOM',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      omitAt: 0,
    },
    {
      kind: 'knob',
      id: 'size',
      call: { method: 'roomsize', argument: { kind: 'number' }, read: 'merge', enabledBy: 'room' },
      label: 'SIZE',
      min: 0,
      max: 10,
      step: 0.5,
      default: 4,
    },
    ...[
      numericCall('fade', 'FADE', 'roomfade', 0, 4, 0.01, 0.1, { unit: 's' }),
      numericCall('lp', 'LP', 'roomlp', 20, 20000, 1, 15000, { unit: 'Hz', taper: 'log' }),
      numericCall('dim', 'DIM', 'roomdim', 20, 20000, 1, 1000, { unit: 'Hz', taper: 'log' }),
    ].map((control) => ({
      ...control,
      ...('call' in control && control.call
        ? { call: { ...control.call, enabledBy: 'room' } }
        : {}),
    })),
  ],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'audio' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['room', 'roomsize', 'roomfade', 'roomlp', 'roomdim'],
  orderSensitive: false,
}

export const MIX: ModuleSpec = {
  id: 'mix',
  name: 'MIX',
  title: 'Mixer',
  family: 'hardware',
  category: 'util',
  hp: 12,
  paletteCall: '.postgain()',
  controls: [1, 2, 3, 4].flatMap((n): Control[] =>
    (
      [
        {
          kind: 'knob',
          id: `ch${n}`,
          label: `CH ${n}`,
          min: 0,
          max: 1,
          step: 0.05,
          default: 0.8,
          omitAt: 1,
          call: { method: 'postgain', argument: { kind: 'number' } },
          modulation: { min: -1, max: 1, default: -0.5 },
        },
        {
          kind: 'switch',
          id: `mute${n}`,
          label: `MUTE ${n}`,
          options: opts('off', 'on'),
          default: 'off',
        },
        {
          kind: 'switch',
          id: `solo${n}`,
          label: `SOLO ${n}`,
          options: opts('off', 'on'),
          default: 'off',
        },
        { kind: 'text', id: `name${n}`, label: `NAME ${n}`, default: '' },
        { kind: 'text', id: `channels${n}`, label: `OUTPUT ${n}`, default: '1:2' },
      ] satisfies Control[]
    ).map((control) => ({ ...control, group: `CH ${n}` })),
  ),
  jacks: [
    ...[1, 2, 3, 4].map((n) => ({
      id: `in${n}`,
      label: String(n),
      direction: 'in' as const,
      signal: 'audio' as const,
    })),
    ...[1, 2, 3, 4].map((n) => ({
      id: `cv${n}`,
      label: `CV ${n}`,
      direction: 'in' as const,
      signal: 'mod' as const,
      cvTarget: `ch${n}`,
    })),
    { id: 'out', label: 'OUT', direction: 'out', signal: 'audio' },
  ],
  strudel: ['postgain', 'stack', 'channels'],
  orderSensitive: false,
}

export const OUT: ModuleSpec = {
  id: 'out',
  name: 'OUT',
  title: 'Output',
  family: 'hardware',
  category: 'util',
  hp: 8,
  paletteCall: 'setcpm()',
  controls: [
    { kind: 'knob', id: 'bpm', label: 'BPM', min: 40, max: 240, step: 1, default: 120 },
    // App master volume. Not written to the code.
    { kind: 'knob', id: 'vol', label: 'VOL', min: 0, max: 1, step: 0.05, default: 0.8 },
  ],
  jacks: [{ id: 'in', label: 'IN', direction: 'in', signal: 'audio' }],
  strudel: ['setcpm', 'setCpm', 'setcps'],
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
  paletteCall: '.iter()',
  paletteCategory: 'pattern',
  controls: [
    {
      kind: 'knob',
      id: 'steps',
      call: { method: 'iter', argument: { kind: 'number' } },
      label: 'STEPS',
      min: 1,
      max: 16,
      step: 1,
      default: 4,
    },
  ],
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
  paletteCall: '.jux()',
  paletteCategory: 'pattern',
  controls: [
    {
      kind: 'switch',
      id: 'right',
      call: {
        method: 'jux',
        argument: {
          kind: 'transform',
          expressions: {
            rev: 'rev',
            fast2: 'x => x.fast(2)',
            press: 'press',
            iter4: 'x => x.iter(4)',
          },
        },
      },
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
  paletteCall: '.chunk()',
  paletteCategory: 'util',
  controls: [{ kind: 'text', id: 'text', label: 'TEXT', default: '.chunk(4, x => x.hurry(2))' }],
  jacks: [
    { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
    { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
  ],
  // CODE claims no functions: it is the fallback for anything no other module claims.
  strudel: [],
  orderSensitive: true,
}

/** Pattern transforms preserve their incoming signal, before or after sound selection. */
const patternJacks = [
  { id: 'in', label: 'IN', direction: 'in', signal: 'any' },
  { id: 'out', label: 'OUT', direction: 'out', signal: 'any' },
] as const

export const CLOCK: ModuleSpec = {
  id: 'clock',
  name: 'CLOCK',
  title: 'Clock divider and swing',
  family: 'hardware',
  category: 'pattern',
  hp: 12,
  paletteCall: '.slow()',
  readDefaults: { division: 1, swing: 0, swingMode: 'off', offset: 0 },
  controls: [
    { kind: 'switch', id: 'swingMode', label: 'GROOVE', options: opts('off', 'on'), default: 'on' },
    {
      kind: 'knob',
      id: 'division',
      label: 'DIV',
      min: 0.25,
      max: 16,
      step: 0.25,
      default: 2,
      omitAt: 1,
      call: { method: 'slow', argument: { kind: 'number' } },
    },
    {
      kind: 'knob',
      id: 'swing',
      label: 'SWING',
      min: 0,
      max: 1,
      step: 0.01,
      default: 1 / 3,
      call: {
        method: 'swingBy',
        argument: { kind: 'tuple', controls: ['swing', 'grid'] },
        read: 'merge',
        when: { control: 'swingMode', value: 'on' },
      },
    },
    { kind: 'knob', id: 'grid', label: 'GRID', min: 1, max: 16, step: 1, default: 4 },
    {
      kind: 'knob',
      id: 'offset',
      label: 'OFFSET',
      min: -1,
      max: 1,
      step: 0.125,
      default: 0.125,
      omitAt: 0,
      call: { method: 'late', argument: { kind: 'number' }, read: 'merge' },
    },
  ],
  jacks: patternJacks,
  strudel: ['slow', 'swingBy', 'late'],
  orderSensitive: true,
}

export const EUCLID: ModuleSpec = {
  id: 'euclid',
  name: 'EUCLID',
  title: 'Euclidean rhythm',
  family: 'hardware',
  category: 'pattern',
  hp: 12,
  paletteCall: '.euclidRot()',
  readDefaults: { rotation: 0 },
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('gate', 'legato'),
      default: 'gate',
      call: {
        method: { control: 'mode', names: { gate: 'euclidRot', legato: 'euclidLegatoRot' } },
        argument: {
          kind: 'tuple',
          controls: ['pulses', 'steps', 'rotation'],
          byMethod: { euclidLegato: ['pulses', 'steps'] },
          atMost: ['pulses', 'steps'],
        },
      },
    },
    { kind: 'knob', id: 'pulses', label: 'PULSES', min: 0, max: 32, step: 1, default: 3 },
    { kind: 'knob', id: 'steps', label: 'STEPS', min: 1, max: 32, step: 1, default: 8 },
    { kind: 'knob', id: 'rotation', label: 'ROTATE', min: -32, max: 32, step: 1, default: 2 },
  ],
  jacks: patternJacks,
  strudel: ['euclidRot', 'euclidLegatoRot'],
  strudelAliases: { euclidrot: 'euclidRot', euclidLegato: 'euclidLegatoRot' },
  orderSensitive: true,
}

export const RATCHET: ModuleSpec = {
  id: 'ratchet',
  name: 'RATCHET',
  title: 'Patterned repeats',
  family: 'hardware',
  category: 'pattern',
  hp: 10,
  paletteCall: '.ply("…")',
  controls: [
    {
      kind: 'text',
      id: 'repeats',
      label: 'REPEATS',
      default: '<1 2 4>',
      call: { method: 'ply', argument: { kind: 'string' } },
    },
  ],
  jacks: patternJacks,
  strudel: ['ply'],
  orderSensitive: true,
}

export const CHANCE: ModuleSpec = {
  id: 'chance',
  name: 'CHANCE',
  title: 'Seeded Bernoulli gate',
  family: 'hardware',
  category: 'pattern',
  hp: 10,
  paletteCall: '.degradeBy()',
  readDefaults: { drop: 0, mode: 'unseeded' },
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'RANDOM',
      options: opts('unseeded', 'seeded'),
      default: 'seeded',
    },
    {
      kind: 'knob',
      id: 'drop',
      label: 'DROP',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.3,
      omitAt: 0,
      call: { method: 'degradeBy', argument: { kind: 'number' } },
    },
    {
      kind: 'knob',
      id: 'seed',
      label: 'SEED',
      min: 0,
      max: 65535,
      step: 1,
      default: 1,
      call: {
        method: 'seed',
        argument: { kind: 'number' },
        read: 'merge',
        when: { control: 'mode', value: 'seeded' },
      },
    },
  ],
  jacks: patternJacks,
  strudel: ['degradeBy', 'seed'],
  orderSensitive: true,
}

export const CHORD: ModuleSpec = {
  id: 'chord',
  name: 'CHORD',
  title: 'Chord sequencer',
  family: 'hardware',
  category: 'pattern',
  hp: 12,
  paletteCall: 'chord("…").voicing()',
  source: { method: 'chord', control: 'chords', suffix: ['voicing'] },
  controls: [{ kind: 'text', id: 'chords', label: 'CHORDS', default: '<Cm7 Fm7 G7>' }],
  jacks: [{ id: 'out', label: 'OUT', direction: 'out', signal: 'pattern' }],
  strudel: ['chord', 'voicing'],
  orderSensitive: true,
}

export const ARP: ModuleSpec = {
  id: 'arp',
  name: 'ARP',
  title: 'Arpeggiator',
  family: 'hardware',
  category: 'pattern',
  hp: 10,
  paletteCall: '.arp("…")',
  controls: [
    {
      kind: 'text',
      id: 'indices',
      label: 'INDICES',
      default: '0 1 2 1',
      call: { method: 'arp', argument: { kind: 'string' } },
    },
  ],
  jacks: patternJacks,
  strudel: ['arp'],
  orderSensitive: true,
}

export const REV: ModuleSpec = {
  id: 'rev',
  name: 'REV / PALINDROME',
  title: 'Reverse and palindrome',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 14,
  paletteCall: '.rev()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('rev', 'palindrome'),
      default: 'rev',
      call: {
        method: { control: 'mode', names: { rev: 'rev', palindrome: 'palindrome' } },
        argument: { kind: 'tuple', controls: [] },
      },
    },
  ],
  jacks: patternJacks,
  strudel: ['rev', 'palindrome'],
  orderSensitive: true,
}

export const SHUFFLE: ModuleSpec = {
  id: 'shuffle',
  name: 'SHUFFLE',
  title: 'Reorder cycle slices',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 10,
  paletteCall: '.shuffle()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('shuffle', 'scramble'),
      default: 'shuffle',
      call: {
        method: { control: 'mode', names: { shuffle: 'shuffle', scramble: 'scramble' } },
        argument: { kind: 'tuple', controls: ['slices'] },
      },
    },
    { kind: 'knob', id: 'slices', label: 'SLICES', min: 1, max: 32, step: 1, default: 8 },
  ],
  jacks: patternJacks,
  strudel: ['shuffle', 'scramble'],
  orderSensitive: true,
}

export const RIBBON: ModuleSpec = {
  id: 'ribbon',
  name: 'RIBBON',
  title: 'Loop a slice of time',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 10,
  paletteCall: '.rib()',
  controls: [
    {
      kind: 'knob',
      id: 'offset',
      label: 'OFFSET',
      min: 0,
      max: 65535,
      step: 0.25,
      default: 45,
      call: { method: 'rib', argument: { kind: 'tuple', controls: ['offset', 'cycles'] } },
    },
    { kind: 'knob', id: 'cycles', label: 'CYCLES', min: 0.125, max: 16, step: 0.125, default: 2 },
  ],
  jacks: patternJacks,
  strudel: ['rib'],
  strudelAliases: { ribbon: 'rib' },
  orderSensitive: true,
}

export const TIME_LENS: ModuleSpec = {
  id: 'time-lens',
  name: 'TIME LENS',
  title: 'Zoom, linger and compress',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 12,
  paletteCall: '.zoom()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('zoom', 'linger', 'compress'),
      default: 'zoom',
      call: {
        method: {
          control: 'mode',
          names: { zoom: 'zoom', linger: 'linger', compress: 'compress' },
        },
        argument: {
          kind: 'tuple',
          controls: ['start', 'end'],
          byMethod: { linger: ['length'] },
          ascending: ['start', 'end'],
        },
      },
    },
    { kind: 'knob', id: 'start', label: 'START', min: 0, max: 0.99, step: 0.01, default: 0.25 },
    { kind: 'knob', id: 'end', label: 'END', min: 0.01, max: 1, step: 0.01, default: 0.75 },
    { kind: 'knob', id: 'length', label: 'LENGTH', min: 0.01, max: 1, step: 0.01, default: 0.25 },
  ],
  jacks: patternJacks,
  strudel: ['zoom', 'linger', 'compress'],
  orderSensitive: true,
}

export const WARP: ModuleSpec = {
  id: 'warp',
  name: 'WARP',
  title: 'Break, press and hurry',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 10,
  paletteCall: '.brak()',
  controls: [
    {
      kind: 'switch',
      id: 'mode',
      label: 'MODE',
      options: opts('brak', 'press', 'hurry'),
      default: 'brak',
      call: {
        method: { control: 'mode', names: { brak: 'brak', press: 'press', hurry: 'hurry' } },
        argument: { kind: 'tuple', controls: [], byMethod: { hurry: ['rate'] } },
      },
    },
    { kind: 'knob', id: 'rate', label: 'RATE', min: 0.25, max: 8, step: 0.25, default: 2 },
  ],
  jacks: patternJacks,
  strudel: ['brak', 'press', 'hurry'],
  orderSensitive: true,
}

export const ECHO: ModuleSpec = {
  id: 'echo',
  name: 'ECHO',
  title: 'Pattern echoes',
  family: 'alien',
  category: 'alien',
  paletteCategory: 'pattern',
  hp: 12,
  paletteCall: '.echo()',
  controls: [
    {
      kind: 'knob',
      id: 'times',
      label: 'TIMES',
      min: 1,
      max: 16,
      step: 1,
      default: 3,
      call: {
        method: 'echo',
        argument: { kind: 'tuple', controls: ['times', 'time', 'feedback'] },
      },
    },
    {
      kind: 'knob',
      id: 'time',
      label: 'TIME',
      min: 0.015625,
      max: 1,
      step: 0.015625,
      default: 0.125,
    },
    { kind: 'knob', id: 'feedback', label: 'FEEDBACK', min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  jacks: patternJacks,
  strudel: ['echo'],
  orderSensitive: true,
}

/** Every shipped module, in library order. */
export const CATALOG: readonly ModuleSpec[] = [
  SEQ,
  DRUMS,
  QUANT,
  CLOCK,
  EUCLID,
  RATCHET,
  CHANCE,
  CHORD,
  ARP,
  OSC,
  SMPL,
  VCF,
  VCA,
  ENV,
  LFO,
  SAMPLE_HOLD,
  ATTENUVERTER,
  MOD_MIX,
  CV_SEQ,
  DELAY,
  REVERB,
  MIX,
  OUT,
  ITER,
  JUX,
  REV,
  SHUFFLE,
  RIBBON,
  TIME_LENS,
  WARP,
  ECHO,
  CODE,
]

const byId = new Map(CATALOG.map((m) => [m.id, m]))

export function getModuleSpec(id: string): ModuleSpec {
  const spec = byId.get(id)
  if (!spec) throw new Error(`Unknown module type: ${id}`)
  return spec
}

export const PALETTE_CATEGORIES: readonly { id: PaletteCategory; label: string }[] = [
  { id: 'pattern', label: 'Pattern' },
  { id: 'sound', label: 'Sound' },
  { id: 'shape', label: 'Shape' },
  { id: 'mod', label: 'Modulate' },
  { id: 'fx', label: 'Effects' },
  { id: 'util', label: 'Utility' },
]

export function paletteModules(category: PaletteCategory, query: string): ModuleSpec[] {
  const filter = query.trim().toLowerCase()
  return CATALOG.filter(
    (spec) =>
      (spec.paletteCategory ?? spec.category) === category &&
      [
        spec.name,
        spec.title,
        spec.paletteCall,
        ...spec.strudel,
        ...Object.keys(spec.strudelAliases ?? {}),
      ].some((text) => text.toLowerCase().includes(filter)),
  )
}

/** superdough 1.3.0 per-voice stage order. Bindings select membership, including future modules. */
export const VOICE_EFFECT_ORDER: Readonly<Record<string, number>> = {
  lpf: 1,
  hpf: 2,
  bpf: 3,
  vowel: 4,
  coarse: 5,
  crush: 6,
  shape: 7,
  distort: 8,
  tremolo: 9,
  tremolosync: 9,
  compressor: 10,
  pan: 11,
  phaser: 12,
  phaserrate: 12,
  delay: 13,
  room: 14,
}
