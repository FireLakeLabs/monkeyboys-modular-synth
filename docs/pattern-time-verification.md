# Pattern and time module acceptance (#132)

The [module spec](module-spec.md#pattern-and-time-132) records all twelve modules,
family assignments, controls and pinned call forms. WINDOW/function loops remain
owned by #135. The base includes #128's shared call bindings and #145's coverage
report; its leading gaps are custom/computed calls and do not replace #132's
acceptance criteria. The private design canvas was not accessed; the repository's
archived board exports and existing look rules supplied the visual reference.

## Decisions

- Use six Hardware modules and six Alien modules as assigned. REV / PALINDROME
  is one Alien module with a mode switch. Widths are catalog-owned across looks.
- Extend shared bindings with tuple/nullary arguments, method-specific arity,
  conditional calls and a source binding. CHORD owns `chord(...).voicing()` as an
  atomic source. No panel component duplicates these module definitions.
- CLOCK owns `.slow()`, preserving its explicit chain position; adjacent SEQ
  `.fast()` and LFO rate adapters retain their existing behavior. Ordered modules
  merge calls only in increasing catalog order, so `.late().swingBy()` remains
  two CLOCK nodes. Repeated calls retain independent nodes.
- Preserve DRUMS' existing unseeded DROP; an adjacent degradation/seed pair is
  CHANCE. Seed zero must remain active, so CHANCE distinguishes seeded and
  unseeded modes. A regression first failed when `.seed(0)` was omitted inside
  an outer random context and passes with the conditional seed binding.
- Preserve literal fractions and full pattern-time precision; rounding `1/3` to
  `0.333` changes events. Numeric readouts use compact fraction spelling without
  changing their values. Unsafe/comment-bearing argument edits remain refused.
- Reject empty/reversed active zoom/compress spans at graph/mutation boundaries.
  Inactive TIME LENS/WARP values remain saved. Unsupported code stays exact CODE.
- Add two original, MIT-licensed library exercises so every new module has an
  active demonstration. The committed corpus manifest records their provenance;
  the baseline accepts these additions without reducing any existing patch's
  coverage. The fourteen original library digest snapshots remain unchanged.

## Independent deterministic proof

`src/modules/pattern-time.test.ts` and its explicit fixture matrix cover every
supported mode and alias. They separately require exact original source,
independently saved rack identity in every family look, and equal actual
pinned-engine onset events after regeneration. Tests also cover scalar edits,
CHORD edits, repeated calls, nested seed contexts, invalid spans, unsupported
arguments and new rack-built modules. The legacy exhaustive control ledger
includes the new matrix rather than silently skipping those controls.

Order tests read both cable orders, generate from the projected graphs and
require different onset events. Each transform has a noncommuting partner;
CHORD feeds reordered ARP/REV. Uniform offsets commute with press, linger and
echo in these fixtures, so their meaningful partner is reversal. Query fragments
without an onset are excluded, as the real scheduler excludes them; splitting a
held event at a cycle boundary is not another note.

The CLOCK `.late(1/8).swingBy(1/3, 4)` regression first failed because the reader
collapsed the calls into one node; it requires two nodes and increasing emitted
call positions as well as event equality. Numeric division is parsed as data,
never evaluated. The Vitest engine kernel now includes the pinned Euclidean
functions, and this suite loads the tonal voicing registration.

## Browser and PCM proof

Run the committed browser groups with:

```sh
npx playwright test -g 'pattern and time|pattern module numeric|imported CHORD|verifyPanels|rack-visuals-check|verifyOnRampUI|verifyLibraryUI|verifyLibraryRackEditing'
```

The form matrix loads all 25 supported forms through the real editor and reader,
plays them through `src/strudel/engine.ts`, and checks nonempty onset events,
exact source, export/reopen rack identity and equal regenerated events. A single
analyser connected to the actual output measures 122,880 PCM samples per form;
it is disconnected after each measurement, avoiding stale/averaged probes.
Actual numeric and text-control gestures edit EUCLID/RATCHET without rewriting
other source, and a subsequent code edit refreshes the RATCHET text control. The library groups check both new exercises as well as the existing
entries and palette filtering, which now includes CHORD for “seq”.

The look matrix checks all 103 catalog/module look combinations at 100%, 75% and
Fit (309 checks), including all 42 new combinations. It asserts catalog widths,
control bounds, readable labels, slider semantics and live cable endpoints. The
larger family fixture uses the existing 104-HP case and rack focus, so Fit is
checking panels in a usable viewport rather than shrinking an ever-growing
collection in a narrow pane. Fractional jack rectangles allow Chromium's 1/64
CSS-pixel geometry rounding. This changes test fixtures, not module widths.

Shared preview first passed every look at 100%; two real Play clicks failed with
“Preview automation click timed out after 15000ms.” Playwright then supplied the
runtime checks. Chromium 156 produced nonzero output for every form. An initial
zoom fixture sustained only one chord per cycle and had no onset inside the
zoomed interval; the final fixture contains several chord onsets per cycle.
Physical listening and other browsers/devices remain unverified. No issue
acceptance criterion is otherwise intentionally deferred.

## Observed run (4 November 2026 UTC)

On Node 24.22.2, `npm ci` and `npm run check` passed: 1,080 tests,
43 guardrails, coverage baseline, skill integrity, lint, TypeScript and build.
The focused pattern/time suite has 134 passing checks. All affected browser groups
in the command above passed in Chromium, including all 25 forms and
309 panel/look/zoom checks. The broader rack visual suite also passed contrast and native cable interactions. The numeric/text gestures and both new library
exercises passed the actual workspace editing checks. These results are separate
from physical listening, which was not performed.

## Sol round 1 corrections

Sol identified three reproducible findings. All four new assertions failed before
the fixes: explicit zero swing was omitted; both EUCLID modes accepted pulses
above steps; CHORD structural edits failed stable-channel discovery. CLOCK now
has a catalog GROOVE switch to distinguish absent swing from an active zero.
The EUCLID tuple declares its inclusive pulses/steps limit, enforced at mutation
and generation boundaries. Branch discovery recognizes catalog `source` bindings.
Regressions separately check exact source, saved identity, onset events (including
narrow query windows), both Euclidean modes and native CHORD deletion/keyboard reconnection.

After rebasing onto main `1c900d6` (#140), `npm ci` applied its required audio-pool
patch and the integrated full gate passed. The final pattern/runtime, panel,
contrast, numeric/text editing and CHORD deletion/keyboard reconnection groups
passed on that refreshed engine. All three Sol findings were accepted and fixed;
none were declined. Review usage was not exposed.
