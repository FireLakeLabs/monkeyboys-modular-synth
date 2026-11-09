# Jack discovery and connected placement (#233)

Observed on 8 November 2026 using Node 24.22.2 and Playwright Chromium, in the
working tree based on `fc720ee`. The [contract](design.md#jack-discovery-and-connected-placement-233)
covers hover/focus discovery and cable drops onto empty rails.

## Deterministic evidence

`src/workspace/discovery.test.ts` checks both cable directions, catalog defaults,
SMOOTH/STEP LFO restrictions, dedicated GATES/FM jacks, unique OUT, occupied-input
replacement, same-rail space refusal and atomic invalid-operation rejection.
Discovery leaves the document unchanged. Selecting commits one complete patch;
accepted-document Undo restores exact source, Redo restores the complete rack,
and reading the exported source restores full module/cable/layout identity.

Imported rewrites are previewed through the same edit/conversion boundary as
selection. Tests distinguish retained credit comments, ordinary supported edits,
rewrite warnings, unverified CODE semantics and a conversion refused because
it would reorder CODE credits. No format or module-definition changes were made.

## Browser evidence

`npm run test:browser:report -- jack-discovery.spec.mjs` completed with
`RESULT passed=8 failed=0 exit=0`.

Native pointer and keyboard checks observed:

- Hovering LFO highlights only compatible jacks/modules; focusing VCF CV discovers
  outputs and exposes the tooltip through its accessible description.
- An output rail drop opens search at a ghost; hovering an option previews its
  actual catalog width and snapped position. Escape restores jack focus and
  exact source. Arrow/Enter selection places and connects, with one-step
  Undo/Redo restoring the complete saved rack.
- An occupied input keeps its cable until selection and explains replacement.
  Reverse keyboard wiring connects LFO OUT to VCF CV.
- Powder, Vintage and Learner retain real ghost geometry at 75%; Instrument
  is covered at 100%. Outside dismissal and invalid drafts cancel the chooser.
- Real pinned-engine playback continues after cancellation. Adding a connected
  ENV to VCF CV, Undo and Redo each retain Playing and nonzero per-voice SCOPE
  waveform data. Stop returns Ready. This is measured browser PCM, not physical
  speaker/headphone listening or a claim of subjective continuity.

The first audio fixture omitted its note source and correctly reported
“Nothing reaches OUT yet”; adding SEQ made the actual sounding-path check pass.
The initial UI run also caught replacement text visible only in the title;
replacement consequences now appear in the option itself.

Inspected actual screenshots of [hover discovery](evidence/jack-discovery/hover.png)
and [the chooser and ghost](evidence/jack-discovery/chooser.png). Module widths,
rail geometry, readable options and the provisional cable are visible. The
private design canvas was not accessed; existing local design documentation and
exports supply the reference.

The neighboring stabilization run passed all eleven overview, repatching,
scrolling, pinned-OUT and sound-assignment cases. Its combined run also contained
the failed initial audio fixture described above; the subsequent dedicated
feature run passed all eight cases. Full-suite results are recorded below once
completed. Other browsers, touch and physical listening remain unverified.
