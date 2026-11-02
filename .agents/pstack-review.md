# Pstack adoption decision

Reviewed [pstack 0.15.36](https://github.com/cursor/plugins/tree/ae5650febf4320793844c12c4adaa937f417f8da/pstack):
all 58 main skills, three Benny automation skills, and relevant workflow/dependency
instructions. This is a suitability review, not a full audit of supporting code.

## Selected skills and local adaptations

| Skill                                        | Adaptation                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript-best-practices`                  | Correct nonempty indexing, duration validation, and literal-inference examples. Preserve `as const` and established discriminants; use brands selectively. Scope assertions to justified boundaries. |
| `principle-type-system-discipline`           | Separate format/type guarantees from graph invariants. Link required local principles.                                                                                                               |
| `principle-boundary-discipline`              | Validate construction/mutations as well as imported input; retain the audio adapter and saved-file compatibility.                                                                                    |
| `principle-encode-lessons-in-structure`      | Preserve useful rationale and point to the standards inventory rather than duplicate instructions.                                                                                                   |
| `tdd`                                        | Preserve focused fail-before/pass-after workflow; link behavior guidance.                                                                                                                            |
| `correct`                                    | Prevent obvious first failures too; remove automatic commits and mandatory new approval rituals. Track scoped checks in the standards inventory.                                                     |
| `benchmark-checklist`                        | Remove poteto playbook dependencies; distinguish browser/audio observations from pure timings and avoid noisy CI thresholds.                                                                         |
| `principle-test-behavior-not-implementation` | Explicitly include catalog/graph/type invariants and separate the three round-trip claims.                                                                                                           |

All eight use normal discovery with scoped descriptions. Removed Cursor-specific
`paths` / `disable-model-invocation` frontmatter. Read linked dependencies once per
task; reciprocal reference links are not instructions to recursively reload them.
The TypeScript entry point reaches three core principles plus behavior-test
guidance. No Cursor setup or companion plugin is required.

## Workflow and utility inventory

| Skills                                                                                 | Decision and reason                                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `create-verification-skill`, `maintain-verification-skill`                             | Defer until a playable slice; adapt to `.agents` and the active browser harness.                               |
| `create-formal-verification-skill`, `maintain-formal-verification-skill`, `statechart` | Defer until a concrete property merits formal tooling. Start with behavioral/property tests.                   |
| `architect`, `arena`                                                                   | Borrow candidate-design exploration for unresolved architecture; avoid mandatory multi-model execution.        |
| `swarm`, `interrogate`                                                                 | Omit overlapping orchestration/review workflows. Keep tstack's explicit review path.                           |
| `how`, `why`, `teach`, `blast-radius`                                                  | Borrow focused investigation and explanation; omit broad agent/external-evidence dependencies.                 |
| `recall`, `reflect`, `show-me-your-work`                                               | Prefer durable specs and focused decision records; defer transcript/integration workflows.                     |
| `automate-me`                                                                          | Omit broader automation generation and publishing behavior.                                                    |
| `poteto-mode`, `poteto-help`, `setup-pstack`, `figure-it-out`                          | Omit competing workflow router and global Cursor model configuration.                                          |
| `no-comments`                                                                          | Avoid deletion-first policy; retain why/contract/external-constraint comments and negative type-test evidence. |
| `technical-writing`, `unslop`                                                          | Borrow clarity; preserve project formatting, literal source, branding, and required tstack attribution.        |
| `bro`, `in-your-own-words`, `sharpen`, `ketchup`                                       | Optional personal utilities; unnecessary as repository standards.                                              |
| `ketchup-video`, `make-bot-ui`                                                         | Omit unrelated media/bot/infrastructure dependencies.                                                          |

## Principle inventory

Names below omit `principle-`. Selected principles above are installed; other
accepted guidance is incorporated into [standards](../docs/standards.md), not
installed as redundant independently triggered skills.

| Principles                                                                         | Decision                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `type-system-discipline`, `boundary-discipline`, `encode-lessons-in-structure`     | Install adapted core dependencies.                                                         |
| `test-behavior-not-implementation`                                                 | Install adapted testing guidance.                                                          |
| `model-the-domain`, `foundational-thinking`, `prove-it-works`                      | Adopt domain-first foundations and evidence proportional to the claim.                     |
| `make-operations-idempotent`, `explain-the-number`                                 | Adopt for lifecycle operations and measured performance.                                   |
| `sequence-verifiable-units`                                                        | Adopt small units; reproduce failing tests locally and deliver green changes.              |
| `attack-the-premise`, `exhaust-the-design-space`, `redesign-from-first-principles` | Use selectively for unresolved design; respect settled scope.                              |
| `build-the-lever`                                                                  | Automate repeatable work when the benefit justifies maintenance.                           |
| `experience-first`                                                                 | Improve experience within the agreed module/look scope.                                    |
| `fix-root-causes`                                                                  | Address the cause in scope; record larger follow-ups.                                      |
| `guard-the-context-window`                                                         | Bounded reads and durable context; no automatic delegation.                                |
| `laziness-protocol`, `subtract-before-you-add`                                     | Prefer small changes while preserving necessary foundations.                               |
| `migrate-callers-then-delete-legacy-apis`                                          | Apply to internal callers, not unversioned removal of saved-file compatibility.            |
| `minimize-reader-load`                                                             | Preserve intentional side-effect boundaries even with one caller.                          |
| `never-block-on-the-human`, `outcome-oriented-execution`                           | Act within authorized scope; deliver verified work and respect external-action boundaries. |
| `separate-before-serializing-shared-state`                                         | Respect truly shared audio ownership and evaluation-order invariants.                      |

## Benny automation pack

`setup-benny`, `triage-issue-reports`, and `reproduce-and-fix-issues` remain out.
Their Cursor Automation, messaging/tracker, and companion-tool assumptions are
unnecessary for this repo. Installing engineering guidance does not enable them.

## Tradeoffs retained

tstack offers narrower explicit shipping/review triggers; full pstack offers
more prescribed investigation and competing designs at the cost of overlapping
automation, context, and tool dependencies. Keep tstack workflows and selected
pstack standards. Multi-model availability remains an execution-time concern.

Boundary validation reduces redundant checks, but internal graph mutation can
invalidate prior input. Validate where the invariant is owned. Simplification
reduces maintenance, but intentional engine adapters and saved-file migrations
carry real contracts. Encode constraints where possible and retain their useful
rationale. Formalize repo policy locally rather than relying on global settings.
