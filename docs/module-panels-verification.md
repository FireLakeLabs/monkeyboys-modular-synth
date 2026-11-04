# Module panels and mixer labels (#129)

Observed 4 November 2026 on Node 24.22.2, with `npm ci` and the committed lockfile.
The base includes #128's catalog bindings and #145's corpus coverage gate.
The private design canvas was not accessed; the repository's supplied board exports
and existing fixed-width panel system supplied the visual reference.

## Static and pure behavior proof

`npm run check` passes formatting, skills, lint, unit tests, committed reader
coverage, guardrails, TypeScript and production build. The focused
[`panels.test.ts`](../src/codegen/panels.test.ts) and explicit
[control cases](../src/testing/panelCases.ts) exercise all 42 added controls.
Exact source retention, generated saved rack recovery, imported save/reopen
identity and installed Strudel events are independent assertions. Plain imported
orbits remain CODE, preserving the existing provenance boundary.

Additional cases cover multi-word scales, conditional omission, inactive saved
values, unpatched Hz drones, label changes overriding stale metadata, all four
mixer CV inputs, and nested levels folded into one final postgain. The real
core/mini/tonal event algebra is queried over four cycles. Unit event checks do
not simulate REPL label filtering; that is independently exercised below.

Focused regressions were observed failing before their fixes:

- Without omitted-time inference, SYNC 3/16 imported as fixed `.delaytime(.375)`.
  The regression failed on the unexpected delaytime call, then passed with the
  corrected engine-default inference. The trance projection/generation digest is
  deliberately updated for its bare `.delay(.4)`; exact supplied source is unchanged.
- An older source-owned rack without the newly introduced MODE value initially
  became invalid. Its regression failed `invalid` versus `restored`. Exact saved
  syntax and call ownership now retain that historical saved projection; the
  original source, IDs, layout and values survive save/reopen. New imports infer
  SYNC; external code changes are reprojected instead of trusting stale values.

Sol round 1 identified repeated imported `postgain` setters incorrectly becoming
nested mixers, and enclosing labels disappearing when `stack()` was expanded.
Five added cases failed before the fixes. Earlier setters now remain CODE; a
terminal scalar setter retains Strudel's last-setter behavior, including explicit
unity after opaque settings. Expanded stack leaves inherit mute/solo/name.
The checks separately compare source bytes, saved identity and actual events;
the browser REPL also compares original versus regenerated labelled stacks.

Sol round 2 confirmed S1/S2 and found three further import cases: companion
calls creating sound-changing defaults, a repeated output pair losing its final
1:2 override, and mixed TIME/SYNC losing explicit seconds. Regressions reproduced
each event mismatch. Catalog `read: 'companion'` now requires an established,
mode-compatible owner; explicit default pair overrides and mixed delay setters
stay CODE. An additional failing-before regression retains old saved delaytime
ownership beside a CODE delaysync call. An implicit bare frequency source and
an explicit neutral DJ override also retain their original engine events. The
browser REPL independently compares original and regenerated companion, output
override and mixed-delay settings.

Sol round 3 confirmed S3–S5 and reproduced loss of explicit neutral sampler
settings over opaque patterns, including when a bank call established a reused
sampler. Ten regressions (N, BEGIN, END, LOOP, CUT, each direct and after BANK)
failed with changed events, then passed after retaining those neutral setters as
CODE regardless of owner reuse. They independently check exact source and saved
rack identity, and the browser REPL compares original/regenerated events too.
Sol round 4 approved the control-state preservation fix; all 212 focused
panel tests passed independently, with no open findings.

## Browser and runtime proof

Run `node scripts/panels-browser.mjs <vite-url> <evidence-directory>`. It is also
registered in the separate full browser acceptance workflow. Chromium
156.0.8078.4 observed:

- All 42 added controls display their restored values and remain reachable by
  scrolling their fixed-width panels. PW disappears after switching pulse to
  sine; DRIVE disappears after switching ladder to 12db; both stop emitting.
  Editing a muted channel's name writes `_bass:` through the actual input.
- Pulse PW, supersaw voices, ladder drive, velocity, sync delay, reverb fade and
  sample index fixtures all produced nonzero WebAudio PCM (RMS above .0001).
  This proves execution and output, not a subjective judgment of timbre.
- Two STEP LFOs with opposite depths write `.range(.2,.8)` and `.range(.8,.2)`
  on separate MIX levels. Their output was nonzero. Muting both through their
  actual panel controls reduced measured RMS below .00001.
- The pinned Strudel REPL evaluated `_$:`, `S$:`, named and combined `_Sname:`
  labels directly. Muted events disappeared, solo selected the intended voice,
  mute won over solo, and surviving events retained their original orbit 1/2.
  No page errors were observed.

Existing `verifyLibraryUI`, `verifyLibraryRackEditing` and `verifyTrance` browser
groups also passed. All fourteen library entries retain exact executable source
and matching racks without autoplay; the rack editing group retains helper/CODE
and export identity. The trance demo retained 29 modules and four-cycle events:
16 kick, 76 events per supersaw voice and 64 pulse events. Master plus all four
orbit probes produced nonzero PCM through repeated Play and export/reopen;
exact source and saved/rendered rack identity remained true.

Shared T3 preview loaded the app, but two Apply clicks timed out after 15000 ms;
the repository's Playwright harness supplied the interaction/runtime proof.
Physical listening, multichannel hardware output and other browsers/devices were
not verified. Output pair correctness is proven in code/events; hearing physical
channels 3/4 requires a capable interface. #130 landed first; integrated MIX
verification is recorded below. No Wave 3 work is included.

## Full browser CI follow-up

