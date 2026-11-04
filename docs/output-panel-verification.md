# Output panel and patch rails (#133)

Implemented the [3 November 2026 decision](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/133).
The issue has no discussion comments. The private design canvas was unavailable;
repository design exports were available as reference.

## Contract and choices

- OUT retains its stable identity, source bindings, IN, BPM, VOL and four Hardware
  looks, outside the rail intervals. It cannot be moved, duplicated or deleted.
- `railHp` is optional v1 metadata: 64, 84 or 104, with absent fields/plain imports
  defaulting to 64. New patches choose the widest full-window case that fits,
  including output and frame padding. Resize never rewrites width or positions.
- Width changes preserve all positions and executable bytes. Reductions that
  would strand a module are refused. Old OUT coordinates normalize to zero in
  memory; untouched legacy files retain exact bytes. New metadata omits OUT
  coordinates while preserving identity, controls, looks and wiring.
- OUT remains fixed while the rails scroll. Short panes scale OUT to fit its
  controls and IN; focus expands the available rack area. Focus is local view
  state and restores the prior workspace view without unmounting the editor.

## Observed browser proof

Run against Vite with provisioned Playwright Chromium:

```sh
node scripts/output-panel-browser.mjs http://127.0.0.1:5173 /tmp/monkeyboy-output-panel
node scripts/rack-visuals-check.mjs http://127.0.0.1:5173 /tmp/monkeyboy-rack-visuals
```

Observed in Chromium 156.0.8078.4:

- All four Hardware OUT looks retain BPM, VOL and IN outside the rail scroller at
  1600×1000, 1024×768 and 900×768. Both scroll axes moved 300/350 px while OUT
  stayed fixed. Cables from rails 1, 2 and 3 retained measured jack endpoints
  through scrolling, manual zoom, Fit, looks and focus/restore.
- Focus hides palette and code and restores the prior view without changing
  source. Width changes retain positions; an off-rail reduction is refused.
  OUT BPM updates the header and `setcpm`; VOL changes metadata alone.
- Native palette clicks produce SEQ → OSC → VCF → MIX before pinned OUT without
  moving MIX. Native LFO dragging displays its ghost before dropping on rail 2.
  Enveloped synth fits at 1440×900 without either inner rail scroll axis.
- Native occupied-input replacement connects MIX on rail 2 and OSC on rail 3 to
  pinned OUT. This regression first failed when a shrinking connection list moved
  an input under an output click's release. Completion now requires a real drag
  or an explicit input press. The cable-origin regression also caught and fixed
  a one-pixel frame/SVG offset before passing.
- A real Play gesture produced nonzero Strudel/WebAudio PCM. Pinned VOL Home
  muted measured output to zero after its gain settled; Backspace restored
  nonzero PCM, and Stop completed. No physical speakers/headphones were heard.
- The existing rack visual suite passed all 61 module/look combinations at 100%,
  75% and Fit, plus native fan-out/replacement/Undo, contrast, cable modes and
  the 29-panel trance patch. The existing mid-width suite passed at 1024×768 and
  900×768, including Show in code, selection and draft undo; page height stayed
  at 768 px.

The browser runner writes screenshots and `results.json` to its evidence directory.
These browser checks remain separate from shared CI because they require Chromium
and the real engine's external resources. Physical listening, other browsers and
physical touch devices remain unverified.

## Static and source proof

`npm run check` covers formatting/skill integrity, lint, unit behavior, guardrails,
TypeScript and production build. Focused regressions cover all saved widths,
nearest placement/spill, wide-rail reconciliation beyond 64 HP with opaque setup, invalid-width and
off-rail metadata, legacy source retention and canonical OUT identity. Every
library patch is saved/reopened at all three widths with exact executable bytes.

A byte comparison against the base branch verified all 14 library executable
bodies unchanged. Thirteen library files remove only OUT's two metadata position
fields; the showcase source remains untouched. The pre-change First sounds file
is retained as a legacy fixture. No acceptance criterion is intentionally deferred.

After rebasing onto #128, its frozen full-file/projection digest snapshots were
updated for the intentional OUT metadata removal and canonical coordinates. The
executable-body comparison against that new base still passed for all 14 library
patches; generator emission changes only the optional rail-width metadata field.

The setup-plus-width reconciliation regression failed before the reader retained
canonical field order and passed after that fix. The final rebased shared gate
passed 927 unit cases and 42 guardrails, the committed reader-corpus gate
(14/14 measured, zero parse/fetch failures), lint, formatting/skills, TypeScript
and the production build. Both #128 and #145 are included in the validated base.
