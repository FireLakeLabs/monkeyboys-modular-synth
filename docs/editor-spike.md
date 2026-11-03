# CodeMirror editor spike (#53)

**Go: adopt plain CodeMirror 6 in #59.** The main unknown is resolved: real
Strudel events can light their original mini-notation tokens while audio output
continues. This PR keeps a reusable, opt-in prototype; it does not replace the
production textarea. Verified 3 November 2026 on Linux, Node 24.22.2, Chromium
156, 1280 × 800. The archived design boards were available; the private live
canvas was not accessed.

## Reproduce

```sh
npm ci
npm run dev
# Open http://localhost:5173/scripts/editor-spike.html
```

The prototype accepts the SourceEditor source/document/selected/invalid and
change/composing/editingModule contracts. The intentional incompatibility is
`editor`: it is an `EditorView` ref, not an `HTMLTextAreaElement` ref. #59 must
migrate App's caret and Show in code callers instead of pretending a CodeMirror
view supports textarea methods. The prototype lives in
[CodeMirrorSourceEditor](../src/spikes/CodeMirrorSourceEditor.tsx), with an
[example caller](../src/spikes/editor-main.tsx). No production App import reaches
it. CodeMirror packages are development dependencies for this spike.

On a fresh page, run this in the browser console:

```js
await (await import('/scripts/editor-probe.mjs')).probe()
```

The [probe](../scripts/editor-probe.mjs) checks 20 editor behaviors and restores
the initial source. Separately click Play, observe the orange mini-notation
marks, then Stop. Playback needs network access to the existing pinned sample
manifests, even though this fixture uses synths. Never confuse the probe's
synthetic composition events with native IME verification.

For an optimized comparison build:

```sh
MMS_EDITOR_SPIKE=1 npm run build
MMS_EDITOR_SPIKE=1 npm run preview -- --port 4173
# /scripts/editor-spike.html
# /scripts/editor-cost.html?editor=textarea
# /scripts/editor-cost.html?editor=cm
```

The environment flag adds the two spike HTML entries and disables the preview
HTTP cache for measurement. An ordinary build ships neither page nor CodeMirror.

## 1. Event highlighting: demonstrated

Strudel's [REPL manual](https://live.strudel.cc/technical-manual/repl/) describes
mini-notation locations attached to haps. The installed `@strudel/core` 1.2.6
uses `hap.context.locations: {start, end}[]`; these are UTF-16 offsets, matching
CodeMirror and Acorn. The prototype does not infer tokens from note values or
rack module ranges.

`play(source, {sourceFeedback})` is an opt-in adapter API in
[engine.ts](../src/strudel/engine.ts). It validates upstream locations, reverses
the offsets introduced by the existing module-activity observers, and delivers
`{source, spans}` at the scheduled AudioContext time through the existing
revision/cancellation gate. No raw hap reaches the editor. Stop, replacement or
failure invalidate pending delivery; unreadable source can still play with
identity location mapping. Instrumentation never enters the draft or saved file.

Observed in the real browser: nested `c3 [e3 g3]*2 c4`, ITER, JUX, independent
later voices, and the opaque `.chunk(...)` voice produced original-source token
marks. Instrumentation before later voices did not shift those marks. Musical
modifiers such as the mini-notation `2` also have Strudel locations, as do sound
names. Concurrent event marks accumulate for 120 ms rather than overwriting each
other. The saved source stayed exact. A WebAudio destination analyser measured
nonzero PCM (peak 0.2943 in the first run). **Speakers/headphones were not heard.**

The existing module-attribution policy remains conservative for CODE, but token
locations do not require a known rack owner. Arbitrary JS that strips/rebuilds
context may have no locations. Escaped/dynamically constructed strings, huge
programs and every Strudel transform are not universally certified by this
fixture. #59 must suppress marks while the draft differs from the evaluated
revision, clear on Stop/failure and honor reduced motion. This prototype has
revision guards and a reduced-motion CSS rule; runtime preference switching was
not exercised here.

