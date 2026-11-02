# MonkeyBoy’s Modular Synth

Patch a modular synth, read the Strudel. A Fire Lake Labs project — [firelakelabs.com](https://firelakelabs.com).

MonkeyBoy’s Modular Synth is being built to teach modular synthesis and [Strudel](https://strudel.cc) side by side. The intended workspace lets you build a patch in a virtual rack and edit the equivalent Strudel code, with changes flowing both ways.

## Status

Pre-alpha. The app currently renders the module catalog, a placeholder rack, and a fixed Strudel demo with play/stop controls. Editable rack patching, code generation, and code import are not implemented yet. See the [build plan](docs/build-plan.md) for implementation order and unresolved research.

## Docs

| Doc                                                      | What it covers                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/decisions.md`](docs/decisions.md)                 | Everything locked in so far                                                   |
| [`docs/v1-scope.md`](docs/v1-scope.md)                   | The first 16 modules, motion defaults, and what is deliberately later         |
| [`docs/translation-rules.md`](docs/translation-rules.md) | How a patch becomes Strudel code and back                                     |
| [`docs/module-spec.md`](docs/module-spec.md)             | Every v1 module: controls, ranges, defaults, jacks, and the Strudel it writes |
| [`docs/patch-format.md`](docs/patch-format.md)           | The patch data model and the layout comment saved with the code               |
| [`docs/design.md`](docs/design.md)                       | Where the design canvas lives and what each board shows                       |
| [`docs/build-plan.md`](docs/build-plan.md)               | Build order and the design work still open                                    |

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
  patch/     patch data types (modules placed in the rack, cables, looks, names)
  strudel/   thin wrapper around the Strudel engine (init, play, stop)
  App.tsx    app shell
docs/        design decisions and specs
```

The [build plan](docs/build-plan.md#build-order) owns the implementation order for code generation, playback, rack UI, code import, and looks.

## Agent workflows

[`AGENTS.md`](AGENTS.md) maps development tasks to the project specs and the
project-local [tstack workflows and adapted pstack standards](.agents/README.md). Use “full stop” to prepare a PR
for your merge, “full send” to carry it through merge, “sol loop” for a Sol
review, or “council” for a review across three providers. See the agent guide
for the remaining workflows and verification expectations. The
[standards inventory](docs/standards.md) records enforcement and remaining gaps;
the [pstack adoption review](.agents/pstack-review.md) explains the selection.

## Licence

See [LICENSE](LICENSE) for this project’s MIT license. Strudel is a separately licensed dependency under AGPL-3.0-or-later.
