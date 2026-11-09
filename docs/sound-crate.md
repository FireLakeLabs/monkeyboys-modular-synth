# Sound crate, tape and sample-fed modules (#138)

Implemented against merged #137 (`c486417a36e19c77aabb4856604f7394ad03475e`),
using its [sample-pack/resource-status and export contract](cartridges.md).
Only URL packs and the existing source-owned static inventories are supported;
there is no local-folder loader or separate pack model.

## Decisions and engine boundary

The crate filters the engine snapshot by the current document's seated cartridge
keys. Every known sound remains in its pack, with `n` variants as flippable cards;
pitched maps use the largest per-note variant count, matching index wrapping in
the selected note bank. Bank-prefixed sounds have labelled drawers. Registry name
collisions retain Strudel's existing last-registration behavior; the crate does
not rename sounds or rewrite setup. Unknown/computed inventories retain their
status rather than being executed to discover names.

`loadSamplePacks` loads supported manifests without evaluating the patch.
`auditionSample` calls pinned superdough directly, without evaluate, scheduler
installation, hush or transport changes. It honors app output volume. A silent
trigger first warms the engine's own sample/table cache: the installed sampler
discards cold notes whose decoding misses their onset. The audible trigger then
uses an onset 50 ms ahead and a separate negative orbit, outside the generator's
positive voice allocation. Stop invalidates pending audition intent before an
audible trigger and releases its queued operation even while decoding is held;
in-flight output remains tracked for offline/live context transitions.
This does not add a decoded-readiness guarantee or clear upstream rejected caches.

