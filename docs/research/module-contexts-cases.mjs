// Original, repository-owned research fixtures. Never evaluate imported/corpus code.
import * as core from '../../src/reader/fixtures/strudel-kernel.mjs'
import * as mini from '@strudel/mini/mini.mjs'
import * as tonal from '@strudel/tonal/tonal.mjs'
import * as voicings from '@strudel/tonal/voicings.mjs'
import { read } from '../../src/reader/read'
import { generate } from '../../src/codegen/generate'
import { saveLayout, sourceBody } from '../../src/workspace/document'
import { CATALOG } from '../../src/modules/catalog'
import { parseSource } from '../../src/reader/syntax'

mini.miniAllStrings()
export { CATALOG, read, generate, saveLayout, sourceBody }
const runtime = { ...core, ...mini, ...tonal, ...voicings }

export function events(expression) {
  // This boundary accepts only the literal fixtures in this research, never input files.
  // oxlint-disable-next-line typescript/no-implied-eval
  const pattern = new Function(...Object.keys(runtime), `return (${expression})`)(
    ...Object.values(runtime),
  )
  return pattern.queryArc(0, 4).map((hap) => ({
    whole: hap.whole && [hap.whole.begin.toString(), hap.whole.end.toString()],
    part: [hap.part.begin.toString(), hap.part.end.toString()],
    value: hap.value,
  }))
}

