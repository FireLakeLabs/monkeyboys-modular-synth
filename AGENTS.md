# MonkeyBoy’s Modular Synth

A browser modular synth whose rack and Strudel code are editable views of the same patch. Preserve that equivalence when changing the model, translation, playback, or UI.

## Project context

- For scope or architectural work, read [decisions](docs/decisions.md), [v1 scope](docs/v1-scope.md), and [build plan](docs/build-plan.md). Read the relevant GitHub issue and discussion before implementing it. Record resolved technical questions in the relevant spec; proposals in issues are not settled decisions.
- For modules, controls, or jacks, read [module spec](docs/module-spec.md) and `src/modules/catalog.ts`. Keep them in sync; the catalog is the runtime source of truth. Extend its data instead of duplicating module definitions in UI components.
- For generation, import, or persistence, read [translation rules](docs/translation-rules.md), [patch format](docs/patch-format.md), and `src/patch/types.ts`. Prove source preservation and layout identity before committing to the reader's representation. Preserve unsupported code through CODE blocks and keep sound, formatting, and saved rack state as distinct round-trip checks.
- For rack UI or looks, read [design](docs/design.md). Looks affect presentation only; module width stays fixed and cables follow live jack positions. The private canvas is a reference, not executable code; report when its boards are unavailable.

## Development and verification

- For TypeScript/TSX work, apply [typescript-best-practices](.agents/skills/typescript-best-practices/SKILL.md) and its linked principles. For test changes, apply [test behavior](.agents/skills/principle-test-behavior-not-implementation/SKILL.md). Read each dependency once; reciprocal reference links do not require reloading it.
- For engineering rules or exceptions, read [standards](docs/standards.md), which distinguishes executable enforcement, review guidance, and feature-owned gaps. For a preventable correction, use [correct](.agents/skills/correct/SKILL.md); for a practical bug regression, use [tdd](.agents/skills/tdd/SKILL.md); for measured performance claims, use [benchmark-checklist](.agents/skills/benchmark-checklist/SKILL.md).
- Follow the build plan's dependency order. Resolve the reader and engine spikes before relying on their assumptions in production code. Keep an issue's acceptance criteria attached to the implementation and report any that remain unverified.
- Keep patch transformations testable without React or browser audio; keep Strudel initialization and playback behind `src/strudel/engine.ts`.
- Use the Node version in `.node-version`, npm, and the committed lockfile; bootstrap with `npm ci`.
- For code, configuration, or tooling changes, run `npm run check`, the same gate used in CI. The build includes TypeScript checking. Add focused behavior tests for generation, import, graph validation, or persistence changes; catalog integrity tests alone do not prove translation correctness.
- For changes to `src/`, run the affected browser checks and inspect real screenshots for UI work. Use the [browser verification policy](docs/ci.md#browser-verification-policy) to choose focused or full local coverage and handle review fixes; the full hosted PR suite remains the merge gate whenever it runs.
- For playback or live-editing changes, verify the affected behavior in a browser when the task and harness permit it. Report separately what was heard or observed and what only passed static/unit checks. For documentation or skill-only changes, run `npm run format:check` and `npm run check:skills`, verify relevant links, and validate changed examples/scripts. CI still runs the full gate.

## Skill routing

Project skills live in `.agents/skills/`. Read the selected `SKILL.md` and its required dependencies when the request triggers it; load other skills only as needed. Installing, documenting, or discussing a workflow is not an instruction to execute it.

| Request                           | Skill                                                              | Finish                                                                             |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| “full send”                       | [full-send](.agents/skills/full-send/SKILL.md)                     | Implement, prove, review, file, babysit, and merge after its gate passes.          |
| “full stop”                       | [full-stop](.agents/skills/full-stop/SKILL.md)                     | The same preparation, with an open PR ready for the user to merge.                 |
| “council”                         | [council](.agents/skills/council/SKILL.md)                         | Review using three providers and reconcile findings.                               |
| “sol loop”                        | [sol-loop](.agents/skills/sol-loop/SKILL.md)                       | Bounded Sol review with an explicit verdict and findings.                          |
| “opus loop”                       | [opus-loop](.agents/skills/opus-loop/SKILL.md)                     | Bounded Opus review with an explicit verdict and findings.                         |
| “review loop”                     | [review-loop](.agents/skills/review-loop/SKILL.md)                 | Bounded review using the model selection policy below.                             |
| “orchestrate”                     | [orchestrate](.agents/skills/orchestrate/SKILL.md)                 | Run waves in their own threads, review each, and land lessons; the owner approves. |
| File, open, or create a PR        | [file-pr](.agents/skills/file-pr/SKILL.md)                         | A concise PR describing the problem, outcome, and verification.                    |
| Take over a PR, branch, or thread | [takeover](.agents/skills/takeover/SKILL.md)                       | Finish the requested scope while preserving contributor credit.                    |
| Monitor, watch, or babysit a PR   | [babysit-pr](.agents/skills/babysit-pr/SKILL.md)                   | Address CI/review findings and report readiness; merge only when authorized.       |
| Modernize or rebase an old PR     | [modernize](.agents/skills/modernize/SKILL.md)                     | Reassess intent and update the branch within the requested scope.                  |
| Post an authorized GitHub comment | [leaving-pr-comments](.agents/skills/leaving-pr-comments/SKILL.md) | An attributed, evidence-backed comment. Formatting rules do not authorize posting. |

Ordinary development requests use the development guidance above; they do not automatically invoke shipping or multi-model review workflows. An explicitly requested workflow may invoke its documented dependencies. Honor the user's current scope and the active harness's tool and permission rules.

## Review and PR preferences

- For stacked PRs, register a native GitHub stack and verify every layer's API membership; chained base branches alone are incomplete. See [stack verification](docs/ci.md#native-stacked-pull-requests).
- Review loops use one reviewer. An explicit reviewer request wins; `sol-loop` otherwise selects Sol and `opus-loop` selects Opus. For `review-loop`, including full-send/full-stop, select Opus for a known Sol implementation and Sol for a known Opus implementation. Mixed, other, or unknown implementation provenance defaults to Sol; report that provenance without claiming cross-model independence. Use known task provenance, not Git author names or the current agent's identity alone. Resolve model availability when invoked and report unavailable reviewers rather than silently substituting. No fixed model IDs are configured here. `council` retains its three-provider default.
- In T3 Code, use its delegation and PR-watch lifecycle as directed by the active harness. Skill fallbacks apply only when the harness allows them. Link created or updated PRs to the thread; stop watching at handoff.
- Keep reviews and fixes within the issue's goal. Lead PR descriptions with the problem and resulting behavior, include observed verification, and link the relevant issue. Keep unrelated findings as follow-ups, filed as issues on the relevant tracking issue rather than left in PR text.
- Wait for **Full browser suites** before merging whenever it runs on a PR, even though it is not a required check. See [browser acceptance](docs/ci.md#full-browser-acceptance).
- Push a new branch by explicit name, as in `git push -u origin HEAD:refs/heads/<branch>`. A branch created from `origin/main` tracks it, so a plain `git push` can target `main`.
- Keep repo-specific workflow preferences in this file. The vendored skills, their source revision, license, and update guidance are documented in [.agents/README.md](.agents/README.md).
