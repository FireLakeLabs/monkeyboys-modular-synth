# #247 verification and review ledger

Implementation provenance: inherited GPT-6.1 Sol in T3 Code/Codex. No
implementation subagents. Project policy selects latest available Opus for
bounded review. Advertised capabilities on 9 November 2026 resolve Claude
provider `claudeAgent`, model `claude-opus-5-5` (Claude Opus 5.5); use advertised
`effort: high`. The reviewer is read-only. Three-round default budget.

## Proof before review

- Application base `d9f06ddc12b135221eec247150c23cce0dadf6c3`; no production source
  changes. `npm ci` succeeded on Node 24.22.2, npm 11.19.1.
- `node --test docs/research/user-defined-modules/prototype.test.mjs`: six passed.
- Controlled Chromium experiment through existing `engine.play`/`stop`:
  `node docs/research/user-defined-modules/runtime.mjs http://127.0.0.1:5187 /tmp/user-defined-modules-runtime.json`.
  `RESULT register-research passed=1 failed=0`; exact fixture onset counts
  16/76/76/64. See hashes, values and limits in `runtime-results.json`.
- `npm run check` passed after report/spec-link additions: 62 files / 2585
  unit tests, 53 guardrails, reader coverage, formatting, skill integrity, lint,
  TypeScript and production build. Local research links were validated. Research tests are run explicitly;
  normal CI does not execute their separate Node test command.
- No panel UI, PCM or listening evidence is claimed. Own server uses port 5187;
  port availability was checked before launch. Runner closes its Chromium.

## Review rounds

Round 1: Claude Opus 5.5, high effort, reviewed clean head
`3a52a31d36fa4c2cb430683691ae60aa48f5b078` against
`d9f06ddc12b135221eec247150c23cce0dadf6c3`. Verdict CHANGES, no blockers.
Usage was not available. Initial diff: 12 files, 5578 insertions (including 4677
lines of full event evidence).

| ID  | Severity | Outcome and evidence                                                                                                                                                                                                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | should   | Fixed argument escape. Require one enclosing ParenthesizedExpression spanning the entire input. The new optional-chain escape regression failed before the fix with “Missing expected exception”; all six research tests pass afterward.                                 |
| S2  | should   | Report now identifies the built-in `o` alias collision from pinned controls.mjs:2047 and alias installation at lines 64–72. Orbit fields establish retained values, not implementation identity; fixture `.o` remains CODE under the proposed production collision rule. |
| S3  | nit      | Fixed within the existing binding operation: rederive the call/ranges from current source instead of trusting caller ranges. The forged-range regression first replaced `register`, then passed after rederivation.                                                      |
| S4  | nit      | Documented prototype boundary: negative literals are unary expressions requiring text mode; a number edit to a negative value returns to text editing. No broad scalar parser added.                                                                                     |
| S5  | nit      | Named #245's sibling branch and inspected commit cb5f370; schema is not claimed to be on this branch/main. Final reconciliation updates links when available.                                                                                                            |

The controlled runtime experiment was rerun after the behavior fixes and passed
again, including the source/complete existing-rack/edited-event checks. Evidence
hashes were refreshed. Own port 5187 server was stopped after this run.
Round 2 is limited to these fixes, changed behavior and remaining findings.

## Coordination and issue disposition

#245 communicated schema committed on sibling branch
`t3/241-strudel-api-inventory` (`cb5f370`), which was inspected with git show; path
`docs/research/strudel-api-coverage/schema.md`, inventory schema v1 and
`api:register`, preserving export/prototype/source-only/app-override distinctions.
#246 was notified of the source-context and nested-binding constraints. Final
reconciliation will record available research commits; these studies are not
blanket blockers.

#217 remains the sole production custom-panel owner. Research conclusions will
be appended/linked without replacing its acceptance or adding excluded scope.
No additional production work is selected: create-from-code, graph encapsulation
and portable packages are explicit deferred proposals. They need distinct stories
if later selected; filing broad speculative implementation issues is unnecessary
for this bounded recommendation. #216 and #242–244 retain their scopes.