// Each comparison is bounded to [0,4); source inspection establishes general constraints.
export const comparisons = [
  ['C21', 'bipolar signal is not normalized alias', 'sine2.segment(8)', 'sine.segment(8)', false],
  ['C21', 'random integer is a numeric pattern', 'irand(8).segment(8)', 'rand.segment(8)', false],
  ['C21', 'continuous constant versus discrete pure', 'steady(1)', 'pure(1)', false],
  [
    'C22',
    'inside and outside reverse context',
    'note("<c2 c3> e2 g2").inside(2,x=>x.rev())',
    'note("<c2 c3> e2 g2").outside(2,x=>x.rev())',
    false,
  ],
  [
    'C24',
    'voicing context can precede chord setter',
    'dict("ireal").anchor("c4").chord("Cm7").voicing()',
    'chord("Cm7").dict("ireal").anchor("c4").voicing()',
    true,
  ],
  [
    'C01',
    'selector order with independent fields',
    'note("c2").s("sine")',
    's("sine").note("c2")',
    true,
  ],
  ['C01', 'selector override', 'note("c2").s("sine").s("square")', 'note("c2").s("square")', true],
  [
    'C02',
    'pulse companion before selector',
    'note("c2").pw(.2).s("pulse")',
    'note("c2").s("pulse").pw(.2)',
    true,
  ],
  [
    'C02',
    'noise companion before selector',
    'note("c2").density(.3).s("crackle")',
    'note("c2").s("crackle").density(.3)',
    true,
  ],
  [
    'C03',
    'quoted add on control values is not transpose',
    'note("c2").add("12")',
    'note("c2")',
    true,
  ],
  [
    'C03',
    'addition before note versus after note',
    'mini("48").add("12").note()',
    'note("48").add("12")',
    false,
  ],
  ['C03', 'actual transposition', 'note("c2").transpose(12)', 'note("c2").add("12")', false],
  ['C03', 'utility arithmetic order', 'mini("2").mul(3).add(1)', 'mini("2").add(1).mul(3)', false],
  [
    'C04',
    'chord without voicing is legal but different',
    'chord("Cm7")',
    'chord("Cm7").voicing()',
    false,
  ],
  [
    'C04',
    'arp is not chord-only',
    'note("[c3,e3,g3]").arp("0 1 2")',
    'chord("C").voicing().arp("0 1 2")',
    false,
  ],
  [
    'C04',
    'scale shift is not semitone transpose',
    'n("0 1").scale("C:major").scaleTranspose(1)',
    'n("0 1").scale("C:major").transpose(1)',
    false,
  ],
  [
    'C05',
    'partials before selector',
    'note("c2").partials([1,.5]).s("user")',
    'note("c2").s("user").partials([1,.5])',
    true,
  ],
  [
    'C05',
    'FM setter before selector',
    'note("c2").fm(2).s("pulse")',
    'note("c2").s("pulse").fm(2)',
    true,
  ],
  [
    'C06',
    'sample speed before selector',
    'note("c2").speed(.5).s("bd")',
    'note("c2").s("bd").speed(.5)',
    true,
  ],
  ['C06', 'chop versus striate', 's("bd hh").chop(4)', 's("bd hh").striate(4)', false],
  [
    'C07',
    'chip companion before selector',
    'note("c2").slide(.2).s("z_square")',
    'note("c2").s("z_square").slide(.2)',
    true,
  ],
  [
    'C08',
    'resonance before cutoff',
    's("sine").lpq(25).lpf(800)',
    's("sine").lpf(800).lpq(25)',
    true,
  ],
  [
    'C08',
    'partial envelope legal',
    's("sine").attack(.2)',
    's("sine").attack(.2).decay(.2).sustain(.5).release(.1)',
    false,
  ],
  [
    'C08',
    'gain repeat overwrites, not multiplies',
    's("sine").gain(.5).gain(.2)',
    's("sine").gain(.1)',
    false,
  ],
  [
    'C09',
    'native setter order independent fields',
    's("sine").pan(.2).lpf(800)',
    's("sine").lpf(800).pan(.2)',
    true,
  ],
  [
    'C09',
    'repeated native cutoff last wins',
    's("sine").lpf(400).lpf(1200)',
    's("sine").lpf(1200)',
    true,
  ],
  [
    'C09',
    'explicit FX repeats retain two stages',
    's("sine").FX(lpf(400)).FX(lpf(1200))',
    's("sine").lpf(1200)',
    false,
  ],
  [
    'C10',
    'time transform order',
    'note("c2 e2").late(.25).fast(2)',
    'note("c2 e2").fast(2).late(.25)',
    false,
  ],
  [
    'C10',
    'repeat transforms must remain separate',
    'note("c2 e2").fast(2).fast(2)',
    'note("c2 e2").fast(2)',
    false,
  ],
  ['C10', 'rev versus palindrome', 'note("c2 e2").rev()', 'note("c2 e2").palindrome()', false],
  [
    'C11',
    'different target sampling structures',
    's("sine").lpf(sine.range(400,800))',
    's("sine").lpf(sine.segment(8).range(400,800))',
    false,
  ],
  [
    'C11',
    'independent modulation arguments',
    's("sine").lpf(sine.range(400,800)).pan(sine.range(0,1))',
    's("sine").lpf(sine.range(400,800)).pan(sine.range(1,0))',
    false,
  ],
  [
    'C12',
    'event ECHO is not audio DELAY',
    's("sine").echo(3,.125,.5)',
    's("sine").delay(.5).delaytime(.125)',
    false,
  ],
  [
    'C12',
    'room companion before activation',
    's("sine").roomsize(2).room(.3)',
    's("sine").room(.3).roomsize(2)',
    true,
  ],
  [
    'C13',
    'stack before versus after same selector',
    'stack(note("c2"),note("e2")).s("sine")',
    'stack(note("c2").s("sine"),note("e2").s("sine"))',
    true,
  ],
  [
    'C13',
    'chained and factory stack',
    'note("c2").stack(note("e2"))',
    'stack(note("c2"),note("e2"))',
    true,
  ],
  [
    'C13',
    'voicing after stack can override independent selectors',
    'stack(note("c2").s("sine"),note("e2").s("square"))',
    'stack(note("c2"),note("e2")).s("sine")',
    false,
  ],
  [
    'C14',
    'firstOf and every are aliases',
    'note("c2 e2").firstOf(4,x=>x.rev())',
    'note("c2 e2").every(4,x=>x.rev())',
    true,
  ],
  [
    'C14',
    'firstOf versus lastOf',
    'note("c2 e2").firstOf(4,x=>x.rev())',
    'note("c2 e2").lastOf(4,x=>x.rev())',
    false,
  ],
  [
    'C14',
    'layer excludes implicit original',
    'note("c2 e2").layer(x=>x.rev())',
    'note("c2 e2").superimpose(x=>x.rev())',
    false,
  ],
  [
    'C14',
    'chunk backwards is different',
    'note("c2 e2 g2 b2").chunk(4,x=>x.transpose(12))',
    'note("c2 e2 g2 b2").chunkBack(4,x=>x.transpose(12))',
    false,
  ],
  [
    'C14',
    'fastChunk preserves evolving source cycles',
    'note("<c2 c3 c4 c5> e2 g2 b2").chunk(4,x=>x.transpose(12))',
    'note("<c2 c3 c4 c5> e2 g2 b2").fastChunk(4,x=>x.transpose(12))',
    false,
  ],
  [
    'C15',
    'branching inside callback is engine legal',
    'note("c2 e2").off(.125,x=>stack(x,x.transpose(7)))',
    'note("c2 e2").off(.125,x=>x)',
    false,
  ],
  [
    'C15',
    'nested scope receiver changes',
    'note("c2 e2").firstOf(2,x=>x.off(.125,y=>y.transpose(7)))',
    'note("c2 e2").firstOf(2,x=>x.off(.125,y=>x.transpose(7)))',
    false,
  ],
  ['C16', 'indexed FM independent fields', 's("sine").fm(2).fm2(3)', 's("sine").fm(3)', false],
  [
    'C17',
    'named reuse retains independent branches',
    '(()=>{const p=note("c2 e2");return stack(p.s("sine"),p.s("square"))})()',
    'stack(note("c2 e2").s("sine"),note("c2 e2").s("square"))',
    true,
  ],
  ['C19', 'general struct need not follow SEQ', 's("bd").struct("x ~ x")', 's("bd")', false],
  [
    'C20',
    'routing field changes survive event queries',
    's("sine").orbit(7).channels("3:4")',
    's("sine").orbit(0)',
    false,
  ],
]

