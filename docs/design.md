# Design

The visual design lives on a Claude design canvas:

**https://claude.ai/code/artifact/3393aa60-6a3d-44b6-9c49-c6e46a06bb8b** (private). [Public canvas](https://claude.ai/artifact/7NQ4nAYu8CfWkjPk9Cjr3t#page-dcb81aee8d83).

User-provided exports received on 2 November 2026 are available locally:

- [Brand — logo](design/brand-logo.png)
- [Workspace — v1 (playable)](design/workspace-v1.png)
- [Translation key](design/translation-key.png)
- [Looks — hardware](design/looks-hardware.png)
- [Looks — alien](design/looks-alien.png)
- [Looks — cyber](design/looks-cyber.png)
- [Original HTML export](design/design-canvas.html)

The PNGs were extracted from the supplied ZIP; the HTML is an unchanged copy of the supplied export. The HTML is an archived reference, not application source.

The canvas boards are mock-ups, not app code. Treat them as reference.

For values, cable gestures, rack editing, and half-typed code/error states,
see the [interaction proposal](interaction-proposal.md) and its
[interactive storyboard](design/interaction-proposal.html). The five UX choices
are owner-approved. See [rack evidence](rack-verification.md) and
[workspace/looks evidence](workspace-verification.md) for implementation and limits.

## Boards

| Board                         | What it shows                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brand — logo**              | Smiley logo, wordmark, app icon sizes, light background, app header                                                                                                                                                                                  |
| **Workspace — v1 (playable)** | The one-screen workspace: library, rack, live code. Right-click any module to switch its look; cables re-route when a look moves its jacks; the amp’s output fans out to two cables named `lead`; the code’s last lines are the layout comment block |
| **Translation key**           | The three cable types, every module and the Strudel it writes, and the six translation rules                                                                                                                                                         |
| **Looks — hardware**          | Powder coat, Instrument, Vintage lab and Learner on an oscillator, filter and envelope                                                                                                                                                               |
| **Looks — alien**             | Crystal, Bioluminescent and Monolith on ITER and JUX                                                                                                                                                                                                 |
| **Looks — cyber**             | Terminal, Neon wireframe and Bare board on two CODE blocks                                                                                                                                                                                           |

The green **Locked** and blue **V1 scope** notes on the canvas match [`decisions.md`](decisions.md) and [`v1-scope.md`](v1-scope.md).

## App chrome

