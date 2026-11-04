import { getModuleSpec } from '../modules/catalog'
import type { LibraryPatch } from './catalog'
import seqSource from './patches/modules/seq.strudel?raw'
import gatesSource from './patches/modules/gates.strudel?raw'
import switchSource from './patches/modules/switch.strudel?raw'
import auxSource from './patches/modules/aux.strudel?raw'
import duckSource from './patches/modules/duck.strudel?raw'
import drumsSource from './patches/modules/drums.strudel?raw'
import quantSource from './patches/modules/quant.strudel?raw'
import clockSource from './patches/modules/clock.strudel?raw'
import euclidSource from './patches/modules/euclid.strudel?raw'
import ratchetSource from './patches/modules/ratchet.strudel?raw'
import chanceSource from './patches/modules/chance.strudel?raw'
import chordSource from './patches/modules/chord.strudel?raw'
import arpSource from './patches/modules/arp.strudel?raw'
import oscSource from './patches/modules/osc.strudel?raw'
import noiseSource from './patches/modules/noise.strudel?raw'
import harmonicSource from './patches/modules/harmonic.strudel?raw'
import fmopSource from './patches/modules/fmop.strudel?raw'
import smplSource from './patches/modules/smpl.strudel?raw'
import vcfSource from './patches/modules/vcf.strudel?raw'
import vcaSource from './patches/modules/vca.strudel?raw'
import envSource from './patches/modules/env.strudel?raw'
import lfoSource from './patches/modules/lfo.strudel?raw'
import sampleholdSource from './patches/modules/samplehold.strudel?raw'
import attenuverterSource from './patches/modules/attenuverter.strudel?raw'
import modmixSource from './patches/modules/modmix.strudel?raw'
import cvseqSource from './patches/modules/cvseq.strudel?raw'
import delaySource from './patches/modules/delay.strudel?raw'
import reverbSource from './patches/modules/reverb.strudel?raw'
import driveSource from './patches/modules/drive.strudel?raw'
import folderSource from './patches/modules/folder.strudel?raw'
import lofiSource from './patches/modules/lofi.strudel?raw'
import formantSource from './patches/modules/formant.strudel?raw'
import compSource from './patches/modules/comp.strudel?raw'
import phaserSource from './patches/modules/phaser.strudel?raw'
import panSource from './patches/modules/pan.strudel?raw'
import shiftSource from './patches/modules/shift.strudel?raw'
import mixSource from './patches/modules/mix.strudel?raw'
import scopeSource from './patches/modules/scope.strudel?raw'
import outSource from './patches/modules/out.strudel?raw'
import iterSource from './patches/modules/iter.strudel?raw'
import juxSource from './patches/modules/jux.strudel?raw'
import chunkSource from './patches/modules/chunk.strudel?raw'
import everySource from './patches/modules/every.strudel?raw'
import sometimesSource from './patches/modules/sometimes.strudel?raw'
import offSource from './patches/modules/off.strudel?raw'
import layerSource from './patches/modules/layer.strudel?raw'
import revSource from './patches/modules/rev.strudel?raw'
import shuffleSource from './patches/modules/shuffle.strudel?raw'
import ribbonSource from './patches/modules/ribbon.strudel?raw'
import time_lensSource from './patches/modules/time-lens.strudel?raw'
import warpSource from './patches/modules/warp.strudel?raw'
import echoSource from './patches/modules/echo.strudel?raw'
import codeSource from './patches/modules/code.strudel?raw'

