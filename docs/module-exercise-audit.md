# Module exercise audit

Observed 4 November 2026 with Node 24.22.2, locked dependencies and Chromium
156.0.8078.4. The catalog contains 48 modules. The previous 19 library entries
already advertised every module, but many effects and time transforms shared long
chains. The new **Module exercises** collection provides 48 focused, rack-owned
starting points, each with a **Try this** action. Existing entries are retained.

## Reproduction and coverage

Open **Patch library → Module exercises**, select the named module exercise,
choose **Load patch…** (confirm replacement if prompted), then press **Play**.
Follow its Try this action. CODE uses **Edit in source** and **Apply code**;
CHORD, SEQ, DRUMS and CV SEQ support Text mode with Enter to commit. MOD MIX
uses two CV sequences; LAYER has a REV inside its SEND/RETURN loop.

The table records one native control action per focused patch. Supporting modules
are expected: a source, VCA, MIX and OUT make effects playable, and CV utilities
need an audible destination. Sample-based exercises require network sample resources.

| Module       | Saved patch                                                                 | Checked action                               |
| ------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| seq          | [seq.strudel](../src/library/patches/modules/seq.strudel)                   | Text mode: `d3 e3 g3 b3`, Enter              |
| drums        | [drums.strudel](../src/library/patches/modules/drums.strudel)               | Text mode: `bd bd sd hh`, Enter              |
| quant        | [quant.strudel](../src/library/patches/modules/quant.strudel)               | SCALE → `major`                              |
| clock        | [clock.strudel](../src/library/patches/modules/clock.strudel)               | DIV → `1`                                    |
| euclid       | [euclid.strudel](../src/library/patches/modules/euclid.strudel)             | PULSES → `5`                                 |
| ratchet      | [ratchet.strudel](../src/library/patches/modules/ratchet.strudel)           | REPEATS → `4`                                |
| chance       | [chance.strudel](../src/library/patches/modules/chance.strudel)             | DROP → `0`                                   |
| chord        | [chord.strudel](../src/library/patches/modules/chord.strudel)               | Text mode: `<C Fm7 G7>`, Enter               |
| arp          | [arp.strudel](../src/library/patches/modules/arp.strudel)                   | INDICES → `3 2 1 0`                          |
| osc          | [osc.strudel](../src/library/patches/modules/osc.strudel)                   | WAVE → `triangle`                            |
| noise        | [noise.strudel](../src/library/patches/modules/noise.strudel)               | TYPE → `pink`                                |
| harmonic     | [harmonic.strudel](../src/library/patches/modules/harmonic.strudel)         | Partial 3 → 1                                |
| fmop         | [fmop.strudel](../src/library/patches/modules/fmop.strudel)                 | INDEX → `0`                                  |
| smpl         | [smpl.strudel](../src/library/patches/modules/smpl.strudel)                 | SPEED → `0.5`                                |
| vcf          | [vcf.strudel](../src/library/patches/modules/vcf.strudel)                   | CUTOFF → `5000`                              |
| vca          | [vca.strudel](../src/library/patches/modules/vca.strudel)                   | LEVEL → `0`                                  |
| env          | [env.strudel](../src/library/patches/modules/env.strudel)                   | ATK → `0.3`                                  |
| lfo          | [lfo.strudel](../src/library/patches/modules/lfo.strudel)                   | RATE → `0.5`                                 |
| samplehold   | [samplehold.strudel](../src/library/patches/modules/samplehold.strudel)     | STEPS → `16`                                 |
| attenuverter | [attenuverter.strudel](../src/library/patches/modules/attenuverter.strudel) | MAX → `600`                                  |
| modmix       | [modmix.strudel](../src/library/patches/modules/modmix.strudel)             | Second CV SEQ → `<0 0>`                      |
| cvseq        | [cvseq.strudel](../src/library/patches/modules/cvseq.strudel)               | Text mode: `<200 800 1600 3200>`, Enter      |
| delay        | [delay.strudel](../src/library/patches/modules/delay.strudel)               | MIX → `0`                                    |
| reverb       | [reverb.strudel](../src/library/patches/modules/reverb.strudel)             | ROOM → `0`                                   |
| drive        | [drive.strudel](../src/library/patches/modules/drive.strudel)               | TYPE → `hard`                                |
| folder       | [folder.strudel](../src/library/patches/modules/folder.strudel)             | FOLD → `2`                                   |
| lofi         | [lofi.strudel](../src/library/patches/modules/lofi.strudel)                 | BITS → `16`                                  |
| formant      | [formant.strudel](../src/library/patches/modules/formant.strudel)           | VOWEL → `a`                                  |
| comp         | [comp.strudel](../src/library/patches/modules/comp.strudel)                 | THR:RATIO:KNEE:ATK:REL → `0:8:10:.005:.1`    |
| phaser       | [phaser.strudel](../src/library/patches/modules/phaser.strudel)             | RATE → `0.25`                                |
| pan          | [pan.strudel](../src/library/patches/modules/pan.strudel)                   | PAN → `1`                                    |
| shift        | [shift.strudel](../src/library/patches/modules/shift.strudel)               | SHIFT → `0`                                  |
| mix          | [mix.strudel](../src/library/patches/modules/mix.strudel)                   | CH 1 → `0`                                   |
| out          | [out.strudel](../src/library/patches/modules/out.strudel)                   | BPM → `90`                                   |
| iter         | [iter.strudel](../src/library/patches/modules/iter.strudel)                 | STEPS → `1`                                  |
| jux          | [jux.strudel](../src/library/patches/modules/jux.strudel)                   | RIGHT → `fast2`                              |
| chunk        | [chunk.strudel](../src/library/patches/modules/chunk.strudel)               | CHUNKS → `2`                                 |
| every        | [every.strudel](../src/library/patches/modules/every.strudel)               | CYCLES → `2`                                 |
| sometimes    | [sometimes.strudel](../src/library/patches/modules/sometimes.strudel)       | CHANCE → `1`                                 |
| off          | [off.strudel](../src/library/patches/modules/off.strudel)                   | TIME → `0.25`                                |
| layer        | [layer.strudel](../src/library/patches/modules/layer.strudel)               | Loop REV MODE → `palindrome`                 |
| rev          | [rev.strudel](../src/library/patches/modules/rev.strudel)                   | MODE → `palindrome`                          |
| shuffle      | [shuffle.strudel](../src/library/patches/modules/shuffle.strudel)           | SLICES → `8`                                 |
| ribbon       | [ribbon.strudel](../src/library/patches/modules/ribbon.strudel)             | OFFSET → `2`                                 |
| time-lens    | [time-lens.strudel](../src/library/patches/modules/time-lens.strudel)       | START → `0`                                  |
| warp         | [warp.strudel](../src/library/patches/modules/warp.strudel)                 | MODE → `press`                               |
| echo         | [echo.strudel](../src/library/patches/modules/echo.strudel)                 | TIMES → `1`                                  |
| code         | [code.strudel](../src/library/patches/modules/code.strudel)                 | Edit in source: `.struct("x*8")`, Apply code |

