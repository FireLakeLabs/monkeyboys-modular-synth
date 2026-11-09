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
  its own absent-roomsize default ([follow-up #239](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/239)). This task does not claim reverb regeneration
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

The first complete-suite attempt was stopped after 114 passes and two fixture
failures (2 interrupted, 108 not run; exit 130). The opaque-token fixture had used
newly supported ADD, and the panel matrix selected controls by shifted list
indices. The fixture now uses unsupported `sub`, and panel checks select stable
module/control identities. Their existing assertions pass unchanged:
`npm run test:browser:report -- -g 'sounding-tokens-check|panels-browser'`
reported `RESULT passed=2 failed=0 exit=0`. The acid UI/PCM pair also passed again.
The final complete run is required independently; this interrupted attempt is
not full-suite acceptance.

The final pre-review gate passed `npm run check` with 2,584 unit tests plus
runtime/format/skill/lint, reader coverage, guardrails and production build.
A second failing-before regression proved that an unowned resonance setter could
invent a default cutoff; the new resonance alias requires an adjacent compatible filter
owner. Canonical lpq keeps its prior saved-file ownership behavior. Both standalone resonance and a computed/unreadable cutoff retain CODE
and real-engine event equivalence. The final pre-review focused browser run
(`-g 'acid imports|saw alias|sounding-tokens-check|panels-browser'`) passed all four
checks, `RESULT passed=4 failed=0 exit=0`.

Opus review round 1 found two saved-identity regressions: canonical standalone or
separated `lpq` owners, and a voice starting with `s("saw")` whose old source
owner was DRUMS with an implicit sampler. The captured base-commit fixture
`pre-238-owner-compat.strudel` reopened as invalid before the fixes and restores
its complete original graph afterward. Canonical resonance calls retain their
existing merge rule; only the new alias requires an owner, using catalog policy.
The saw alias retains both prior chained SMPL and root DRUMS ownership.

After those review fixes, `npm run check` passed with 2,585 unit tests and the
same remaining gates. The acid browser file passed all three cases
(`RESULT passed=3 failed=0 exit=0`), including loading/reloading the captured
pre-change owner fixture with exact source and the complete stored graph.
