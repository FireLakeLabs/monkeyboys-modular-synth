# Multi-input and cross-voice routing verification (#136)

Verified on 4 November 2026 with Node **24.22.2**, npm's committed lockfile and
Chromium **156.0.8078.4**. Scope is [#136](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/136):
GATES, SWITCH, AUX, DUCK and audio into CV. Cartridge bay, sound crate and pattern
visibility remain in #137–#139.

## Deterministic proof

`npm ci` and `npm run check` pass: formatting, skill integrity, lint, unit tests,
reader coverage, **2,204 unit tests**, 43 executable guardrails, TypeScript and
production build.
The pre-existing large-bundle build advisory remains.

[Routing tests](../src/codegen/routing.test.ts) independently check:

- Exact original source, complete saved rack identity, and real pinned
  compiler/core events for each of the five routing forms. They also save and
  reopen unproven imported routing without claiming bus/orbit ownership.
- Literal expected gate onset times/pitches, cycle selections, shared AUX bus
  send/return events, DUCK targeting and retargeting, silent modulation senders
  and an additional audible MIX branch.
- Every CV destination (OSC, VCF, VCA, PAN and MIX), shared CV fan-out, named
  GATES fan-out, and source-owned bus reservations. Forged metadata, changed bus
  addresses, feedback and non-GATES gate inputs cannot claim generated identity.
- Each new scalar/step control changes events and retains saved state. Imported
  post-struct timing stays after the rhythm operation; timing after patterned
  accent is not folded into an earlier SEQ RATE. Source-owned routing
  comments retain exact bytes through generation/save and preserve engine events.
- An opaque trigger orbit cannot shift DUCK away from its actual target. An
  active DUCK feeding only pre-orbit bus taps is refused with a reason.

[Playback tests](../src/strudel/playback.test.ts) show bus retention on knob
changes, reset on cable changes and reset when setup reserves an address and
renumbers the allocation without changing modules/cables. Removing the allocation
fingerprint reproduced a failing reset assertion. The named-GATES test failed
before emitting its shared definition; source-comment generation failed before
using the tokenizer to recognize comment-prefixed CODE. The opaque-trigger test
failed with DUCK 2 targeting a channel actually allocated orbit 3 before including
trigger reservations in the allocation pass.

All prior generator/library digest snapshots remain unchanged. Four new
rack-owned module exercises extend the existing complete catalog coverage; their
snapshots are additional cases. The literal-edit inventory links the dedicated
routing control matrix rather than pretending these are independent scalar
chain adapters.

## Direct browser proof

Reproduce with a Vite server in this checkout and:

```sh
node scripts/routing-browser.mjs http://127.0.0.1:5174 /tmp/monkeyboy-routing
```

The shared T3 preview rendered the cable and exposed its accessible signal and
computed strokes. Native preview clicks timed out twice, so the authorized
Playwright fallback drove the app's real Play/Stop and nested-cell controls.
The [browser driver](../scripts/routing-browser.mjs) and
[real-engine helpers](../scripts/routing-check.mjs) produced the committed
[raw results](evidence/routing/results.json).

Observed separately from unit/static checks:

- Every routing form played and produced nonzero live WebAudio PCM at **48 kHz**.
  Browser queries of the actual scheduled patterns contained 20 GATES events,
  4 SWITCH events, 36 AUX events, 36 DUCK events and 8 audio-mod events over four
  cycles, matching their independent expected routing checks.
- DUCK changed the actual target orbit's output gain between approximately
  **.11 and 1**. The trigger remained separately audible on its own MIX channel.
- A 40-Hz audio source modulated VCA within one sustained carrier note. The two
  sidebands near **90.8/170.8 Hz** rose from roughly **−143 dBFS** without the
  audio-mod cable to **−73 dBFS** with it. This is direct audio-rate output proof,
  separate from checking a `bmod` event object.
- The actual bus object survived a cutoff edit. Reserving bus 1 replaced it with
  a fresh bus 2 and removed the old address. Stop/replay replaced bus 2 again.
- Native Enter/edit/Enter on a GATES cell changed only its intended gate token
  and synchronized `.struct("~ ~ x x ~ x ~ x")` in the editor.
- GATES, SWITCH, AUX and DUCK retained 120/144-px catalog widths across all four
  Hardware looks at 100% zoom. Their jacks stayed within panels with at least
  24-px targets. Audio-mod retained its distinct double/dashed strokes and `≋`
  accessible jack marks in every look. The
  [colour capture](evidence/routing/audio-mod.png) and
  [greyscale capture](evidence/routing/audio-mod-greyscale.png) retain the visible
  cable distinction without relying on hue.
- No uncaught page errors remained after the full playback/reset sequence.

The first live sequence exposed an upstream `InvalidAccessError`: a late AUX
return tried to disconnect an edge already disconnected by structural reset.
The pinned [postinstall patch](../scripts/patch-strudel-audio-pools.mjs) now makes
that specific return cleanup idempotent, in the source and both distributed
bundles. Other errors still propagate. Exact original, prior patched and final
hashes reject dependency drift. The same unchanged browser sequence failed
before the fix and passed after a fresh `npm ci` and Vite dependency rebuild.

## Decisions and limits

The [translation contract](translation-rules.md#multi-input-and-cross-voice-routing-136)
records the decisions: silent private pre-mixer send/trigger voices, shared AUX
and audio-mod allocation, relative native bus modulation, explicit destination
controls, DUCK SIDE/IN/OUT semantics, and source-owned imported routing. Native
bus taps precede global orbit delay/reverb; inline effects before the tap remain
in the signal. Source-only wet output is suppressed as well as dry output.

The private design canvas boards were unavailable. Checked-in exports and the
current rack design supplied the references. Physical listening, other browsers,
physical devices and mobile/zoom interaction matrices are unverified; the report
claims measured browser PCM and native desktop behavior. No #136 acceptance
criterion remains unverified by the stated deterministic/browser checks.

## Sol review regressions

Round 1 (gpt-6.1-sol, high) found S1/S2. The actual browser/REPL repro lost all
AUX sends under solo (0 instead of 8), and a leading-rest DUCK target stopped
playback with `duck target orbit 2 does not exist`. Both checks failed before
the fixes. Private routing now keeps solo participation without dry/wet output.
The pinned source and bundles lazily create a duck target's envelope and defer
its output connection until its actual voice supplies the channel pair.

The browser suite retains 8 AUX sends, 1 audio-mod send and 4 DUCK triggers when
their destinations are soloed. Leading-rest DUCK stays playing through startup,
structural replacement and replay, and its target retains logical output pair
3:4 (zero-based 2:3). These real-REPL checks complement the deterministic source
label and saved-identity regressions; the ordinary unit event helper deliberately
does not emulate REPL label selection. Physical multichannel devices are not
verified. No extra musical events or app-only playback shims were added.

Sol recheck approved the current routing behavior in round 2 with no new
in-scope findings. Both S1/S2 are resolved; provider-reported usage was unavailable.

## Wave-four integration

Rebased on the completed #137 cartridge bay without discarding its setup or
resource behavior. The generator retains bay-owned `samples()` setup before
routing declarations/voices. Five additional regressions separately prove exact
export bytes and full saved routing identity with both explicit factory packs.
The full repository and routing browser gates were rerun on that combined base.
