# Workspace error and recovery acceptance (#12)

Audited 2 November 2026. #12 owns the workspace presentation, replacement and
acceptance evidence; [#36](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/36)
owns the engine reporting/cancellation implementation. The subsequent
[#36 recovery audit](audio-recovery.md) and [run data](audio-recovery-results.json)
resolve the engine gaps below and rerun this browser suite. The original matrix
is retained as the #12 baseline; its #36 gaps describe that earlier adapter,
not the current recovery contract.

## Reproduce

Use `.node-version` and `npm ci`. Run `npx playwright install chromium` once,
then `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. In another
terminal run:

```sh
node scripts/workspace-errors.mjs http://127.0.0.1:5173 /tmp/monkeyboy-workspace-errors
```

The script asserts outcomes and exits nonzero on failure. It writes `results.json`
and syntax/pending screenshots to that directory and closes every browser context.
It is a separate browser/network check; `npm run check` runs the deterministic
unit, lint, guardrail and build gate. The committed [run results](error-results.json)
record the observed browser and PCM separately from physical listening.

The first group routes only the audio adapter to deterministic browser fixtures
for pending/rejected Play, rejected Stop and late completion/error. The second
uses the actual adapter and installed Strudel, with network fault injection for a
503 manifest and undecodable audio, a one-shot `AudioContext.resume` rejection,
a missing sample, an output callback that throws, and a never-settling evaluation.
Mocks establish workspace behavior at the adapter boundary; they do not establish
Strudel's ability to observe a failure or cancel execution.

## Resolved workspace contract

- Draft source, accepted readable rack and scheduling status are independent.
  A valid rack can coexist with stopped, pending or unknown scheduling. “Pattern
  scheduled” means evaluation completed; it does not assert successful sample
  decoding, audible output or physical playback.
- Starting includes activation, initialization and evaluation. The existing
  adapter does not identify their individual phases; the UI says “Enabling audio /
  starting…” and reports a generic failure with expandable details. It never
  attributes a resource, line or module by guessing from a runtime stack.
- Surfaced failures request Stop. While recovery is pending, show “Stopping… ·
  audio state unknown”; only confirmed Stop establishes scheduling stopped.
  Error details retain the submitted source. If the user has edited it since,
  label the failure as an earlier revision. A newer manual Stop owns its result
  even if an older evaluation rejects; the old rejection cannot overwrite it.
- A failure from older in-flight work can still affect the engine. Its queued
  newer edits are discarded and explicit Play is required. This safety action
  is not attribution of the error to the newer code or rollback of side effects.
- Correction, Revert, and replacement while stopped do not start audio. Stop
  invalidates queued playback intent immediately, but waits for an active engine
  evaluation. It ends scheduling, not already sounding notes or effect tails.
- After **10 seconds** in the same pending audio operation, show a warning rather
  than impose a fake cancellation timeout. Export remains available. For a
  never-settling asynchronous evaluation, export then reload/close the page is
  the available recovery. Synchronous JavaScript that blocks the main thread
  also blocks this warning, Export and Stop; browser-level tab termination is
  the remaining recovery and unsaved work may be lost. No sandbox, worker
  isolation, hard mute or arbitrary side-effect rollback is introduced.
- Open now offers Cancel / Export current / Open patch before replacing work.
  Open and New load the replacement and wait for confirmed Stop. Failure retains
  current work. Editing, cancelling, or starting a newer replacement invalidates
  the old replacement. New's Cancel/Escape also invalidate replacement already
  waiting for Stop. The queued Stop itself is not cancelled.
- Sample readiness remains explicitly unavailable. There is no Retry samples
  button because this adapter cannot identify or retry individual failed resources.
  Manual Stop and explicit Play are available; their availability is not a
  promise that Strudel clears its rejected sample cache.

## Acceptance matrix

| Condition / acceptance                                                            | Evidence                                                                                                                            | Result / remaining owner                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pending/syntax draft, retained/dim rack, disabled mutation, exact parser location | Browser fixture checks locked library/rack, line/column, retained module count; PCM probe retains output across incomplete code     | Passed for tested draft; existing reader tests cover CRLF/Unicode diagnostics                      |
| Exact draft export and valid unsupported CODE                                     | Browser downloads typed invalid text and an imported invalid CRLF file; opens `.chunk(...)` as CODE; source/rack unit round trips   | Passed; source preservation and saved rack identity checked separately from scheduling             |
| Activation blocked / rejected resume                                              | Real adapter with one-shot resume rejection, explicit Play retry; source unchanged                                                  | Passed for injected rejection in Chromium; native browser/OS denial and other browsers unverified  |
| Manifest failure                                                                  | Real manifest request returns 503, current source retained; explicit retry succeeds with real engine output                         | Passed in fresh isolated context                                                                   |
| Missing sample and undecodable audio                                              | Real Strudel logs missing sound; invalid audio response reaches decode and fails                                                    | Reproduced; workspace resource diagnosis, readiness and resource-specific retry remain #36         |
| Evaluation/construction failure                                                   | Real `.missingMethod()` failure; correction remains stopped until explicit Play                                                     | Passed; no invented runtime source location                                                        |
| Late output failure                                                               | Real output callback sets a marker then throws; upstream logs its error                                                             | Reproduced; automatic workspace notification/Stop remains #36; manual Stop verified                |
| Stop failure                                                                      | Browser adapter rejects Stop; Open/New retain current work; Retry Stop succeeds; unit transport coverage                            | Passed workspace boundary; real engine Stop-failure reporting remains #36                          |
| Never-settling evaluation                                                         | Real `new Promise(() => {})`; pending Stop warning and exact export                                                                 | Pending state/export verified; in-page cancellation remains #36; context disposal used after probe |
| Rapid edits followed by Stop / stale completion or error                          | Focused transport tests discard queued edits and prevent restart; browser labels older error; newer Stop result wins                | Passed transport/UX boundary; no claim of cancelling already executing engine code                 |
| Open/New while playback pending                                                   | Browser holds evaluation while Open waits, edits to cancel, New Cancel/Escape; unit helper rejects replacement until confirmed Stop | Passed boundary fixtures; queued Stop still waits for engine                                       |
| Physical listening and broad autoplay coverage                                    | Headless browser only                                                                                                               | Not performed; no speaker/click-free or cross-browser claim                                        |

## Observations and limits

The run used Node 24.22.2 and Playwright's headless Chromium on Linux, with fresh
nonpersistent contexts, no saved permissions, and
`--autoplay-policy=user-gesture-required`. Real engine contexts allowed insecure
TLS certificates in this harness; this is not a hosted certificate/CORS audit.
Browser contexts were closed after each test group. The stricter autoplay flag
plus direct clicks is evidence for these contexts, not every fresh browser profile
or audio device. The resume rejection is deliberate fault injection, not a claim
that Chromium naturally rejected that click.

The PCM probe taps the real WebAudio output before the physical device. It checks
nonzero synth output after retry, nonzero output with an invalid draft, and near-zero
output after Stop plus 1.5 seconds of release time. Exact measurements are in
[the run data](error-results.json). Physical speakers/headphones were **not heard**.
No measured speed, throughput, or continuity improvement is claimed.

Four new transport regressions failed before the fix: stale failure replaced a
newer Stop with an error; failure recovery still claimed Starting while Stop was
pending; diagnostics had no source ownership; and an older stopped-volume failure overwrote a newer edit. They pass after the fix. A
separate browser reproduction showed New → Replace → Cancel during pending Stop
still installing the starter; Cancel/Escape now preserve the original draft.
Sol review also reproduced a render crash when an incomplete draft followed an
audio failure. Error ownership now compares only accepted source and treats an
editing/invalid draft as a newer revision. The browser regression covers editable
incomplete source, exact export and available Stop after each adapter failure.

The suite deliberately exposes unmet #36 criteria. Do not close #12 until #36
provides observable resource/output reporting and supported recovery, this audit
is updated with its results, and the remaining end-to-end acceptance is rerun.

## Long imported voices (#44)

Verified 2 November 2026 against the exact
[reported source](../src/reader/fixtures/issue-44.strudel). At the pre-fix base
`c857d98`, pasting while stopped produced 15 modules: the voice occupied HP
0–153 on row 0, followed by MIX/OUT on row 1. `read` and graph validation accepted
this layout, but `validateRack` rejected it with “Module extends past the rail”.
Rack mutations all cross that validator, explaining the blocked rack input.
The source editor, Copy, Export and New remained enabled in this reproduction;
a complete page freeze was **not** reproduced. The original report did not
identify its app revision or browser.

Placement now wraps the voice across three 64-HP rails and places MIX/OUT on a
fourth. Catalog widths and unsupported CODE text remain unchanged. Reconciliation
reserves every matched position before placing unmatched modules, including on
later rows. The workspace validates rail bounds and overlap before installing a
read result, retaining the editable draft and accepted rack on failure.

The five [placement regressions](../src/reader/placement.test.ts) separately prove
valid placement, exact executable source, saved rack identity, reconciliation and
later voices/overflowing mixer buses. Three of the original four regressions
failed before the fix with the reported rail error; exact source preservation
already passed. `npm run check` passes with 203 unit tests and 40 guardrail checks.
The [browser error suite](../scripts/workspace-errors.mjs) now includes the long
voice and failure/revert/correction scenario. Its syntax was checked with
`node --check`; the complete suite was not rerun in this session. The observations
below were asserted through T3's managed browser tools against Vite on port 5174,
using real Strudel rather than the suite's audio fixture.

Chromium 156 on Linux, 1280×800, default managed profile:

- Pasting/importing the complete source produced four bounded rails, without
  overlap or unhandled page errors. Pasting while stopped did not initialize
  audio. Explicit Play scheduled the exact imported expression.
- Editing `.room(.6)` to `.room(.7)` while playing updated the rack and remained
  scheduled. Resetting DELAY TIME successfully spliced the imported literal.
  Directly resetting the CV-driven cutoff was refused by the existing
  source-preservation policy, with a recoverable “edit its code instead” message.
- A saved layout with the first module moved to HP 64 exercised placement
  failure while playing. The exact draft and accepted panel IDs/positions stayed
  intact; the error was visible and the source remained editable. Copy submitted
  the exact draft to the browser clipboard API; Export's Blob contained the
  exact draft bytes. Physical clipboard contents were not read back.
- Stop remained available. Revert restored the exact accepted source and panel
  positions. Repeating the failure and correcting the source updated the rack
  without restarting playback.
- Open from a failed draft while playing loaded the complete fixture after
  confirmed Stop. New from a failed draft restored the silent two-module
  starter. Neither action autoplayed. No unhandled page errors were observed.

A WebAudio destination probe measured nonzero output for the exact original
snippet after explicit Play (RMS 0.002429 over 2,232,320 captured samples).
This establishes output in this browser, not physical listening or universal
musical equivalence. Source bytes were preserved independently. Speakers and
headphones were not heard; other browsers and the original reporter's complete
freeze remain unverified. Rail width remains 64 HP; configurable wider racks are
outside this bug fix.