export const readerCases = [
  [
    'C26',
    'bare n imports degree SEQ but remains oscillator partial count',
    'n("0 2").s("sawtooth")',
    ['seq', 'osc'],
    [],
    { seq: { mode: 'degree' } },
  ],
  [
    'C21',
    'bipolar signal argument',
    'note("c2").s("sine").lpf(sine2.range(400,800))',
    ['osc'],
    ['.lpf(sine2.range(400,800))'],
  ],
  [
    'C21',
    'random integer control',
    'note("c2").s("sine").lpf(irand(8))',
    ['osc'],
    ['.lpf(irand(8))'],
  ],
  [
    'C21',
    'continuous constant argument',
    'note("c2").s("sine").lpf(steady(800))',
    ['osc'],
    ['.lpf(steady(800))'],
  ],
  [
    'C22',
    'inside callback candidate',
    'note("c2 e2").s("sine").inside(2,x=>x.rev())',
    ['osc'],
    ['.inside(2,x=>x.rev())'],
  ],
  [
    'C24',
    'voicing controls candidate',
    'chord("Cm7").dict("ireal").anchor("c4").voicing().s("sine")',
    ['osc'],
    ['chord("Cm7")'],
  ],
  [
    'C25',
    'patterned selector candidate',
    'note("c2").s("<sine square>")',
    [],
    ['.s("<sine square>")'],
  ],
  ['C01', 'bare root sine retains sampler topology', 's("sine")', ['drums', 'smpl'], []],
  [
    'C03',
    'unvoiced note arithmetic is whole CODE',
    'note("c2").add("12")',
    [],
    ['note("c2").add("12")'],
  ],
  [
    'C08',
    'implicit sampler complete envelope',
    's("bd").att(.01).dec(.2).sus(.5).rel(.1).gain(.5)',
    [],
    ['s("bd").att(.01).dec(.2).sus(.5).rel(.1).gain(.5)'],
  ],
  [
    'C09',
    'implicit sampler FX boundary',
    's("bd").FX(lpf(800).lpq(1))',
    ['drums', 'smpl'],
    ['.FX(lpf(800).lpq(1))'],
  ],
  ['C11', 'patterned gain is CV SEQ', 's("bd").gain("1 .5")', ['vca', 'cvseq'], []],
  ['C01', 'root oscillator', 's("saw")', ['osc'], []],
  ['C01', 'chained oscillator', 'note("c2").s("saw")', ['seq', 'osc'], []],
  ['C01', 'sample rhythm source', 's("bd hh")', ['drums', 'smpl'], []],
  ['C01', 'chained sample selector', 'note("c2").s("bd")', ['seq', 'smpl'], []],
  ['C02', 'pulse companion adjacent', 'note("c2").s("pulse").pw(.2)', ['osc'], []],
  ['C02', 'pulse companion before selector', 'note("c2").pw(.2).s("pulse")', ['osc'], ['.pw(.2)']],
  ['C02', 'incompatible sound companion', 'note("c2").s("sine").pw(.2)', ['osc'], ['.pw(.2)']],
  ['C03', 'quoted add after note', 'note("c2").add("12").s("sawtooth")', ['add'], []],
  ['C03', 'scalar add after note', 'note("c2").add(12).s("sawtooth")', ['seq'], ['.add(12)']],
  ['C03', 'computed addition', 'note("c2").add(offsets).s("sawtooth")', ['seq'], ['.add(offsets)']],
  ['C04', 'chord voiced', 'chord("Cm7").voicing().s("sawtooth")', ['chord'], []],
  ['C04', 'bare chord', 'chord("Cm7")', [], ['chord("Cm7")']],
  [
    'C04',
    'alternate voicing arguments',
    'chord("Cm7").voicing("lefthand")',
    [],
    ['.voicing("lefthand")'],
  ],
  ['C05', 'user partials', 's("user").partials([1,.5])', ['harmonic'], []],
  [
    'C05',
    'stock-wave partials',
    'note("c2").s("sawtooth").partials([1,.5])',
    ['osc'],
    ['.partials([1,.5])'],
  ],
  ['C05', 'FM repeated setting', 'note("c2").s("sine").fm(2).fm(3)', ['fmop'], []],
  ['C06', 'sample slicing', 's("bd").slice(4,"0 1")', ['splice'], []],
  ['C06', 'computed sample slice count', 's("bd").slice(count,"0 1")', [], ['.slice(count,"0 1")']],
  ['C06', 'wavetable controls', 's("wt_piano").wt(.4).warp(.2)', ['wavetable'], []],
  ['C07', 'bytebeat preset', 's("bytebeat").n(2)', ['bytebeat'], []],
  ['C07', 'chip selector', 's("z_square").slide(.2)', ['chip'], []],
  ['C07', 'speech words', '"hello".speak("en",0)', ['speak'], ['"hello"']],
  ['C08', 'owned filter alias', 'note("c2").s("sine").cutoff(800).resonance(25)', ['vcf'], []],
  [
    'C08',
    'unowned resonance alias',
    'note("c2").s("sine").resonance(25)',
    ['osc'],
    ['.resonance(25)'],
  ],
  [
    'C08',
    'partial amplitude envelope',
    'note("c2").s("sine").attack(.2)',
    ['osc'],
    ['.attack(.2)'],
  ],
  [
    'C08',
    'complete amplitude envelope',
    'note("c2").s("sine").attack(.01).decay(.2).sustain(.5).release(.1).gain(.5)',
    ['env', 'vca'],
    [],
  ],
  ['C09', 'native repeated filter', 'note("c2").s("sine").lpf(400).lpf(1200)', ['vcf'], []],
  [
    'C09',
    'ordered repeated filter',
    'note("c2").s("sine").FX(lpf(400)).FX(lpf(1200))',
    ['vcf'],
    [],
  ],
  ['C09', 'opaque FX helper', 'note("c2").s("sine").FX(helper())', ['osc'], ['.FX(helper())']],
  ['C10', 'timing calls repeat', 'note("c2 e2").s("sawtooth").slow(2).slow(3)', ['clock'], []],
  [
    'C11',
    'sampled cutoff',
    'note("c2").s("sine").lpf(perlin.range(200,1500).slow(4))',
    ['vcf', 'lfo'],
    [],
  ],
  [
    'C11',
    'utility cutoff',
    'note("c2").s("sine").lpf(sine.segment(8).mul(1).range(400,2400).add(mini(\'<0 200>\')))',
    ['vcf', 'lfo', 'samplehold', 'attenuverter', 'modmix', 'cvseq'],
    [],
  ],
  [
    'C11',
    'unsupported control expression',
    'note("c2").s("sine").lpf(customSignal)',
    ['osc'],
    ['.lpf(customSignal)'],
  ],
  ['C12', 'room companions', 'note("c2").s("sine").room(.3).roomsize(2)', ['reverb'], []],
  ['C12', 'room IR unowned', 'note("c2").s("sine").ir("hall")', ['osc'], ['.ir("hall")']],
  ['C13', 'nested stack before selector', 'stack(note("c2"),note("e2")).s("sine")', [], []],
  ['C14', 'single chain loop', 'note("c2 e2").s("sawtooth").chunk(4,x=>x.rev())', ['chunk'], []],
  [
    'C14',
    'nested chain loop',
    'note("c2 e2").s("sawtooth").chunk(4,x=>x.firstOf(2,y=>y.rev()))',
    ['chunk', 'every'],
    [],
  ],
  [
    'C14',
    'alias every',
    'note("c2 e2").s("sawtooth").every(4,x=>x.rev())',
    ['seq'],
    ['.every(4,x=>x.rev())'],
  ],
  [
    'C15',
    'chunk variant',
    'note("c2 e2").s("sawtooth").chunkBack(4,x=>x.rev())',
    ['seq'],
    ['.chunkBack(4,x=>x.rev())'],
  ],
  [
    'C15',
    'callback branch',
    'note("c2 e2").s("sawtooth").off(.125,x=>stack(x,x.transpose(7)))',
    ['seq'],
    ['.off(.125,x=>stack(x,x.transpose(7)))'],
  ],
  [
    'C15',
    'callback source selector',
    'note("c2 e2").s("sawtooth").off(.125,x=>x.s("square"))',
    ['off'],
    ['.s("square")'],
  ],
  ['C16', 'indexed FM', 'note("c2").s("sine").fm2(3)', ['osc'], ['.fm2(3)']],
  [
    'C16',
    'harmonic scale option',
    'n("0 1").scale("C:minor:pentatonic").s("sawtooth")',
    ['quant'],
    [],
  ],
  [
    'C18',
    'opaque function remains inert during parse',
    'note("c2").s("sawtooth").unknownResearchCall()',
    ['seq'],
    ['.unknownResearchCall()'],
  ],
  ['C19', 'general struct', 's("bd").struct("x ~ x")', [], ['.struct("x ~ x")']],
  ['C20', 'opaque orbit', 'note("c2").s("sine").orbit(7)', ['osc'], ['.orbit(7)']],
  ['C20', 'opaque bus', 'note("c2").s("sine").bus(7)', ['osc'], ['.bus(7)']],
  ['C20', 'scope tap', 'note("c2").s("sine").analyze(2)', ['scope'], []],
]

export const documentCases = [
  ['C17', 'named fan-out', 'const p = note("c2 e2");\n$: p.s("sine")\n$: p.s("square")\n'],
  [
    'C18',
    'inert setup',
    'globalThis.__moduleContextResearchExecuted = true;\n$: note("c2").s("sawtooth")\n',
  ],
  [
    'C20',
    'opaque setup and routed branch',
    'samples("https://example.invalid/manifest.json");\n$: note("c2").s("sawtooth").orbit(7).channels("3:4")\n',
  ],
]

export function reportEvents(source) {
  const { scopes } = parseSource(source)
  const declarations = scopes
    .filter((scope) => scope.kind === 'declaration')
    .map((scope) => `const ${scope.descriptor.anchor} = ${source.slice(scope.start, scope.end)};`)
    .join('\n')
  const voices = scopes
    .filter((scope) => scope.kind === 'voice')
    .map((scope) => source.slice(scope.start, scope.end))
  return events(`(()=>{${declarations} return stack(${voices.join(',')})})()`)
}