## 2. Rack-driven rewrites: demonstrated

[editorChanges](../src/spikes/editorChanges.ts) uses `@codemirror/merge`'s plain
`diff`, converting disjoint changes to a CodeMirror transaction. This is not a
whole-document delete/insert or a single prefix/suffix splice. The rack caller
uses the real `editDocument`/`setValue` path, changing both executable cutoff and
saved metadata.

Observed: rewriting `.lpf(800)` to `.lpf(1800)` retained the backward selection
of `.lpq(2)`, mapping anchor/head 102/95 to 103/96. Both scroll positions stayed
120 px vertically and 80 px horizontally. The resulting editor document exactly
matched the accepted saved document. Show in code used `EditorSelection` and
`EditorView.scrollIntoView`; the selected range was inside the live viewport
without a fixed line height. A focused unit case additionally keeps an anchor
between two disjoint edits. Multi-range edits, very large diff fallback behavior
and scrolling through major structural rewrites still need production coverage.

## 3. The #37 contract: viable, with a native-IME acceptance gap

The unchanged `sourceTreatments()` spans and `sourceSegments()` precedence map
to `Decoration.mark` ranges. Browser computed styles confirmed orange Hardware
sound, teal Alien glow, dashed Cyber underline and orange named outputs. Selecting
VCF marked both `.lpf` and `.lpq`. The editingModule callback identified CODE
while its source had focus; the example Cyber indicator blinked then became
solid on blur. This proves the callback contract, not a rerun of every rack look.

Exact draft strings, astral Unicode, unfinished input and mixed LF/CRLF are
covered separately from graph identity or audio. `Text.of(source.split('\n'))`
is deliberate: default CodeMirror string ingestion normalizes line separators.
The browser composition-start/end check kept the reader in editing past the
250 ms debounce and retained Japanese text on commit. **These events were
synthetic; no native OS IME was driven.** Native IME (including composition-end
ordering, selection and rack acceptance), reduced-motion interaction and the
existing production feedback suite remain required in #59. This is a go on
technical feasibility, not production acceptance of the replacement.

The prototype intentionally uses a simple decoration compartment and fixture
controls. #59 should use revision-aware incremental decoration state, proper
editor lifecycle cleanup, and the real rack's editing indicator. Queued external
rewrites during composition are not a supported production path: rack mutation
must remain disabled while composing/editing.

## 4. Undo: app-owned accepted source documents

Recommend that #63 own a history of accepted source documents, including their
source-bound rack metadata. That represents deletion, cables, looks, names and
patch replacement as well as accepted code changes. Undo/redo must install the
source and graph together and use the normal playback update path. Restoring
only editor text would temporarily separate rack state and code and would not
represent external operations that never touch the editor.

CodeMirror history is useful for an in-progress, unaccepted draft only. The
prototype includes it to expose the boundary, not to implement app undo. Its
rack/read transactions use `addToHistory: false`; the unit experiment shows
native undo removes the typed edit while leaving the rack's new cutoff in place,
and has no rack transaction left to undo. Therefore default CodeMirror history
alone is insufficient **with this ownership policy**. It could record rack text
transactions, but the app would still have to restore/validate accepted rack and
playback state and define draft grouping/replacement boundaries.

#63 should intercept Ctrl/Cmd+Z consistently: undo draft edits locally while a
draft is unaccepted, then undo accepted documents at the app boundary; accepting
or replacing a document must reset/checkpoint local editor history so the same
change cannot be undone twice. Decide grouping and invalid-draft escape behavior
in #63. This spike does not implement that global history.

## 5. Folding and errors: demonstrated

A `foldService` recognizes the rack marker and collapses its following comment
payload to one placeholder on the marker line. The browser confirmed folding
left the full editable source intact. Ordinary JavaScript folding and line
numbers come from the standard language/gutter extensions.

