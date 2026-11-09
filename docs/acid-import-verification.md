# Acid-patch import verification (#238)

The acid screenshot's three CODE blocks can be projected as ADD and a VCF with
STEP Perlin LFO; `s("saw")` projects as OSC. RES spans 0–50. The engine's chained
plain-number addition after `note()` does not transpose its note field; ADD
retains that operation and explains it. Its numeric-value exercise adds before
the note wrapper and therefore demonstrates a real pitch change.

On 9 November 2026, Node 24.22.2 and locked dependencies:

- The initial focused regression reproduced the original CODE/sampler projection
  and missing resonance 0/25/50 controls. Those cases pass after the change.
- `src/reader/acid.test.ts` checks exact source, narrowly scoped ADD/RES/WAVE
  edits, complete export/reopen identity, unsupported operands and resonance
  bounds independently from pinned-core event equivalence. The original
  `.room(.15)` suffix retains source; regenerated event comparisons isolate the
  changed dry arithmetic/filter path, because the existing reverb adapter writes
  its own absent-roomsize default. This task does not claim reverb regeneration
  equivalence.
- A captured pre-change file retains all three saved CODE blocks and its saved
  sampler. ADD has an explicit independent conversion offer. Grouped filter/CV
  conversion remains conservative; explicitly reimporting the executable body
  without old layout metadata builds the complete new rack and discards that
  old layout. No automatic saved-patch conversion was added.
- `npm run test:browser:report -- tests/browser/acid.spec.mjs` passed both tests
  (`RESULT passed=2 failed=0 exit=0`). Native keyboard End sets RES to 50;
  Undo, ADD text edits, OSC selection, recovery and reopened rack identity pass.
  Inspected screenshots show readable ADD notice/text controls and VCF RES 50.
- The real browser schedules `s: saw` at resonance 50, produces nonzero finite
  WebAudio PCM and accepts a live resonance edit to 25 without surfaced engine
  failures. This is observed scheduled/output behavior, not physical listening.

The private canvas boards were not available; existing local design exports and
catalog-driven Hardware layouts supplied the presentation reference. Chromium
and the installed engine are covered; physical speakers/headphones and other
browsers/devices were not tested.
