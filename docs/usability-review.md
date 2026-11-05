# Usability review

Review of `fa290cd` on 4 November 2026, tracked in
[#188](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/188). The
owner reported that the app had grown messier as features landed. This records
what was observed and proposed. Proposals are not settled until
[`decisions.md`](decisions.md) records them.

- [Mockups beside real panels](design/usability-review.html)
- [Measurements](usability-review-results.json)
- [Screenshots](evidence/usability-review/)

## Summary

About 20 features each added their own strip, prompt or scroll area, so the rack
went from the main event to one panel among many. Two inexpensive bugs cause much
of the bad feel: rendering re-parses the patch, and code edits remount the rack.

## Measurements

One knob step, on a production build with the transport stopped. Each row is
5 rounds of 7 steps, and every step changed its value.

| Patch                    | Modules | Median step | Range       | Median load |
| ------------------------ | ------- | ----------- | ----------- | ----------- |
| First sounds             | 5       | 85 ms       | 81–102      | 268 ms      |
| Three-voice sketch       | 12      | 299 ms      | 287–308     | 631 ms      |
| Function loops           | 21      | 708 ms      | 693–725     | 1,051 ms    |
| Trance, after conversion | 29      | 1,180 ms    | 1,152–1,197 | 1,402 ms    |

The limiter is `sourceBody`: 3,504 ms of 4,368 ms sampled across five steps on
an unminified Function loops build. `cartridges()` reaches it during render from
`App`, `SoundCrate` and `CartridgeBay`. Rerun with
[`knob-latency-check.mjs`](../scripts/knob-latency-check.mjs). A one-round rerun
gave 84, 296, 712 and 1,175 ms. The fix is not yet tested
([#168](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/168)).

Other observed results:

- **Code edits:** typing one space disabled Play, made the rack inert and reset
  zoom, module filter and cable mode.
- **Scrolling:** the page overflows by 43 px. Eight of 55 modules scroll at
  default size, led by SMPL (856 px of content in 270 px) and MIX (827 in 225).
- **Fit:** Trance fits at 14%, where a 24 px jack sits on a 24×55 px module. That
  gives 54 scrollers, 28 of them patch boxes, and draws 1 of 28 cables.
- **Trance layout:** 8 rows on a 64 HP rail, 66% full, so Fit fills about 13% of
  the viewport's width.
- **Layout shift:** selecting a module shrinks the rack frame from 614 to 570 px.
- **New patch:** 1,284 px of rail in an 831 px viewport leaves MIX off-screen.
- **Delete:** the key works only on a focused header. Backspace does nothing.
- **Undo:** restores a deleted module and the previous patch after a load. Undo
  after Make rack-editable was not tested.
- **Dropdowns:** about 35 of 42 setting dropdowns have four or fewer options, and
  at least 13 are off/on.
- **Refused edits:** only the Trance demo refused a knob edit among all 74 library
  patches, with up to four knobs tested per patch.
- **Contrast:** app chrome text measured 6.5:1 or better. Text on metal panels was
  not re-measured.

## Proposals

| Area                 | Proposal                                                     | Issues                 |
| -------------------- | ------------------------------------------------------------ | ---------------------- |
| Feel                 | Stop re-parsing and remounting; fix the shell and key access | #168–#172              |
| Consistency          | One button style                                             | #173                   |
| Module panels        | Toggles, slimmer panels, widen or restructure overflow       | #174–#176              |
| Workspace            | Left dock, File menu, plain wording                          | #177, #178             |
| Saving and loading   | My patches, Ctrl+S, shorter load and restore                 | #182, #183             |
| Sounds               | Real cartridges and whole-panel drop targets                 | #184, #185             |
| Large racks          | Overview zoom and better import layout                       | #186, #187             |
| Open owner decisions | Confirmations, apply behavior, conversion, 24 px jacks       | #179, #180, #181, #186 |

## Limits

Checks used headless Chromium at 1600×1000, with spot checks at 1440 and 1920 px.
Nothing was heard, and latency during playback was not measured. Mac, Firefox and
touch were not tested, and no real imported Strudel files were tried. The private
canvas was not accessed; the local board exports were used. Mockups are sketches:
their control names and pack counts are illustrative, and the
[catalog](../src/modules/catalog.ts) stays the source of truth.
