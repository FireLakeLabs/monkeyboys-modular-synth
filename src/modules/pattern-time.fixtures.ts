import type { ControlValue } from '../patch/types'

/** Explicit engine examples, shared by the unit and real-browser acceptance matrices. */
export const PATTERN_FORMS = [
  {
    type: 'clock',
    call: '.slow(2).swingBy(1/3, 4).late(1/8)',
    values: { division: 2, swing: 1 / 3, swingMode: 'on', grid: 4, offset: 1 / 8 },
  },
  {
    type: 'euclid',
    call: '.euclidRot(3, 8, 2)',
    values: { mode: 'gate', pulses: 3, steps: 8, rotation: 2 },
  },
  {
    type: 'euclid',
    call: '.euclidLegatoRot(3, 8, 2)',
    values: { mode: 'legato', pulses: 3, steps: 8, rotation: 2 },
  },
  {
    type: 'euclid',
    call: '.euclidLegato(3, 8)',
    values: { mode: 'legato', pulses: 3, steps: 8, rotation: 0 },
  },
  {
    type: 'euclid',
    call: '.euclidrot(3, 8, 2)',
    values: { mode: 'gate', pulses: 3, steps: 8, rotation: 2 },
  },
  { type: 'ratchet', call: '.ply("<1 2 4>")', values: { repeats: '<1 2 4>' } },
  {
    type: 'chance',
    call: '.degradeBy(0.3).seed(45)',
    values: { drop: 0.3, seed: 45, mode: 'seeded' },
  },
  { type: 'chance', call: '.degradeBy(0.3)', values: { drop: 0.3, mode: 'unseeded' } },
  { type: 'arp', call: '.arp("0 1 2 1")', values: { indices: '0 1 2 1' } },
  { type: 'rev', call: '.rev()', values: { mode: 'rev' } },
  { type: 'rev', call: '.palindrome()', values: { mode: 'palindrome' } },
  { type: 'shuffle', call: '.shuffle(8)', values: { mode: 'shuffle', slices: 8 } },
  { type: 'shuffle', call: '.scramble(8)', values: { mode: 'scramble', slices: 8 } },
  { type: 'ribbon', call: '.rib(45, 2)', values: { offset: 45, cycles: 2 } },
  { type: 'ribbon', call: '.ribbon(45, 2)', values: { offset: 45, cycles: 2 } },
  {
    type: 'time-lens',
    call: '.zoom(0.25, 0.75)',
    values: { mode: 'zoom', start: 0.25, end: 0.75 },
  },
  { type: 'time-lens', call: '.linger(0.25)', values: { mode: 'linger', length: 0.25 } },
  {
    type: 'time-lens',
    call: '.compress(0, 0.5)',
    values: { mode: 'compress', start: 0, end: 0.5 },
  },
  { type: 'warp', call: '.brak()', values: { mode: 'brak' } },
  { type: 'warp', call: '.press()', values: { mode: 'press' } },
  { type: 'warp', call: '.hurry(2)', values: { mode: 'hurry', rate: 2 } },
  { type: 'echo', call: '.echo(3, 1/8, 0.5)', values: { times: 3, time: 1 / 8, feedback: 0.5 } },
] satisfies readonly { type: string; call: string; values: Record<string, ControlValue> }[]

export const CHORD_SOURCE = 'chord("<Cm7 Fm7 G7>").voicing()'

// These controls have their literal/selector coverage in pattern-time.test.ts.
// The legacy exhaustive control suite imports this list to keep one coverage ledger.
export const PATTERN_CONTROLS = [
  'clock.swingMode',
  'clock.division',
  'clock.swing',
  'clock.grid',
  'clock.offset',
  'euclid.mode',
  'euclid.pulses',
  'euclid.steps',
  'euclid.rotation',
  'ratchet.repeats',
  'chance.mode',
  'chance.drop',
  'chance.seed',
  'chord.chords',
  'arp.indices',
  'rev.mode',
  'shuffle.mode',
  'shuffle.slices',
  'ribbon.offset',
  'ribbon.cycles',
  'time-lens.mode',
  'time-lens.start',
  'time-lens.end',
  'time-lens.length',
  'warp.mode',
  'warp.rate',
  'echo.times',
  'echo.time',
  'echo.feedback',
] as const
