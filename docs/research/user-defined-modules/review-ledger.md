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

Pending first review. Findings will record stable IDs, severity, evidence,
outcome, actual reviewed head/working tree, diff size and usage when returned.

## Coordination and issue disposition

#245 communicated committed schema path
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