/** One small, rack-owned starting point per shipped module. */
export const MODULE_EXERCISES: readonly LibraryPatch[] = [
  {
    type: 'gates',
    source: gatesSource,
    description: 'Independent gate rhythm and pitch sequence.',
    tryThis: 'Turn a GATES rest into x and compare the attacks without changing SEQ pitch.',
  },
  {
    type: 'switch',
    source: switchSource,
    description: 'Four patterns chosen by a cycle selector.',
    tryThis: 'Change SWITCH SELECT to <0 1 2 3> and compare one note per cycle.',
  },
  {
    type: 'aux',
    source: auxSource,
    description: 'Two voices share a filtered send/return bus.',
    tryThis: 'Turn the return VCF CUTOFF to 400 and compare both voices together.',
  },
  {
    type: 'duck',
    source: duckSource,
    description: 'A bass pulse ducks the other mixer channel.',
    tryThis: 'Set DUCK DEPTH to 0 and compare the sustained target voice.',
  },

  {
    type: 'seq',
    source: seqSource,
    description: 'A four-note melody with no pattern transforms.',
    tryThis: 'Change the first SEQ note from c3 to d3 and compare the first note of each cycle.',
  },
  {
    type: 'drums',
    source: drumsSource,
    description: 'A single drum pattern with rests. Samples load on Play.',
    tryThis: 'Turn the second DRUMS step on and compare the beat.',
  },
  {
    type: 'quant',
    source: quantSource,
    description: 'Scale degrees through one quantizer.',
    tryThis: 'Switch QUANT SCALE from minor to major and compare the melody.',
  },
  {
    type: 'clock',
    source: clockSource,
    description: 'A melody with clock division, swing and phase.',
    tryThis: 'Change CLOCK DIV from 2 to 1 and compare the cycle length.',
  },
  {
    type: 'euclid',
    source: euclidSource,
    description: 'Three pulses spread over eight steps.',
    tryThis: 'Change EUCLID PULSES from 3 to 5 and count the attacks.',
  },
  {
    type: 'ratchet',
    source: ratchetSource,
    description: 'A melody with two attacks per note.',
    tryThis: 'Change RATCHET repeats from 2 to 4, then Apply.',
  },
  {
    type: 'chance',
    source: chanceSource,
    description: 'A seeded pattern with dropped notes.',
    tryThis: 'Set CHANCE DROP to 0 to restore every note.',
  },
  {
    type: 'chord',
    source: chordSource,
    description: 'Voiced chords without arpeggiation.',
    tryThis: 'Change the first CHORD symbol from Cm7 to C, then press Enter.',
  },
  {
    type: 'arp',
    source: arpSource,
    description: 'An arpeggiator running through chord tones.',
    tryThis: 'Reverse the ARP pattern to 3 2 1 0, then Apply.',
  },
  {
    type: 'osc',
    source: oscSource,
    description: 'A bare sawtooth voice for waveform and tuning checks.',
    tryThis: 'Switch OSC WAVE from sawtooth to triangle, then raise TUNE by 12.',
  },
  {
    type: 'noise',
    source: noiseSource,
    description: 'Steady white noise without pitched voices or effects.',
    tryThis: 'Compare NOISE TYPE white, pink and brown; select crackle and raise DENSITY to 0.5.',
  },
  {
    type: 'harmonic',
    source: harmonicSource,
    description: 'An additive voice with four harmonic drawbars.',
    tryThis: 'Raise HARMONIC partial 3 from 0 to 1 and compare the tone.',
  },
  {
    type: 'fmop',
    source: fmopSource,
    description: 'One FM operator feeding a sine oscillator.',
    tryThis: 'Set FM OP INDEX from 2 to 0 to compare the unmodulated sine.',
  },
  {
    type: 'smpl',
    source: smplSource,
    description: 'A TR909 sample voice. Samples load on Play.',
    tryThis: 'Set SMPL SPEED from 1 to 0.5 and compare sample pitch and length.',
  },
  {
    type: 'vcf',
    source: vcfSource,
    description: 'A sawtooth melody through one resonant filter.',
    tryThis: 'Raise VCF CUTOFF from 800 to 5000 Hz, then compare LP and HP.',
  },
  {
    type: 'vca',
    source: vcaSource,
    description: 'One amplifier before the mixer.',
    tryThis: 'Set VCA LEVEL to 0, then restore it to 0.15.',
  },
  {
    type: 'env',
    source: envSource,
    description: 'An envelope patched to amplitude.',
    tryThis: 'Raise ENV ATK from 0.01 to 0.3 seconds and compare note onsets.',
  },
  {
    type: 'lfo',
    source: lfoSource,
    description: 'An LFO sampled into filter cutoff.',
    tryThis: 'Change LFO RATE from 2 to 0.5 cycles and compare cutoff motion.',
  },
  {
    type: 'samplehold',
    source: sampleholdSource,
    description: 'A sampled LFO scaled to filter frequencies.',
    tryThis: 'Raise S&H STEPS from 4 to 16 and compare the cutoff staircase.',
  },
  {
    type: 'attenuverter',
    source: attenuverterSource,
    description: 'A normalized LFO mapped to absolute cutoff values.',
    tryThis: 'Change ATTENUVERTER MAX from 2400 to 600 Hz and compare the sweep range.',
  },
  {
    type: 'modmix',
    source: modmixSource,
    description: 'Two numeric sequences added at the filter cutoff.',
    tryThis:
      'Change the second CV SEQ values from <0 1200> to <0 0> and compare the two-cycle cutoff pattern.',
  },
  {
    type: 'cvseq',
    source: cvseqSource,
    description: 'Four absolute filter cutoff values, one per cycle.',
    tryThis: 'Change the first CV SEQ value from 400 to 200 and compare the first cycle.',
  },
  {
    type: 'delay',
    source: delaySource,
    description: 'A melody with one delay send.',
    tryThis: 'Set DELAY MIX to 0, then restore it to 0.4; compare the repeats.',
  },
  {
    type: 'reverb',
    source: reverbSource,
    description: 'A melody with one room send.',
    tryThis: 'Set REVERB ROOM to 0, then restore it to 0.4; compare the tails.',
  },
  {
    type: 'drive',
    source: driveSource,
    description: 'One waveshaper without other distortion stages.',
    tryThis: 'Compare DRIVE TYPE soft and hard at DRIVE 0.5; keep AMOUNT in value mode.',
  },
  {
    type: 'folder',
    source: folderSource,
    description: 'One wavefolder without other effects.',
    tryThis: 'Raise FOLDER FOLD from 0.6 to 2 and compare the tone.',
  },
  {
    type: 'lofi',
    source: lofiSource,
    description: 'A bitcrusher and decimator on one voice.',
    tryThis: 'Compare LO-FI BITS 6 and 16, then COARSE 4 and 1.',
  },
  {
    type: 'formant',
    source: formantSource,
    description: 'One vowel filter, changing vowel each cycle.',
    tryThis: 'Replace FORMANT VOWEL with a, then i, applying each change.',
  },
  {
    type: 'comp',
    source: compSource,
    description: 'One compressor and transient shaper.',
    tryThis:
      'Change COMP threshold from -30 to 0 in the text field, then Apply and compare the level.',
  },
  {
    type: 'phaser',
    source: phaserSource,
    description: 'One phaser on a sustained sawtooth.',
    tryThis: 'Compare PHASER RATE 2 and 0.25 Hz, then switch PHASER off.',
  },
  {
    type: 'pan',
    source: panSource,
    description: 'One panner with no JUX or other stereo transforms.',
    tryThis: 'Set PAN to 0, then 1; compare the left and right channels.',
  },
  {
    type: 'shift',
    source: shiftSource,
    description: 'One phase-vocoder pitch shifter.',
    tryThis: 'Compare SHIFT 0 and 0.5; note duration stays the same.',
  },
  {
    type: 'mix',
    source: mixSource,
    description: 'Two distinguishable voices on separate mixer channels.',
    tryThis: 'Set MIX channel 1 to 0, restore it, then set channel 2 to 0.',
  },
  {
    type: 'scope',
    source: scopeSource,
    description: 'A sine voice with a per-voice analyser tap.',
    tryThis: 'Press Play and switch SCOPE VIEW between waveform and spectrum.',
  },
  {
    type: 'out',
    source: outSource,
    description: 'A simple melody for tempo and master output checks.',
    tryThis: 'Change OUT BPM from 120 to 90, then lower VOL and restore it.',
  },
  {
    type: 'iter',
    source: iterSource,
    description: 'A melody rotated across four cycles.',
    tryThis: 'Compare ITER STEPS 4 and 1 over four cycles.',
  },
  {
    type: 'jux',
    source: juxSource,
    description: 'An unchanged left melody and a reversed right melody.',
    tryThis: 'Change JUX RIGHT from REV to FAST ×2 and compare stereo timing.',
  },
  {
    type: 'chunk',
    source: chunkSource,
    description: 'A rotating quarter-cycle reversal in a function loop.',
    tryThis: 'Change CHUNK CHUNKS from 4 to 2 and compare four cycles.',
  },
  {
    type: 'every',
    source: everySource,
    description: 'A reversal on the first of every four cycles.',
    tryThis: 'Change EVERY CYCLES from 4 to 2, then compare first and last modes.',
  },
  {
    type: 'sometimes',
    source: sometimesSource,
    description: 'A probabilistic reversal with no other pattern transforms.',
    tryThis: 'Compare SOMETIMES CHANCE 0 and 1 in events mode.',
  },
  {
    type: 'off',
    source: offSource,
    description: 'A quieter copy delayed by one eighth of a cycle.',
    tryThis: 'Compare OFF TIME 0.125 and 0.25; the original notes stay in place.',
  },
  {
    type: 'layer',
    source: layerSource,
    description: 'A reversed copy layered over the original melody.',
    tryThis:
      'In the LAYER loop, switch REV MODE from rev to palindrome and compare several cycles.',
  },
  {
    type: 'rev',
    source: revSource,
    description: 'A reversed four-note melody.',
    tryThis: 'Switch REV MODE from rev to palindrome and compare two cycles.',
  },
  {
    type: 'shuffle',
    source: shuffleSource,
    description: 'Four shuffled melody slices.',
    tryThis: 'Compare SHUFFLE SLICES 4 and 8, then try scramble mode over several cycles.',
  },
  {
    type: 'ribbon',
    source: ribbonSource,
    description: 'A two-cycle loop cut from a changing melody.',
    tryThis: 'Compare RIBBON OFFSET 1 and 2 while keeping CYCLES at 2.',
  },
  {
    type: 'time-lens',
    source: time_lensSource,
    description: 'The middle half of a melody expanded to one cycle.',
    tryThis: 'Compare TIME LENS START/END 0.25/0.75 and 0/1.',
  },
  {
    type: 'warp',
    source: warpSource,
    description: 'A broken-up melody without other time transforms.',
    tryThis: 'Compare WARP modes brak, press and hurry; use RATE 2 for hurry.',
  },
  {
    type: 'echo',
    source: echoSource,
    description: 'Pattern echoes without an audio delay effect.',
    tryThis: 'Change ECHO TIMES from 3 to 1 and compare the number of attacks.',
  },
  {
    type: 'code',
    source: codeSource,
    description: 'An opaque rhythm transform kept in a connected CODE block.',
    tryThis:
      'Click CODE Edit in source, change .struct("x ~ x x") to .struct("x*8"), then Apply code and compare the rhythm.',
  },
].map(({ type, ...entry }) => ({
  kind: 'patch',
  id: `exercise-${type}`,
  title: `${getModuleSpec(type).name} exercise`,
  ...entry,
  attribution: {
    author: 'MonkeyBoy’s Modular Synth contributors · MIT',
    url: 'https://github.com/FireLakeLabs/monkeyboys-modular-synth',
  },
  exercises: [type],
}))
