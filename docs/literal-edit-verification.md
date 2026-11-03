# One-control round trips (#64)

Verified 3 November 2026 with Node 24.22.2 and the committed npm lockfile.
[`literal-edits.test.ts`](../src/reader/literal-edits.test.ts) runs through
`npm test`, and therefore through the local/CI `npm run check` gate.

## Coverage and distinct claims

The deterministic, catalog-enumerated suite accounts for all 38 controls across
16 modules. A new or unaccounted-for catalog control fails the coverage assertion.
There are 45 edit scenarios, including LFO and ENV into both VCF and VCA,
named audio/modulation fan-out, each mixer channel, generator-owned routing and
the exact six-module #65 reproduction. Each example has explicit before/after
control values and source tokens; the generator does not choose the edit oracle.
This is bounded property-style coverage, not randomized exploration of every value.

- **Source:** splice executable text without updating the old rack block, then
  require exact source retention. The stale block must remain byte-for-byte intact.
- **Rack:** compare module IDs, types, positions, looks, effective controls,
  named output keys and directed jack endpoints separately from source. Missing
  values mean catalog defaults; numbers follow the writer's three-decimal precision.
  CODE's surrounding whitespace is checked by exact source, while its control
  comparison ignores leading/trailing whitespace. External projection allocates
  fresh cable IDs; wiring comparisons use endpoints, not those incidental IDs.
- **Saved identity:** independently generated before/after patches reopen exactly,
  including raw values and cable IDs. The actual accepted edited projection is
  also saved through `saveLayout` and reopened with exact full patch equality,
  without rewriting its executable body. This does not imply the edited projection
  already has the intended topology: the rack assertions own that claim.
- **Strudel events:** query four cycles of real Strudel patterns, with mini-notation
  and tonal functions, comparing event values, timing, voice separation and tempo.
  The directly edited program, retained document and independently regenerated
  graph must agree with a patch whose expected control value was set explicitly.
  Each edit must also change the observed events/tempo. A concrete two-note fixture
  independently checks that the event oracle parses mini-notation and timing.

Mode/shape controls that select function names are exercised as syntax edits.
VCF MODE changes its paired filter/resonance calls together. SEQ LEN has no
independent literal: it changes the emitted notation's length. OUT VOL is saved
metadata only. Both have explicit generation/save/reopen checks; the suite does
not pretend they have independently editable executable literals.

The test-only [kernel entry](../src/reader/fixtures/strudel-kernel.mjs) re-exports
the installed Strudel pattern, signal, control, utility, logging and Fraction
implementations. The [Vitest configuration](../vitest.config.ts) directs
mini/tonal to that shared kernel, avoiding the browser REPL/audio backend in Node.
No pattern/mini/tonal behavior is mocked. Production engine loading is unchanged.

## Known failures are executable

The 413 tests include 53 named expected failures. They execute normally under
Vitest's `it.fails`, and an unexpected pass fails the gate until the annotation is
removed. Setup, parsing, source retention, saved identity, most individual
metadata/value assertions and all event comparisons remain ordinary passing tests.

| Owner                                                                     | Expected failure                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#65](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/65) | Editing a final voice loses generator-owned orbit provenance, adding CODE and changing topology. Includes the original `.lpq(1)` → `.lpq(8)` reproduction.                                                                                                            |
| [#66](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/66) | SEQ/DRUMS arrays become notation strings after a sibling literal edit. These tests cover the domain representation; they do not prove rendered grid behavior.                                                                                                         |
| [#99](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/99) | MIX channels 2–4 are reassigned to channel 1; BPM and mode changes lose module identity/layout; SEQ mode loses the saved name key; shared ENV fan-out duplicates its module. Mode switches also need reconciliation with the existing conservative matching contract. |

The suite adds regression coverage without implementing those production fixes.
Expected rack failures are kept separate from passing value/source/event checks
so that an orbit regression cannot conceal a wrong resonance value, parse failure
or changed sound events. Exact rack equality is still enforced on each saved and
reopened accepted revision.

## Observed proof and limits

- With the expected-failure annotations temporarily removed, the #65 fixture
  failed with an extra `code1`; both #66 tests failed with strings instead of
  their original arrays. The annotations were restored afterwards.
- A temporary reader mutation that forced resonance to zero made the ordinary
  `vcf.res` value assertion fail (`0` versus `8`). The production reader was
  restored before the passing run. This demonstrates that the expected orbit
  failure does not swallow a new control-projection regression.
- The complete targeted suite passed, including the named expected failures,
  with no skipped tests. The full `npm run check` passed: 591 ordinary tests,
  53 expected failures, 40 guardrail checks, formatting, skills, lint and build.

This is domain/runtime verification in Node. It does not render the rack, start
browser audio, measure PCM, or establish physical listening or audible continuity.
Those belong to the production fixes' browser acceptance.
