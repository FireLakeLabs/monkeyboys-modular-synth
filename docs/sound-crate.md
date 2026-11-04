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
audible trigger; in-flight output is tracked for offline/live context transitions.
This does not add a decoded-readiness guarantee or clear upstream rejected caches.

The [catalog and module contract](module-spec.md#sample-fed-panels-138) own controls,
widths, drop slots and wavetable filtering. Drops are one patch/history edit.
SMPL selections use `s("name:n")`, clearing conflicting BANK/N overrides. A banked
DRUMS row first qualifies the other sounding atoms before clearing the sampler
overrides, preserving their sounds. Ambiguous different-bank fan-out and downstream
sound selectors refuse the row edit and direct the user to SMPL. REVERB IR remains
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
