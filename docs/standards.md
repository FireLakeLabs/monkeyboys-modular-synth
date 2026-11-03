# Engineering standards

This is the enforcement inventory. Product behavior remains defined by the
[decisions](decisions.md), [module spec](module-spec.md), [translation rules](translation-rules.md),
and [patch format](patch-format.md). Skills supply procedures, not competing
product requirements. [AGENTS.md](../AGENTS.md) routes agents to these sources.

## Enforcement levels

- **Enforced:** an executable check rejects a violation within its stated coverage.
- **Reviewed:** a contributor or agent must inspect evidence; no deterministic guarantee is claimed.
- **Planned:** the feature or check does not yet exist. Implement it with the owning feature, not a placeholder test.

## Baseline

Run `npm run check` after `npm ci` using the version in `.node-version`. The
build performs TypeScript checking once. Focused scripts remain available for
iteration. Formatting does not rewrite vendored skills or embedded code examples.

| Standard                                                                                 | Status                            | Mechanism / scope                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict nullability, checked indexes, exact optional properties, explicit return coverage | Enforced                          | App and tooling TypeScript projects, including Vite/Vitest configs and repository scripts; negative compiler probes.                                                                                |
| Consistent supported runtime                                                             | Enforced                          | `.node-version`, `check:runtime`, package engines and `.npmrc`; update the version file and engine minimum together.                                                                                |
| Locked dependency tree                                                                   | Enforced                          | Committed npm lockfile and `npm ci`; this pins package resolution, not the external OS or advisory database.                                                                                        |
| Consistent formatting                                                                    | Enforced                          | Pinned Prettier, `format:check`, and EditorConfig. Vendored skill bytes and embedded examples are preserved.                                                                                        |
| Reject explicit `any`, non-null assertions, hook misuse, and floating promises           | Enforced                          | Oxlint plus `oxlint-tsgolint`; warnings fail, unused disables are reported, `void` does not exempt promises. Callback rejection semantics still need review.                                        |
| Basic accessible JSX                                                                     | Enforced                          | Static image-alt, ARIA, and label checks. Keyboard interaction, focus, reduced motion, and audible behavior still need runtime review.                                                              |
| Pure domain imports                                                                      | Enforced                          | Static React/Strudel imports are blocked in existing `src/modules` and `src/patch` TypeScript modules. Dynamic/transitive effects and future directories remain reviewed.                           |
| Catalog consistency                                                                      | Enforced                          | `npm test` checks module IDs, controls, ranges, CV targets, looks, and Strudel-function ownership.                                                                                                  |
| Skill source integrity and local dependencies                                            | Enforced                          | `check:skills` checks registered files, hashes, modes, declared dependencies, identity, licenses, and relative links. Negative probes test representative failures.                                 |
| The same checks locally and in CI                                                        | Enforced locally and in hosted CI | `npm run check`; `.github/workflows/check.yml` invokes it on PRs/main with pinned actions and read-only permissions. Hosted execution verified; see [dated evidence](ci.md#observed-github-status). |
| Merges require passing checks                                                            | Active GitHub ruleset             | Effective branch rules verified; see [evidence and verification limits](ci.md#observed-github-status). A failing-PR merge attempt remains unverified.                                               |

`npm run test:guardrails` exercises representative invalid and valid cases in
temporary directories, including compiling the adapted TypeScript examples. It
protects against accidentally inert checks; it does not prove every rule or
combination is covered. The skill lockfile detects drift, not a coordinated change
to both instructions and hashes; review those changes together.

## Runtime and TypeScript configuration

`.node-version` pins the runtime used locally and in CI. The root package's engine
range sets installation compatibility; the runtime check requires the exact pin.
Older versions in negative test fixtures are intentionally rejected inputs.
Dependency engine ranges in `package-lock.json` describe those packages' support,
not additional supported development environments for this repository.

[tsconfig.base.json](../tsconfig.base.json) owns shared compiler safety settings.
The app and tooling projects inherit that policy using TypeScript's
[`extends`](https://www.typescriptlang.org/tsconfig/extends.html) mechanism, while
retaining their different environments:

- [App](../tsconfig.app.json): browser DOM and Vite types, JSX, and bundler module resolution for `src`.
- [Tooling](../tsconfig.node.json): Node types and NodeNext module resolution for Vite/Vitest configuration and repository scripts; no DOM globals.

`tsc` checks type compatibility, nullability, indexed access, optional properties,
and return paths. Oxlint adds policies that valid TypeScript can still violate,
including explicit `any`, non-null assertions, floating promises, React hooks,
accessible JSX, and restricted imports. Some hygiene checks overlap, such as
unused variables; that does not make either layer a replacement for the other.
Oxlint's [type-aware mode](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
uses type information for lint rules; this repo does not enable its separate
full type-check mode. The build runs `tsc -b` once for the actual projects; negative
guardrail probes separately compile intentional invalid/valid fixtures.

## Review standards

For stacked PRs, verify native GitHub stack membership using the
[API completion checks](ci.md#native-stacked-pull-requests). This is reviewed
workflow evidence; local branch relationships and CI do not establish membership.

| Standard             | Evidence to inspect                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain modeling      | Distinct variants cannot contradict each other. Brand only meaningful primitive distinctions. Catalog/schema owns shared definitions.                                                   |
| Validation ownership | Parse external input as `unknown`; constructors and graph mutations preserve invariants. Downstream code relies only on established guarantees.                                         |
| Comments             | Retain rationale, contracts, and external limitations. Replace enforceable warnings with checks while retaining useful explanation.                                                     |
| Async operations     | Await or handle rejection; `void` alone is insufficient. State has a clear owner. Specify idempotence, cancellation, and latest-edit behavior where relevant.                           |
| Tests                | A representative broken behavior fails, a valid case passes, and a behavior-preserving refactor need not rewrite the test. Catalog and type invariants count as behavior.               |
| Changes              | Prefer scoped, verifiable units. Demonstrate failing regression tests locally; deliver green changes. Broader findings become follow-ups.                                               |
| Performance          | Validate outputs and work counts; interleave repeated runs, disclose environment/noise, and connect microbenchmarks to a user-visible path. No timing gate without a reliable baseline. |
| UI                   | Use semantic controls, names, focus behavior, keyboard operation, and reduced motion. Advanced keyboard patching may remain outside v1.                                                 |
| Agent workflow       | tstack owns explicitly requested PR/review workflows. pstack engineering skills do not authorize delegation, commits, external messages, or shipping by themselves.                     |

Record narrow exceptions beside the affected code with their reason and removal
condition. Review whether an exception reveals a missing abstraction or boundary.
Negative type tests may use documented `@ts-expect-error`; ordinary application
code should satisfy the actual type rather than suppress it.

## Feature-owned checks still to build

Hosting IAM trust is checked by the synthesized-template regression in
`scripts/hosting.test.mts`, using the repository's observed immutable GitHub OIDC
subject as an independent fixture. It rejects the old name-only trust format.
Actual GitHub-to-AWS exchanges and environment branch restrictions remain live
verification; record them in [deployment evidence](deployment-verification.md).

| Owner                          | Required checks / decisions                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph construction and editing | Unique IDs, existing modules/jacks, direction and signal compatibility, input cardinality, and a defined cycle policy. Validate on mutation, not just import.                                                           |
| Generator and reader           | Separate sound equivalence, source/comment preservation, and rack identity. Cover fan-out, named dependency ordering, disconnected/bypassed modules, nested mixers, repeated settings, and modulation target semantics. |
| Persistence                    | Validate versioned input, define migrations and unknown-content preservation, and round-trip all agreed state including volume/bypass. Saved files are an external contract.                                            |
| Audio engine                   | Verify initialization ownership, retry/stop semantics, concurrent evaluations, last-good behavior, effects/orbits, and sample-loading failures. Real audible verification is separate from unit tests.                  |
| Executable code import         | Decide execution trust and isolation. Recognizing Strudel syntax does not sandbox arbitrary JavaScript.                                                                                                                 |
| Browser verification           | Add a project-local verification procedure when the playable slice exists, then automate stable interactions. Include manual listening where automation cannot establish the claim.                                     |
| Property testing               | Add deterministic seeds and shrinking for graph and round-trip properties once their contracts exist. Consider formal models only for a concrete property that benefits.                                                |
| Assets and offline use         | Inventory sample/font sources, versions, licenses, and caching. Repository-owned development standards do not imply an offline audio application.                                                                       |

The #3 generator now validates graph structure (including cycles and signals
through passthrough modules) and control/layout values before emission. Its
behavior tests cover generation, target-specific CV, fan-out, nested mixer gains,
CODE source retention, routing provenance and saved JSON state. The #5 rack mutation operations now validate through this boundary and reject
overlap/out-of-rail placement before committing. Focused rack tests cover these
mutations and generated source ownership; [browser evidence](rack-verification.md)
covers the UI. The [#6 reader checks](reader-verification.md) cover source-preserving
import, catalog/CV projection, validated saved-state recovery and conservative
identity reconciliation. Live editor integration and universal audible equivalence
remain open.

The #35 structural workspace boundary requires explicit call ownership plans and
independent source/graph validation before accepting imported edits. Focused
behavior tests cover exact source, events, atomic refusal and full reopened rack
identity. Its [real-engine browser acceptance](structural-edit-verification.md)
is separate from the shared deterministic gate.

The #37 activity boundary uses numeric context keys, enforced by the
[attribution regression](../src/strudel/activity.test.ts), so Strudel cannot turn
an observer key into mini-notation. Fake-clock engine tests cover scheduled-audio
time and cancellation. Statement-boundary regressions reject decoration that
changes JavaScript automatic semicolon insertion. One typography rule owns the
editor and ink layer; the browser suite checks computed metrics and glyph
alignment. The separate [real-browser feedback check](feedback-verification.md)
requires actual pulses, nonzero PCM, native IME and reduced-motion behavior;
shared CI still lacks Chromium/network provisioning for that suite.

Resolve open product questions in the owning spec and issue before encoding them
as expected test results. Do not invent graph, persistence, or audio behavior to
make a standards check pass.

## Maintaining standards

The #12 workspace compares audio diagnostic ownership only against validated,
accepted source; editing/invalid drafts never enter the parsing comparison during
render. The [browser error regression](../scripts/workspace-errors.mjs) reproduces
the original crash after an audio failure and verifies that incomplete source,
Export and Stop remain available. See [error acceptance](error-verification.md).
This browser check is a narrow exception to the shared local/CI gate: it requires
provisioned Chromium and its real-engine group reaches external sample sources.
It currently runs separately from `npm run check`; The [#36 audit](audio-recovery.md) adds real resource/output errors,
scheduler Stop failure, pending evaluation recovery and fresh-context activation;
CI automation remains a follow-up until browser provisioning and network isolation
are added. The deterministic transport regressions do run in the shared
gate. Do not infer render coverage from those unit tests.

Use [correct](../.agents/skills/correct/SKILL.md) for a correction that reveals a
preventable failure class. Prefer structure, then types, lint, and behavioral
tests; use review instructions for remaining judgment. Prove each new guardrail
rejects a representative violation and accepts valid code. Update this inventory
when the actual coverage changes.

Review dependency and action updates with the lockfile and checks. Keep external
advisory scans separate from the deterministic local gate: their results depend
on changing network data. Follow [skill provenance](../.agents/README.md) when
updating imported instructions.

## Documentation status ownership

Review guidance: link to `LICENSE` for project licensing and to the build plan for
implementation order instead of maintaining competing status descriptions. Live
GitHub settings are dated observations in [CI status](ci.md#observed-github-status),
verified against the repository, ruleset, and effective branch-rules APIs. Local
CI does not continuously verify those external settings or prose accuracy.
