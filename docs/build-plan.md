# Build plan

Foundations first; visual polish late. Each step has a matching GitHub issue.

## Early public hosting

[Issue #22](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/22)
deploys the existing module library and fixed Play/Stop demo independently of
the feature work below. This repository owns its separate AWS hosting stack;
see [deployment operations](deployment.md) and [verification evidence](deployment-verification.md).
The reader/engine spikes and feature dependency order remain unchanged.

## Build order

1. **Module catalog.** `src/modules/catalog.ts` holds every v1 module as data (controls, ranges, defaults, jacks, Strudel functions). _Started in the initial commit, with integrity tests._
2. **Patch → code generator.** A pure function `generate(patch) → string`, following [`translation-rules.md`](translation-rules.md). Done when unit tests cover every module, CV routing (LFO and ENV into VCF and VCA), fan-out naming, several mixer channels, omitted defaults and the layout block.
3. **Play through Strudel.** Wire `src/strudel/engine.ts` to the generator: play, stop, re-evaluate when values change. Load sample banks at start-up. Done when a patch built in code plays in the browser and a value change is heard without restarting.
4. **Rack UI in one look.** Render modules from the catalog in a single look (Instrument is the most neutral), with cables drawn from live jack positions, selection, typed values and knob gestures (see below). Done when every v1 module can be placed, patched and adjusted.
5. **Code → patch reader.** Parse Strudel with `acorn`, retain source and ranges alongside the graph, walk chains, map calls through the catalog, fall back to CODE blocks. The source-aware document is required in addition to `Patch` for exact preservation. Done when round-trip tests pass: `generate(read(code))` reproduces `code` for generated code, and hand-written examples import without changing their sound.
6. **Looks.** Layout rules for all ten looks; the right-click menu with “use for all”. Done when every module renders in every look in its family and cables follow.
7. **Workspace polish.** Fan-out name tags and renaming, the layout comment block read and written, live two-way editing with sensible behaviour while code is half-typed.

## Prove early

These are the two biggest unknowns. Spike them before or alongside steps 2–3.

- **Round-tripping code — spike decided (#1/#14).** Retain the original source and Acorn ranges; splice supported edits and reconcile layout with stable IDs plus conservative syntax matching. [Evidence and limits](source-preservation-spike.md). Production catalog mapping, structural edits, and sound checks remain #3/#6 work.
- **Embedding the engine (#2, investigated 2 November 2026).** The real browser
  probe confirms `$:` lines and shared `const` declarations work through
  `evaluate`, and repeated parameter edits replace the running pattern without
  resetting its scheduler. The adapter now initializes audio explicitly after
  lazy import, resumes its context, registers pinned default and TR808/TR909
  sample maps in `prebake`, rejects reported evaluation errors, and orders
  Play/Stop operations. Per-event activity is available through
  `pattern.onTrigger(callback, false)`; pass `false` to keep audio enabled and use
  the target audio time to schedule visuals. Module/source mapping remains #4.
  Syntax and expression-construction failures leave the previous pattern
  scheduling, but arbitrary JS side effects are not rolled back; late
  sample/output errors are a separate failure class. Stop ends scheduling;
  existing notes and effect tails can ring out. See [reproduction, signal
  evidence and verification limits](engine-spike.md). Generator integration and
  production interaction states remain #4/#8/#12.

## Interaction design handoff

The owner has selected the five UX choices for #9–#12: typed values plus knob
dragging with Shift fine control and double-click reset; Replace / Cancel for
occupied inputs; deletion without auto-bridging; a silent MIX → OUT starter;
and request Stop after a surfaced runtime failure. Touch remains later.
See [decisions](decisions.md#interaction-policy), [v1 value input](v1-scope.md#value-input),
and the [detailed interaction handoff](interaction-proposal.md).

The handoff covers cable target states and explanations, placement/full rows,
deleting modules, half-typed code, audio activation, samples and runtime errors.
Production behavior remains #5/#8 work, following the generator/reader/engine
dependency order above. Owner approval does not close the remaining persistence,
source-mapping, late-error or cancellation gaps recorded in the handoff.

## Technical questions

- **Orbits (#13, decided).** One dedicated orbit per final voice, including dry voices; no sharing by equal settings. Append routing on final branches, preserve imported routing, and reset old buses when topology changes reassign them. See [effect-orbit contract](translation-rules.md#effect-orbits). Implementation remains #3/#4.
- **Layout block matching — decided (#14).** Stable IDs with conservative matching replace derived chain addresses. Ambiguous repeats auto-place; see [`patch-format.md`](patch-format.md#matching-rules). Non-sounding saved state remains open.
- **Sample sources (#2, decided).** Register pinned Dirt-Samples and tidal-drum-machines manifests on first engine use, with pinned audio bases. Audio files load lazily; use browser HTTP caching, with no app-managed offline cache. See [sample sources and failure behavior](engine-spike.md#samples-and-deployment).
- **Types for `@strudel/web`.** The package ships without TypeScript types; `src/strudel/strudel-web.d.ts` declares the few functions used.
