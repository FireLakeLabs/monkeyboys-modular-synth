# Engineering standards

The [rack layout browser regressions](../tests/browser/rack-layout.spec.mjs) guard
the Packs tab, usable rack height, and fitted MIX cables: clipped jack
targets cannot leave cables dangling on other rails. Both checks failed before
the fixes. Scrolling the output jack back into view restores its cable at the
measured endpoint, without changing the source. This is part of browser acceptance,
separate from the deterministic gate; physical listening is not covered.

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
| Catalog consistency                                                                      | Enforced                          | `npm test` checks module IDs, controls, ranges, CV targets, call binding dependencies/ownership, looks, and Strudel-function ownership.                                                             |
| Reader coverage regression                                                               | Enforced                          | Per-patch and aggregate committed corpus baseline in `npm run check`; see [metrics, provenance and wild report limits](reader-coverage.md).                                                         |
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

| Standard             | Evidence to inspect                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain modeling      | Distinct variants cannot contradict each other. Brand only meaningful primitive distinctions. Catalog/schema owns shared definitions.                                                                                                                                        |
| Validation ownership | Parse external input as `unknown`; constructors and graph mutations preserve invariants. Downstream code relies only on established guarantees.                                                                                                                              |
| Comments             | Retain rationale, contracts, and external limitations. Replace enforceable warnings with checks while retaining useful explanation.                                                                                                                                          |
| Async operations     | Await or handle rejection; `void` alone is insufficient. State has a clear owner. Specify idempotence, cancellation, and latest-edit behavior where relevant.                                                                                                                |
| Tests                | A representative broken behavior fails, a valid case passes, and a behavior-preserving refactor need not rewrite the test. Catalog and type invariants count as behavior.                                                                                                    |
| Changes              | Prefer scoped, verifiable units. Demonstrate failing regression tests locally; deliver green changes. Broader findings become follow-ups.                                                                                                                                    |
| Performance          | Validate outputs and work counts; interleave repeated runs, disclose environment/noise, and connect microbenchmarks to a user-visible path. No timing gate without a reliable baseline.                                                                                      |
| UI                   | Use semantic controls, names, focus behavior, keyboard operation, and reduced motion. Advanced keyboard patching may remain outside v1. Rack controls stay above the cable layer and are tested with a real pointer, as in [design](design.md#controls-and-the-cable-layer). |
| Stored user data     | Review lost work and multiple tabs from round 1: stale tabs, full or unreadable storage, undo, reload. On #205, most Sol findings were two-tab cases, including a blocker that silently overwrote a saved patch; it took 5 rounds.                                           |
| Browser evidence     | Full suite on the final commit and after every review fix, `RESULT` line read, [**Full browser suites**](ci.md#full-browser-acceptance) waited for. Process rules only: that check is not required, so nothing blocks a merge that skips them.                               |
| Agent workflow       | tstack supplies PR workflows; [review-loop](../.agents/skills/review-loop/SKILL.md) owns model review under [AGENTS.md](../AGENTS.md). pstack skills alone do not authorize delegation, commits, external messages, or shipping.                                             |

Record narrow exceptions beside the affected code with their reason and removal
condition. Review whether an exception reveals a missing abstraction or boundary.
Negative type tests may use documented `@ts-expect-error`; ordinary application
code should satisfy the actual type rather than suppress it.

## Feature-owned coverage and remaining gaps

The [build plan](build-plan.md#current-status-and-remaining-work) owns feature and
issue status. This inventory distinguishes implemented checks from their limits;
a requirement in this table is not evidence of enforcement.

The [trance layout regressions](../src/library/trance.test.ts) enforce moving the
imported `.o(2)` CODE block onto widened 84/104 HP rails, preserving exact source
and complete saved rack identity after reopen. They failed before the save check
ignored object key insertion order.

The [WAV bounce regression](wav-bounce.md) covers live/offline/live context
transitions with released filter nodes and nonzero PCM on bounce and replay.
It failed before the pinned `postinstall` audio-pool ownership fix. The install
script verifies exact original/patched upstream hashes and rejects dependency
drift; this is a narrow dependency exception until upstream pools and late cleanup
preserve node contexts. The browser suite also rejects uncaught cleanup errors
after live restoration. A deterministic installed-pool smoke test in `npm run test:guardrails`
checks both context transitions and retained same-context reuse. Runtime PCM
proof remains in the separate browser acceptance gate.

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
| Browser verification           | Project scripts and committed reports cover rack/workspace, interactions, feedback, errors and library loading.                                                                                                                                                                         | Runs in a separate [browser workflow](ci.md#full-browser-acceptance); external resources, physical listening and broad browser/device coverage remain limits.       |
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
the separate [browser workflow](ci.md#full-browser-acceptance) now provisions
Chromium and runs this suite after every main push.

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
and independently reopened saved rack state. The focused Module exercises
collection must additionally advertise one target per entry, cover the complete
catalog, supply a manual action and restore generator-owned source/rack state.
See the [module exercise audit](module-exercise-audit.md) for browser evidence.
Shared deterministic tests also
cover preparation failure, confirmed Stop and cancellation. The separate
[library browser check](patch-library.md#original-45-browser-verification) verifies actual
dialog interactions, exports, loading and real-engine PCM; it needs browser/audio
and external sample resources; it runs in the separate
[browser workflow](ci.md#full-browser-acceptance), outside the deterministic gate.

The #44 reader placement regressions use the exact reported CODE/CV source to
check fixed-rail validity, exact executable source and saved rack identity
separately, plus reconciliation and overflowing mixer buses. Per-patch rail width lives in
`src/patch/layout.ts` and is shared by reader placement and rack mutations. The
#133 regressions cover all three widths, legacy OUT migration, off-rail metadata,
wide-rail reconciliation and exact library executable bytes; see
[output-panel proof](output-panel-verification.md).
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
the separate [browser workflow](ci.md#full-browser-acceptance) now provisions
Chromium and executes it after every main push. Network isolation is not claimed.
The deterministic transport regressions do run in the shared gate. Do not infer render coverage from those unit tests.

The workspace recovery browser probe calibrates its combined output analyser by
adding silent branches without changing the expected signal. That regression
failed with the former per-connection averaging and passed after the probe summed
branches per audio context. A sustained fixture and two future note onsets prove
that invalid drafts retain scheduling; Stop must end further onsets and reach
the existing PCM silence threshold. See the [hosted failure and correction](ci.md#hosted-pcm-probe-correction).
This is real-browser/engine coverage, not physical listening or a calibration of
every other legacy audio probe.

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
Chromium event-order regression runs in the separate
[browser workflow](ci.md#full-browser-acceptance). Session history is not persisted; physical listening and other browsers
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
locally and in the separate [browser workflow](ci.md#full-browser-acceptance).
Static checks do not establish
pointer hit priority.

The [cable-control clarity regression](cable-visibility-verification.md) extends
that browser script with explicit All/Focus/Dim modes, visible selected/hovered
ownership, active styling/pressed state, native hover-out and keyboard changes,
and exact-source checks. It first failed against the former toggle. These checks
run in that browser workflow; the deterministic gate does not prove
visual state clarity.

The #77 [common-call regressions](../src/reader/aliases.test.ts) separately check
source bytes, complete saved rack identity and real Strudel events for lowercase
scale roots, above-unity gain and all sixteen short ENV aliases. Saved-file
fixtures protect existing suffix and whole-voice CODE ownership when adapters are added; external source
edits and forged saved text exercise that boundary's conservative rejection.
Partial envelopes and unproven orbit aliases remain CODE under the
[translation contract](translation-rules.md#common-imported-calls-77).

The #91 [mid-width browser regression](mid-width-verification.md) rejects page
scrolling and checks pane reachability, horizontal palette geometry, source/rack
selection, Show in code focus, exact source and draft undo across view changes.
It runs in the separate [browser workflow](ci.md#full-browser-acceptance), outside
the deterministic gate.

The #132 [pattern/time acceptance](pattern-time-verification.md) enumerates all
supported call forms, with independent exact-source, saved-identity, literal-edit
and pinned-engine onset-event checks. Every mode has an order-sensitive partner;
commuting transforms are not presented as event changes. Catalog time-span rules
reject empty/reversed zoom/compress spans at mutation/generation boundaries.
The separate browser suite checks real scheduling and output PCM, all family
looks at fixed catalog widths, and live cable endpoints. These checks do not
establish physical listening or other-browser/device coverage.

The #132 palette/Fit correction is guarded by the existing
`scripts/output-panel-browser.mjs` group in the full browser workflow. Its actual
1024-px rail-clipping assertion failed with the expanded call lists and passed
with compact catalog representatives; no assertion was weakened. This is a
browser layout check, not a static string-length limit; see the
[hosted regression](pattern-time-verification.md#hosted-palettefit-regression).
The #130 [modulation matrix](../src/reader/modulation.test.ts) separately checks
exact source, saved graph identity and real pinned-engine events for generalized
CV and utilities. Catalog compatibility defaults preserve legacy STEP LFOs.
The [browser/PCM acceptance](modulation-verification.md) verifies actual controls
and within-note motion; it runs in the existing separate browser workflow.

The #130 CI run caught nested explicit-mini arguments being parsed twice by
the REPL. The modulation event guard now runs generated forms through the pinned
REPL transpiler, including inline/named CV SEQ utility inputs; it failed with
`cannot parse as numeral: "object"` on the old writer and passes with plain-string
parser arguments. The existing browser matrix now derives module/look counts
from the catalog and verifies every added module without relaxing overflow,
jack-target or font-size assertions. The live library signal suite also covers
the new utility exercise. These guardrails replace assumptions that the initial
sixteen-module catalog and direct core queries cover later module additions.

The #129 [panel regressions](../src/codegen/panels.test.ts) reject competing MIX
reader paths that turn repeated `postgain` setters into multiplied buses, and
stack expansion that drops enclosing mute/solo/name labels. Five cases failed
before the fixes. Only the dedicated terminal adapter projects MIX gains;
earlier setters stay CODE, including explicit unity overrides when necessary.
The shared gate checks event/source/saved-identity behavior, and the separate
[panel browser suite](module-panels-verification.md) compares original and
regenerated stack labels through the pinned REPL. Physical listening and
multichannel hardware remain unverified.

Catalog companion bindings additionally require compatible established owners,
preventing newly mapped calls from creating sound-changing module defaults.
The #129 unit suite reproduces standalone/separated companions, repeated output
pair defaults and mixed delay-time precedence, with independent real-engine event,
source and saved-identity checks. The same tests cover retaining prior CODE
ownership, which a new adapter must not silently replace.

Explicit neutral SMPL setters over opaque upstream patterns stay CODE even when
reusing an established sampler. Ten #129 event/source/saved-identity regressions
failed before this guard (all five new sampler settings, with and without BANK)
and pass afterward; the browser REPL independently compares the same forms.

The #129 browser guard scrolls dense controls into view while retaining fixed
catalog widths, readable text and jack targets. The output-panel suite rejects
Fit-rack rail clipping at desktop and mid-width sizes. A MIX jack-scroll fixture
checks actual cable endpoints and unchanged source: the old viewport-only
listener fails with a detached endpoint, while capturing descendant scrolls
passes. Contrast and pointer checks inspect painted, reachable controls rather
than clipped DOM rectangles. These checks run in full browser acceptance;
static/unit checks do not prove the geometry or native hit targets.

The #132 imported pattern-control browser check also guards #129 integration:
RATCHET retains its Apply action and external source refresh rather than using
the MIX-only compact text editor. It failed on a missing Apply before narrowing
the editor dispatch; the peer's assertion remains unchanged.

The combined #129/#130 CV matrix includes all four MIX jacks and all four source
modes. It failed on missing emission/projection and saved ownership before the
integration. Nested cases compare actual pinned-engine/REPL events with literal
expected expressions, while exact source and saved identity remain separate.
The browser workflow measures within-note SMOOTH/STEP behavior and ENV/CV SEQ
output through a nested bus. Canonical Save retains generated metadata only on
an exact executable-byte match; other source still needs independent ownership
proof. Folded pattern gain CODE keeps its original position before opaque routing.

The small-height panel matrix rejects overflowing numeric values at Fit, including
REVERB's five-digit LP. Narrow numeric rows wrap the readout instead of shrinking
text or knob geometry. The same unchanged browser assertion guards that fix.
A mixer import regression separately rejects moving an unsupported LFO gain past
opaque routing when saved, checking events, bytes and reopened state.

S7/S8's #129 regressions independently check event preservation and Save/reopen
for three nested SMOOTH mixer modulators and opaque gain followed by modulation.
They failed on a dropped contribution/unity override and invalid saved ownership.
Ordered reverse insertion preserves all deferred CODE; opaque gains keep their
associated modifiers opaque. The real REPL probe checks the same forms.

The #134 [ordered-effect regressions](../src/codegen/effects.test.ts) separately
check exact source, repeated argument identity/save/reopen and pinned-engine
control events. Native imported setters retain fixed-order execution; unsupported
FX stays atomic CODE. The [browser suite](ordered-effects-verification.md) checks
actual notes, scheduled event stages, orbit routing and nonzero PCM. These checks
do not establish physical listening or other-browser coverage.
The #131 [sound/effect matrix](../src/modules/sound-effects.test.ts) checks exact
source, complete saved rack identity and pinned-engine onset events independently,
including explicit noise silence, 16-bit quantization, missing FM envelopes and
depth-only phaser imports. The retained trance digests still match: a rejected
speculative PAN projection restores its placement cursor before CODE fallback.
The separate browser suite covers four Hardware looks, real PCM and native
harmonic drawbar editing. The [SHIFT measurement](sound-effects-verification.md#shift-cost)
is a CPU-only processor cost, not a browser polyphony or continuity guarantee.

The #131 Sol regressions failed in twelve cases before fixing explicit default
resets, nullary sample-effect boundaries and shared FM OP saves. Reset setters
that cannot be omitted safely retain exact CODE; scalar/nullary sound calls use
one sampler boundary; operator source matching requires equal effective values
before sharing a saved owner. Compound effect planning compares every active
catalog rank after #134 integration, preventing hidden LO-FI/COMP repeats.

The #147 nested editor imports only the pinned krill parser into its pure model.
Its boundary validates AST shapes and checks recovered modifiers/weights against
the parser. [Deterministic checks](../src/reader/nested-steps.test.ts) separately
cover exact source, saved identity and real mini/REPL events, including backticks,
text cells, argument-location filtering, repeated copies and simultaneous note/CV
literals. The [browser suite](../scripts/nested-steps-browser.mjs) exercises native
gestures, looks/zoom/geometry, nested activity and live WebAudio PCM; see
[observations and limits](nested-step-editor-verification.md). Escaped literals
retain whole text mode; touch and screen-reader behavior are not established.

The #136 [routing matrix](../src/codegen/routing.test.ts) checks source, complete
saved identity and real engine events independently; its playback regression
also rejects a bus allocation change without structural reset. The separate
[browser acceptance](routing-verification.md) checks actual bus object retention
and replacement, audio-rate sidebands, DUCK gain, native gate editing and
non-colour cable geometry. It reproduced a late AUX return cleanup error after
reset. The same pinned postinstall patch now tolerates only that missing-edge
`InvalidAccessError`, in source and both bundles, while preserving all #140
context fixes and exact dependency hash checks. The unchanged real-browser
sequence is the behavioral regression for this dependency exception.

The S1/S2 routing review regressions additionally exercise actual REPL solo
selection and DUCK before the first target onset, including reset/replay and
output-pair retention. Both failed before their fixes. Private voices retain
solo participation with silent dry/wet output; the pinned controller starts a
missing target orbit's envelope and connects its output only when the target
voice supplies its channel pair. Source and both bundles are hash-verified.

The #139 probe boundary is enforced by planner/real-Pattern regressions: upstream
CODE (including callbacks), opaque setup, stale ownership and non-pattern cables
never reach evaluation. Separate tests prove prefix onset values/times, exact
credit source bytes and full reopened SCOPE rack identity. Engine-boundary tests
cover noninitializing clock/analyser reads and stopped taps. The separate
`scripts/pattern-visibility-browser.mjs` proves pointer/Alt-click interaction,
zero-context silent probing, real per-voice PCM, credits and reduced-motion
interval cancellation. This runtime proof is outside the deterministic CI gate;
see [its acceptance record](pattern-visibility-verification.md).

The #139 integration browser checks also exercise the clock/probe/analyser
exports on recording engine doubles. A missing clock export reproduced a blank
workspace; the corrected doubles pass the existing application/history/error
suites. Pinned-OUT comparisons await fonts and stable reference geometry before
scrolling. Delayed-font reproduction failed before that prerequisite and passed
afterwards, without weakening the pinning or cable-position assertions.

The #138 [crate/tape acceptance](sound-crate.md) separates exact source, complete
saved-rack identity, real engine events and browser PCM. Its banked-row regression
failed before drops qualified untouched sounds and cleared sampler overrides;
unsupported lookahead and saved CODE owners cannot invent slicing defaults. The
crate uses #137's seated inventory and status API. The separate browser suite
checks cold audition without transport, five drop destinations and tape/code
updates; physical listening and other-browser coverage remain unverified.

The #210 Doom acceptance compares the isolated restart’s active DRIVE worklets
with the anchor oscillator lifetimes in that same window. The probe separately
names its earlier maximum `cumulativeDrivePeak`; using that maximum as the
isolated count fails the browser guard. Module/HP and source/rack invariants
run in `npm run check`; PCM, finite lifetimes and stopped/restarted scheduling
run in the full browser suite. Historical report figures remain reviewed
observations, and neither path establishes subjective listening acceptance.

The #211 Industrial acceptance derives its stopped-scheduling wait from the longest
gap between onsets in any lane, and names an isolated restart’s peaks
(`immediateRestart`) separately from the maximum across repeated loads
(`cumulativeRepeatedLoad`). Live edits are checked as events and again in a Bounce
of the edited rack. Noise samples differ between sessions, so noise PCM is held to
level and envelope bounds, not digests. Module/HP and source/rack invariants run in
`npm run check`; PCM, lifetimes and scheduling run in the full browser suite.
Neither path establishes subjective listening acceptance.
