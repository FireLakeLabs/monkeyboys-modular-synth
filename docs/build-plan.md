# Build plan

Foundations first; visual polish late. Each step has a matching GitHub issue.
This file owns application implementation status. Specs define contracts;
verification reports record dated observations, not continuously retested claims.

## Current status and remaining work

Reconciled 2 November 2026 against main at `bebe452` and GitHub issue state.
The foundation spikes and build steps #3–#8 are implemented and closed. The
public [AWS deployment](https://mms.firelakelabs.com) shipped in #22; its
[deployment evidence](deployment-verification.md) records the initial rollout,
OIDC publishing, hosted playback and rollback without implying every later UI
feature was reverified on the public host.

- **Shipped follow-ups:** [PR #34](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/34)
  completed and closed #9–#11; see [interaction acceptance](interaction-verification.md).
  #35's [imported structural edits](structural-edit-verification.md), #36's
  [audio recovery](audio-recovery.md), #37's [activity/source feedback](feedback-verification.md),
  #44's [bounded reader placement](error-verification.md#long-imported-voices-44),
  #45's [patch library](patch-library.md) and #46's [trance demo](trance-demo.md)
  are also implemented and closed.
- **Open acceptance owner:** [#12](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/12)
  remains open in GitHub. Its [parser/draft and replacement baseline](error-verification.md)
  is verified; #36 subsequently supplied observable resource/output failures,
  guarded Stop and a rerun of the acceptance suite. The remaining issue-level
  reconciliation/closure must use those results, not repeat completed #4/#6/#8
  integration. This documentation change does not close #12.
- **Next usability work:** [#188](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/188) orders the [usability review](usability-review.md)
  follow-ups. Start with its first wave, which needs no design decisions.
- **Supported limits:** imported mutations outside the
  [preservation matrix](translation-rules.md#imported-structural-edits-35) are
  refused; ambiguous external edits may reset affected layout. Samples have no
  universal readiness guarantee or resource-specific retry. Runtime errors have
  no proven line/module mapping. Stop ends scheduling, while notes/tails may
  finish; arbitrary evaluation and side effects cannot be cancelled or rolled
  back. Pending asynchronous evaluation can require export/reload; synchronous
  main-thread blocking can require browser-level termination.
- **Verification still limited:** reports distinguish exact source, saved rack
  identity, Strudel events and measured WebAudio PCM. Physical speakers/headphones
  were not heard; universal audible equivalence, subjective continuity and broad
  browser/device/autoplay coverage are unverified. Browser suites require Chromium
  plus external resources; the separate [browser workflow](ci.md#full-browser-acceptance)
  runs them after every main push. Imported JavaScript is not sandboxed.
- **Deferred or separately tracked:** [v1 exclusions](v1-scope.md#later-deliberately-not-v1)
  include touch, keyboard patching/screen-reader support, beginner aids and accounts.
  [#39](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/39) tracks
  the [CDK tooling advisory disposition](cdk-advisory.md);
  [#47](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/47) tracks
  another library collection. Neither is completed by this status reconciliation.

## Early public hosting

[Issue #22](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/22)
deploys the existing module library and fixed Play/Stop demo independently of
the feature work below. This repository owns its separate AWS hosting stack;
see [deployment operations](deployment.md) and [verification evidence](deployment-verification.md).
The reader/engine spikes and feature dependency order remain unchanged.

## Build order

1. **Module catalog.** `src/modules/catalog.ts` holds every v1 module as data (controls, ranges, defaults, jacks, Strudel functions). _Started in the initial commit, with integrity tests._
2. **Patch → code generator (#3, implemented).** Pure `generate(patch) → string` in `src/codegen/generate.ts`, following [`translation rules`](translation-rules.md#rack-generator-contract-3). Tests cover every v1 module, CV routing (LFO and ENV into VCF and VCA), fan-out/dependency naming, nested mixer channels, omitted defaults, CODE preservation, per-voice routing and the source-bound layout block. Imported-document reading/editing and playback are integrated in the later steps below.
3. **Play through Strudel (#4, implemented).** The top-bar transport plays generated patch state, applies value changes without restarting scheduling, and controls OUT VOL at the engine output. Sample maps load before first evaluation. Its original cutoff/tempo/volume fixture preceded the rack controls shipped in step 4. Queued edits respect Stop, surfaced construction failures request Stop, and structural replacements clear old effect buses. See [browser signal evidence, reproduction and listening limits](playback-verification.md).
4. **Rack UI in one look (#5, implemented).** Catalog-driven panels in `src/rack/`, with 12 px/HP rails, placement/movement, measured sagging cables, validated connections and replacement, selection/source highlights, typed and dragged values, sequencer/drum/text controls, deletion, and a silent New patch. See [reproduction and browser evidence](rack-verification.md). Code import and two-way editing are implemented in steps 5/7.
5. **Code → patch reader (#6, implemented).** `read` in `src/reader/` parses with `acorn`, maps catalog-owned chains and CV, retains exact source/bindings beside the graph, and falls back to CODE. `generate(read(code))` saves the retained document; generated files also restore complete saved rack state after validation, while externally edited files reconcile only unambiguous identities. See [source, rack and Strudel event evidence and limits](reader-verification.md). Live workspace editing and source-aware mutations are integrated in step 7 below.
6. **Looks (#7, implemented).** Layout rules and tokens for all ten looks in `src/looks/`, family-wide changes, and a module context menu with duplicate/show/delete. All 61 module/look combinations retain catalog widths; cables follow measured jack positions. See [video and browser evidence](workspace-verification.md).
7. **Workspace polish (#8, implemented).** Editable fan-out names, source-bound layout writes, live code/rack editing, exact draft export/open, parser diagnostics and explicit runtime recovery. Imported literal and safe name edits preserve source; structural edits without a preservation plan are refused. See [contracts, videos and remaining engine limits](workspace-verification.md).

## Instrument feel

Issues #81, #82, #84, #92, #94 and #95 share the compact numeric controls,
keyboard slider semantics, minimum panel typography, enlarged jack targets and
rack zoom described in [design](design.md#panel-controls-and-rack-zoom-81-82-84-92-94-95).
See the [61-combination browser matrix and screenshot evidence](rack-feel-verification.md).
Catalog widths and saved positions remain unchanged.

Issues #89 and #90 polish the module menu and add scheduled-event SEQ/DRUMS grid
feedback, including steady reduced-motion outlines. See the [contract](design.md#module-menu-and-grid-activity-89-90)
and [separate browser proof](feedback-verification.md#module-menu-and-step-playheads-89-90).

Issues #85, #86, #96 and #88 add Instrument category bands under the #58
decision, readable dimmed panels for modules without a path to OUT, signal
stroke/jack markings and hover/selection/global cable fading. See the
[design contract](design.md#rack-visual-hierarchy-85-86-96-88) and
[browser acceptance](rack-visuals-verification.md).

## Built-in patch library

Issues #61, #83, #93, #71 and #87 refine replacement, placement, keyboard file
opening, Strudel sharing and the single header transport. See the
[contracts](design.md#app-chrome) and
[browser, signal and regression evidence](workspace-trust-verification.md).

[Issue #45](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/45)
adds a modal browser of nested collections, exact source/attribution and nine
module exercise patches. It reuses the source-preserving reader and shared
New/Open replacement confirmation, validates before Stop, and never autoplays.
See [adding entries, loading/persistence and browser verification](patch-library.md).

[Issue #46](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/46)
adds the exact supplied Switch Angel/cosimo trance demo under Complete patches →
Trance. It also reads the engine's `setCpm` tempo alias without rewriting it.
See [source, pinned-engine compatibility and separate verification](trance-demo.md).

Issue #75 implements the [#55 library ownership decision](patch-library.md#rack-ownership-55-and-75):
all nine module exercises are authored as rack-owned files, while attributed
showcases retain exact source and offer explicit conversion at a refused edit.
See [independent source/rack/event and browser evidence](library-rack-verification.md).
Global [undo/redo](undo-redo.md) is implemented separately under #63.

## Explicit code application

Issue #70 implements the #56 decision: Ctrl/Cmd+Enter accepts code and starts
stopped playback; Ctrl/Cmd+. stops globally. Since #180, finished code applies by
itself while stopped, and a session-only toggle extends that to playback. Rack edits remain immediate;
file loading and recovery remain silent. See the [contract and browser/signal
evidence](code-application.md), including preserved #12 error/recovery behavior.

Issue #73 consolidates sync, cursor, engine status and error/recovery messages
into one editor footer, with engine caveats behind an info disclosure. See the
[contract and browser evidence](editor-status-verification.md).

## Local workspace recovery

Issue #60 adds [local workspace recovery](patch-format.md#local-workspace-recovery-60):
accepted source and exact draft text share one browser-local recovery copy.
A reload restores that copy silently and offers Start new; restoring keeps
audio stopped. Storage failure leaves editing/export available and an unsaved
draft requests the browser's departure warning. `scripts/autosave-check.mjs`
checks reload/close, exact source/rack identity, draft recovery, Start new and
restricted storage separately from the deterministic gate.

## Activity and source feedback

[Issue #37](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/37)
completes event-timed Alien/Instrument feedback, editing-only Cyber blinking,
reduced motion and category/family code styling with all owned selection spans.
The CodeMirror editor retains exact draft text, selection, scrolling and IME input.
See the [attribution contract and browser evidence](feedback-verification.md).

## Source-preserving structural edits

[Issue #35](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/35)
extends the workspace with explicit plans for conservative imported chain edits
and independent voice connection/disconnection. Reader validation proves planned
ownership and saved graph identity before acceptance. See the
[supported matrix](translation-rules.md#imported-structural-edits-35) and
[source, event, saved-state and browser evidence](structural-edit-verification.md).

## Source editor adoption

The [#53 CodeMirror spike](editor-spike.md) recommends plain CodeMirror 6,
with event/source mapping behind the engine and accepted-document undo ownership.
#59 adopts it as a lazy editor, applies minimal rack rewrites, memoizes source
styles and checkpoints draft history on acceptance. The [adoption evidence](editor-adoption.md)
records Chromium composition, reduced motion and all three production browser suites.
#68 adds [protected metadata folding](metadata-folding.md), retaining the full v1
file for Copy/Export/Open/paste and keeping EOF diagnostics on code lines.
#72 adds [sounding token marks](sounding-tokens.md) through engine-timed source feedback
and a CodeMirror StateField. #63 adds [accepted-document undo/redo](undo-redo.md),
including saved rack identity, draft checkpoints, knob gesture grouping and live
playback restoration. #69 adds [opener diagnostics and gutter markers](error-positions.md).
Physical OS IMEs and broad device coverage remain unverified.

## Prove early

These were the two foundational unknowns, resolved before the production work
that depended on them. The reports retain the original spike scope and results.

- **Round-tripping code — spike decided (#1/#14).** Retain the original source and Acorn ranges; splice supported edits and reconcile layout with stable IDs plus conservative syntax matching. [Evidence and limits](source-preservation-spike.md). Production catalog mapping, saved identity and supported event checks are recorded in [reader evidence](reader-verification.md); conservative structural plans are covered by #35 below.
- **Embedding the engine (#2, investigated 2 November 2026).** The real browser
  probe confirms `$:` lines and shared `const` declarations work through
  `evaluate`, and repeated parameter edits replace the running pattern without
  resetting its scheduler. The adapter now initializes audio explicitly after
  lazy import, resumes its context, registers pinned default and TR808/TR909
  sample maps in `prebake`, rejects reported evaluation errors, and orders
  Play/Stop operations. Per-event activity is available through
  `pattern.onTrigger(callback, false)`; pass `false` to keep audio enabled and use
  the target audio time to schedule visuals. Production playback and module/source activity mapping are covered by #4 and #37.
  Syntax and expression-construction failures leave the previous pattern
  scheduling, but arbitrary JS side effects are not rolled back; late
  sample/output errors are a separate failure class. Stop ends scheduling;
  existing notes and effect tails can ring out. See [reproduction, signal
  evidence and verification limits](engine-spike.md). Production playback/workspace integration is recorded in steps 3/7; #12’s
  remaining acceptance status is summarized above.

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

- **Orbits (#13, decided).** One dedicated orbit per final voice, including dry voices; no sharing by equal settings. Append routing on final branches, preserve imported routing, and reset old buses when topology changes reassign them. See [effect-orbit contract](translation-rules.md#effect-orbits). The #3 generator allocates routing and #4 playback resets structural buses; see [playback evidence](playback-verification.md).
- **Layout block matching — decided (#14).** Stable IDs with conservative matching replace derived chain addresses. Ambiguous repeats auto-place; see [`patch-format.md`](patch-format.md#matching-rules). The reader/workspace now restore validated complete saved state, including disconnected modules and empty rails; see [saved-state evidence](reader-verification.md#saved-state) and [row persistence](interaction-verification.md#saved-rows-and-source-preservation).
- **Sample sources (#2, decided).** Register pinned Dirt-Samples and tidal-drum-machines manifests on first engine use, with pinned audio bases. Audio files load lazily; use browser HTTP caching, with no app-managed offline cache. See [sample sources and failure behavior](engine-spike.md#samples-and-deployment).
- **Types for `@strudel/web`.** The package ships without TypeScript types; `src/strudel/strudel-web.d.ts` declares the few functions used.

## Palette and first-session collection (#79/#80)

The palette groups catalog-owned Strudel call chips by category, with family
badges and name/call filtering. The first library collection, Start here, follows
the workshop’s four-stage order with original generator-style exercises and
one-line try-this edits. Existing guarded loading and exact-source showcases keep
their contracts. See [acceptance evidence](on-ramp-verification.md).

## CODE ownership conversion

Issue #78 adds explicit single-module conversion offers for saved CODE owners
recognized by the current reader. Conversion retains executable source and
unrelated rack state, participates in accepted-document undo/redo, and requires
independent saved-identity validation before an offer appears. See the
[contract](translation-rules.md#explicit-code-conversion-78) and
[unit/event and browser evidence](code-conversion-verification.md).

## Patch names

Issue #62 adds an editable header name, library titles and named Export/Open
through optional v1 rack metadata. See the [contract](patch-format.md#patch-names-62)
and [unit/browser evidence](patch-names-verification.md).

## Generalized modulation (#130)

Catalog CV targets accept SMOOTH/STEP LFO, ENV and CV SEQ. OSC adds pitch CV;
S&H, ATTENUVERTER and MOD MIX expose pattern modulation utilities. Existing
signals and native envelopes retain source and saved identity. See the
[contract and independent source/rack/event/browser PCM proof](modulation-verification.md).

## Sound sources and effects (#131)

Eleven Hardware panels extend the catalog with noise, additive/FM synthesis and
voice effects, plus HARMONIC drawbars and the OSC FM jack. Exact imported source,
saved CODE/rack identity and pinned-engine events have separate checks; see the
[contract, engine limits and SHIFT cost](module-spec.md#sound-sources-and-voice-effects-131)
and [acceptance record](sound-effects-verification.md). These effects integrate
with merged #134: native matching paths, inline reordered/repeated stages, and
source-preserved native imports.

## Pattern visibility (#139)

Readable cable probes, the real scheduler cycle clock, Hardware SCOPE and source
credits are implemented with separate source/rack/event and real-browser proof.
The [acceptance record](pattern-visibility-verification.md) documents the safe
prefix boundary, metadata/name precedence, native analyser limits and motion
behavior. Routing (#136), cartridges (#137) and sound-crate work (#138) remain
separate wave-four work items.

## Sound crate and sample-fed panels (#138)

After merged #137, the SOUNDS drawer browses seated factory/user inventories and
variants and auditions through the engine without starting transport. DRUMS,
SMPL, REVERB IR, SPLICE and WAVETABLE share source-aware drop edits; SMPL tape
marks edit begin/end/loop points. The catalog owns new controls and fixed-width
Hardware panels. See the [decisions, independent round trips and browser proof](sound-crate.md).

## Connection discovery (#233)

Hover/focus compatibility and cable-to-empty-rail connected-module placement
share the source-aware connection assessment. The chooser is catalog-backed,
works from inputs or outputs and commits placement plus wiring as one history
step. See [contract](design.md#jack-discovery-and-connected-placement-233) and
[verification](jack-discovery-verification.md).

## User-defined-module research (#247)

The [bounded register/subpatch study](research/user-defined-modules/README.md)
provides parse-only discovery/source/identity probes and separate pinned-engine
event experiments. It recommends original-call wrappers as #217's first
production increment. No custom-panel implementation, MIX change, consolidation
or format extension ships in this research; #217 retains its implementation and
browser acceptance, while macro authoring/encapsulation/portability remain
explicit later proposals.
