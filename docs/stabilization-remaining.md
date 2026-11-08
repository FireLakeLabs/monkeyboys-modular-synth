# Remaining stabilization bundle (#219)

Implementation: GPT-6.1 Sol in T3 Code/Codex. Reviewer reserved: Claude Opus
5.5 through T3, at most three read-only rounds. Date: 8 November 2026.

## Acceptance and execution plan

| Issue      | Contract                                                                                                                                                     | Independent proof                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| #207 early | Capture fetch failures/status, decode outcomes, buffer scheduling and PCM before later shared runs; preserve unknowns                                        | Original raw failing JSON; bounded natural attempts; controlled failures labelled injected   |
| #186       | Below 75% overview: inactive jacks, every cable, no inner scrollbars, pointer/keyboard zoom; 24px active targets; complete Connections select/remove/repatch | Native interactions, measured painted/hit geometry, screenshots                              |
| #187       | Unsaved imports pack across 64/84/104 HP; Fit uses both dimensions; saved positions exact                                                                    | Trance 1600×1000; representative imports; executable bytes and full reopened rack separately |
| #185       | Compatible panels highlight, others dim, sound cursor; whole panel except DRUMS rows; selection then double click/Enter; native selectors; wt_ restriction   | Native drag/key actions, source-aware refusal/bank regressions, overview interaction         |

#218 explicit Arrange rack and saved-library refresh remain separate. Module
widths are unchanged. No extra expansion, process changes or follow-up issues.
Private live canvas is unavailable; archived exports and the approved usability
mockup are reference only. A small navigation/placement/target sketch was shown
inline before visual implementation.

## Historical failure retained

[Raw Wave 1 hosted results](evidence/stabilization-remaining/wave1-hosted-failure.json)
are copied without reinterpretation from artifact 13630086965, run
42510337281 attempt 1, entry
`test-results/suites-module-exercises-browser/evidence/results.json`.
DRUMS baseline RMS was 0.000048520497682993385 over 9,830,400 samples, below
unchanged >0.0001. This is distinct from #207's original soft()/SMPL fixtures.
Fetch, loading and decoding states in that historical observation are UNKNOWN.
Subsequent passing runs establish neither cause nor fix. The earlier nested-step
Repeat failure and unchanged isolated/full passing reruns also remain unexplained.

## Verification ledger

Implementation and verification in progress. No acceptance claimed yet.

## Initial verification and harness reconciliation

`npm ci` used Node 24.22.2. `npm run check` passed with 2,383 unit cases.
Focused navigation/sound/probe checks initially passed 10/10. A strengthened
Connections test then failed on an actual destination change: the window
pointer-up cancellation cleared the wire before the chooser click. Exempting
only the chooser from that cancellation made the same native test pass.

The first complete local attempt at `ebae110` was deliberately interrupted after
repeated obsolete harness assumptions: RESULT passed=111 failed=15 exit=130,
with two interrupted and 58 not run. It is not a passing gate. The raw log is
retained beside the [55 exercise baseline observations](evidence/stabilization-remaining/first-exercise-probes.json).
Every baseline was above the unchanged silence threshold. Three exercise edits
failed afterward because overview intercepted native control input. Their
nonzero PCM is not a silence reproduction.

Adapted checks navigate to detail before native edits/wiring, test noninteractive
Fit separately, and author a controlled crowded MIX patch box at 75% for the
existing scrolling/endpoints proof. The 100%/75% control reachability, typography,
24px target, source and rack assertions remain; overview checks inert controls
and hidden internal scrollbars instead. Smoke: 28/29 passed, with only the real
Connections bug above; its focused recheck passed. Nine adapted suites then had
7 passing and two geometry assumptions left; both passed after explicit detail
navigation and the controlled scroll fixture. No assertion or PCM threshold was
relaxed to accept an unexplained failure.

## Final local evidence (8 November 2026)

The corrected complete run on `0368471` finished
`RESULT passed=185 failed=1 exit=1` ([raw log](evidence/stabilization-remaining/complete-local-run.log)).
All module exercises, sound/effect event/source/rack/PCM matrices, library edits,
undo/conversion and new bundle tests passed. The sole failure sampled a function
cable at four shared crossings where DOM hit inspection proved another cable,
`chunk1:out → mix1:in1`, was topmost. The gap test now samples unoccluded curve
points, still requires more than ten points and still checks every sampled hit,
paint/dash/color, selected shadow, native pointer behavior and Dim pass-through.

A separate endpoint regression failed before the fix: an off-screen, internally
clipped MIX target ended at x=1246.125, beyond the rail edge x=1047. Applying the
patch-box clamp and then the viewport clamp fixed the same test. No cable paint,
dash, hit width, shadow or control/jack stacking changed.
[Failing-before evidence](evidence/stabilization-remaining/endpoint-before.log).

