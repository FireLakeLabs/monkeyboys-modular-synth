export const SOUND_FORMS = [
  ...['white', 'pink', 'brown'].map((wave) => ({
    type: 'noise',
    expression: `s("${wave}")`,
    values: { wave },
  })),
  {
    type: 'noise',
    expression: 's("crackle").density(0.1)',
    values: { wave: 'crackle', density: 0.1 },
  },
  { type: 'noise', expression: 'note("c3*4").s("pink")', values: { wave: 'pink' } },
  {
    type: 'harmonic',
    expression: 'note("c3 e3 g3").s("user").partials([1, 0.5, 0, 0.3])',
    values: { wave: 'user', partials: [1, 0.5, 0, 0.3] },
  },
  {
    type: 'harmonic',
    expression: 's("user").partials([1, 0.5, 0, 0.3])',
    values: { wave: 'user', partials: [1, 0.5, 0, 0.3] },
  },
  {
    type: 'fmop',
    expression: 'note("c3 e3 g3").s("sine").fm(2).fmh(1.5).fmattack(0.01).fmdecay(0.3)',
    values: { index: 2, ratio: 1.5, attack: 0.01, decay: 0.3, attackMode: 'on', decayMode: 'on' },
  },
  ...['soft', 'hard', 'cubic', 'diode', 'asym', 'sinefold', 'chebyshev', 'shape'].flatMap(
    (type) => [
      {
        type: 'drive',
        expression: `note("c3 e3").s("sine").${type}(0.5)`,
        values: { type, amount: 0.5 },
      },
      {
        type: 'drive',
        expression: `note("c3 e3").s("sine").${type}()`,
        values: { type, arguments: 'none' },
      },
    ],
  ),
  { type: 'folder', expression: 'note("c3 e3").s("sine").fold(0.6)', values: { amount: 0.6 } },
  {
    type: 'lofi',
    expression: 'note("c3 e3").s("sine").crush(6).coarse(4)',
    values: { bits: 6, coarse: 4, bitsMode: 'on' },
  },
  {
    type: 'formant',
    expression: 'note("c3 e3").s("sawtooth").vowel("<a e i o>")',
    values: { vowel: '<a e i o>' },
  },
  {
    type: 'comp',
    expression: 'note("c3 e3").s("sine").compressor("-20:4:10:.005:.1").transient(0.5)',
    values: { compressor: '-20:4:10:.005:.1', transient: 0.5 },
  },
  {
    type: 'phaser',
    expression: 'note("c3 e3").s("sawtooth").phaser(2).phaserdepth(0.5)',
    values: { rate: 2, depth: 0.5, rateMode: 'on' },
  },
  { type: 'pan', expression: 'note("c3 e3").s("sine").pan(0.3)', values: { pan: 0.3 } },
  ...[1.5, -1.5].map((shift) => ({
    type: 'shift',
    expression: `note("c3 e3").s("sawtooth").stretch(${shift})`,
    values: { shift },
  })),
]

export const SOUND_CONTROLS = [
  ...new Set(
    SOUND_FORMS.flatMap((form) => Object.keys(form.values).map((id) => `${form.type}.${id}`)),
  ),
]
