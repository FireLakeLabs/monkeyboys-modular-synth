# Callback #243 bounded review

Implementation: inherited and current GPT-6.1 Sol in T3 Code's Codex harness.
Policy selects Opus for this known Sol implementation. Advertised availability
was resolved once before delegation: Claude Opus 5.5 (`claudeAgent`,
`claude-opus-5-5`); target effort is `high`. No implementation agents are used.
One read-only reviewer per round, default three-round budget. Usage is recorded
only if exposed.

Base: `885289ead03cacbef557f70eba437135e163ea6b`. Review command throughout:
`git diff 885289ead03cacbef557f70eba437135e163ea6b`, plus `git status --short`.

Round 1 reviewed clean `6b3ae63ce6d2b79b6abefa8053cbfa6334cb83c8` and returned **CHANGES**. Usage was not exposed. The reviewer independently passed 100 focused cases and about 30 read/generate/save/mutation probes; it ran no browser, PCM or full gate.
Focused source/save/events/mutation/browser/PCM proof and the repository gate are
available in [the contract](../callback-branches.md). Full local browser coverage
runs after bounded review; two earlier intentionally interrupted runs are not
claimed as passing. Required hosted checks and Full browser suites remain separate
merge gates. No push has occurred.

## Round 1 findings

| ID  | Severity                                          | Outcome                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | should                                            | Fixed. Opaque-only local bindings/captures now stay whole-call CODE, including their construction. Both supplied conversion counterexamples failed before the guard and pass afterward with exact source/save and pinned events. Unused bindings also stay CODE to preserve possible construction side effects; directly returned bound values remain supported. |
| S2  | should                                            | Fixed. Structural edits clear names only for outputs leaving their former callback owner, so delete/unplug/repatch cannot hoist them into colliding globals. Still-local incomplete graphs retain names. Delete/unplug/save/Undo regressions failed before the fix and pass; native Delete/Undo coverage is refreshed.                                           |
| S3  | nit from reviewer; assessed as in-scope sound bug | Fixed. The local allocator reserves every explicit name belonging to the owner before walking. A failing-before real pinned-event regression now retains fast/reverse/iter branch values and times without lexical shadowing.                                                                                                                                    |

The four focused review regressions failed before the fixes; 151 affected
reader/module/rack/document cases and TypeScript passed afterward. No finding was
declined, no extra implementation or reviewer agent was started, and no push
occurred. Round 2 will review changed code and these findings only, using the same
base/provider/model/effort. Final complete local/hosted gates remain pending.

Post-fix `npm run check` passed 2,676 unit cases / 65 files and 59 guardrails,
format/skills/lint, reader coverage, TypeScript and production build. Audit remains
88 files with zero errors/failures. The affected browser command (callback cases
plus the full earlier function-loop script) completed
`RESULT passed=4 failed=0 exit=0`. It now includes native owner Delete and exact
Undo with colliding global/local names, and refreshed engine/runtime/screenshots.
The final full local run remains deferred until bounded review agrees.

## Round 2

Claude Opus 5.5/high **APPROVED** clean
`5b1736f054bc0109b470ad9a47a64ecda4f946af`: S1/S2/S3 resolved, no induced finding.
The reviewer independently passed 154 affected cases, TypeScript and about 20
source/save/event/mutation probes, including direct binding returns, nested names,
partial unplugs and both directions of generated/explicit name collision. No
browser, PCM or full gate was independently run. Usage was not exposed.

The reviewer separately mentioned, without filing a finding, that deleting the
only wired consumer of a mixed CODE/local binding could still leave an unbound
CODE reference. The implementer assesses this local delete/opaque-preservation
case as inside #243's acceptance and records it as S4 (should), rather than expand
the existing global dependency model. A focused test failed before the fix for
both deleting the consumer and the bound module. Structural edits now refuse
atomically when a callback would discard a known binding referenced
by surviving CODE; changing the CODE reference first allows deletion. Native
Delete rollback is included. Round 3 checks only this guard and S4, retaining all
prior verdicts. No extra reviewer/provider or implementation agent is started.

S4 proof on the refined guard: inspected output shows **155/155** affected cases,
`npm run check` **2,677 cases / 65 files + 59 guardrails**, and focused browser
`RESULT passed=3 failed=0 exit=0`. Native Delete of the only consumer refuses with
accepted source/rack intact. Deleting the value itself also refuses when it would
permanently discard a referenced binding; incomplete graphs retaining their
binding/name state remain savable. Editing the CODE reference first permits the
consumer deletion. The 88-file audit has zero errors/failures. Round 3 remains
pending; no push or full local pass is claimed.

## Round 3

Claude Opus 5.5/high **APPROVED** clean
`fec8dfa0e26afff310c3f9a82b1d1b7d204963d2`: S4 resolved, S1–S3 approvals retained,
no blocker/should remaining. It independently passed 373 cases in 21 affected
files, `tsc -b`, and about 20 mutation probes. It checked nested CODE references,
partial unplugs/reconnects, lexical shadowing, remaining consumers, owner deletion
and incomplete bodies. No browser, listening, full gate or performance measurement
was run by the reviewer; usage was not exposed.

Two rare nits are declined for this increment: detached CODE can lose a former
binding across several deliberate edits before reattachment; and typing an
already-unbound opaque name can cause a later unrelated edit to refuse. The guard
covers CODE in the new RETURN dependency graph and retained incomplete binding
state, not arbitrary detached closure provenance or global free-variable checking.
These limits are explicit; no new issue, process change or broader dependency
model is adopted. A candidate note will be retained on #241, outside PR scope.

Three rounds total, one reviewer per round, same provider/model/effort. Findings
S1–S4 are fixed, neither nit blocks. Production is frozen at `fec8dfa`; subsequent
changes record evidence/limits only. The complete local suite and hosted PR gates
must still pass before protected merge. Nothing has been pushed.

## Complete local gate after approval

On clean `a81737ab441ddd133f202fe4f2cbe109aa7c77df` (production identical to approved
`fec8dfa`), the full command completed **RESULT passed=232 failed=0 exit=0**, no
retries, actual footer 232 passed (20.4m). No source/test edit or reviewer competed
with this run. Current event/PCM/screenshots were refreshed from its artifacts;
physical listening remains unperformed. Unrelated tracked sound-picker and stabilization captures regenerated by the
existing suites are restored to their original bytes.
Subsequent changes are this evidence/status prose and captures only. Hosted gates
and protected merge remain independently required. The line reporter produced a
raw log and test-results evidence; no HTML report was produced by that invocation.
