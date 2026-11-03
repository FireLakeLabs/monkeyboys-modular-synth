# Editable rack (#5)

Historical #5 baseline, verified 2 November 2026. Its fixed-look observations
predate [all ten looks and two-way editing](workspace-verification.md) and
[PR #34 interaction completion](interaction-verification.md). The
[build plan](build-plan.md#current-status-and-remaining-work) owns current status;
the measurements below remain evidence for the original run.

The rack renders the sixteen v1 catalog modules with Instrument hardware panels
and one fixed presentation for Alien and CODE. Click a library button to place
in the first available interval, or drag it onto a rail. Headers select and move
modules. Rails are 64 HP; each HP is 12 CSS pixels. The rail scrolls rather than
changing saved coordinates when the window narrows. Add row is also a drop
zone. Trailing empty rows can be removed explicitly.

The code pane is generated from accepted rack state. Generator-owned source
ranges highlight a selected module's calls, including CV and folded MIX gain.
Disconnected and bypassed modules can have no sounding span. The saved rack
block is inspectable separately. This baseline preceded code import and two-way editing; the linked workspace
evidence records their subsequent integration without regenerating imported source.

## Reproduce

Use the pinned Node version, `npm ci`, `npm run check`, and `npm run dev`.

1. Load the app: Stopped, silent MIX → OUT. Add SEQ and OSC. Drag or click
   SEQ NOTE → OSC NOTE and OSC OUT → MIX 1. Code updates without starting audio.
2. Add VCF, connect OSC OUT → VCF IN, then VCF OUT → MIX 1. Cancel preserves
   the old cable; Replace changes it atomically. Select VCF and inspect the
   pink filter-call highlights. Signal-invalid inputs and cycles are blocked.
3. Click a numeric readout. Enter a value, then Enter or blur to commit. Invalid
   values keep the field/error open. Off-step input offers the nearest value
   and requires a second explicit commit. Escape abandons typed input.
4. Drag a knob upward/downward. Shift gives one-tenth sensitivity. Pointer
   cancellation or Escape restores its starting value. Double-click or Reset
   uses the catalog default. Frequency controls use logarithmic travel.
5. Adjust switches, SEQ cells, DRUMS cells/sample names/step count, or text mode.
   CODE and notation text apply explicitly; invalid active CODE retains the
   accepted patch and editable draft. A chained CODE fragment without an input
   stays silent and retains its text, so deleting upstream modules works.
6. Play the patched voice; accepted edits use the existing playback queue.
   Stop remains available. Move a header onto Add row and verify cables follow
   live jack centers while generated sound code stays unchanged.
7. Use Connections to select, remove, or move a cable's destination. An aborted
   reroute preserves the original. Delete a selected module through its
   confirmation; only that module and its incident cables are removed.
8. New patch offers Cancel, Export current, and Replace patch. Replacement
   confirms Stop before installing the silent starter; it never auto-plays.

LFO DEPTH uses target catalog units/ranges, including through passthroughs.
Repatching restores target defaults. When different targets have different
implicit defaults, the panel says “per-target defaults”; Set shared depth
chooses an explicit depth in their shared range. Audio fan-out and directly
reversed REVERB → DELAY connections have persistent explanations. The later interaction/workspace reports verify indirect effect-order warnings
and output-name editing. Exhaustive Strudel effect-order analysis is not claimed.

## Observed evidence — 2 November 2026

Node 24.22.2 and local Chromium at 1280 × 800:

- All sixteen modules were added through the UI; catalog widths were observed
  (MIX 144 px, OUT 96 px, SEQ 120 px, OSC 108 px). Hardware is Instrument.
- A SEQ → OSC → MIX → OUT voice generated live while stopped. A VCF inserted
  through explicit replacement emitted `.lpf(...)` / `.lpq(...)`; selecting it
  highlighted exactly those lines. Switch, drum-cell and CODE Apply edits
  appeared in generated source or saved rack values.
- Typed cutoff 1000 committed; 21000 displayed “Enter 20–20000” and left
  `.lpf(1000)` intact. A real pointer drag reached 20000. Reset restored 800.
  A simulated pointer drag changed BPM 120 → 220; pointercancel restored 120.
- Library/header dragging onto Add row placed/moved modules without pushing
  neighbors. Cross-row cables followed the measured endpoints. A confirmed
  New patch returned to two modules, Stopped, and tempo-only executable code.
- The rack-built sounding voice reached Playing. An AudioWorklet tapped the
  app's actual Strudel output (using Vite's loaded module URL) and captured
  nonzero PCM, RMS 0.04910 over 72,192 frames at master gain 0.8. An initial
  probe imported a second URL/module instance and sampled the wrong output;
  its zero readings are not evidence about the app output.
- The focused deletion regression failed with Acorn's unexpected-token error
  before the generator handled an orphaned chained CODE fragment; it passes
  afterward. Unit coverage also checks placement, graph rejection, replacement,
  deletion, target-specific modulation, snapping and exact source ownership.

Physical speaker output and subjective continuity were not heard. Other
browsers, touch, exhaustive imported-code behavior, and persistence/reopening
remain outside this verification. The private live design canvas was not
accessed; the archived local workspace board was inspected.

Sol review found two SEQ issues: text-mode conversion included cells beyond LEN,
and increasing LEN omitted displayed trailing rests. Both focused tests failed
before the fixes and passed afterward. The browser then emitted sixteen steps
with eight trailing rests at LEN 16, and text conversion at LEN 4 retained
exactly four sounding notes. The complete gate passed with 91 unit tests and
40 guardrail/spike checks. A built-production smoke check also confirmed
placement, patching, source highlights, deletion, and no page-width overflow at
1280 × 800.