## Observed proof and limits

- The library unit suite verifies active source ownership for advertised modules,
  the complete focused collection, generator-style source, valid fixed rails,
  exact original source, independent saved rack identity, and CV/effect/mixer edits.
  Removing the SEQ exercise made the focused coverage assertion fail.
- The native browser audit loads every focused entry through the library dialog,
  verifies stopped loading, explicitly plays it, queries onset events and measures
  nonzero WebAudio PCM. It then performs the table’s native control action, checks
  the resulting value and changed source, and independently saves/reopens the rack.
- The existing library browser group covers all 67 entries, replacement Cancel,
  export/reopen and Stop-failure recovery. Its per-patch output measurements are
  separate from the native control audit. That full sweep preceded the OFF gain
  correction below; all 48 native exercise checks were rerun after the correction.

Run the focused browser groups with:

```sh
npx playwright test -g 'module-exercises-browser|library audio|verifyLibraryUI' --workers=2
```

The committed [native runner](../scripts/module-exercises-browser.mjs) also accepts
a dev-server URL and an output directory. It continues after failures to retain
all module reproduction records, then fails the group if any action failed.
The Playwright report retains the raw results, logs and failure screenshots.
[Recorded native results](evidence/module-exercise-results.json) and the
[DRIVE failure](evidence/module-exercise-drive-bug.json) retain this audit’s evidence.

These checks establish evaluation, baseline output and native edit/save behavior.
They do not establish physical listening, subjective sound quality, every control
or mode, changed PCM for every edit, touch behavior or other browser support.
The production build passes but reports a chunk-size advisory for the expanded
eagerly bundled raw patch library.

## Review corrections

Sol's first review found that a final VCA after OFF overwrote its copy's lower
gain. The exercise now puts the main VCA before OFF and gives the copy its own
0.06 level. A [pinned-engine regression](../src/library/module-exercises.test.ts)
failed against the original patch: all eight events had gain 0.15. It now checks
four original events at 0.15 and four copies at 0.06, then verifies that setting
the copy's loop VCA to zero leaves the originals at 0.15. This was an exercise
authoring error; no module implementation changed.

The review also corrected MOD MIX's instruction: its two alternating inputs
produce a two-cycle cutoff pattern. Both findings were fixed; none were declined.

## Module bugs recorded without fixing

### DRIVE: nullary shape enters Audio error

This is the pinned-engine limitation already noted in the
[sound/effect module spec](module-spec.md#sound-sources-and-voice-effects-131),
reconfirmed through the new exercise. Other tested exercises and primary actions
completed without module failures.

1. Load **Module exercises → DRIVE exercise** and press **Play**.
2. In DRIVE, select **TYPE → shape**. Leave **AMOUNT → value** initially;
   the emitted `.shape(0.5)` plays.
3. Select **AMOUNT → none**. The rack emits `.shape()`.
4. Observe **Audio error**. Expand **Audio error details**: scheduling stopped
   after `Failed to set the 'value' property on 'AudioParam': The provided float value is non-finite.`

**Expected:** an available module mode plays, or the unsupported combination is
refused before submission to the engine. **Observed:** the UI accepts it and the
engine fails during audio scheduling. The source/rack remain available.

**Workaround:** restore **AMOUNT → value**, use a finite amount such as 0.5 and
press Play again. The shipped DRIVE exercise starts in supported `soft(0.5)` mode.
No module/engine implementation was changed in this audit.
