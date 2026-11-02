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

The following baseline is approved for implementation. Its status will change to
enforced only after the checks and their negative probes pass.

| Standard | Status | Mechanism / scope |
| --- | --- | --- |
| Strict nullability, checked indexes, exact optional properties, explicit return coverage | Planned | App and tooling TypeScript projects; include Vite and Vitest configuration. |
| Reproducible supported runtime and dependency tree | Planned | Node 24 version file, engine checks, lockfile, `npm ci`; CI uses the same version. |
| Consistent formatting | Planned | One pinned formatter and EditorConfig; preserve vendored skills and executable code examples. |
| Reject explicit `any`, non-null assertions, hook misuse, and unhandled promises | Planned | Focused Oxlint rules, including its type-aware companion; justified exceptions remain reviewed. |
| Pure domain modules and isolated audio adapter | Reviewed | Keep patch transformations independent of React and browser audio; preserve `src/strudel/engine.ts`. |
| Catalog consistency | Enforced | `npm test` checks module IDs, controls, ranges, CV targets, looks, and Strudel-function ownership. |
| Skill source integrity and complete local dependencies | Planned | Pinned provenance, file hashes, executable modes, dependency inventory, and relative-link checks. |
| The same checks locally and in CI | Planned | One `npm run check` entry point, PR/main workflow, read-only permissions and pinned actions. |
| Merges require passing checks | Planned | GitHub repository rules after the workflow is published; a YAML workflow alone does not require a passing merge gate. |

## Review standards

| Standard | Evidence to inspect |
| --- | --- |
| Domain modeling | Distinct variants cannot contradict each other. Brand only meaningful primitive distinctions. Catalog/schema owns shared definitions. |
| Validation ownership | Parse external input as `unknown`; constructors and graph mutations preserve invariants. Downstream code relies only on established guarantees. |
| Comments | Retain rationale, contracts, and external limitations. Replace enforceable warnings with checks while retaining useful explanation. |
| Async operations | Await or handle rejection; `void` alone is insufficient. State has a clear owner. Specify idempotence, cancellation, and latest-edit behavior where relevant. |
| Tests | A representative broken behavior fails, a valid case passes, and a behavior-preserving refactor need not rewrite the test. Catalog and type invariants count as behavior. |
| Changes | Prefer scoped, verifiable units. Demonstrate failing regression tests locally; deliver green changes. Broader findings become follow-ups. |
| Performance | Validate outputs and work counts; interleave repeated runs, disclose environment/noise, and connect microbenchmarks to a user-visible path. No timing gate without a reliable baseline. |
| UI | Use semantic controls, names, focus behavior, keyboard operation, and reduced motion. Advanced keyboard patching may remain outside v1. |
| Agent workflow | tstack owns explicitly requested PR/review workflows. pstack engineering skills do not authorize delegation, commits, external messages, or shipping by themselves. |

Record narrow exceptions beside the affected code with their reason and removal
condition. Review whether an exception reveals a missing abstraction or boundary.
Negative type tests may use documented `@ts-expect-error`; ordinary application
code should satisfy the actual type rather than suppress it.

## Feature-owned checks still to build

| Owner | Required checks / decisions |
| --- | --- |
| Graph construction and editing | Unique IDs, existing modules/jacks, direction and signal compatibility, input cardinality, and a defined cycle policy. Validate on mutation, not just import. |
| Generator and reader | Separate sound equivalence, source/comment preservation, and rack identity. Cover fan-out, named dependency ordering, disconnected/bypassed modules, nested mixers, repeated settings, and modulation target semantics. |
| Persistence | Validate versioned input, define migrations and unknown-content preservation, and round-trip all agreed state including volume/bypass. Saved files are an external contract. |
| Audio engine | Verify initialization ownership, retry/stop semantics, concurrent evaluations, last-good behavior, effects/orbits, and sample-loading failures. Real audible verification is separate from unit tests. |
| Executable code import | Decide execution trust and isolation. Recognizing Strudel syntax does not sandbox arbitrary JavaScript. |
| Browser verification | Add a project-local verification procedure when the playable slice exists, then automate stable interactions. Include manual listening where automation cannot establish the claim. |
| Property testing | Add deterministic seeds and shrinking for graph and round-trip properties once their contracts exist. Consider formal models only for a concrete property that benefits. |
| Assets and offline use | Inventory sample/font sources, versions, licenses, and caching. Repository-owned development standards do not imply an offline audio application. |

Resolve open product questions in the owning spec and issue before encoding them
as expected test results. Do not invent graph, persistence, or audio behavior to
make a standards check pass.

## Maintaining standards

Use [correct](../.agents/skills/correct/SKILL.md) for a correction that reveals a
preventable failure class. Prefer structure, then types, lint, and behavioral
tests; use review instructions for remaining judgment. Prove each new guardrail
rejects a representative violation and accepts valid code. Update this inventory
when the actual coverage changes.

Review dependency and action updates with the lockfile and checks. Keep external
advisory scans separate from the deterministic local gate: their results depend
on changing network data. Follow [skill provenance](../.agents/README.md) when
updating imported instructions.