The top-bar Patch library opens the nested collection browser from #45. It uses
the existing dark surfaces, orange primary action and Barlow panel typography.
The module picker stays alongside the rack. Its independently scrollable palette
groups chips by the six categories, shows family badges and catalog-owned Strudel
calls, and filters names/calls (#79). Labels wrap without ellipsis; rack module
widths stay fixed. See the
[library interaction contract and observed layouts](patch-library.md).

The header owns the single Play/Stop control and a catalog-backed BPM readout.
BPM edits use the same source-preserving operation as OUT; OUT and code edits
update the header. Stop remains available while starting, applying, stopping or
recovering unknown scheduling, including with an invalid draft. Playing a patch
with only proven tempo setup reports “Nothing reaches OUT yet” and brings OUT's
highlighted input into view; it does not initialize audio. Unclassified imported
statements still reach the engine because reader coverage does not prove silence.

New racks place MIX and OUT at the right end of the first rail. Palette clicks
fill free space from the left. Clicks and drag previews share the same placement
search: nearest whole HP on the requested rail, then the next free rail or a new
one, without shifting neighbors. Saved and imported positions are retained.

Open file is a keyboard-focusable button that opens the hidden file picker.
Open in Strudel opens a separate tab using the accepted executable source,
without rack metadata, encoded as UTF-8 Base64 in the URL hash. An unreadable
draft shows that the last readable code will be used. Copy and Export retain
the exact draft, including saved rack state. See the
[five-issue acceptance evidence](workspace-trust-verification.md).

| Token         | Value                                |
| ------------- | ------------------------------------ |
| Background    | `#101113`                            |
| Panels        | `#131417`, `#15171b`                 |
| Borders       | `#24272c`, `#2a2d33`                 |
| Text          | `#e4e6ea`; muted `#9aa0a8`           |
| Rack interior | `#0a0b0d`, rails `#3b3f46 → #25282d` |

## Editor status (#73)

One bar directly beneath the source editor contains the cursor's one-based line
and column, rack/code sync state, concise engine status and an **Audio engine
info** disclosure. Cursor coordinates follow the active selection head and
mapped document changes without updating React workspace state. The header
retains the single Play/Stop control and tempo.

The bar says “Ready” while stopped, “Loading samples” during manifest
registration, “Playing” while scheduled, and reports starting/applying/stopping
or audio errors as needed. “Ready” means the transport is available; it does not
promise decoded samples or audible output. Manifest state, sample-readiness
limits and Stop/tail caveats live behind the keyboard-operable info control.
An observed resource failure keeps that control visibly marked after retries.

Parser, metadata and runtime errors expand this same footer. Revert, metadata
replacement, runtime error details and the slow-evaluation export/reload advice
remain reachable; the header Stop and global Stop shortcut keep their #36
semantics. See [browser observations and checks](editor-status-verification.md).

## Looks at a glance

Each look is a set of layout rules plus tokens applied to a module’s control list (see [`decisions.md`](decisions.md#looks)). Fonts are Google Fonts.

### Hardware

| Look            | Panel                                                                                                                                                | Name type                                                                   | Knobs                                                | Jacks                                             | Layout rule                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Powder coat** | Painted in the category’s dark colour (sound `#9A4F22`, shape `#8E3457`, mod `#2B567F`, fx `#5A3E8F`, pattern `#7A6512`, util `#474C55`), fine grain | Barlow Condensed 700, 26 px, off-white                                      | Black with off-white indicator and printed tick ring | Silver nut; outputs labelled on an off-white chip | Jacks along the bottom; printed signal-flow line above them                                   |
| **Instrument**  | Brushed aluminium                                                                                                                                    | Barlow Condensed 700 on a black band, category-colour status light          | Knurled with a dark cap, tick ring                   | Silver nut; outputs on a black chip               | Jacks along the bottom inside an outlined patch box; dark recessed display in category colour |
| **Vintage lab** | Matte black, grain                                                                                                                                   | Barlow Condensed 600, letter-spaced, centred, off-white with a rule beneath | Chrome skirt, black cap                              | Ring coloured by signal type                      | **Jacks along the top**, under the name; controls below                                       |
| **Learner**     | Warm white, 14 px corners, 2 px dark outline, offset shadow                                                                                          | Fredoka 600, lower case                                                     | Category-coloured, outlined, white pointer dot       | Ring coloured by signal type                      | Jacks along the bottom; rounded white display                                                 |

### Alien

| Look               | Panel                                                       | Name type                                      | Controls                                            | Jacks            |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------- |
| **Crystal**        | Faceted dark teal glass, inner teal light, facet lines      | Barlow Condensed 700, teal `#8CF5DA` with glow | Hexagonal crystal knobs; chevron selector           | Hexagonal        |
| **Bioluminescent** | Deep violet, irregular rounded corners, glowing green veins | Quicksand 700, acid green `#C2FF9A`            | Glowing orb knobs; pill selectors                   | Glowing “pores”  |
| **Monolith**       | Obsidian slab with an iridescent rim, no screws             | Michroma, widely spaced, centred               | Lit rings instead of knobs; engraved line selectors | Thin white rings |

### Cyber

| Look               | Panel                                                                               | Name type                               | Controls                     | Jacks                        |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------- | ---------------------------- |
| **Terminal**       | Green-phosphor CRT inside a dark bezel, scanlines                                   | VT323, `#7CFF9B`                        | `[ EDIT CODE ]` text button  | Silver nut on the bezel      |
| **Neon wireframe** | Black with cut corners, magenta-to-cyan outline, faint grid                         | Chakra Petch 700 with a chromatic split | Outlined `EDIT ›` button     | Square, cyan glow            |
| **Bare board**     | Black circuit board, gold traces, “NO PANEL YET” silkscreen; code printed on a chip | Share Tech Mono                         | Tactile switch labelled EDIT | Silver nut, labelled J1 / J2 |

### In the code panel

| Family        | Treatment                                     |
| ------------- | --------------------------------------------- |
| Hardware      | Text in the module’s category colour          |
| Alien         | Teal `#8CF5DA` with a soft glow               |
| Cyber         | Off-white with a dashed gold underline        |
| Named outputs | Orange `#FFC48F` on a faint orange background |

The [#37 feedback contract and browser evidence](feedback-verification.md)
record the production code treatments, all-span selection, editing-only cursor
and event-timed visual activity. These treatments preserve the saved source.

## Panel controls and rack zoom (#81, #82, #84, #92, #94, #95)

Numeric controls show a rotary slider, label and editable value including its
unit. Double-click resets to the catalog default; Backspace resets a focused
knob. Arrows move through the existing drag scale (1% of travel; Shift: 0.1%),
snapped to at least one catalog step. Detented controls move to the adjacent
detent; Home/End reach the range limits. Slider semantics announce the label,
range, current number and unit. All changes use the existing commit boundary,
including source preservation and live playback updates.

Panels group switches before knobs after sequence/grid/text editors, with the
same visual and keyboard order. Compact drum rows place the sample beside its
step cells. The v1 controls fit the existing catalog widths, so this change does
not widen modules or relocate saved patches. Panel labels are at least 11 px;
value fields/readouts are at least 12 px. Module IDs and rail labels use opaque
dark backgrounds for consistent contrast across looks.

The rack toolbar offers Fit rack and manual 75%, 100%, 125% and 150% zoom.
Fit recalculates when the viewport or row count changes; zoom is local view
state and changes neither source nor saved rack positions. Cable measurements,
wire pointers and module placement convert viewport coordinates back to rack
coordinates. Jacks reserve at least 24 screen pixels, growing their layout boxes
when zoomed out and wrapping into additional rows as needed.

See the [browser matrix, screenshots and verification limits](rack-feel-verification.md).
