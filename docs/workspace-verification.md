# Looks and live workspace verification (#7 / #8)

The rack and editable source now share one accepted `SourceDocument`. The draft
and scheduled audio are separate revisions. Run `npm ci` with Node 24.22.2 and
`npm run check`, then `npm run dev -- --host 0.0.0.0` for the reproductions below.
The repository's exported design boards were available and used as references.

## Video evidence

- [Workspace recording](evidence/workspace.mp4), 19 seconds: Instrument → Vintage
  lab with a connected filter, fan-out `lead` → `melody`, cutoff 800 → 1200,
  Play, an incomplete draft, correction, Stop and a stopped code edit.
- [All ten looks recording](evidence/looks.mp4), 30 seconds: one instance of every
  v1 module, family-wide look changes, and scrolling through the rack.
- [Source regression recording](evidence/source-regressions.mp4), 26 seconds:
  editing an imported envelope amount, inserting a declaration before generated
  code, deleting the first voice while retaining `.orbit(2)`, and replacing invalid
  metadata while preserving a voice and comment appended after it. The final
  segment shows identical anonymous voices and opening a file while playing;
  the opened file remains stopped until explicit Play.

These are real browser recordings, not storyboards. They show UI behavior;
physical speaker audio was not heard. The matrix exercised 13 hardware modules
in four looks, two Alien modules in three looks, and CODE in three looks: 61
module/look combinations. DOM checks retained each catalog width, 390 px panel
height, control/jack counts, and the exact executable body throughout the matrix.

## Reproduce the workspace

Paste this into **Strudel source**:

```js
// Workspace proof — source stays exact
setcpm(120/4)
const lead = note('c3 e3 g3').s('sine').lpf(800)
$: lead.gain(0.25)
$: lead.iter(2).gain(0.15)
```

1. Right-click VCF, select Instrument, then Vintage lab. Its width remains
   120 px; the output jack moves from y=484 to y=281.5 in the recorded viewport.
   Cable endpoints follow the measured jack centers. The executable text stays
   byte-identical; only the trailing rack metadata changes.
2. Change the output name to `melody`, press Enter, and set CUTOFF to 1200.
   The declaration and both references change; only the cutoff token changes
   in the expression. The comment, single quotes and surrounding formatting stay.
3. Click Play. Replace the draft with `$: note(`. The rack remains at its last
   readable revision, dims, and becomes inert immediately. The parser reports
   line/column and marks the failing line. The prior pattern stays scheduled.
4. Correct the source. The rack updates after 250 ms idle; running audio applies
   the accepted source. Stop, then edit again: rack/source update without autoplay.
5. Export, then open the `.strudel` file. Stop is confirmed before the file is
   accepted, and the opened patch does not autoplay. Looks, positions, names,
   values and cables reopen. Copy/Export use the exact current draft, including syntax errors.
   An invalid export containing `// exact invalid export 🐒\n$: note(` was downloaded
   and checked byte-for-byte; it contained no stale layout block.

The browser also verified the context menu's Duplicate and Delete actions on a
disconnected VCF: values/look copy into free space without wiring, and deletion
removes the copy. Show in code reports that a disconnected module has no sounding
range; connected modules focus/select their current source span. OUT's duplicate
and delete actions are disabled. Escape closes the menu.

## Source and saved-state contract

- New rack-owned patches support structural edits through the existing generator.
  Presentation-only edits retain executable bytes. Automatic fan-out names are
  saved, renaming validates identifiers/collisions, and a chosen declaration is
  retained when a split is reduced to one branch.
- Imported value edits splice proven literal ranges. Safe declaration/receiver
  renames update every proven reference. Opaque CODE references, missing literal
  ownership and sounding structural edits without a preservation plan are refused
  with an explanation; users can edit those expressions in source. Adding or
  duplicating a disconnected module is safe and retained in metadata.
- Active CODE blocks offer **Edit in source**, so half-typed expressions use the
  same draft/diagnostic flow. Disconnected CODE drafts remain editable as saved
  non-sounding values.
- Accepted source edits reconcile old identities before stamping current metadata.
  An optional `source` snapshot in the v1 envelope records the accepted executable
  body. Reading validates its scope syntax, binding addresses and semantic ownership,
  and compares the independently projected and saved graphs' generated programs
  before restoring complete state. A stale snapshot never overrides edited code.
- Old generator-only v1 files remain readable. Invalid/unknown metadata remains
  exact until the user chooses **Replace rack metadata**. Rack editing is disabled
  in that state; source editing and exporting remain available.
- Unit tests separately cover exact source, graph/value behavior, identity and
  malformed metadata. Existing reader tests exercise real Strudel event algebra.
  Four review reproductions failed before fixes and passed afterward: shifted scope
  IDs, removed-voice orbit allocation, an imported envelope amount omitted by the
  generator, and executable source after a malformed layout block. Metadata also
  cannot override proven direct literal controls omitted by generation. Replacing
  metadata removes identifiable comment lines and retains subsequent source.
  A repeated-voice regression first failed with missing ownership, then passed
  after enabling ordered matching only within a proven unchanged snapshot;
  external ambiguous edits still receive fresh identities. Opening a file while
  playing previously kept scheduling; the browser now confirms Stopped, and
  transport tests verify that Stop failure rejects the file replacement.

## Audio observations and limits

Local Chromium, Linux, 1600 × 1000 viewport, 48 kHz AudioContext, Node 24.22.2.
A direct Play click reached **Pattern scheduled**. An AnalyserNode connected to
the real post-master `destinationGain` captured 40,960 sampled values with RMS
0.0162333 for the stopped-edit synth fixture after explicit Play. This establishes
nonzero browser output for that fixture, not physical speaker listening.

A valid unsupported `.missingMethod()` draft produced a readable CODE block,
then a surfaced construction error. The banner reported **Scheduling stopped**;
the readable rack and exact source stayed current. Correcting source after an
error requires explicit Play. Metadata-only look changes do not re-evaluate audio;
source changes use the existing serialized playback/Stop-intent boundary.

No human listening, other-browser/mobile behavior, universal audible equivalence,
late sample/decode error detection or arbitrary-JavaScript cancellation is claimed.
The engine's existing never-settling evaluation and side-effect limits remain.
Runtime failures get a generic banner; only parser diagnostics claim a source
location. The UI labels sample status unavailable rather than inferring success.
