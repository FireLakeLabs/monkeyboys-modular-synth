# Function-loop acceptance (#135)

Verified 4 November 2026 on Node 24.22.2 and Chromium 156.0.8078.4.
The [contract](translation-rules.md#function-loops-135),
[catalog](../src/modules/catalog.ts) and [format](patch-format.md#function-loop-ownership-135)
separate generated code, exact source, saved identity and sound/event behavior.

## Static and unit evidence

`npm ci` and `npm run check` passed: 1,627 unit cases, 43 guardrails,
formatting, skill integrity, lint, reader coverage, TypeScript and production build.
The new [focused suite](../src/modules/function-loops.test.ts) independently checks:

- CHUNK, first/last EVERY, event/cycle/often/rarely SOMETIMES, OFF, LAYER,
  TIME LENS WINDOW, custom JUX and nested loops against real pinned-engine events.
- Exact imported comments/formatting, scalar edits inside nested bodies, saved
  IDs/values/layout/cables on reopen, and all four unchanged JUX presets.
- Whole-body CODE inside the corresponding loop, preserved callback identifiers,
  references and comments; nested CODE does not hide the readable outer loop.
- Conservative whole-call fallback for async/block/non-receiver/parenthesized
  callbacks and unsupported arity. A same-named global cannot replace a callback
  parameter when interpreting CV. These are parser checks, not a sandbox.
- All four CV source adapters inside nested functions; source/bus exclusions,
  cross-return, branching, recursive containment and forged saved addresses.
- Incomplete SEND/RETURN chains and deletion without automatic reconnection.
  A regression initially rejected deletion or sounded a partial body; it now
  preserves the disconnected state and uses the preset until the chain closes. A closed bypassed chain retains an identity lambda,
  rather than accidentally selecting REV; its focused event regression failed
  before that distinction was implemented.
- Activity instrumentation retains real event values/times. Lambda ink and CODE
  underline ownership have a separate presentation assertion.

New catalog controls have explicit source/edit oracles in
[function-loops.fixtures.ts](../src/modules/function-loops.fixtures.ts), included
in the catalog-wide control coverage inventory. Existing CODE tests now use the
still-unsupported `chunkBack` where they require opaque code; a saved explicit
`chunk` CODE fixture still proves old ownership is retained.

The generator-style [Function loops exercise](../src/library/patches/function-loops.strudel)
keeps every new module on an active route. Its independent generated/projection
digests are new; all pre-existing library digests remain unchanged. The corpus
manifest records its MIT provenance. The coverage baseline adds that patch and
raises aggregate floors without reducing any pre-existing patch's floor.

## Observed browser and audio evidence

Run `node scripts/function-loops-browser.mjs <vite-url> <evidence-directory>`.
The suite is also registered in the hosted Playwright browser gate. It drives
real Play/Stop, the editor, numeric controls, cable replacement and undo/redo.

All nineteen examples passed: twelve supported call/mode/nesting forms, four
CV source forms, two nested ordered-FX forms, and an
opaque `.color("red").rev()` body. For every example, the browser observed exact
imported source, identical saved rack recovery, matching generated four-cycle
pinned-engine event snapshots, scheduled playback events and nonzero WebAudio
PCM (122,880 samples per example; observed RMS approximately .0074–.0169).
This is measured output, not physical listening.

The UI proof changed CHUNK count and saw its SEND role update; repatched an inner
loop using Connections → Move destination → Replace; retained the displaced
RATCHET as disconnected saved state; and restored the complete nested graph with
Undo/Redo. An imported `p => p.iter(/* keep */ 3).rev()` edit changed only `3` to
`5`, preserving its comment and parameter. Reopen retained the complete rack.

Computed styles showed Alien teal (`rgb(140, 245, 218)`), distinct long/short dashes
(`16 4 3 4`), λ centers, accessible “function” jack names, visible SEND roles and
generated lambda hover text on all function cables and SEND jacks. Measured cable
endpoints stayed attached. The existing panel matrix also passed all 534
module/look/zoom cases (ten looks, 100%, 75% and Fit), including fixed widths,
24-pixel jack targets and no overlapping targets. No page errors were observed.
The screenshot and raw JSON are produced in the requested evidence directory.

Shared Preview loaded and inspected the nested rack, but two Play-click actions
timed out. Playwright provided the completed audio and interaction proof. Local
exports of the design boards were available; the private live canvas was not
accessed. Other browsers/devices and physical speakers/headphones remain
unverified. The specified browser/source/rack/event acceptance criteria are
covered within these limits.

## Resolved choices

- New empty loops use `rev`; JUX keeps its current RIGHT presets.
- Functions are local single chains, with incomplete state preserved and no
  generated global fan-out names. Nested loops and attached CV are supported.
- Imported loop scalar and layout edits preserve source. Imported loop rewiring
  uses the existing explicit Make rack-editable flow; rack-owned rewiring works
  immediately. This avoids guessing nested structural ownership.
- Optional v1 nested binding paths and callback identifiers preserve old saved
  JUX/CODE files without a version migration. Changed ambiguous callbacks do not
  attach saved inner identities by ordinal.

## Sol review ledger

Round 1 used GPT-6.1 Sol on high effort. It requested four scoped fixes; usage
was not exposed. No findings were declined. Each finding had a failing-before
regression, then passed after its fix:

- **S1, blocker, fixed:** top-level orbit-routing call indices no longer skip
  nested lambda calls after external source edits. Both ITER nodes and the
  independently queried event sequence survive the edited saved file.
- **S2, should, fixed:** receiver-chain validation excludes attached CV
  dependencies. STEP/SMOOTH LFO, ENV and CV SEQ now project to real loop controls
  and modulators rather than an opaque body. All four also passed browser events,
  source/rack round trips and nonzero PCM.
- **S3, should, fixed:** saved CODE retention resolves the nested snapshot scope.
  Editing a saved loop CODE body from `.color("red")` to `.rev()` retains its CODE
  identity and exact source edit, with matching regenerated events.
- **S4, should, fixed:** signal inference uses validated loop membership for main
  chain endpoints, preserving declared CV signals. The browser observed a mod CV
  jack and a dashed function RETURN cable after removing SEND; reopen retained
  that partial graph.

After these fixes, `npm run check` passed 1,485 unit cases and 43 guardrails.
The registered `function-loops-browser` Playwright test passed all seventeen
examples and its UI checks without page errors. The changes add focused tests
and reuse the existing loop membership map in rendering. Round 2 approved all four fixes with no new findings, independently passing
230 relevant tests and three adjacent nested/CV/CODE probes. Both rounds used
GPT-6.1 Sol on high effort; usage was not exposed. The full diff grew from
40 files (+2,509/−81) before review to 40 files (+2,658/−92) after the fixes,
including their focused regression and browser evidence. No review findings remain open.

## Integration with ordered effects (#134)

PR #158 landed while this PR was being opened. The implementation was rebased
onto `7699774` and combines nested `loop` and effect-argument `fx` ownership in
both writer and reader, including source-snapshot validation and exact literal
edits. Effect planning now treats each closed SEND/RETURN body as its own path,
without following SEND back into the outer voice or merging inner and outer
stages. Incomplete loops do not contribute an audible-stage note.

The new integration regressions separately check ordered FX arguments inside a
lambda, exact second-filter edits/reopen, independent main/function effect order,
and preserved native imported effects. Explicit engine-default controls keep
these event comparisons independent from omitted-default formatting. The
planner regression failed with a stack overflow using main's prior traversal;
the incomplete-loop note regression failed by listing unsounded filters. Both
pass with the integrated planner.

`npm run check` passed 1,518 unit tests and 43 guardrails after integration.
The registered function-loop browser suite passed nineteen real-engine forms,
including two nested FX forms with nonzero PCM. It edited the second nested
filter through the actual CUTOFF input while preserving both comments, then
removed SEND and observed no false audible-stage note. The existing ordered-FX
browser test also passed its native/reordered/repeated playback and control
checks. No page errors were observed. Sol round 3 approved the integration with no new findings. It independently
passed 116 focused tests and six additional nested FX/CV/save/edit/reopen probes;
S1–S4 remain resolved. All three rounds used GPT-6.1 Sol on high effort.
Reviewer usage was not exposed. The final feature diff against integrated main
is 41 files (+2,822/−115) before this approval note; no review findings remain.

## CI and sound-module integration (#131)

The first hosted browser run exposed three old opaque-code examples that still
used newly readable CHUNK. Those browser fixtures now use `chunkBack`, retaining
their CODE presence, underline and Cyber-look assertions. The remaining failure
was a real native-pointer regression: a JUX output moved when cable-start status
text wrapped after SEND's multiline role. The pointer-up landed on a cable path
instead of the jack. Status marks now reserve a fixed inline width before the
role label, so starting a wire does not change the patch-box geometry.

Main then gained #131 in `a256274`. The integration retains its catalog, drawbar
controls, sound-input adapter, multi-stage effect ranks and saved reset/companion
semantics. `soundSource` catalog modules (NOISE and HARMONIC) are excluded from
function bodies. Both new RETURN-source rejection tests failed without that
catalog guard, then passed with it. Reader coverage adds the function exercise
without lowering any existing corpus patch's floor.

The local full gate after these fixes passed 1,627 unit tests and 43 guardrails.
A clean dev-server start is required for the broad browser run: hot-reload query
URLs in a long-running server can instantiate a second engine in browser probes.
The isolated module-feedback test passed after a fresh start without changing
engine behavior or its immediate-clear assertions. The complete browser rerun passed all 37 tests in 7.1 minutes, including
the four initially failing cases, the nineteen loop/CV/FX audio forms, #131
sound effects, ordered effects, library editing/playback, recovery, undo and
modulation. The updated look matrix covered 534 module/look/zoom cases.
Physical listening and other browser/device coverage remain unverified.

Sol round 4 approved the pointer-state and source-boundary fixes, independently
passing 186 focused tests and six nested source/effect save/edit/reopen probes.
The review budget was extended for the observed native-pointer state race and
new saved-state integration. S5 (pointer geometry) and S6 (sound-source exclusion)
are resolved; S1–S4 remain resolved, with no new findings. Four rounds used
GPT-6.1 Sol on high effort; usage was not exposed. The diff against integrated
main before this final evidence note is 44 files (+2,882/−128).

## Final integration with nested steps (#147)

PR #161 landed during the final fetch/push. The branch was rebased onto
`23401a1`, which includes every other wave-three item. Production changes applied
without conflicts; the activity-test oracle and browser-suite list retained
#147's nested-step behavior alongside the loop and opaque-CODE cases. The new
committed dependency/lockfile was installed with `npm ci` on Node 24.22.2.

Two additional integration tests retain backticks and CRLF during an enclosing
loop edit and splice a multiline CV SEQ literal inside a function without
changing its raw line endings. They separately prove exact source, saved rack
identity and generated events. RATCHET remains a text control; the test does not
apply #147's notation-tray editing guarantees to it. The final deterministic
gate passed 1,807 unit tests and 43 guardrails. A fresh-server complete browser
run includes the added nested-step suite as well as function loops and effects.
