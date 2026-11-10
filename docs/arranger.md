# Arranger lane (#141)

Patches were loops. The arranger lane, opened from **Arrange** in the rack
footer, places each mixer channel over cycles, so a patch can play a song with sections. The [decision](decisions.md#arranger-lane-141-decided-8-november-2026)
records the code form chosen by the spike below.

## Static sections added separately (#244)

[SECTIONS](section-sequencing.md) now owns the bounded static native arrange
representation. It does not replace this footer or its song-time masks. The
following #141 comparison and 24/200 count are **historical pre-244 evidence**;
its source-boundary rows describe the old reader. #244 independently proves
native local phase, two full arrangements, routing/PCM and saved identity before
replacing only that static CODE boundary. Unsupported forms remain exact CODE.

## Spike: one song both ways

The same 16-cycle song was written in each candidate form and checked with the
pinned `@strudel/core` 1.2.6 and the production reader and generator. Drums play
throughout; a bass with a three-cycle `<c2 eb2 g2>` alternation enters at cycle 4;
a lead enters at cycle 8. The evidence is the spike block in
[`src/codegen/arranger.test.ts`](../src/codegen/arranger.test.ts).

**Per-voice mask lanes**, as the rack writes them:

```js
$: s("bd hh sd hh").bank("RolandTR909").postgain(0.8).orbit(1)
$: note("<c2 eb2 g2>").s("sawtooth").mask("<0!4 1!12>").postgain(0.8).orbit(2)
$: note("c4 eb4 g4").s("square").mask("<0!8 1!8>").postgain(0.8).orbit(3)
```

(The generator writes one call per line; they are joined here for comparison.)

**`arrange()` over sections**:

```js
const drums = s("bd hh sd hh").orbit(1)
const bass = note("<c2 eb2 g2>").s("sawtooth").orbit(2)
const lead = note("c4 eb4 g4").s("square").orbit(3)
$: arrange([4, drums], [4, stack(drums, bass)], [8, stack(drums, bass, lead)])
```

| Check                | Mask lanes                                                                                                                                                          | `arrange()`                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readability          | Each voice keeps its own line and chain; a section is one string on the voices it affects. Changing a section edits one literal.                                    | Sections read like a song form, but each voice is listed in every section it plays (drums three times). Voices must become shared declarations.                                                                                                                   |
| Engine events        | Over 32 cycles: drums in every cycle; bass in cycles 4–15 and 20–31; lead in 8–15 and 24–31. The bass alternation keeps song time (cycle 8 plays `g2`).             | Same onset times and orbits, but **24 of 200 onsets differ**: each section restarts its patterns' cycle count, so the bass plays `c2` at cycle 8 and its phase changes again on the second pass. Section boundaries change the music, not only which voices play. |
| Source round trip    | Exact bytes. The generated file restores the complete saved rack; plain code reads each final mask as that channel's lane, with no CODE except the imported orbits. | Exact bytes, but the whole `arrange()` voice is one CODE block: no readable modules, mixer channels or lanes.                                                                                                                                                     |
| Saved identity       | Lanes are MIX channel values, saved and restored with the rest of the rack.                                                                                         | The rack has nothing to save: the voices exist only inside CODE.                                                                                                                                                                                                  |
| Orbits and the mixer | Unchanged: one `$:` line and one orbit per voice; mute, solo, names and channel outputs stay per voice.                                                             | One `$:` line holds every voice, so per-voice labels are lost. Orbits must move into shared declarations, which the [orbit rule](translation-rules.md#effect-orbits) forbids, and a new allocation rule would be needed.                                          |

The mask form was selected for the lane. #244 separately adds static section
editing; unsupported arrange forms and other masks remain exact CODE.

## Contract

- **Rows.** One row for each connected MIX input, in rack order. A row is named by
  its channel NAME, or by the module that feeds it; with several mixers the row
  also names its MIX. A voice patched straight to OUT has no row: route it
  through MIX to arrange it.
- **Lane text.** A lane is the MIX control `arr1`…`arr4` holding one mini-notation
  step per cycle: `<1!4 0!12>`. `1` plays the cycle and `0` rests it; `!n`
  repeats a step. Only `0`/`1` steps with optional positive `!n`, up to 256 cycles,
  are lane text. Empty means every cycle and writes nothing. Graph validation refuses
  any other value.
- **Writing.** The channel's voice gets `.mask("<…>")` after its transforms and
  before its gain, channel output and orbit. A nested bus adds its own mask
  after the inner one; masks only remove events, so their order does not matter.
  Fan-out branches each carry their own channel's mask. Orbits, labels and gain
  are unchanged.
- **Reading.** A voice's mask is that channel's lane when its argument is lane
  text and only postgain, mixer modulation, `channels` and `orbit` follow it. Any
  other mask (patterned, mid-chain, a second mask) stays exact CODE. An imported
  lane edits in place: only its string literal changes. Clearing it removes only
  the `.mask(…)` call, keeping comments and other calls.
- **Timing.** A lane repeats after its own length. A note plays when its start
  falls in a playing cycle; a note started in a rested cycle stays silent even
  if it lasts into a playing one. A lane counts song cycles, so patterns keep
  their place: a three-cycle alternation does not restart at a section.
- **Placement.** Arrange is a footer popover along the rack's bottom edge, so
  the rack frame keeps its size ([design](design.md#arranger-lane-141)).
- **Editing.** Drag across cells to play or rest a range; Enter or Space toggles
  the focused cell, and arrow keys, Home and End move along the row. Each gesture
  is one rack edit and one undo step. Song length is derived from the longest
  arranged lane (16 cycles when there are none). **+** extends the final step of
  every arranged lane to the new length, in one undoable edit; **−** cuts lanes
  past the new length, also in one edit. Unmasked channels stay unmasked. With no
  lanes, the length controls are disabled until a channel is arranged. An explicit
  all-playing mask is retained on resize so cutting away its final rest does not
  lose the chosen length. Undo/Redo, recovery and Export/Open restore length from
  the lanes; there is no separate length metadata. Imported lanes of different
  lengths show a drift warning; growing aligns every arranged lane to the full song.
- **Padding decision (#230).** On 8 November 2026 the owner explicitly chose
  extending the final step: `<0!4 1!12>` becomes `<0!4 1!28>` at 32 cycles.
  This supersedes the issue's conflicting sound-preservation requirement: the
  opening 16 cycles are unchanged, but later repetitions deliberately change.
  Padding does not repeat the previous lane inside the larger song.
- **Playhead (#230).** While transport is starting, playing or applying a live edit,
  an outline marks
  `floor(scheduler cycle) modulo song length` in every row, including rested cells;
  the ruler marks the same column. It uses the header's engine clock and 100 ms
  display cadence. Stop clears it. Reduced motion freezes the display, matching
  the header, and leaving reduced motion resumes updates. These visual updates
  never edit code, saved rack state or history.
- **Imported code.** A channel with no mask has no literal to change, so adding a
  lane converts the code on edit, with Undo ([#181](decisions.md#usability-review-188-decided-4-november-2026)).
  The same now applies to NAME and OUTPUT edits on an imported mixer: they
  previously failed with a saved-identity error instead of converting.

## Song length and playhead verification (#230)

Observed on 8 November 2026 with Node 24.22.2 and the pinned Playwright Chromium:

- `npm run check` passed, including 2,436 unit cases. Five focused assertions
  failed before the resize fix: growing was a no-op, and cutting to an all-playing
  lane lost its length. All 23 arranger model/codegen cases now pass.
- Imported padding changes only the lane literals, keeping comments and other
  executable bytes. Exact source save/read and complete saved rack identity are
  separate assertions. Pinned-engine onsets over 64 cycles verify the chosen
  16→32 final-step extension: unmasked drums are identical, the original opening
  stays intact, and the bass/lead deliberately play through the added cycles.
- The arranger browser spec passed **4/4**. Native +/− edits step through
  Undo/Redo; imported lanes align and lose the drift warning; reload and
  Export/Open recover the length. Export's standard factory setup is checked
  separately from complete module/cable/value identity.
- A recording engine double drives starting/playing clock values through cycle
  8 and checks modulo-four highlights, motion-preference changes, Stop, unchanged
  exact source/recovery state and unchanged next Undo. A held live rack edit also
  verifies the playhead keeps advancing while code is applying; this assertion
  failed before using the existing transport playing flag. It performs no audio.
- Real playback at 240 BPM records the scheduler clock beside the displayed
  column for six seconds. Away from the 100 ms display-tick boundary, every
  sample matches the scheduler modulo four, all four columns appear, and the
  second song pass wraps. The existing per-orbit event and nonzero master PCM
  assertions pass. Stop removes the outlines.
- The complete local browser suite passed **197/197**
  before the review fix (`RESULT passed=197 failed=0 exit=0`), including workspace
  history, error recovery,
  playback matrices, pattern visibility, rack geometry and stabilization checks.
- After the one-line review fix, the full local run passed 196/197; DRUMS had
  zero PCM despite recorded starts (the [#207](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/207)
  symptom, with no cause inferred). Its unchanged module matrix passed on an
  isolated rerun. The first hosted attempt passed 195/197 and also hit the
  half-typed-code test's Stop cleanup race; the second passed 196/197, including
  DRUMS, leaving only that race. Waiting for the expected Audio error before the
  old cleanup reproduced the failure locally. That test now asserts accepted
  CODE, the settled Audio error and available Play control; application behavior
  is unchanged. Focused auto-apply and arranger acceptance then passed 27/27.
- The [playhead](evidence/arranger-230/playhead.png) and
  [restored length](evidence/arranger-230/length.png) screenshots were inspected.
  The outline is visible on playing and rested cells without changing rack size.
- Browser commands use `npm run test:browser:report`. A temporary config changes
  only the server port to 5185 because another worktree owns 5173. The committed
  design exports and current app were used as references; no live canvas access
  was used. Physical listening, touch and other-browser behavior were not verified.

## Original lane verification (#141)

Observed on 8 November 2026 with Node 24.22.2 and the pinned Playwright Chromium,
on `12d49ca` (rebased onto `3af8609`) unless noted.

- `npm run check` passed: 2432 unit cases, formatting, skill integrity, lint,
  reader coverage, guardrails, TypeScript and production build.
- **Engine events** (pinned core, no audio): the spike above, plus per-channel
  lanes on fan-out branches (alternate cycles, with a muted, named branch) and on
  nested buses (`.mask("<1!2 0!2>").mask("<1 0>")` plays cycles 0 and 4 of 8).
  The shared panel cases add `.mask("<1!2 0!2>")` on each of the four channels,
  with events preserved through reader projection.
- **Exact source and saved identity** are separate checks: generated files
  restore the complete rack; plain code keeps every byte; changed, added and
  removed masks in a saved file reconcile to the new lane. That check failed
  before the reader carried lanes through mixer channel restoration. Clearing an
  imported lane removes only its mask call, including beside line and block
  comments.
- **Browser** ([`tests/browser/arranger.spec.mjs`](../tests/browser/arranger.spec.mjs),
  `RESULT passed=2 failed=0`): opening Arrange leaves the rack frame unchanged;
  pointer drag and keyboard edits write the mask on that voice only; Undo and Redo
  step through lane edits; a code edit moves the lane; reload recovers the exact
  file and lane. Playing at 240 BPM, recorded engine triggers showed orbit 1 only
  in cycle 0 of each four and orbit 2 only in cycles 2 and 3, with nonzero master
  PCM. An imported lane edits only its literal; adding a lane to an unmasked
  imported channel converts with Undo, which restores the exact source; playing
  the last rested cycle removes only the mask call. Screenshots are in
  [evidence](evidence/arranger/).
- **Full local suite.** At `6372e52` (inline lane): 190 of 191 passed;
  `verifyOnRampUI` failed 4 of 4 when repeated, because the lane shrank the rack
  and Fit fell below the 75% overview threshold. Main passed it. Arrange became a
  footer popover, and the test then passed 2 of 2. At `8bfce31`: 189 of 191
  passed; `sound-effects-browser` and `module-exercises-browser` reported silent
  sample PCM with recorded sample starts, the
  [#207](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/207)
  signature, and passed 2 of 2 on a focused rerun. No cause is inferred. After
  rebasing, the arranger, rack-layout and workspace-chrome specs passed 23 of 23.
  The hosted **Full browser suites** run is the merge gate.
- Physical listening was not done. Touch and other browsers were not tested.
- **Review:** three Sol rounds (GPT-6.1 Sol, high effort) on an Opus 5.5
  implementation; two rounds found imported-lane clearing bugs, fixed above.
  Approved on `12d49ca`.