The first hosted run passed the new panel/PCM suite but rejected the old
no-scrolling panel assertion and found Fit-rack rail clipping at 1024px. The
same output-panel script reproduced the clipping locally before the fix. Dense
patch boxes now scroll within the fixed rail height, mixer name fields fit their
panels, and scrolling any descendant updates measured cable endpoints.

The visual guard now scrolls each control into view and rejects unreachable or
horizontally clipped controls, retaining catalog width, text size and jack target
checks. Contrast sampling excludes text clipped outside its scrolling surface;
the trance control hit test scrolls controls into view before checking actual
pointer ownership. All 119 module/look combinations passed at 100%, 75% and Fit,
all ten looks passed visible-label contrast, and all 29 trance panels passed
control hit testing without changing source. The output-panel suite passed at
1600px, 1024px and 900px, including native insertion/replacement and real PCM.

A new panel browser regression scrolls the MIX CV1 jack at Fit and checks live
cable endpoints and exact source. Routing the old viewport-only scroll listener
into the same browser fixture failed with `Cable end detached from jack`; the
capturing listener passed. The existing panel/PCM/REPL checks also passed.

After rebasing onto `23c6f98` (#132), the full deterministic gate passed 1,292
unit tests and 43 guardrails, retaining the peer's tuple/time bindings. Its
existing pattern text browser test failed because the new compact text editor
had also captured RATCHET's REPEATS field and removed Apply. Compact fields are
now limited to MIX; pattern text retains its existing Apply workflow. No peer
assertion was changed. The playhead-cleanup check passed after restarting the
dev server with the rebased source, without changing that check or playback code.

## Integration after #130 merged

Rebased onto main `0f6d04b`, preserving #130's generalized modulation and #132's
pattern/time work. A fresh `npm ci` applied the locked audio-pool patches on
Node 24.22.2. `npm run check` passed 1,416 unit cases, 43 guardrails and build;
reader coverage remains 135/150 mapped calls, 19/23 fully readable voices and
15/17 CODE-free patches, with zero parse/fetch failures.

The shared target matrix now includes all four MIX jacks with SMOOTH LFO, STEP
LFO, ENV and CV SEQ. It initially failed 27 cases on missing modulation/projection
and generated-save ownership, then passed. Sixteen additional nested cases query
the pinned engine and REPL transpiler against independently written expected
expressions: a .2 level through an outer .5 becomes one .1 postgain; SMOOTH/ENV
absolute .4 depth becomes .2. STEP and CV SEQ multiply their event levels by .5.
All cases independently check exact source, generated/reopened rack identity,
plain imports and saved imports. The focused panel/modulation suites pass 327
cases. Folded pattern products stay CODE at their original position; eight nested
save regressions failed until that order was retained.

The generator and reader reuse #130's catalog-driven per-voice modulation
adapters; MIX has no separate waveform or envelope definitions. Canonical Save
retains generated metadata when executable bytes exactly equal the current
writer output, preserving folded paths and non-first channel identities.
Noncanonical imported source still follows its existing ownership proof.

The focused real Chromium PCM suite passed SMOOTH upward/downward, STEP, ENV and
CV SEQ through a nested MIX. Each run verifies one sustained onset, exact saved
rack identity, nonzero PCM for more than 100 sampled windows and an outer .5
factor. SMOOTH's within-note high/low RMS ratio exceeded 1.5; STEP stayed below
1.1. ENV and CV SEQ were observed executing with output; event semantics are
separately proven by the matrix. Physical listening is not claimed.

Observed nested MIX PCM at 48 kHz: upward SMOOTH RMS .02231–.06262
(ratio 2.806), downward .00570–.02078 (3.646), STEP .04214–.04271 (1.013),
ENV .04213–.05362 and CV SEQ .02107–.02135. These are measured destination
PCM, separate from event/source/identity checks.

The combined full browser run passed 33 of 34 groups; the smaller-height panel
matrix found REVERB's 15000 Hz readout overflowing its 40px row at Fit. Narrow
numeric rows now wrap the readout below the knob while retaining font size,
knob geometry and catalog HP. The unchanged matrix, contrast and output-panel
checks verify that correction. A separate failing-before regression also keeps
an out-of-panel-range LFO gain and an unsupported postgain modulation object
before opaque routing when saved; both pass with preserved events, exact bytes
and reopened identity.

## Sol round 5 import-state corrections

The final integrated review accepted the earlier fixes but found S7: three nested
MIX SMOOTH modulators lost a contribution through consecutive deferred fallbacks,
and S8: a gain outside the LFO panel's period range followed by a representable
SMOOTH object acquired a unity postgain override. Four added regressions failed
before the fixes, separately exposing changed event data and broken Save/reopen.

Multiple modulation objects cannot share one channel CV jack, so plain imports
retain them all as ordered CODE. Fallbacks insert from the end of the source;
an opaque gain is inserted last, before its associated modulation and routing.
A gain that cannot project also keeps its modulation as CODE, preventing a new
MIX CV path from emitting unity. All 331 focused panel/modulation tests pass.
The real REPL import probe includes both forms and separately checks events,
exact source and saved/reopened rack state. Round 5 returned CHANGES; a further
Sol approval is pending, and the skill's five-round budget requires the user's
explicit extension before another recheck. No review usage was exposed.

Current deterministic gate after S7/S8: 1,420 unit cases, 43 guardrails, formatting,
lint, reader coverage, TypeScript and build pass. S7 (blocker) and S8 (should) are
fixed locally, with approval pending; neither finding is disputed or declined.
The previous integrated head passed all 34 browser groups in 5.1 minutes; the
same full workflow is being rerun with these fixes and the new REPL assertions.
