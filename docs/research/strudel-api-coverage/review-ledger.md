# #245 review and verification ledger

Implementation provenance: GPT-6.1 Sol in T3 Code through Codex. Project policy
selected the latest advertised Opus: Claude Opus 5.5 (`claude-opus-5-5`, provider
`claudeAgent`), on advertised `effort: high`. One reviewer, maximum three rounds;
no implementation agents. Reviewer usage figures were not exposed.

| Round | Revision / working tree                                           | Verdict / findings                                                                                                                                                | Resolution                                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ca17afcb397842ff9185670428bacd44885016ae`, clean; base `d9f06dd` | CHANGES: S1 blocker shallow-CI git lookup; S2 should missing density collision; S3 should mini namespace misnamed transpiler; S4 nit generated underscore methods | S1 removed mutable git-derived provenance; input hashes retain exact identity. S2 records density overlap and stable source ordering; bundled registration order supplies the name candidate without attributing density's control to fast. S3 corrected initialization scope. S4 documented unresolved generated methods. |
| 2     | Pending corrected commit after rebase onto `77dc91b`              | Recheck open IDs and changed scanner boundaries                                                                                                                   | No approval claimed yet.                                                                                                                                                                                                                                                                                                   |

Coordination findings C1/C2: #246 identified missing `layer` and OUT tempo joins.
The bundle's `let _ = class yt` bound methods to an inner class name; the scanner
now retains the public variable binding for named/anonymous class expressions.
Direct-object REPL scope injection is recorded separately from initialization
namespaces, exposing tempo helpers without inventing package exports.

Fail-before evidence: `node --test scripts/strudel-api-inventory.test.mts` reported
four failing subtests on the pre-fix scanner: missing `api:layer`, class owners
`Internal`/`<anonymous>` instead of public bindings, absent direct injection, and
`git merge-base` failure from an unversioned source copy. After the fixes all five
focused subtests passed, including byte-identical repeat reports and the no-git
CLI path. The real density collision is asserted by the report test. Standards
records the enforced boundaries and remaining enumeration/audio limits.

Observed preparation: Node 24.22.2; `npm ci` passed with unchanged lockfile.
Before review `npm run check` passed: 62 Vitest files / 2,585 tests, 55 Node
guardrails, reader 294/309 mapped calls with no baseline changes, formatting,
skills, lint, TypeScript and production build. After the fixes and rebase, `npm run check` passed again: 2,585 Vitest cases,
58 Node guardrails, unchanged 294/309 reader coverage, formatting/skills/lint,
TypeScript and production build. JSON Schema v2020-12 validation passed with
`ajv-cli@5.0.0` against the corrected generated report. Wild fetch reproduced all
5 pinned sources with zero failures and 19/69 mapped outer calls. No local
browser, audio initialization or server work occurred.

Rebase: #247 research merged in PR #252 at
`77dc91be42f4a408f94745a628fc2cad86b4f5e0`; application source and lockfile remain
those of `d9f06dd`. The inventory's reproduction no longer depends on these git
refs being present. The [merged helper research](../user-defined-modules/README.md)
remains separate browser/event evidence, not a new observation by #245.
