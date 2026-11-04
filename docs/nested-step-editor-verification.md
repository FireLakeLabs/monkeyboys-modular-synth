# Nested step editor acceptance (#147)

Implements the [chosen study](nested-step-editor.md) and
[storyboard](design/nested-step-editor.html) for SEQ, DRUMS, CV SEQ and CHORD.
GATES does not exist yet; its later story can use the same component.
The private canvas boards were unavailable; the committed storyboard and look CSS
were used as the design references.

## Decisions

- Retain existing array/grid saved formats and generator conventions. Nested edits
  store strings, preserving complete notation timing instead of flattening it.
  The old 16-step limit describes legacy arrays; imported strings have no flat-token
  limit. Logical layout width is fixed independently of rack zoom.
- Keep the pinned `@strudel/mini` 1.2.6 as a direct dependency and import its standalone
  krill parser without initializing Strudel or audio. Validate the AST boundary and
  recovered modifier counts, weights and repetitions rather than trusting casts.
- Keep escaped literals in whole text mode. Uninterpolated backticks are supported;
  interpolated templates remain CODE. Text cells accept exactly one parsed element.
  Expansion beyond 128 copies/ticks/Euclidean steps stays a text cell with its
  correct weight and source, keeping imported density bounded without truncation.
- Preserve delimiters and unedited literal bytes through a narrow content splice.
  New rack strings use the existing canonical generator. Metadata retains IDs,
  looks, placement, cables, names and inactive values through Save/reopen.
- Give each source its own event-context field: Strudel overwrites equal context
  keys when combining note and CV patterns. Capture source position and locations
  before transforms, match known leaf spans, trim whitespace and ignore modifier
  argument locations. Visual updates wait for the next frame so paged cells exist.

## Reproduce

```sh
npm ci
npm run check
npm run test:browser
```

The full browser runner includes `scripts/nested-steps-browser.mjs`; it can also
run against Vite with `node scripts/nested-steps-browser.mjs http://127.0.0.1:5173 /tmp/nested-proof`.
The existing grid, on-ramp/library, modulation and activity suites use the shared
editor's native interfaces. No prior audio or source-preservation assertion is
replaced by a screenshot.

## Observations

On Node 24.22.2, `npm run check` passed all 1,595 tests in 38 files and 43
Node guardrail tests, plus formatting, skill integrity, lint, reader coverage,
TypeScript and the production build. Exact source, complete saved rack identity
and pinned-engine/REPL events are separate assertions. The real event oracle also
checks Bjorklund grouping and rotation for every 0–n pulse count through n=16.

Chromium 156.0.8078.4 passed the dedicated native editor suite and the existing
CV-control/within-note PCM group. Observed editor behavior includes every notation
key with one undo step, nested backtick value editing, text-cell rejection and
recovery, Enter/Escape focus, native tray buttons, line/lane arrows, weight dragging,
DRUMS mixed rows/ghosts/Euclidean steps/toggles, all four Hardware looks, fixed
catalog widths, zoom-independent layout, readable labels and viewport-clamped tray.
Live playback produced nonzero WebAudio PCM before and after a nested edit, flashed
source-owned cells in SEQ and CV SEQ, and reached zero measured PCM after Stop.
Reduced motion used steady outlines and Stop cleared feedback. No page errors
were observed. These are browser and WebAudio observations, not physical listening.

The broader browser suite has covered the remaining library, workspace, activity,
layout, pattern/time, bounce and recovery checks; a clean complete rerun is in
progress. Its final result and retained evidence will be recorded before merge.

Physical listening, touch devices, screen readers and other browsers are outside
this observed proof. PCM proves WebAudio output and Stop silence, not audio quality.

## Sol review ledger

Round one: GPT-6.1 Sol on high, verdict CHANGES. All findings were accepted:
S1 (should), raw CRLF template mapping; S2 (should), simultaneous row/chord
flashes; S3 (should), dot-group copy timing; S4 (should), deletion focus.
The new source/event tests failed on S1 and both S3 examples before the fixes.
Native browser regressions separately failed for S2 and S4 before the fixes.
Afterward the source/event regressions and four affected browser groups passed.
Usage was not exposed. No findings were declined. Re-review is pending.
