/** Explicit source oracles for #135; shared by unit and browser proofs. */
export const FUNCTION_FORMS = [
  ['chunk', '.chunk(4, x => x.ply(2).rev())'],
  ['every', '.firstOf(4, x => x.rev())'],
  ['every', '.lastOf(3, x => x.ply("2"))'],
  ['sometimes', '.sometimesBy(.5, x => x.rev())'],
  ['sometimes', '.someCyclesBy(.5, x => x.rev())'],
  ['sometimes', '.often(x => x.rev())'],
  ['sometimes', '.rarely(x => x.rev())'],
  ['off', '.off(1/8, x => x.rev().gain(.5))'],
  ['layer', '.superimpose(x => x.rev().gain(.5))'],
  ['time-lens', '.within(.25, .75, x => x.ply("2").rev())'],
  ['jux', '.jux(x => x.ply("2").rev())'],
  ['chunk', '.chunk(4, x => x.off(1/8, y => y.ply("2").rev()).rev())'],
] as const
export const FUNCTION_EDITS = [
  ['chunk', 'chunks', 3, '.chunk(4, x => x.rev())', '.chunk(3, x => x.rev())'],
  ['every', 'cycles', 5, '.firstOf(4, x => x.rev())', '.firstOf(5, x => x.rev())'],
  ['off', 'time', 0.25, '.off(1/8, x => x.rev())', '.off(0.25, x => x.rev())'],
  [
    'sometimes',
    'probability',
    0.7,
    '.sometimesBy(.5, x => x.rev())',
    '.sometimesBy(0.7, x => x.rev())',
  ],
] as const
export const FUNCTION_CONTROLS = [
  'chunk.chunks',
  'every.cycles',
  'every.mode',
  'off.time',
  'sometimes.probability',
  'sometimes.mode',
] as const