The final affected run was serial, with visible scrollbars:
`npm run test:browser:report -- tests/browser/stabilization-remaining.spec.mjs tests/browser/stabilization-wave-1.spec.mjs tests/browser/rack-layout.spec.mjs tests/browser/rack-view-state.spec.mjs --workers=1`.
It passed **31/31**, `RESULT passed=31 failed=0 exit=0`
([raw log](evidence/stabilization-remaining/final-focused.log)). This covers
neighboring dock/Packs/responsive behavior, all Hardware supersaw/SPLICE looks,
75%/100% target geometry, continuous cable hit/paint behavior, local view state,
source preservation, new overview navigation and an actual Connections move.
`npm run check` passed again after the endpoint and diagnostic fixes.

Policy decision: the broad interacting bundle received the complete local run.
Afterward, the small endpoint clamp and test-only evidence snapshot changes were
verified through the affected/neighboring suites above; import/source/engine
behavior did not change after that complete run. The full hosted PR suite on the
final head remains the merge gate. No unexplained failing assertion was accepted.

Inspected real, font-loaded screenshots:
[overview](evidence/stabilization-remaining/overview.png),
[Trance Fit](evidence/stabilization-remaining/trance-fit.png),
[Trance detail](evidence/stabilization-remaining/trance-detail.png), and
[native sound drag](evidence/stabilization-remaining/sound-drag.png).
Trance retains 29 modules and 28 cables, in four 104-HP rows at 41% Fit at
1600×1000. Fit is a navigation overview, not legible control text; pointer/Enter
navigation opens readable 100% detail. The owner has been asked whether this
satisfies #187's “readable zoom” criterion or whether that criterion stays open.
No acceptance answer is inferred from elapsed time. CODE merging remains declined;
no saved personal/bundled positions or catalog widths were changed.

## #207 bounded diagnostic disposition

Canonical quiet serial window: **three natural attempts per original fixture**,
soft() first and `exercise-smpl` second, with a fresh browser context per attempt,
one worker, no concurrent review or other suite launched by this thread. The
soft fixture includes the original sound-effects probe's `.gain(0.1)`. Engine
initialization is warm for the second fixture; individual resource/CDN/disk cache
states were not cleared or established and remain unknown. These were real
resource requests, not injected failures. All six measurements exceeded the
unchanged >0.0001 threshold:

| Attempt | soft() RMS / samples   | SMPL RMS / samples     |
| ------- | ---------------------- | ---------------------- |
| 1       | 0.0064203364 / 165,888 | 0.0038492887 / 722,944 |
| 2       | 0.0061747512 / 163,840 | 0.0033819103 / 724,992 |
| 3       | 0.0066316542 / 165,888 | 0.0033631938 / 727,040 |

[Attempt 1](evidence/stabilization-remaining/serial-probes/attempt-1.json),
[attempt 2](evidence/stabilization-remaining/serial-probes/attempt-2.json),
[attempt 3](evidence/stabilization-remaining/serial-probes/attempt-3.json)
retain exact fixture source, PCM, network lifecycle snapshots, decoder outcomes,
buffer start calls, context states and comparable clocks. Each soft observation
had one decoded buffer and three buffer start calls; each subsequent SMPL snapshot
had four decoder observations and eight cumulative buffer start calls. These are
observed calls and measured PCM, not physical listening or per-resource proof of
readiness. Decode observations are not mapped to URL/sound names; that readiness
remains unknown per resource. Fetched bytes/HTTP completion do not prove decoding.

Additional exploration: three earlier three-attempt dedicated batches passed
(the initial focused run, smoke run and complete run); their soft variants used
default gain, not the original probe's 0.1. Both complete-run attempts also finished
the existing soft()/SMPL matrix probes with nonzero PCM; the first full attempt
was interrupted later. These extra passes do not rule out intermittent silence.
Older collector network lists accumulated through script completion and must not
be used as exact per-measurement network timelines. The final collector records
requested/headers/finished/failed states and freezes each capture. The injected
pending-request test failed before that improvement and then passed, proving a
later failure cannot rewrite an earlier pending snapshot.

[Injected failure record](evidence/stabilization-remaining/serial-probes/injected-failure.json)
is explicitly controlled: request abort and invalid audio bytes. It proves the
collector distinguishes pending/failure/decoder failure, not a historical cause.
No natural silence reproduced in the canonical window; no historical cause or
product fix is established. **BOUNDED UNRESOLVED for #219; #207 stays OPEN.**
The existing #207 follow-up should correlate resource URLs with decoded buffers
and onset delivery before diagnosing another natural failure. No new issue or
speculative product silence change is included. The historical DRUMS failure,
original two fixtures, and unrelated nested-step Repeat uncertainty stay distinct.

## Review and hosted gates

Pending bounded Opus review and current-head hosted verification. No physical
listening performed; existing matrices separately prove engine events and PCM.
