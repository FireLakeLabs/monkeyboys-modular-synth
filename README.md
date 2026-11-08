# MonkeyBoy’s Modular Synth

Patch a modular synth, read the Strudel. A Fire Lake Labs project — [firelakelabs.com](https://firelakelabs.com).

MonkeyBoy’s Modular Synth teaches modular synthesis and [Strudel](https://strudel.cc) side by side. Build a patch in the editable rack or edit its Strudel source; supported changes flow both ways, and unsupported code is preserved in CODE blocks.

## Status

Pre-alpha, publicly hosted at [mms.firelakelabs.com](https://mms.firelakelabs.com).
The workspace includes rack patching, code generation/import, live playback,
all ten looks, two-way source editing, file export/open and a built-in patch
library. New patches start silent; Play is explicit.

The [build plan](docs/build-plan.md#current-status-and-remaining-work) owns current
implementation status, remaining limitations and verification links. Imported
rack edits require a source-preservation plan. Browser PCM evidence does not
establish physical listening or universal audible equivalence; playback executes
JavaScript without a sandbox. See the [audio boundaries](docs/audio-recovery.md).

## Docs

| Doc                                                      | What it covers                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/decisions.md`](docs/decisions.md)                 | Everything locked in so far                                                   |
| [`docs/v1-scope.md`](docs/v1-scope.md)                   | The first 16 modules, motion defaults, and what is deliberately later         |
| [`docs/translation-rules.md`](docs/translation-rules.md) | How a patch becomes Strudel code and back                                     |
| [`docs/module-spec.md`](docs/module-spec.md)             | Every v1 module: controls, ranges, defaults, jacks, and the Strudel it writes |
| [`docs/patch-format.md`](docs/patch-format.md)           | The patch data model and the layout comment saved with the code               |
| [`docs/design.md`](docs/design.md)                       | Where the design canvas lives and what each board shows                       |
| [`docs/build-plan.md`](docs/build-plan.md)               | Implementation status, build order and remaining work                         |

## Getting started

Use the exact Node 24 release in [`.node-version`](.node-version). The check
command rejects a different version; `.npmrc` also enforces the supported engine
range during installation.

```bash
npm ci             # install the exact dependencies from the lockfile
npm run dev        # start the dev server
npm run check      # the complete local and CI gate
npm test           # run the unit tests
npm run typecheck  # type-check the project
npm run build      # type-check and production build
npm run format     # apply repository formatting
```

The [standards inventory](docs/standards.md) describes each check and its limits.
See [CI status and verification](docs/ci.md) for the observed GitHub merge-gate configuration.

## Stack

- React + TypeScript, built with Vite
- [`@strudel/web`](https://www.npmjs.com/package/@strudel/web) for the sound engine
- Vitest for unit tests

## Layout

```
src/
  modules/   module catalog: the single source of truth for every module
  patch/     patch data types and fixed-rail layout rules
  codegen/   graph validation, Strudel generation and rack metadata
  reader/    source-preserving import and saved-state reconciliation
  rack/      catalog-driven panels, controls, placement and cables
  looks/     family look layouts and styles
  workspace/ source documents, safe edits, highlighting and replacement
  library/   built-in collections, Strudel patches and loading UI
  strudel/   engine adapter, transport and event activity
  App.tsx    shared rack/source workspace and application state
docs/        contracts, build status and dated verification evidence
scripts/     guardrails, browser verification and deployment tooling
infra/       independent AWS hosting stack
```

The [build plan](docs/build-plan.md#build-order) owns implementation status and dependency order; the detailed reports retain their original verification scope.

## Agent workflows

[`AGENTS.md`](AGENTS.md) maps development tasks to the project specs and the
project-local [tstack workflows and adapted pstack standards](.agents/README.md). Use “full stop” to prepare a PR
for your merge, “full send” to carry it through merge, “review loop” to select a
reviewer using the project policy, “sol loop” or “opus loop” to choose the reviewer,
or “council” for a review across three providers. See the agent guide
for the remaining workflows and verification expectations. The
[standards inventory](docs/standards.md) records enforcement and remaining gaps;
the [pstack adoption review](.agents/pstack-review.md) explains the selection.

## Licence

See [LICENSE](LICENSE) for this project’s MIT license. Strudel is a separately licensed dependency under AGPL-3.0-or-later.
