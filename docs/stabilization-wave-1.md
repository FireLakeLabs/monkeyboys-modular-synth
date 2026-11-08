# Stabilization Wave 1 (#219)

Scope: #192, #196, #197, #198 and #206 in one PR. The issues retain their
acceptance criteria; `design.md` and `module-spec.md` own product behavior.
Implementation provenance: GPT-6.1 Sol in T3 Code/Codex. Explicit reviewer:
Opus (available Claude Opus 5.5); bounded `review-loop`, one read-only reviewer.

## Plan and acceptance matrix

| Issue | Implementation plan                                                                                   | Proof required                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| #192  | Separate continuous transparent SVG hit stroke from unchanged paint; faded paths stay pointer-through | Native pointer hover/click at stroke gaps; paint geometry/styles; dim and control/jack priority               |
| #196  | Catalog `more` placement for secondary supersaw fields, no HP change                                  | Note/freq × four Hardware looks, visible scrollbars; exact executable bytes and full saved rack independently |
| #197  | Give razor strip real flex width                                                                      | COUNT edit, evenly spaced marks across strip × four looks                                                     |
| #198  | More consumes native Escape before global rack listener                                               | Native keyboard with focused and committed/unfocused fields; footer unchanged; cable/placement still cancel   |
| #206  | Let chip intrinsic word widths use a full row when needed, retain dock width                          | Loaded-font word Range geometry for every name, accessible names/filtering, new-patch rail widths             |

## Baseline observed on d733cb9

- Supersaw Instrument: control scrollHeight 272, clientHeight 247.
- SPLICE: strip width 2 px; all four marks share x=342.78.
- Filtered ATTENUVERTER with loaded Barlow Condensed 700 13px: text Range
  fragments 55.84 and 18.28 px, splitting the word.
- Parent prelaunch observed More Escape changing the normal footer to Cancelled;
  this wave will independently reproduce and verify it.

Archived design exports are available under `docs/design/`; the private live
canvas is unavailable and is not executable app code. No catalog widths,
translation, reader, arrangement or later-wave work is authorized here.

## Verification and review ledger

Pending implementation. Browser observations, PCM measurements and physical
listening will be reported separately. No audio behavior change is intended.

## Implementation observations (8 November 2026)

- Baseline regression probes failed: supersaw Powder/note content 271 > 247 px;
  SPLICE client width 0 px; More Escape changed the normal footer to Cancelled;
  SOMETIMES had two text Range rectangles; dotted cable sampling missed curve
  points. Initial test harness mistakes (COUNT is labelled SLICES; cable buttons
  have accessible names ending in “cables”) were corrected before judging fixes.
- Catalog `more` moves VOICES, DETUNE and SPREAD only. Eight complete generated
  files captured before/after the change are byte-identical, including metadata.
  [SHA-256 evidence](evidence/stabilization-wave-1/source-identity.json) records
  each file; browser regressions separately compare reopened `read(source).patch`
  with the complete fixture graph and assert the executable calls.
- The cable hit stroke is transparent, solid and 12 px; signal dash selectors
  target paint explicitly. Selected paint, shadows and the audio-mod center retain
  their previous stroke styles. Faded paths disable hit testing. Existing control
  and jack stacking is unchanged.
- More's document bubble listener prevents the native Escape default; the rack's
  window bubble listener respects that flag. Field edit cancellation still runs
  first through React. The committed numeric field case drops focus before Escape.
- SPLICE's flex strip now spans its panel. Its slice-order textarea starts at
  36 px and remains resizable, making room for the strip without hiding SLICES.
- Dock chips use intrinsic minimum word widths in a wrapping flex row. No module
  name list, font scaling, truncation or filtering change was introduced.
- `npm ci` on Node 24.22.2 and `npm run check` passed: 53 unit files, 2,382
  cases, 51 guardrails, formatting/skill integrity, lint, TypeScript and build.

Inspected actual screenshots at 1280 × 800 with loaded fonts:
[Powder](evidence/stabilization-wave-1/powder.png),
[Instrument](evidence/stabilization-wave-1/instrument.png),
[Vintage](evidence/stabilization-wave-1/vintage.png),
[Learner](evidence/stabilization-wave-1/learner.png),
[filtered long dock name](evidence/stabilization-wave-1/dock.png).
The disconnected screenshot fixtures demonstrate presentation only; connected
regression fixtures provide the source/identity proof. Playwright's dedicated
regressions enable visible scrollbars with `ignoreDefaultArgs`.

Full local/hosted browser results and the bounded Opus ledger are recorded below
as those gates complete. No physical listening has been performed; the full
browser suite's existing PCM checks remain separate from these UI observations.

Focused final regression: `npx playwright test tests/browser/stabilization-wave-1.spec.mjs
--reporter=line` passed **9/9** (11.6 s). This includes note/freq × four looks,
COUNT edits 4/8/3 × four looks, full reopened patch identity, native cable
hover/selection and dim pointer-through, Escape after focused and committed
More fields, native cable/HTML placement cancellation, font-loaded whole-word
geometry for all catalog names, name/call filtering and default widths
64/64/84/104 HP at 1280/1600/1920/2200 px. Chromium consumes Escape during a native
HTML drag and fires dragend: the proof checks removed preview, no insertion and
unchanged source, not an unrelated footer wording.
