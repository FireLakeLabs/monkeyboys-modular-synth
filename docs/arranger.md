# Arranger lane (#141)

Patches were loops. The arranger lane, opened from **Arrange** in the rack
footer, places each mixer channel over cycles, so a patch can play a song with sections. The [decision](decisions.md#arranger-lane-141-decided-8-november-2026)
records the code form chosen by the spike below.

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

The mask form wins on every check, so the lane writes it. `arrange()` and any
other mask stay source-owned CODE with exact bytes.

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
  lane edits in place: only its string literal changes.
- **Timing.** A lane repeats after its own length. A note plays when its start
  falls in a playing cycle; a note started in a rested cycle stays silent even
  if it lasts into a playing one. A lane counts song cycles, so patterns keep
  their place: a three-cycle alternation does not restart at a section.
- **Placement.** Arrange is a footer popover along the rack's bottom edge, so
  the rack frame keeps its size ([design](design.md#arranger-lane-141)).
- **Editing.** Drag across cells to play or rest a range; Enter or Space toggles
  the focused cell, and arrow keys, Home and End move along the row. Each gesture
  is one rack edit and one undo step. Song length changes only the view while
  lanes fit; shortening below a lane cuts it in one edit. A longer song repeats
  lanes unchanged. Lanes of different lengths drift apart, and the lane says so.
- **Imported code.** A channel with no mask has no literal to change, so adding a
  lane converts the code on edit, with Undo ([#181](decisions.md#usability-review-188-decided-4-november-2026)).
  The same now applies to NAME and OUTPUT edits on an imported mixer: they
  previously failed with a saved-identity error instead of converting.

## Verification

Observed on 8 November 2026 at `6372e52`, Node 24.22.2, Chromium from the
pinned Playwright.

- `npm run check` passed: 2428 unit cases, formatting, skill integrity, lint,
  reader coverage, guardrails, TypeScript and production build.
- **Engine events** (pinned core, no audio): the spike above, plus per-channel
  lanes on fan-out branches (alternate cycles, with a muted, named branch) and on
  nested buses (`.mask("<1!2 0!2>").mask("<1 0>")` plays cycles 0 and 4 of 8).
  The shared panel cases add `.mask("<1!2 0!2>")` on each of the four channels,
  with events preserved through reader projection.
- **Exact source and saved identity** are separate checks: generated files
  restore the complete rack; plain code keeps every byte; changed, added and
  removed masks in a saved file reconcile to the new lane. That last check failed
  before the reader carried lanes through mixer channel restoration.
- **Browser** ([`tests/browser/arranger.spec.mjs`](../tests/browser/arranger.spec.mjs),
  focused run `RESULT passed=2 failed=0`): pointer drag and keyboard edits write
  the mask on that voice only; Undo and Redo step through lane edits; a code edit
  moves the lane; reload recovers the exact file and lane. Playing at 240 BPM,
  recorded engine triggers showed orbit 1 only in cycle 0 of each four and orbit 2
  only in cycles 2 and 3, with nonzero master PCM. An imported lane edits only its
  literal; adding a lane to an unmasked imported channel converts with Undo, and
  Undo restores the exact source. Screenshots are in
  [evidence](evidence/arranger/).
- Physical listening was not done. Touch and other browsers were not tested.
