# Generated patch playback (#4)

Historical #4 integration slice, verified 2 November 2026: the top-bar transport
played `generate(patch)` using a SEQ → OSC → VCF → VCA → OUT fixture and
catalog-driven cutoff, tempo and volume sliders. The fixture/reproduction below
records that run; the current app starts with a silent MIX → OUT rack. For
current controls and editing use [rack](rack-verification.md),
[workspace](workspace-verification.md) and [interaction evidence](interaction-verification.md).
The [build plan](build-plan.md#current-status-and-remaining-work) owns status;
[#36 recovery](audio-recovery.md) supersedes the earlier serialized-Stop limit.

## Reproduce

Use `.node-version`, `npm ci`, `npm run check`, then `npm run dev`.
Open the local app in a fresh tab and keep it active.

1. Confirm **Stopped** on load. Change CUTOFF or BPM: generated code updates,
   and no audio starts.
2. Click **Play** once. Initialization registers the pinned sample maps and
   initializes/resumes audio before evaluating the generated source. Confirm
   the transport reaches **Playing** and listen for the sequence.
3. While playing, move **VCF CUTOFF** between its extremes. The displayed
   `.lpf(...)` and the sound should change without the sequence starting over.
   Change **OUT BPM** and check that `setcpm(...)` and the tempo change.
4. Move **OUT VOL** to zero and back. This controls the final output gain,
   including effect tails, without re-evaluating the pattern. There is no
   volume expression in executable Strudel. Explicit values remain saved in
   the generator's trailing rack metadata, under the existing format.
5. Click **Stop**, including during Starting/Applying. Pending value edits
   must not restart audio. Notes/tails can ring out; Stop is not a hard mute.
   Change values while stopped, then click Play to hear the new patch.

`src/strudel/playback.test.ts` covers queued edits, Stop intent, explicit retry,
invalid graph/control rejection and structural replacement at the engine
boundary. `src/strudel/engine.test.ts` covers real adapter initialization,
manifest retry, volume, reset ordering and error propagation with a mocked
Strudel boundary. The older [engine probe](engine-spike.md#reproduce) remains
available for detailed scheduling, PCM, samples and independent effect buses.

## Playback contract

- Patch preparation validates through the generator before accepting the edit
  or touching audio. Framework-independent playback owns current playback intent
  and serializes operations. Superseded queued edits are skipped; an active
  evaluation originally finished before Stop in this baseline. #36 now calls Stop
  outside that queue and guards abandoned installation/query results; it cannot
  interrupt the arbitrary evaluation itself. See the recovery contract above.
- A value edit replaces the running pattern through `evaluate`, with no hush
  or effect reset. Existing/scheduled notes are not rewritten; lookahead and
  the next event bound when a sound change arrives.
- Volume-only and presentation-only edits do not evaluate code. OUT VOL uses
  the catalog default when omitted and ramps the engine's final gain over a
  short time constant. Changing volume while stopped does not initialize audio
  but adjusts an existing output, including tails.
- A new Play session and structural graph changes reset global effect buses,
  then restore master volume on the replacement output before evaluation.
  The conservative structural key includes module IDs/types/order, cables and
  opaque CODE values. Normal numeric controls and looks do not reset buses.
- A surfaced evaluation/construction failure cancels playback intent and
  requests Stop. Only confirmed Stop is described as stopped; Stop failure
  reports unknown audio state. Fixing values does not automatically retry.
- Playing confirms scheduling, not successful decoding/output of every sample.
  Observable late sample/output errors now request Stop under the #36 contract.
  Unreported errors, arbitrary-code side effects and precise runtime-to-module
  mapping retain the limits documented there.

## Observed evidence — 2 November 2026

Local Chromium 156 on Linux, 48 kHz output, Node 24.22.2. One top-bar Play click
reached Playing and nonzero PCM output (RMS 0.02310 for the default fixture).
An AudioWorklet tapped the real `destinationGain` after the master gain;
measurements below describe that signal, not physical speakers.

- Live cutoff changes updated generated source. At 20,000 Hz the captured RMS
  was 0.02283; after settling at 20 Hz it was 0.001637. The same output bus
  remained connected, and the engine cycle clock advanced across edits rather
  than returning to zero. These are signal-change observations, not timing or
  performance guarantees.
- OUT VOL zero reached gain 0 and near-zero output during the ramp (RMS
  0.000000649). Raising it to 1 restored output. The voice still emitted its
  VCA `.gain(0.3)`, with no master-volume expression added.
- OUT BPM 240 emitted `setcpm(240/4)`; the clock advanced about 2.18 cycles
  during a 2.2-second capture. Stop returned the clock to zero. An edit while
  stopped remained stopped and measured zero PCM; explicit Play subsequently
  produced nonzero output (RMS 0.03091).
- Generated DRUMS → SMPL → OUT fixtures produced nonzero output for default,
  RolandTR808 and RolandTR909 banks (RMS 0.08894, 0.02895 and 0.09767), each at
  master gain 0.5 after a new-session output reset.
- A valid CODE expression followed by `note("c3").missingMethod()` surfaced the
  construction error, reported “Scheduling stopped”, and left the engine clock
  at zero. No precise source/module highlight was claimed.
- The app fit the 1280 × 800 viewport with code scrolling independently. No
  failed resource status was observed in the completed sample/UI checks.
- The three new adapter volume/reset tests failed against the pre-change
  engine and passed with the implementation. The complete local gate passed.

Human listening and physical speaker output were **not heard** in this harness.
The real captured signal establishes generation, output changes and transport
behavior for these fixtures. Subjective clicks, fresh-profile autoplay rules,
other browsers/devices and universal late-error detection remain unverified.
