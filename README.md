# MonkeyBoy’s Modular Synth

Patch a modular synth, read the Strudel. A Fire Lake Labs project — [firelakelabs.com](https://firelakelabs.com).

MonkeyBoy’s Modular Synth is a web app that teaches modular synthesis and [Strudel](https://strudel.cc) side by side. You build a patch in a virtual rack — pull in modules, connect them with cables, turn knobs — and see the exact Strudel code that patch produces. It works the other way too: paste Strudel code and the app builds the matching patch.

## Status

Pre-alpha. The design is settled enough to build the foundations; see [`docs/`](docs/) for what is decided and what is still open.

## Docs

| Doc | What it covers |
| --- | --- |
| [`docs/decisions.md`](docs/decisions.md) | Everything locked in so far |
| [`docs/v1-scope.md`](docs/v1-scope.md) | The first 16 modules, motion defaults, and what is deliberately later |
| [`docs/translation-rules.md`](docs/translation-rules.md) | How a patch becomes Strudel code and back |
| [`docs/module-spec.md`](docs/module-spec.md) | Every v1 module: controls, ranges, defaults, jacks, and the Strudel it writes |
| [`docs/patch-format.md`](docs/patch-format.md) | The patch data model and the layout comment saved with the code |
| [`docs/design.md`](docs/design.md) | Where the design canvas lives and what each board shows |
| [`docs/build-plan.md`](docs/build-plan.md) | Build order and the design work still open |

## Getting started

Requires Node 20 or newer.

```bash
npm install
npm run dev        # start the dev server
npm test           # run the unit tests
npm run typecheck  # type-check the project
npm run build      # production build
```

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

Code generation (`src/codegen/`), the code reader (`src/reader/`), the rack UI (`src/rack/`) and the look system (`src/looks/`) arrive in that order — see [`docs/build-plan.md`](docs/build-plan.md).

## Agent workflows

[`AGENTS.md`](AGENTS.md) maps development tasks to the project specs and the nine
project-local [tstack skills](.agents/README.md). Use “full stop” to prepare a PR
for your merge, “full send” to carry it through merge, “sol loop” for a Sol
review, or “council” for a review across three providers. See the agent guide
for the remaining workflows and verification expectations.

## Licence

Not yet chosen. This repository is private. Note that Strudel is licensed AGPL-3.0-or-later, which will matter when a licence is picked.
