# MIX #242 bounded review

Implementation: GPT-6.1 Sol in T3 Code's Codex harness. Policy-selected reviewer:
Claude Opus 5.5 (`claudeAgent`, `claude-opus-5-5`, verified `effort: high`).
Availability was resolved before delegation. One read-only reviewer per round;
three-round budget. Usage was not exposed and is not estimated.

Base: `7a3fa0b54b810c07025c87179c78e98f3ec5077b`. Review command throughout:
`git diff 7a3fa0b54b810c07025c87179c78e98f3ec5077b`, plus `git status --short`.
No unrelated work or implementation agents were included.

## Round 1

Reviewed clean head `91e37be8c204396cab6571587d9d8f563ef5e857`.
Verdict: **CHANGES**. Diff: 64 files, 5,470 insertions, 419 deletions.

| ID  | Severity | Outcome and evidence                                                                                                                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | should   | Fixed. Opaque routing checks inspect the CODE suffix itself, while normal orbit checks inspect the accumulated expression. A native Stack followed by unrelated CODE keeps its owned route. Focused failing-before two-voice regression and actual engine send-bus proof pass.           |
| S2  | should   | Fixed. Source-owned final expressions reserve default orbit 1 before both allocation passes, including mixed explicit/default inner routes. Two failing-before regressions and actual opaque-Stack/native-voice send-bus proof pass. No overriding orbit is added to opaque expressions. |
| S3  | should   | Fixed. Alias `o` is recognized as a routing call/property, not an ordinary callback parameter. Failing-before native callback regression and actual engine bus proof pass; custom `o` routing remains source-owned.                                                                      |
| N1  | nit      | Removed duplicate graph construction in the default `cableSignal` argument. Declined broader render-level graph/cache API as a performance change outside the routing fix; no measured performance claim or follow-up issue.                                                             |
| N2  | nit      | Documented CLOCK Multiply's deliberate contextual `.fast()` ownership in `mix-composition.md`; existing catalog bindings remain authoritative for emitted calls. No general #248 expansion.                                                                                              |

The reviewer independently passed audit (88 files), historical corpus coverage
(294/309 calls, 32/36 voices, 20/22 patches), and 58 focused tests. Browser and PCM
evidence was supplied by the implementer, not independently run by the reviewer.

Post-fix browser command:
`npm run test:browser:report -- tests/browser/composition.spec.mjs -g 'shares native'`:
`RESULT passed=1 failed=0 exit=0`. The runtime JSON records the three new isolation
cases separately from source/event/WAV equivalence cases. The Trance generated
digest changed only for the conservative default-bus reservation; retained source
and saved projection did not change. All 412 library tests passed after that
intentional snapshot update.

Post-fix `npm run check` passed: 2,638 tests in 64 files, 59 guardrails,
format/skills/lint, historical corpus coverage, TypeScript and production build.
The existing Vite chunk-size warning remains. Audit: 88 files, zero errors/failures.
The existing explicit-CODE-orbit generation fixture now also expects default-bus
reservation; its digest and the Trance generated digest were intentionally updated.

Round 2 will check changed behavior and these findings, with the same base and
reviewer. Final review and full-suite results are pending.
