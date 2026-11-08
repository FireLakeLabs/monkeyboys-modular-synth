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

Local verification is recorded below; Opus and hosted PR gates remain pending.

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
navigation opens readable 100% detail. The owner explicitly accepted overview plus readable 100% detail navigation
as satisfying #187's “readable zoom” criterion on 8 November 2026. CODE merging remains declined;
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

## Opus round 1 and acceptance correction

Read-only Claude Opus 5.5 (`claudeAgent`, high effort, usage not exposed) reviewed
clean `7188b1372f61cc8928e432e3e5d21bd4c57a49ab` against `9484126`.
Verdict **CHANGES**. The code/test diff before review was 31 files,
+815/-63; after these fixes it is 34 files, +1100/-71. Evidence/log additions
are counted separately from this code/test growth. The added row chooser is
necessary to satisfy the owner's explicit #185 non-drag acceptance, rather than
excluding DRUMS from that path.

| ID  | Severity | Disposition                                                                                                                                                                                                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | should   | Fixed: the independently scaled pinned OUT retains VOL/BPM controls and its header in overview; OUT wiring stays disabled. Native VOL decrement and bound BPM edit retain Fit.                                                              |
| S2  | should   | Fixed: Move destination opens Connections before waiting for a destination. Native canvas selection then pointer repatching works with Connections initially closed.                                                                        |
| S3  | should   | Fixed with explicit row choice: Enter/double click on a sound with DRUMS selected opens a keyboard/pointer row dialog. Opening/cancelling does not mutate; choosing row two preserves timing, other rows and complete unrelated rack state. |
| N1  | nit      | Accepted: overview has no sound-target outlines or dimmed target hints; a drag leaves source/Fit intact and the next panel click still zooms.                                                                                               |
| N2  | nit      | Accepted: selecting a module without a catalog sample target produces a generic refusal before calling the mutation. WAVETABLE keeps its own wt_ validation.                                                                                |
| N3  | nit      | Clarified: the pending-snapshot assertion now occurs before the controlled abort and again after it, proving later events cannot mutate the earlier capture.                                                                                |

The first review repro had an invalid `out1` assumption: the multi-voice import
uses `out9`. The [corrected OUT repro](evidence/stabilization-remaining/review-1/output-before.log)
independently failed on inert controls. The
[initial repro](evidence/stabilization-remaining/review-1/initial-before.log)
also records the hidden canvas-move chooser and automatic DRUMS row-zero issue;
its OUT locator failure is not counted as proof of S1. The final OUT test uses
an explicit bound tempo so it exercises supported native tempo editing without
changing the imported-refusal contract.

After R1, the owner clarified that refusing module-wide DRUMS assignment would
leave #185 incomplete: the non-drag path needs an actual row-specific choice.
The [native row-dialog regression failed before implementation](evidence/stabilization-remaining/review-1/drums-before.log).
It now proves Enter opens without mutation, Escape restores focus without an edit,
and double click then Tab/Enter assigns only the explicitly chosen second row.
The pure row projection and drop mutation share the same notation accessor;
`SoundAssignment` distinguishes completed assignment from a required row choice,
so the crate does not announce completion before the choice. No new workflow
rule, follow-up issue, module width or saved format was introduced.

Inspected the real font-loaded [row chooser screenshot](evidence/stabilization-remaining/drums-row-chooser.png).
`npm run check` passed **2,384 unit cases**, reader coverage, guardrails, lint,
TypeScript and build. The affected browser run passed **16/16**,
`RESULT passed=16 failed=0 exit=0`
([log](evidence/stabilization-remaining/review-1/affected-after.log)). It includes
the corrected review regressions, overview/native sound/row choice, bank/refusal
neighbors, all-look geometry, connection targets, More Escape, injected snapshots
and Trance playback/events/export-reopen. Under the merged verification policy,
these bounded UI/source-row fixes use affected coverage; they do not change the
reader, engine or playback. The final hosted complete suite remains mandatory.
A fresh Opus round must assess the actual row-specific non-drag path against the
issue wording before #185 is closed.
