import { connect, placeModule, setValue, starterPatch } from '../rack/model'
import { getModuleSpec } from '../modules/catalog'
import type { ControlValue } from '../patch/types'

/** Explicit #129 behavior examples, shared by the unit and real-browser acceptance. */
export const panelCases: readonly {
  type: string
  control: string
  value: ControlValue
  settings?: Record<string, ControlValue>
  call: string
}[] = [
  { type: 'seq', control: 'accent', value: '1 .6 .6 .6', call: '.velocity("1 .6 .6 .6")' },
  { type: 'drums', control: 'accent', value: '1 .6 .6 .6', call: '.velocity("1 .6 .6 .6")' },
  { type: 'quant', control: 'shift', value: 2, call: '.scaleTranspose(2)' },
  { type: 'add', control: 'value', value: '<0 7>', call: '.add("<0 7>")' },
  { type: 'osc', control: 'mode', value: 'freq', call: '.freq(110)' },
  { type: 'osc', control: 'pw', value: 0.3, settings: { wave: 'pulse' }, call: '.pw(0.3)' },
  { type: 'osc', control: 'voices', value: 7, settings: { wave: 'supersaw' }, call: '.unison(7)' },
  {
    type: 'osc',
    control: 'detune',
    value: 0.3,
    settings: { wave: 'supersaw' },
    call: '.detune(0.3)',
  },
  {
    type: 'osc',
    control: 'spread',
    value: 0.8,
    settings: { wave: 'supersaw' },
    call: '.spread(0.8)',
  },
  { type: 'osc', control: 'noise', value: 0.2, call: '.noise(0.2)' },
  { type: 'osc', control: 'oct', value: -1, call: '.octave(-1)' },
  { type: 'osc', control: 'freq', value: 220, settings: { mode: 'freq' }, call: '.freq(220)' },
  { type: 'smpl', control: 'n', value: 3, call: '.n(3)' },
  { type: 'smpl', control: 'begin', value: 0.1, call: '.begin(0.1)' },
  { type: 'smpl', control: 'end', value: 0.6, call: '.end(0.6)' },
  { type: 'smpl', control: 'loop', value: 1, call: '.loop(1)' },
  { type: 'smpl', control: 'cut', value: 1, call: '.cut(1)' },
  { type: 'vcf', control: 'type', value: 'ladder', call: '.ftype("ladder")' },
  { type: 'vcf', control: 'drive', value: 0.8, settings: { type: 'ladder' }, call: '.drive(0.8)' },
  { type: 'vcf', control: 'anchor', value: 0.5, call: '.fanchor(0.5)' },
  { type: 'vcf', control: 'dj', value: 0.3, settings: { mode: 'dj' }, call: '.djf(0.3)' },
  { type: 'vca', control: 'vel', value: 0.6, call: '.velocity(0.6)' },
  {
    type: 'delay',
    control: 'mode',
    value: 'sync',
    settings: { sync: 0.25 },
    call: '.delaysync(0.25)',
  },
  {
    type: 'delay',
    control: 'sync',
    value: 0.125,
    settings: { mode: 'sync' },
    call: '.delaysync(0.125)',
  },
  { type: 'reverb', control: 'fade', value: 2, call: '.roomfade(2)' },
  { type: 'reverb', control: 'lp', value: 4000, call: '.roomlp(4000)' },
  { type: 'reverb', control: 'dim', value: 8000, call: '.roomdim(8000)' },
  ...[1, 2, 3, 4].flatMap((channel) => [
    { type: 'mix', control: `mute${channel}`, value: 'on', call: '_$: ' },
    { type: 'mix', control: `solo${channel}`, value: 'on', call: 'S$: ' },
    { type: 'mix', control: `name${channel}`, value: 'bass', call: 'bass: ' },
    { type: 'mix', control: `channels${channel}`, value: '3:4', call: '.channels("3:4")' },
    { type: 'mix', control: `arr${channel}`, value: '<1!2 0!2>', call: '.mask("<1!2 0!2>")' },
  ]),
]

export function panelFixture(type: string, values: Record<string, ControlValue> = {}, channel = 1) {
  let patch = starterPatch(104)
  const sample = ['drums', 'smpl'].includes(type)
  const path = sample ? ['drums', 'smpl'] : ['seq', ...(type === 'quant' ? ['quant'] : []), 'osc']
  if (!path.includes(type) && type !== 'mix') path.push(type)
  for (const [row, kind] of path.entries()) patch = placeModule(patch, kind, row + 1)
  for (let i = 0; i < path.length; i++) {
    const from = `${path[i]}1`,
      to = i === path.length - 1 ? 'mix1' : `${path[i + 1]}1`
    const output = getModuleSpec(path[i] ?? '').jacks.find((jack) => jack.direction === 'out')
    const input = getModuleSpec(path[i + 1] ?? 'mix').jacks.find(
      (jack) => jack.direction === 'in' && !jack.cvTarget,
    )
    if (!output || !input) throw new Error('Missing fixture jack')
    patch = connect(
      patch,
      { module: from, jack: output.id },
      { module: to, jack: to === 'mix1' ? `in${channel}` : input.id },
    )
  }
  if (type === 'quant')
    patch = setValue(setValue(patch, 'seq1', 'mode', 'degree'), 'seq1', 'steps', '0 1 2 3')
  for (const [key, value] of Object.entries(values)) patch = setValue(patch, `${type}1`, key, value)
  return patch
}
