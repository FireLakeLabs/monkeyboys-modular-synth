# CodeMirror adoption (#59)

Verified 3 November 2026 on Linux, Node 24.22.2, Chromium 156, 1600 × 1000.
Plain CodeMirror 6 now replaces the production textarea/overlay. The archived
[spike decision](editor-spike.md) remains the rationale; its prototype entries,
`src/spikes` and `MMS_EDITOR_SPIKE` build path have been removed.
The archived design boards were available; the private live canvas was not accessed.

## Behavior and ownership

The rack renders outside the editor's lazy/Suspense boundary. App holds an
`EditorView` ref; selections map through disjoint `diff` changes, and Show in code
uses CodeMirror's live selection scrolling rather than a fixed line height.
`Text.of` retains CR and mixed line endings on programmatic source changes.
Native typing/composition publishes exact editor state; composition holds the
reader/rack gate until the final browser mutations have flushed.

`sourceTreatments()` runs when an accepted document changes. Memoized spans and
selection styling become decorations; focus, transport and other unrelated
renders reuse them. Editing/invalid drafts clear source treatments, while Cyber
editing focus follows the retained rack revision until blur or acceptance.

Local editor history covers unaccepted drafts only. Acceptance, Revert, rack
operations and patch replacement remove/reinstall the history extension without
resetting selection or scroll. This is the explicit checkpoint for #63, which
will own accepted-document undo across source, saved graph and playback. There
is deliberately no accepted-document undo in this issue. Folding (#68), error
placement (#69) and event marks (#72) remain separate; the engine's opt-in
source-location API is retained without adding token marks here.

## Observed browser proof

[Raw results](editor-adoption-results.json) and the
[editor screenshot](evidence/source-editor.png) retain this session's evidence.
The updated suites passed:

- `scripts/feedback-check.mjs`: 14 checks, including all VCF spans, category/family
  styles, invalid drafts, exact Japanese composition via Chromium CDP, backward
  selection/both scroll axes through a real cutoff rewrite, live Show in code,
  local undo checkpoints, Cyber focus through invalid boundary edits, runtime reduced motion, real Alien and
  Instrument activity, Stop/replacement/error cleanup and nonzero WebAudio PCM.
  A route probe counts the actual treatment function: selecting modules does not
  reparse, and playback renders reuse the same decoration facet and read count.
- `scripts/workspace-errors.mjs`: 9 UI and 8 real-engine recovery checks, including
  long imported source, exact CRLF export, failed/pending Stop and replacement,
  resource/output failure, abandoned evaluation and explicit retry/reload.
- `scripts/library-check.mjs`: UI loading/export/reopen and saved rack identity,
  all ten built-in patches with nonzero PCM, plus injected Stop-failure recovery.
  The browser-only adapter reads public editor state, including virtualized text.

The initial feedback run exposed an old all-lines-in-DOM assertion; bringing
ranges into the viewport fixed the suite without weakening source/selection
checks. The library helper now yields for React to render the editing phase
before waiting for acceptance. A workspace async polling predicate was replaced
with synchronous viewport and acceptance waits to avoid finishing on a Promise.

The migrated trance verification also passed exact source, event snapshots,
nonzero PCM and saved/rendered rack identity. Sol review found that the first
editor draft transaction compared a moved caret against stale accepted spans.
The new CODE-boundary regression failed before the fix (`none` instead of
`cyber-edit`), then passed with ownership retained until acceptance or blur.

These are browser and measured PCM observations. Physical speakers/headphones
were not heard, and a physical OS IME was not operated. CDP drives Chromium's
native composition events, rather than synthetic JavaScript CompositionEvents.
Other browsers, mobile IMEs and arbitrary large programs remain unverified.
The real suites also exercised StrictMode's editor cleanup/remount, with one
live editor and no unhandled page errors.

## Integrated bundle and first load

Production minification, fresh browser contexts, HTTP cache disabled by routing,
no CPU/network throttling, same silent starter and exact exported-source checks.
Five alternating before/after runs used the app at `8acfd286` and this integrated
build. Every run mounted the two-module rack and editor and fetched JS bytes;
HTTP/request/page errors failed the run. Audio startup was excluded. Host load
before work was 0.60/0.19/0.09 on 16 logical CPUs.

| JS output              |       Raw |      Gzip |
| ---------------------- | --------: | --------: |
| Initial app before     | 451.95 kB | 141.29 kB |
| Initial app after      | 448.85 kB | 140.38 kB |
| Lazy production editor | 402.71 kB | 137.40 kB |

CodeMirror remains outside the initial chunk; the lazy engine remains 650.28 kB
raw / 215.28 kB gzip. The editor is smaller than the spike's 148.30 kB gzip
fixture because production omits its diagnostic/folding/event presentation.
Unused direct lint/language dependencies were removed; all directly used
CodeMirror packages are runtime dependencies. The bundler module report retains
only `diff`/`Change` from `@codemirror/merge`, 9,892 rendered bytes before final
minification, with no MergeView UI. This is not a separately gzippable module share.

| Navigation → two-animation-frame observation |   Median | Range (5 runs) |
| -------------------------------------------- | -------: | -------------: |
| Textarea rack/editor                         | 137.0 ms | 126.0–343.7 ms |
| CodeMirror rack                              | 129.2 ms | 127.0–130.8 ms |
| CodeMirror editor                            | 424.8 ms | 422.8–427.7 ms |

The integrated editor arrives after the rack. A separate held-chunk check
observed the painted rack and loading placeholder with zero editor instances,
then exactly one editor after release. A separate, unreported CPU profile was
mostly idle (365 samples versus 78 app and 45 editor samples); the installed
React production scheduler contains a 300 ms fallback throttle. The roughly
300 ms rack-to-editor gap is consistent with that scheduling boundary, rather
than pure editor download/CPU cost. These are local observations, not a deployed
latency forecast or a claim that rack startup became faster. Network/device
latency remains inconclusive; the added editor byte cost is established.

Reproduce with the old app's optimized output served on 4174 and this app's
optimized output on 4173, then run:

```sh
node scripts/editor-load-check.mjs http://127.0.0.1:4174 http://127.0.0.1:4173 /tmp/mms-editor-load.json
```

The script writes fresh load-only results. The committed combined evidence adds
this session's three browser suites and bundler module inspection. Run feedback
and errors against the development server as documented in their reports. Run
the library module's UI, signal and Stop-failure groups as documented in
[patch library verification](patch-library.md#browser-verification).

## Static proof

The initial adoption `npm run check` passed: formatting, skill integrity, lint, 230 unit tests,
40 guardrail tests, TypeScript and production build. The spike's disjoint-edit
and exact mixed-ending tests moved beside the production diff adapter; draft
history ownership is now exercised through the actual editor in the browser.
Source bytes, restored saved rack identity and nonzero audio signal were checked
separately; none establishes universal audible equivalence.

## Retest after concurrent main changes

Rebased onto `3de7423` after [#102](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/102)
landed #75. The App conflict preserved the new rack refusal/conversion callback
and this issue's composition guard. `npm run check` passed again: 604 unit cases,
53 inherited expected failures and 40 guardrails, with lint, TypeScript and build.
The full feedback and workspace error suites passed again. The expanded library
suite passed all nine exercise rack edits, showcase refusal/conversion, ten-patch
PCM and Stop recovery, with no page errors.

The final integrated build reports 518.82 kB raw / 145.03 kB gzip initial JS;
#75 added authored library metadata. The lazy editor remains 402.71 kB raw /
137.40 kB gzip. The alternating load comparison above predates these concurrent
main changes and is retained as dated evidence, not a new timing claim for the
larger library build. Updated browser results and final bundle observations are
recorded under `afterMainRebase` in the combined evidence.