The [catalog and module contract](module-spec.md#sample-fed-panels-138) own controls,
widths, drop slots and wavetable filtering. Drops are one patch/history edit.
SMPL selections use `s("name:n")`, clearing conflicting BANK/N overrides. A banked
DRUMS row first qualifies the other sounding atoms before clearing the sampler
overrides, preserving their sounds. Ambiguous different-bank fan-out, including
unbanked sample-fed siblings, and downstream sound selectors refuse the row edit
and direct the user to SMPL. SPLICE/WAVETABLE drops below an inherited nonempty
sampler BANK refuse with the owner ID and a clearing instruction. REVERB IR remains
inactive when ROOM is bypassed. Source-owned edits keep the established conversion
gate; no drag silently regenerates unsupported source.

Tape markers use independent absolute sample fractions, exactly as the installed
sampler does. Moving one does not implicitly move another or enable looping.
Pointer gestures group live edits into one undo step; code and numeric controls
share the same accepted values. Uniform razor divisions represent the four SPLICE
modes. Array cut points and computed call arguments retain CODE. New panels start
with the issue's wavetable preset; imports use neutral engine omission defaults.
Existing saved CODE owners remain CODE.

The focused WAVETABLE exercise seats a URL manifest and audio base pinned to
`bubobubobubobubo/dough-waveforms` commit
`125801fa9a799117fd0a0350a195ab7c2f4cdf13`; it follows #137's ordinary ownership and
export path. No new factory pack is silently added to every patch.

## Acceptance evidence

- `src/samples/crate.test.ts` independently checks retained source bytes, complete
  generated/save/reopen rack identity and real pinned-core onset events for all
  five drop targets, all four slice modes, tape aliases/edits, sample selectors,
  wavetable settings, unsupported-call fallback and historical CODE ownership.
  It also covers large card indices and filtering unseated session resources.
- The banked-row regression failed before its fix: the selected TR808 sound still
  carried a TR909 bank. It now passes with explicit names, while independently
  requiring untouched rows to retain their effective sounds and event timing.
- Engine tests cover inventory loading and one-shot audition without evaluating
  code or starting/replacing transport, plus Stop during deferred cold loading.
- `scripts/crate-check.mjs`, in the browser acceptance suite, checks both real
  pinned factory inventories and a deterministic URL-pack manifest using real
  remote WAV files. It observes drawer labels, variant flipping, a cold audition
  while Ready with unchanged source, all five DOM drag destinations, restored saved
  ownership, `wt_` filtering, bidirectional tape edits and live WebAudio output.

Observed locally on 4 November 2026 in Chromium: the crate suite passed without
page errors. Cold audition measured RMS 0.01179 while transport stayed Ready;
the live sample-fed fixture measured RMS 0.01196. The first live fixture failed
because it combined a nonempty manifest base with absolute file URLs; the pinned
sampler concatenates them. Fixing the fixture to use an empty base and absolute
paths produced the passing run. No production sampler behavior was patched.

The shared T3 preview twice returned “Preview automation click timed out after
15000ms.” Verification therefore used the repository's Playwright Chromium harness.
The private design canvas was inaccessible; repository reference exports were
available. PCM establishes browser output, not physical listening. Other browsers,
devices and speakers/headphones remain unverified.

The native Chromium acceptance also passed a pointer-captured tape drag at Fit:
its value reached 0.5 and one Undo restored the exact previous file and 0.2 mark.
The catalog-wide module/look matrix passed at 100%, 75% and Fit, and the existing
1024px/900px workspace suites passed. All 50 focused module exercises passed
source/rack/manual-edit and PCM checks; SPLICE measured RMS 0.000886 and WAVETABLE
0.001734. These results are separate from the deterministic repository gate.

After integrating #136 from main (`b51fcf9`), `npm run check` passed 2,261 tests,
43 guardrails, coverage, lint, TypeScript and build. All 54 module exercises
passed with no page errors, retaining the new routing exercises. The crate/tape,
look/zoom and mid-width checks were rerun. The routing suite passed its five forms,
bus retention/replacement, audio-rate sidebands, actual REPL solo behavior and
leading-rest DUCK startup/replacement/replay after restarting the pre-integration
dev server with forced dependency optimization. Its initial old-server run had
reported the already-fixed missing DUCK target error; no routing code was changed.

## Sol review regressions

Round 1 used gpt-6.1-sol on high and returned three should-fix findings. S1 found
inherited sampler banks misdirecting SPLICE/WAVETABLE choices; S2 found a banked
DRUMS branch rewriting an unbanked sibling; S3 found a stalled cold audition holding
Play's operation queue after Stop. Four focused regressions failed before the fixes
(two S1 destinations, S2 fan-out and S3 recovery) and now pass. Cancellation reuses
the engine's existing operation boundary; a separate check proves Bounce retains
the live context until the cancelled trigger settles. No findings were declined.
Provider-reported usage was unavailable. The full gate passes 2,266 tests and
43 guardrails after these changes.

The real Chromium review suite also passes both inherited-bank target refusals
with exact source/saved ownership unchanged, mixed-bank sibling refusal, and
Ctrl+. followed by Play with measured PCM while the audition's sample fetch is
still held. Releasing that fetch cannot dispatch the cancelled audible trigger.

Sol round 2 approved the current behavior diff and marked S1/S2/S3 resolved, with
no new blocker or should-fix findings. The reviewer independently reran all
73 focused cases. Both rounds used gpt-6.1-sol on high; usage was unavailable.
During review the diff grew from 37 files (+2,386/−14) to 37 (+2,698/−14), mostly
focused regressions, browser proof and documentation for those three fixes.

## Final wave-four integration

Rebased onto merged #139 (`d7be12f`) before updating the PR. The overlapping rack
and spec edits were combined additively: source-document probes, SCOPE, credits,
sample slots and tape views remain present together. The implementation and review
fixes retain their reviewed behavior. On this combined tree, `npm run check`
passes 2,297 tests and 43 guardrails, including coverage, lint, TypeScript and build.
Chromium again passes crate/audition/drop/tape checks, the bank/cancellation review
regressions, the module/look/zoom matrix and both mid-width layouts. The separate
pattern-visibility suite passes safe prefix probes, pointer hover/pinning, live
SCOPE PCM and spectrum, scheduler clock, reduced motion, credits and exact saved
presentation/source checks, with no page errors.
All 55 module exercises pass manual edits, exact saved identity, event and PCM
checks with no bugs or page errors. Routing compatibility again passes all five
forms, bus retention/replacement, modulation sidebands, REPL solo and leading-rest
DUCK startup/reset/replay. These browser observations remain separate from the
repository gate and do not establish physical listening.

## Sound picker (#227)

Each SMPL, SPLICE, REVERB and WAVETABLE panel used to hold a native selector that
listed every variant of every seated sound: 4,386 options per panel with the two
factory packs (901 sounds), rebuilt on every rack render. The owner's
[decisions](decisions.md#sound-picker-227-decided-8-november-2026) replace it with
a readout, a search popup and a pick mode in the Sounds dock.

### Readout

Line one names the bank or pack (`RolandTR808`, `Dirt Samples`); line two, in
monospace, is the rest of the token (`bd:3`, `808bd:3`). Long names end in an
ellipsis. The accessible name and tooltip carry the full token. An empty slot reads
“Choose sound” (“Choose wt\_ sound” on WAVETABLE). A value that no seated pack
provides keeps its token, gains a dashed border and reads “not loaded”, as the old
selector's “unavailable” option did. The whole panel still accepts dropped cards
(#185).

### Search popup

Click, Enter or Space on the readout opens the popup beside the panel with focus in
its search box. Opening it loads the seated packs, as a first visit to Sounds does;
while they load, a loading line shows under any matches from loaded packs.

- With no query or filter, it lists **In this patch** (the other slots' tokens) and
  **Recent** (the last five sounds chosen this session; nothing is saved).
- Results have one row per sound, grouped by pack, capped at 40 with “Showing 40 of
  N”. Ranking: the name starts with the query; then the part after the bank (`bd`
  in `RolandTR808_bd`) does; then the name contains it; then the kind does, so
  `kick` finds kicks. Ties keep pack and manifest order. A name repeated across packs
  keeps one row, the last registration, which is the one Strudel plays. Sounds with
  no variants are left out.
- Kind chips filter the rows. With three or more seated packs, pack chips appear too.
- ↑/↓ move the active row. ←/→ change its variant and play it. Space plays it
  again, Enter chooses it, and Esc or a click outside closes with no change. Clicking
  a row chooses it, and the active row shows ‹ › for pointer flipping. Space never
  types, because sound names cannot contain spaces.
- The footer offers **Browse all in Sounds ›** and, for a filled slot, **Clear slot**.
- WAVETABLE lists only `wt_` sounds. Neither factory pack has any, so its empty state
  points to Packs.
- The search box is a combobox that owns a listbox through `aria-activedescendant`.

Every route chooses through the panel's existing drop path, as one undo step with
the same source and refusals as a dragged card.

Auditions queue in the engine, so flipping quickly would otherwise play a backlog.
The popup waits 150 ms after the last flip and never queues more than the newest
request behind one that is playing. Space plays at once. Audio stays behind
`src/strudel/engine.ts`.

### Kinds

Strudel's [samples guide](https://strudel.cc/learn/samples/) names drum sounds with
the suffixes `bd`, `sd`, `rim`, `cp`, `hh`, `oh`, `cr`, `rd`, `ht`, `mt`, `lt`, `sh`,
`cb`, `tb`, `perc`, `misc` and `fx`, and `.bank()` relies on them: `.bank()` puts the
machine name and `_` in front. Packs may use any names, so this is a convention.

A name of the form `<Bank>_<suffix>`, or exactly `<suffix>`, takes that suffix's kind:
Kick `bd`; Snare `sd`; Hat `hh`; Open hat `oh`; Clap `cp`; Tom `ht`, `mt`, `lt`;
Cymbal `cr`, `rd`; Perc `perc`, `cb`, `rim`, `sh`, `tb`. `misc`, `fx` and anything else
is Other. In the pinned packs this covers 682 of the 683 Drum Machines sounds; the
exception, `OberheimDMX_`, has an empty suffix. A short list in
`src/samples/soundIndex.ts` covers Dirt Samples names that do not follow it, such as
`808bd`, `kicklinn` and `sn`. `reverbkick`, `hc`, `ho`, `rs` and `rm` stay Other until
someone has listened to them.

### Pick mode

**Browse all in Sounds** selects the module, switches the dock to Sounds, carries the
query into the crate search and shows “Choosing for smpl1” with **Done**. Each card
gains **Use**; Use, double-click and Enter assign through the #225 path to that
module. Pick mode stays on after a choice, so you can try several, and ends with
Done, Esc or selecting another module. The target panel stays lit and the others dim,
as during a drag, and its readout reads “choosing…”.

### Index

`soundIndex.ts` indexes each pack resource once. The engine replaces a resource
rather than mutating it, so the index is cached per resource object and shared by
every panel. A closed slot only looks its own name up; the list exists only while a
popup is open.

### Evidence

Observed on 8 November 2026 with Node 24.22.2 and Playwright's Chromium.

- **Lag:** [`scripts/sample-slot-latency.mjs`](../scripts/sample-slot-latency.mjs)
  adds three SMPL, two SPLICE and one REVERB from the palette, loads both pinned
  factory packs, then times a knob step from keydown to the second frame, as
  `knob-latency-check.mjs` does. It ran against production builds of `3af8609`
  (main) and this branch, alternating for five rounds of nine steps. The six slots
  held 26,322 `<option>` elements before and none after. The median step fell from
  **131.8 ms** (range 116.0–139.3) to **33.9 ms** (range 30.7–42.1); all 90 steps
  changed the knob. An unreported profile put the limiter on main-thread JavaScript:
  over nine steps, busy time fell from 1,115 ms to 361 ms, mostly React rendering.
  Opening the picker took a median 9.1 ms, and typing `808` took 28.2 ms from its
  input event to the second frame, finding 24 sounds. One machine (AMD Ryzen 7 PRO 6850U, 16 logical CPUs), headless; the
  [runs and environment](evidence/sound-picker/latency.json) are recorded.
- **Behaviour:** [`tests/browser/sound-picker.spec.mjs`](../tests/browser/sound-picker.spec.mjs)
  uses small stand-ins for the factory packs and a third pack, with WAV fixtures
  served locally. It checks that no slot renders a list; the first view; ranking and
  grouping; that three quick → presses fetch only the last variant's audio file;
  Space; Enter choosing with focus back on the readout and code
  `s("RolandTR808_bd:3")`; one Undo restoring the source; Recent; kind and pack chips;
  no results; Esc and outside click changing nothing; row click; Clear slot;
  WAVETABLE filtering and its empty state; pick mode with the query carried over,
  Use twice, Esc, Done and selection ending it; and readouts that fit 8 HP.
  [Screenshots](evidence/sound-picker/) show the first view, search, kind and pack
  chips, pick mode, the WAVETABLE empty state and the readout states.
- `src/samples/soundIndex.test.ts` and `src/samples/latestAudition.test.ts` cover
  kinds, ranking, filters, repeated names and the latest-only audition queue.
- The existing crate, #185 assignment and panel checks now read the readout instead
  of the native selector.

Audio was fetched and decoded in Chromium but not listened to.