The invalid `note(` fixture followed by metadata can make Acorn report EOF inside
the trailing block. The prototype caller clamps that diagnostic to the end of
executable source before rendering `setDiagnostics`/`lintGutter`; the browser
observed an error marker on `note(`, not on metadata. This is a presentation
experiment, not a parser change. #59 must derive the metadata boundary from the
reader's comment-aware representation: the prototype's literal marker lookup
is insufficient for marker-like text inside strings or nontrailing comments.

## 6. Cost and packages

The prototype uses plain MIT-licensed `@codemirror/*`: state 6.7.6, view 6.43.15,
commands 6.11.1, language 6.13.1, lang-javascript 6.2.5, lint 6.9.7 and merge
6.12.3, pinned by the lockfile. Their package manifests and
[CodeMirror source](https://github.com/codemirror/dev) supply the license evidence.
The comparison option [`@strudel/codemirror` 1.3.0](https://registry.npmjs.org/@strudel%2fcodemirror/1.3.0)
is AGPL-3.0-or-later and brings Strudel draw/tonal/transpiler plus Vim/Emacs/VSCode
keymaps and stores. Existing `@strudel/web` is already separately AGPL-licensed.
This is a dependency choice, not a legal conclusion about application licensing.
Use plain packages: existing engine ownership, category treatments and app history
do not need a second REPL/editor lifecycle. The extension's bundle was not built;
no measured size comparison with it is claimed.

Optimized Vite output for the identical editor-only comparison fixture:

| Item                                     |      Textarea | CodeMirror prototype |
| ---------------------------------------- | ------------: | -------------------: |
| Editor-specific JS chunk                 |       1.65 kB |            437.66 kB |
| Editor-specific JS, gzip                 |       0.82 kB |            148.30 kB |
| Total JS fetched by comparison page      | 387,011 bytes |        823,026 bytes |
| Navigation → verified mount, median of 5 |       45.9 ms |              71.0 ms |
| Observed range                           |  38.8–80.9 ms |         68.6–96.8 ms |

The added editor chunk costs about **436 kB raw / 147.5 kB gzip** in this fixture.
The default app's initial JS was 451.11 kB / 141.01 kB gzip before the spike and
451.95 kB / 141.29 kB afterward (the opt-in engine adapter); its 650.28 kB lazy
Strudel chunk and stylesheet were unchanged. CodeMirror is absent from that
ordinary build. Adopting it in #59 will incur the editor dependency cost; measure
again with the integrated app and chosen extensions.

[Raw observations](editor-spike-results.json) retain all ten alternating runs and
resource timings. Each run used production minification, localhost, no network
or CPU throttling, `Cache-Control: no-store`, the same small source and an exact
source assertion before the `editor-ready` mark/requestAnimationFrame. All
resources transferred bytes; neither branch silently failed or skipped mounting.
Host load was 0.31/0.14/0.05 on 16 logical CPUs before measurement. These timings
include local navigation, module loading and mount, **not Play or audio startup**.
They are an illustrative first-load cost, not a statistically established runtime
regression: ranges overlap, browser/JIT caches remain, and there was no bottleneck
profile, low-end-device run or deployed-network test. User-visible load cost on
the public site remains inconclusive; byte cost is established.

## Static proof and implementation handoff

`npm run check` passed: formatting, skill integrity, lint, 231 unit tests, 40
script/guardrail tests and TypeScript/production build. Focused behavior tests
cover disjoint selection mapping, exact Unicode/mixed endings, local-history
ownership, location validation and reversal, scheduled audio time, suspended
clock and Stop cancellation. A fault-injection run replacing reverse-offset
mapping with identity failed the later-voice regression; restoring it passed.
Browser observations above are separate from these deterministic checks.

#59 should start from the prototype, migrate the imperative ref, integrate
sourceFeedback with accepted playback revisions, replace the marker heuristic,
finish composition/lifecycle/reduced-motion coverage and update the three
textarea-driven browser suites. #63 should implement accepted-document history
with an explicit draft boundary. The prototype itself is deliberately not the
production editor and should not be imported wholesale as a completed feature.
