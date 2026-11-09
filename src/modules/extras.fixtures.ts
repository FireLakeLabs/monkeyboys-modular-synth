export const EXTRA_FORMS = [
  { type: 'bytebeat', expression: 's("bytebeat")' },
  ...Array.from({ length: 15 }, (_, i) => ({
    type: 'bytebeat',
    expression: `s("bytebeat").n(${i})`,
  })),
  { type: 'bytebeat', expression: 'note("c3 e3").s("bytebeat").n(3).bbst(0)' },
  { type: 'bytebeat', expression: `s("bytebeat").bbexpr(pure('t*(t>>8)')).bbst(1000)` },
  ...['z_sine', 'z_triangle', 'z_sawtooth', 'z_square', 'z_tan', 'z_noise'].map((wave) => ({
    type: 'chip',
    expression: `note("c3 e3").s("${wave}").slide(.5).pitchJump(12).zcrush(.2).zdelay(.1).zmod(2).znoise(.1).pitchJumpTime(.1).deltaSlide(-.1)`,
  })),
  { type: 'speak', expression: '"<hello modular world>".speak("en", 0)' },
  { type: 'speak', expression: '"hello".speak("zz-unavailable", 127)' },
]

/** Explicit import-edit oracles; selector modes have separate emission checks. */
export const EXTRA_EDITS = [
  ['bytebeat', 'preset', 5, 's("bytebeat").n(3)', 's("bytebeat").n(5)'],
  ['bytebeat', 'start', 42, 's("bytebeat").bbst(0)', 's("bytebeat").bbst(42)'],
  [
    'bytebeat',
    'formula',
    't>>2',
    `s("bytebeat").bbexpr(pure('t>>1'))`,
    `s("bytebeat").bbexpr(pure('t>>2'))`,
  ],
  ['chip', 'wave', 'z_noise', 's("z_square")', 's("z_noise")'],
  ['chip', 'slide', -0.5, 's("z_square").slide(.5)', 's("z_square").slide(-0.5)'],
  ['chip', 'jump', 24, 's("z_square").pitchJump(12)', 's("z_square").pitchJump(24)'],
  ['chip', 'crush', 0.4, 's("z_square").zcrush(.2)', 's("z_square").zcrush(0.4)'],
  ['chip', 'delay', 0.3, 's("z_square").zdelay(.1)', 's("z_square").zdelay(0.3)'],
  ['chip', 'mod', 40, 's("z_square").zmod(20)', 's("z_square").zmod(40)'],
  ['chip', 'noise', 0.2, 's("z_square").znoise(.1)', 's("z_square").znoise(0.2)'],
  ['chip', 'jumpTime', 0.2, 's("z_square").pitchJumpTime(.1)', 's("z_square").pitchJumpTime(0.2)'],
  ['chip', 'deltaSlide', -0.2, 's("z_square").deltaSlide(.1)', 's("z_square").deltaSlide(-0.2)'],
  ['speak', 'lang', 'fr', '"hello".speak("en", 0)', '"hello".speak("fr", 0)'],
  ['speak', 'voice', 3, '"hello".speak("en", 0)', '"hello".speak("en", 3)'],
] as const
export const EXTRA_CONTROLS = [
  ...EXTRA_EDITS.map(([type, id]) => `${type}.${id}`),
  'bytebeat.presetMode',
  'bytebeat.timeMode',
]
