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
2. **Patch → code generator (#3, implemented).** Pure `generate(patch) → string` in `src/codegen/generate.ts`, following [`translation rules`](translation-rules.md#rack-generator-contract-3). Tests cover every v1 module, CV routing (LFO and ENV into VCF and VCA), fan-out/dependency naming, nested mixer channels, omitted defaults, CODE preservation, per-voice routing and the source-bound layout block. Imported-document edits and production reading remain #6; playback integration remains #4.
3. **Play through Strudel (#4, implemented).** The top-bar transport plays generated patch state, applies value changes without restarting scheduling, and controls OUT VOL at the engine output. Sample maps load before first evaluation. A small playback fixture exposes cutoff/tempo/volume while rack editing remains step 4. Queued edits respect Stop, surfaced construction failures request Stop, and structural replacements clear old effect buses. See [browser signal evidence, reproduction and listening limits](playback-verification.md).
4. **Rack UI in one look (#5, implemented).** Catalog-driven panels in `src/rack/`, with 12 px/HP rails, placement/movement, measured sagging cables, validated connections and replacement, selection/source highlights, typed and dragged values, sequencer/drum/text controls, deletion, and a silent New patch. See [reproduction and browser evidence](rack-verification.md). Code import and two-way editing remain steps 5/7.
5. **Code → patch reader (#6, implemented).** `read` in `src/reader/` parses with `acorn`, maps catalog-owned chains and CV, retains exact source/bindings beside the graph, and falls back to CODE. `generate(read(code))` saves the retained document; generated files also restore complete saved rack state after validation, while externally edited files reconcile only unambiguous identities. See [source, rack and Strudel event evidence and limits](reader-verification.md). Live workspace editing and source-aware mutations are integrated in step 7 below.
6. **Looks (#7, implemented).** Layout rules and tokens for all ten looks in `src/looks/`, family-wide changes, and a module context menu with duplicate/show/delete. All 61 module/look combinations retain catalog widths; cables follow measured jack positions. See [video and browser evidence](workspace-verification.md).
7. **Workspace polish (#8, implemented).** Editable fan-out names, source-bound layout writes, live code/rack editing, exact draft export/open, parser diagnostics and explicit runtime recovery. Imported literal and safe name edits preserve source; structural edits without a preservation plan are refused. See [contracts, videos and remaining engine limits](workspace-verification.md).

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
The #9–#11 value, cable and module flows are implemented; see the
[acceptance audit and browser evidence](interaction-verification.md). Empty rows
now persist in optional v1 metadata. The [#12 production error audit](error-verification.md)
adds revision-owned diagnostics, pending warnings and guarded Open/New replacement.
The [#36 recovery contract and browser evidence](audio-recovery.md) integrate
late resource/output reporting and guarded Stop without waiting for evaluation.
Uninterruptible JavaScript and universal resource readiness remain explicit engine
boundaries; the #12 browser acceptance suite has been rerun against this contract.

## Technical questions

- **Orbits (#13, decided).** One dedicated orbit per final voice, including dry voices; no sharing by equal settings. Append routing on final branches, preserve imported routing, and reset old buses when topology changes reassign them. See [effect-orbit contract](translation-rules.md#effect-orbits). Implementation remains #3/#4.
- **Layout block matching — decided (#14).** Stable IDs with conservative matching replace derived chain addresses. Ambiguous repeats auto-place; see [`patch-format.md`](patch-format.md#matching-rules). Non-sounding saved state remains open.
- **Sample sources (#2, decided).** Register pinned Dirt-Samples and tidal-drum-machines manifests on first engine use, with pinned audio bases. Audio files load lazily; use browser HTTP caching, with no app-managed offline cache. See [sample sources and failure behavior](engine-spike.md#samples-and-deployment).
- **Types for `@strudel/web`.** The package ships without TypeScript types; `src/strudel/strudel-web.d.ts` declares the few functions used.
