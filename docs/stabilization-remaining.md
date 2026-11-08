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
