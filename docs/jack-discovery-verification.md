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
feature run passed all eight cases. Other browsers, touch and physical listening
remain unverified.

## Full local run and regressions

The first complete local run on `228829c` finished with
`RESULT passed=201 failed=2 exit=1`. This remains a failed run, separate from
later focused verification. Its raw output is `/tmp/compatible-jacks-full-browser.log`.
A briefly overlapping nine-case Wave5 run was disclosed; no performance inference
is made from this run.

The two failures identified adjacent behavior affected by discovery:

- A connection whose imported-source conversion cannot succeed is now blocked
  before committing. The old browser case expected an error only after the click;
  the preview also replaced the specific conversion reason with generic text.
  The blocked jack now retains the specific reason, and the case checks its
  local explanation before activation and unchanged source/rack afterwards.
- Focusing the starting output after pointer-down cleared the wiring instruction.
  Pointer and keyboard starts now share the same direction-aware prompt, and
  focusing a jack that is not an opposite endpoint preserves that prompt. The
  existing More/Escape check continues to require the prompt and cancellation.

A further focused regression first failed with
`RESULT passed=0 failed=1 exit=1`: hovering a CV input changed OSC OUT's displayed
signal to audio-mod. Outputs now retain their actual signal marking while the
proposed connection and receiving CV jack show audio-mod. That before-fix log
and trace were copied to `/tmp/monkeyboy-233` before rerunning.

The changes were rebased onto `af7040f`; the only conflict combined independent
additions to the standards inventory. Executable rack changes merged cleanly.

After those fixes and rebase, the complete affected browser files ran with:

```sh
npm run test:browser:report -- jack-discovery.spec.mjs undo-notices.spec.mjs stabilization-wave-1.spec.mjs
```

The result was `RESULT passed=40 failed=0 exit=0`, including the original
More/Escape guard, the specific blocked-conversion explanation before and after
activation, and the previously failing audio-output marking check. Refreshed
chooser/hover screenshots were inspected after this run. The raw log is
`/tmp/233-focused-after.log`; its artifacts were copied to
`/tmp/monkeyboy-233/focused-after` before the next full run.

The fresh complete run on `da20bff` (based on `af7040f`) finished with
`RESULT passed=205 failed=0 exit=0`. Its log is `/tmp/233-full-rebased.log` and
its raw artifacts were copied to `/tmp/monkeyboy-233/full-after`. The 5173 test
server stopped after the run. This green run does not replace the earlier
`201/2` failed evidence.

A final status-only check then reproduced a stale chooser instruction after
Escape (`RESULT passed=0 failed=1 exit=1`). Dismissal now reports **Cancelled**;
successful selection reports **Added and connected …**. The complete feature
file was rerun after that small change with `RESULT passed=8 failed=0 exit=0`,
including real playback and Undo/Redo. That focused coverage is appropriate for
the two status messages; the full hosted suite on the final PR head remains
the merge gate. The before-fix trace/log and after-fix log are retained under
`/tmp/monkeyboy-233` and `/tmp/233-final-feature.log` respectively.

## Review regression

Sol round 1 found S1: hovering another option could change the ghost while
Enter still committed the old focused option or the first search result. Two
native regressions reproduced that mismatch (`RESULT passed=0 failed=2 exit=1`).
The ghost and search activation now share one active candidate; hovering a valid
option keeps existing option focus aligned without taking focus from search.
The current option has one visible and accessible marker. The complete feature
file then passed `RESULT passed=10 failed=0 exit=0`, including both new Enter
paths, source/rack identity, cancellation and real playback. This UI selection
fix has bounded focused coverage; the final hosted full suite remains required.
Logs/traces are retained under `/tmp/monkeyboy-233/preview-before` and
`/tmp/monkeyboy-233/preview-after`.
