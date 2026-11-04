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

## Feature-owned coverage and remaining gaps

The [build plan](build-plan.md#current-status-and-remaining-work) owns feature and
issue status. This inventory distinguishes implemented checks from their limits;
a requirement in this table is not evidence of enforcement.

Hosting IAM trust is checked by the synthesized-template regression in
`scripts/hosting.test.mts`, using the repository's observed immutable GitHub OIDC
subject as an independent fixture. It rejects the old name-only trust format.
Actual GitHub-to-AWS exchanges and environment branch restrictions remain live
verification; record them in [deployment evidence](deployment-verification.md).

| Owner                          | Implemented coverage / evidence                                                                                                                                                                                                                                                         | Remaining limits or work                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph construction and editing | Generator validation and rack mutations check IDs, jacks, directions, signals, input cardinality, cycles, values and placement.                                                                                                                                                         | Unknown CODE semantics remain unverified; broader effect-order analysis is not claimed.                                                                             |
| Generator and reader           | Focused tests cover fan-out/dependency ordering, nested mixers, repeated settings, CV, source preservation, saved identity and supported Strudel events. See [reader evidence](reader-verification.md).                                                                                 | Separate source bytes, rack identity and events; none proves universal audible equivalence.                                                                         |
| Persistence                    | Versioned metadata validation, unknown-block preservation, explicit replacement and full saved-state restoration, including volume, bypass and empty rows. See [workspace](workspace-verification.md) and [row checks](interaction-verification.md#saved-rows-and-source-preservation). | Ambiguous external edits reset affected identity/layout; unknown versions are retained, not migrated speculatively.                                                 |
| Audio engine                   | Adapter/transport tests and [browser recovery evidence](audio-recovery.md) cover initialization, retry, Stop intent, abandoned evaluation, resources/output and structural effect resets.                                                                                               | Uninterruptible evaluation/side effects, unreported errors, resource readiness and runtime source mapping retain explicit limits. Physical listening is unverified. |
| Executable code import         | Reader never executes source; playback runs user JavaScript through Strudel.                                                                                                                                                                                                            | No sandbox, isolation or side-effect rollback. Parsing does not establish execution safety.                                                                         |
| Browser verification           | Project scripts and committed reports cover rack/workspace, interactions, feedback, errors and library loading.                                                                                                                                                                         | Suites need Chromium/external resources and run outside shared CI; physical listening and broad browser/device coverage remain unverified.                          |
| Property testing               | Focused deterministic behavior fixtures exist.                                                                                                                                                                                                                                          | Seeded generative properties/shrinking remain later work, not implemented enforcement.                                                                              |
| Assets and offline use         | [Sample sources and caching](engine-spike.md#samples-and-deployment) and [fonts/design](design.md) are documented.                                                                                                                                                                      | No app-managed offline cache; source registration does not prove every resource is available or decoded.                                                            |

The #3 generator now validates graph structure (including cycles and signals
through passthrough modules) and control/layout values before emission. Its
behavior tests cover generation, target-specific CV, fan-out, nested mixer gains,
CODE source retention, routing provenance and saved JSON state. The #5 rack mutation operations now validate through this boundary and reject
overlap/out-of-rail placement before committing. Focused rack tests cover these
mutations and generated source ownership; [browser evidence](rack-verification.md)
covers the UI. The [#6 reader checks](reader-verification.md) cover source-preserving
import, catalog/CV projection, validated saved-state recovery and conservative
identity reconciliation. [Live editor integration](workspace-verification.md) is
implemented; universal audible equivalence remains unverified.

The #35 structural workspace boundary requires explicit call ownership plans and
independent source/graph validation before accepting imported edits. Focused
behavior tests cover exact source, events, atomic refusal and full reopened rack
identity. Its [real-engine browser acceptance](structural-edit-verification.md)
is separate from the shared deterministic gate.

The #37 activity boundary uses numeric context keys, enforced by the
[attribution regression](../src/strudel/activity.test.ts), so Strudel cannot turn
an observer key into mini-notation. Fake-clock engine tests cover scheduled-audio
time and cancellation. Statement-boundary regressions reject decoration that
changes JavaScript automatic semicolon insertion. CodeMirror renders editable text and decorations in one layer; the browser
suite verifies current owned spans, native composition, mapped backward selection,
both scroll axes, local undo checkpoints, Cyber editing through invalid span-boundary drafts and live Show in code geometry. Treatment
instrumentation rejects reparsing on selection, and playback renders retain the
same decoration facet. The #72 [sounding-token boundary](sounding-tokens.md) uses exact source/intent
guards and a CodeMirror StateField; focused tests cover token expiry/retrigger,
draft clearing and transport delivery without React snapshots. Its real-browser
check covers generated/imported tokens, opaque/unmapped spans, motion, errors and
the trance demo without event-driven editor renders or parsing.
The separate [real-browser feedback check](feedback-verification.md)
requires actual pulses, nonzero PCM, native IME and reduced-motion behavior;
shared CI still lacks Chromium/network provisioning for that suite.

Resolve open product questions in the owning spec and issue before encoding them
as expected test results. Do not invent graph, persistence, or audio behavior to
make a standards check pass.

## Maintaining standards

The #62 naming regression submits the displayed fallback on an unnamed patch and
requires byte-identical source, absent name metadata and unchanged undo history.
`renameDocument` treats an unchanged display name as a no-op; its unit check runs
in the shared gate. The separate browser check exercises actual Escape/blur and
also requires unchanged local recovery. This prevents focus or cancellation from
materializing default presentation text as a saved edit.

The [#64 literal-edit suite](literal-edit-verification.md) enumerates every catalog
control, with separate source, wiring/layout/value, exact saved identity and real
Strudel event assertions. It runs in the shared gate. Named executable expected
failures originally retained the identity/channel (#99) gaps; those assertions
now pass under the [documented conservative contract](patch-format.md#matching-rules).
The #66 grid-view
checks now pass, with separate source-splicing and saved-identity regressions and
[real-browser observations](literal-edit-verification.md#source-independent-grid-views-66). The #65 routing assertions now pass normally, including anonymous
root edits, unchanged wiring in the reported patch, source preservation and exact
save/reopen checks; passing the suite does not claim the remaining bugs are fixed.

The #45 library behavior tests require unique collection/patch IDs, active
source-bound coverage of every shipped module, exact original source on load,
and independently reopened saved rack state. Shared deterministic tests also
cover preparation failure, confirmed Stop and cancellation. The separate
[library browser check](patch-library.md#browser-verification) verifies actual
dialog interactions, exports, loading and real-engine PCM; it needs browser/audio
and external sample resources and is not part of the shared CI gate.

The #44 reader placement regressions use the exact reported CODE/CV source to
check fixed-rail validity, exact executable source and saved rack identity
separately, plus reconciliation and overflowing mixer buses. Rail width lives in
`src/patch/layout.ts` and is shared by reader placement and rack mutations.
The workspace validates the candidate rack before accepting a draft; the browser
error suite covers an out-of-rail saved layout retaining the draft and accepted
rack through Stop, Export, Revert and correction. See
[the #44 browser observations](error-verification.md#long-imported-voices-44).

The #12 workspace compares audio diagnostic ownership only against validated,
accepted source; editing/invalid drafts never enter the parsing comparison during
render. The [browser error regression](../scripts/workspace-errors.mjs) reproduces
the original crash after an audio failure and verifies that incomplete source,
Export and Stop remain available. See [error acceptance](error-verification.md).
This browser check is a narrow exception to the shared local/CI gate: it requires
provisioned Chromium and its real-engine group reaches external sample sources.
It currently runs separately from `npm run check`; the [#36 audit](audio-recovery.md) adds real resource/output errors,
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

The #63 [history contract](undo-redo.md) has deterministic exact-source, saved
rack/reopen identity, gesture grouping and redo branching checks. Its separate
browser suite covers actual draft/accepted shortcut ownership, replacement,
recovery and live engine updates, plus real Strudel mute/undo/redo PCM. Knob grouping is passed explicitly by pointer commits; the browser regression
rejects absorbing a preceding input blur commit and failed before that fix. This
Chromium event-order regression remains outside shared CI with the other browser
checks. Session history is not persisted; physical listening and other browsers
remain unverified.

## Documentation status ownership

Review guidance: link to `LICENSE` for project licensing and to the build plan for
implementation status and order instead of maintaining competing status descriptions.
Keep dated verification records scoped to their original run and link superseding
evidence when later work resolves a limitation. Live
GitHub settings are dated observations in [CI status](ci.md#observed-github-status),
verified against the repository, ruleset, and effective branch-rules APIs. Local
CI does not continuously verify those external settings or prose accuracy.

The #75/#80 library regressions require the nine module exercises and four Start
here entries to be rack-owned and accept CV/effect/mixer mutations, with independent export/reopen identity checks. Explicit
conversion tests retain opaque setup and CODE, reject invalid saved preludes, and
query real Strudel control events separately from source and graph assertions.
The [browser acceptance](library-rack-verification.md) covers the actual controls,
nearby refusal/Cancel/retry and measured output; physical listening remains unverified.

The #76 connection preview uses the source mutation boundary before showing a
valid jack. Focused regressions cover imported CV refusal, accepted replacement
and saved identity; the [separate browser probe](interaction-verification.md#cable-refusal-preview-76)
covers blocked styling, local hover/focus reasons and conversion consent.

The #85/#86/#96/#88 [rack visual acceptance](rack-visuals-verification.md)
checks panel contrast, signal markings and cable fading in Chromium. Its native
connected-jack regression rejects a panel stacking context that lets cable paths
intercept fan-out and occupied-input replacement. The same browser script runs
locally for this feature; like the existing browser suites, it remains outside
shared CI until Chromium provisioning is added. Static checks do not establish
pointer hit priority.

The #77 [common-call regressions](../src/reader/aliases.test.ts) separately check
source bytes, complete saved rack identity and real Strudel events for lowercase
scale roots, above-unity gain and all sixteen short ENV aliases. Saved-file
fixtures protect existing suffix and whole-voice CODE ownership when adapters are added; external source
edits and forged saved text exercise that boundary's conservative rejection.
Partial envelopes and unproven orbit aliases remain CODE under the
[translation contract](translation-rules.md#common-imported-calls-77).
