# Cable visibility control clarity

Observed 3 November 2026 as a follow-up to #88 and PR #125, using Node 24.22.2,
Vite and headless Chromium. The user's screenshot showed OSC selected: its two
attached cables remained bright after hover-out. The former Dim cables toggle
had no visible active treatment, and switching it off restored Focus rather than
showing every cable. The [design contract](design.md#rack-visual-hierarchy-85-86-96-88)
now names these as three explicit modes.

## Shared gate

`npm ci` and `npm run check` passed: formatting, skill integrity, lint,
861 unit tests, 40 guardrails, TypeScript and the production build.

## Browser proof

Start `npm run dev`, then run
`node scripts/rack-visuals-check.mjs http://127.0.0.1:5173 /tmp/rack-visuals`.
The new regression first failed against the old UI because the Cable visibility
control group was absent. It passes with the explicit modes:

- Focus starts active, with one pressed button. Selecting SEQ identifies `seq1`
  as selected; hovering VCF identifies `vcf1` as hovered and brightens its attached
  cables. Hover-out restores both SEQ emphasis and its selected readout.
- All brightens every cable despite the retained selection, and every cable
  stays bright during hover and hover-out. It reports “All cables visible”.
- Dim reports “All cables dimmed”, marks its button pressed, has a different
  background from inactive choices and dims every cable to 8%, including during
  hover and hover-out. Only one mode is pressed. Faded paths still pass pointer
  input to controls.
- Choosing All after Dim shows every cable. Native Space on Focus restores the
  selected-module emphasis. The complete saved source stays byte-for-byte exact
  through these mode changes; JUX's selector remains operable in Dim.
- The existing 183 module/look/zoom observations, ten-look contrast samples,
  connected-jack fan-out/replacement and 29-panel trance checks pass too. No
  uncaught page errors occurred and audio was not started.

Separate native-click captures use the Enveloped synth fixture with OSC selected:
Focus has two bright and four dim cables; All has all six bright; Dim has all six
at 8%. The toolbar fits without horizontal overflow at 1600, 1440, 1280, 1000 and
800 CSS pixels. The online private canvas was not accessed; the supplied local
board exports remain available as references.

The browser suite requires provisioned Chromium and runs separately from shared
CI under the existing [standards exception](standards.md). This evidence does not
establish physical screen-reader speech, touch or other-browser coverage. Modes
are local rack view state, like zoom; document replacement and existing rack
remount boundaries return to the default Focus mode. Audio and saved-patch
formats are unchanged.

## Captures

- [Focus identifies the selected OSC](evidence/cable-visibility/focus.png)
- [All shows every cable with OSC still selected](evidence/cable-visibility/all.png)
- [Dim clearly indicates that every cable is dimmed](evidence/cable-visibility/dim.png)
