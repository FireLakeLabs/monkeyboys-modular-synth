# Workspace trust acceptance (#61, #83, #93, #71, #87)

Observed on 3 November 2026 with Node 24.22.2, the committed npm lockfile and
the T3 shared Chromium preview against `npm run dev -- --host 127.0.0.1`
(port 5174). The local design exports were available; the private canvas was
not accessed.

## Browser observations

- **#61:** `verifyReplacementConfirmation()` from
  [library-check.mjs](../scripts/library-check.mjs), starting from New's clean
  starter, passes all four groups: starter/library/New without a prompt;
  edited source prompts with action-specific warnings and orange confirmation;
  presentation edits remain protected; invalid drafts remain protected.
  Clean-source tracking and warning copy already existed in the base (#106);
  this change fixes the library stylesheet overriding the primary button.
- **#61, playback:** `installAudioProbe()` and
  `verifyReplacementCancelPlayback(measure)` from the same script ran with the
  real engine. Cancelling New and library replacement retained exact source and
  rack identity while status stayed scheduled. Measured output RMS was 0.00488
  before and 0.00450 after cancellation. No physical listening was performed.
- **#83:** Clicking SEQ, OSC, VCF on New produced spatial order
  SEQ, OSC, VCF, MIX, OUT. Browser DragEvents showed a SEQ placement ghost before
  committing the drop, then removed it after placement. Adding modules to fill
  the first rail put DRUMS on row 2. Unit checks separately prove existing
  module positions remain unchanged. Drag events exercised the real React
  handlers; OS drag integration and touch were not tested.
- **#93:** Focused Open in Strudel, pressed Tab, observed focus on the real
  Open file button, then pressed Enter. The browser reported a file chooser
  accepting `.strudel,.js,.txt`; cancellation retained the workspace.
- **#71:** The actual Open in Strudel button opened a new strudel.cc tab.
  Its editor contained the executable fixture below with `·`, `’`, Chinese text
  and emoji intact, and no rack block. Pressing the REPL's Play changed it to
  Stop and produced measured output RMS 0.02018. With an invalid local draft,
  intercepting the window-open boundary confirmed the same accepted source URL
  and a visible last-readable-code explanation. No physical listening was
  performed. The URL format matches Strudel's
  [documented long URL](https://strudel.cc/technical-manual/project-start/).
- **#87, tempo:** Header input 138 updated OUT and `setcpm(138/4)`; OUT input
  144 updated the header; replacing source with `setcpm(132/4)` updated both.
  The header readout resets across replacements and externally changed tempo.
- **#87, transport:** Play on New reported “Nothing reaches OUT yet” and
  highlighted/scrolled OUT's input into view. There is no code-column Stop.
  Playing a synth, making its draft invalid and pressing the header Stop
  retained the exact invalid draft and stopped scheduling.
  After Sol identified reader classification as insufficient proof of silence,
  final pattern identifiers and named Strudel labels were admitted again. Both
  `const lead = note("c3").s("sine").gain(0.2); lead` and
  `drums: note("c3").s("sine").gain(0.2)` reached Scheduled with nonzero measured
  output (RMS 0.01975 and 0.00746). New still reported silence without initializing
  audio. Three focused unclassified-source regressions failed before this fix.
- **#36 recovery:** `verifyLibraryStopFailure()` still passes using the header:
  injected Stop failure retains work and export, then explicit Stop retry
  recovers. A real pending evaluation remained in Starting; header Stop returned
  immediately to Stopped, and resolving the abandoned evaluation did not
  restart scheduling. This also passed with a plain unlabeled Promise after the
  silence check was narrowed; the existing browser suite retains that fixture.

Strudel sharing/tempo fixture:

```js
// Unicode · MonkeyBoy’s 音 🎵
setcpm(132/4)
$: note("c3 e3 g3").s("sine").gain(0.2)
```

## Deterministic checks

`npm run check` passed: runtime pin, formatting, skill integrity, lint,
731 passing unit tests plus 17 expected failures after rebasing onto #107,
40 guardrail tests, and the
TypeScript/production build. The placement regression failed before the fix
with MIX, OUT, SEQ, OSC, VCF and passes after it. Transport tests cover empty and
incomplete paths, opaque imported voices, Unicode sharing and exact removal of
rack metadata while preserving subsequent comments.

The changed existing browser scripts now target the header Stop. The in-page
library suites and targeted runtime checks above were executed; the complete
standalone Playwright workspace-errors, feedback and trance suites were not
rerun in this session. Their JavaScript syntax was checked. These observations
do not claim universal imported-code audibility, sample readiness, physical
audio continuity or broad browser/device coverage.
