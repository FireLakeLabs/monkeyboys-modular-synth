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
