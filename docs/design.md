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

An editable patch name sits beside the brand. Enter or blur saves it; Escape
cancels. New and unnamed files display **Untitled patch**; library loads use the
entry title. Export uses a sanitized filename while metadata retains the full
name. See [persistence and compatibility](patch-format.md#patch-names-62).

**Bounce WAV** beside Export takes a cycle count and downloads the applied patch
under the same sanitized name. It stops playback and leaves explicit Play
available afterwards. See [bounds, engine contract and observed PCM](wav-bounce.md).

The header owns the single Play/Stop control and a catalog-backed BPM readout.
BPM edits use the same source-preserving operation as OUT; OUT and code edits
update the header. Stop remains available while starting, applying, stopping or
recovering unknown scheduling, including with an invalid draft. Playing a patch
with only proven tempo setup reports “Nothing reaches OUT yet” and brings OUT's
highlighted input into view; it does not initialize audio. Unclassified imported
statements still reach the engine because reader coverage does not prove silence.

New racks place MIX at the right end of the first rail, with OUT pinned beside it
at the right edge of the rack frame, outside the scrolling rails. Palette clicks
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
| **Instrument**  | Brushed aluminium                                                                                                                                    | Barlow Condensed 700 on a category-colour band with dark text, status light | Knurled with a dark cap, tick ring                   | Silver nut; outputs on a black chip               | Jacks along the bottom inside an outlined patch box; dark recessed display in category colour |
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

Panels with switches or four or more controls use compact numeric rows, except
for drum grids and text editors; four plain level controls can share two rows.
SEQ places its mode label beside the select. This keeps the #130 controls inside
their fixed width and height across looks. Panels group switches before knobs
after sequence/grid/text editors, with the
same visual and keyboard order. Compact drum rows place the sample beside its
step cells. The v1 controls fit the existing catalog widths, so this change does
not widen modules or relocate saved patches. Panel labels are at least 11 px;
value fields/readouts are at least 12 px. Module IDs and rail labels use opaque
dark backgrounds for consistent contrast across looks.

The rack toolbar offers Fit rack and manual 75%, 100%, 125% and 150% zoom.
Fit recalculates when the viewport or row count changes; zoom is local view
state and changes neither source nor saved rack positions. Cable measurements,
wire pointers and module placement convert viewport coordinates back to rack
coordinates. Fit leaves an extra 24 screen pixels below the rails for wrapped
jack targets. Jacks reserve at least 24 screen pixels, growing their layout boxes
when zoomed out and wrapping into additional rows as needed.

See the [browser matrix, screenshots and verification limits](rack-feel-verification.md).

## Module menu and grid activity (#89, #90)

Look choices show miniature panels using the existing look/category styles, with
labels and a selected checkmark. Delete uses the same destructive colors in the
menu, selection tools and confirmation. Escape and an outside primary click
close the menu and return focus to that module's header; Show in code retains its
editor-focus action. There is no Close menu item.

The shared SEQ, DRUMS, CV SEQ and CHORD editors flash sounding source cells for
up to 400 ms, replacing the previous cell flash on the next event. Since #147,
DRUMS identifies the sounding nested cell in its own row rather than inventing
equal columns across rows. Capture the original source location and copy position
before rate/Alien transforms, and
deliver it through #37's scheduled AudioContext-time boundary. Rests and dropped
events have no independent tick; text cells match their contained leaf locations,
while whole-text notation and opaque/unattributed voices receive no invented playhead. Reduced motion replaces moving cell flashes with
a steady grid outline after its first sounding event. Stop, playback replacement,
surfaced errors and motion changes clear the old feedback. This affects neither
saved source nor rack geometry. See the [original browser evidence](feedback-verification.md#module-menu-and-step-playheads-89-90)
and [nested acceptance](nested-step-editor-verification.md).

## Rack visual hierarchy (#85, #86, #96, #88)

The #58 decision keeps new Hardware modules in Instrument and gives their header
bands the existing category colours; Powder coat remains available. Band text
uses dark ink. Modules with no graph path to OUT dim their panel surface and
Instrument band, retaining contrasting labels and controls. Their accessible
module names add “not connected to OUT”. Reconnecting a path brightens them;
this describes routing, independently of transport or emitted source ranges.
The badge beneath the panel shows only its ID, avoiding status text wrapping over
the jack labels.

Dense panels keep their catalog width and rail height. Controls scroll inside
the panel; a crowded patch box also scrolls within a bounded area so Fit rack
cannot push jacks beyond the rails. Jack targets retain their minimum size, and
cable endpoints follow scrolling inside either the rail viewport or a patch box.
Mixer name inputs use the same bounded field width as selectors.

Signal type has a shape as well as its unchanged colour: pattern cables are
dotted and jack centers square; audio cables are solid and centers circular;
mod cables are dashed and centers diamond-shaped. These marks remain inside
each look's outer jack geometry. Connected passthrough jacks inherit the upstream
signal; unresolved jacks have a dotted circular center. Jack accessible names
include the signal type. Cable warnings retain their text and mark the plug
collar, leaving the signal stroke pattern intact. Cables have no flow animation.

The rack toolbar's **Cables** group has three exclusive modes: **All** shows
every cable even when a module is selected or hovered; **Focus** fades unrelated
cables; **Dim** fades every cable. Focus is the default, retaining #88's behavior:
hover takes precedence over selection, and leaving restores the selected module's
cable emphasis. The active mode has a checkmark, contrasting background and
pressed semantics. A visible readout says whether all cables are visible/dimmed
or identifies the module controlling Focus and whether it is hovered or selected.
This separates “show all” from the former toggle's ambiguous return to Focus.

Faded cables allow pointer input through to controls; the Connections list still
selects them for removal or repatching. Modes and hover/selection emphasis are
local view state and do not write source or rack metadata. See
[browser and contrast evidence](rack-visuals-verification.md) and the
[control-clarity follow-up](cable-visibility-verification.md).

## Mid-width workspace (#91)

At widths up to 1150 px, a Rack / Code / Both button group switches local view
state. Both is the default: rack and code share the space below the palette
side by side. Rack gives the rack the full width; Code gives the editor the full
workspace and hides the palette. At 700 px and below, Both divides that space
vertically. The workspace uses the viewport height; each pane scrolls internally
when its content needs more room, leaving the view controls and transport reachable.

The palette becomes a horizontally scrollable strip with category groups, full
chip labels/calls and its existing filter. Module widths and saved positions
remain catalog-owned. View changes keep the editor mounted, retaining drafts,
selection and undo. Show in code opens Code from Rack, preserves Both when both
panes are visible, and focuses/selects the module's source after revealing it.
Selection highlights survive returning to either view. View choices never write
source or saved rack state. Wider screens keep the existing three-column layout.

See [browser observations and limits](mid-width-verification.md).

## Output panel and per-patch rails (#133)

OUT keeps its catalog IN, BPM and VOL controls and all four Hardware looks, but
occupies a fixed case panel to the right of the rail viewport. Rail
scrolling never moves OUT. In a short pane, OUT scales to keep its controls and
IN visible; rack focus restores the available height. Cables use measured jack centers in the frame's SVG
coordinates, refreshed on scrolling, zoom, resize, look and workspace changes.
The panel cannot be moved, duplicated or deleted. Selecting OUT in the palette
selects the existing panel.

The rail-width control offers 64, 84 and 104 HP and saves that choice per patch.
New patches choose the widest full-window case that fits; files without a saved
width stay at 64. The normal palette/code columns can still require zoom or
scroll. Changing the window or a look never moves rail modules. A width reduction
that would strand a module is refused. MIX starts at the saved rail's right end;
palette insertion and drag previews retain the nearest-free-interval rule.
Fit rack uses the rail viewport after reserving space for OUT.

**Focus rack** hides the palette and code at every window size. **Restore
workspace** restores the previous view; the editor remains mounted, retaining
its document, draft and selection. Show in code leaves rack focus. Focus and zoom
are local view state and never change saved width or executable source.
See [verification and compatibility evidence](output-panel-verification.md).

## Nested step editor (#146)

Planned for #147; the [storyboard](design/nested-step-editor.html) shows every state.
The editor keeps today's areas: 104 × 73 px in SEQ and 109 × 18 px per DRUMS row. Time
reads like text, so `width = share of cycle × lines × area width`. The line count is
the largest of 4, 3 or 2 that starts each line on a cell boundary. Otherwise it uses
four lines, and a cell crossing a break continues with dotted edges, carrying its
content in its widest piece.

Marks work without colour, and looks change only their tokens:

- Groups have heavy side bars. Too narrow for their children, they collapse to a count;
  chords and choices collapse to `c2+2`. Opening one shows a crumb in the legend row.
- `*n` adds ticks, `/n` hatching, `?` a dashed border, and `!n` linked cells with
  dotted joins. `@n` and `_` are width alone, and dragging the right edge changes `@n`.
- `,` and `|` stack as lanes; `|` adds a diamond. `<…>` shows this cycle's alternative
  with pager dots. `(k,n,r)` is n dots in SEQ and n computed steps in DRUMS.
- Rests are hollow with a center dot. Text cells are italic with a double left edge and
  a corner fold.
- A whole-row `*n` in DRUMS shows ghost copies of its first period.

Numbers add a level bar behind the label, gates fill the cell, and a mixed DRUMS row
reads `mix` with first letters where they fit. The tray floats beside the panel,
outside module geometry. Each editor is one Tab stop with roving focus; arrows move
between cells, Enter opens or edits and Esc backs out.

Activity matches each event's source location to a cell and otherwise keeps #90's
timing, reduced-motion outline and clearing rules. Collapsed groups flash as one cell,
text cells flash when an event falls inside their span, and `<…>` pages with the cycle
unless the cell is being edited. See the [study](nested-step-editor.md) for options,
measurements and the [parser requirements](nested-step-editor.md#what-147-must-handle).

## Effect order notes (#134)

The Connections area shows a neutral “You hear” note listing stage module names
and IDs in audible order. It distinguishes inline FX with per-note send tails
from native orbit sends. Reordering supported effects does not mark cables or
connection targets as warnings. Audio fan-out retains its existing level warning. Repeated native setters share
one listed stage with an explanation that later setters override matching
controls; explicit FX stages remain separate.

## Function cables (#135)

SEND/RETURN jacks use λ centers and announce “function”; SEND's visible role also
appears in its accessible name. Cables are Alien teal with a long/short dash
pattern (`16 4 3 4`), distinct from modulation's uniform dashes and pattern dots.
Their hover text names the loop role and generated lambda; jack hover does the
same. Lambda source receives teal ink while CODE retains its dashed underline.
Widths stay catalog-owned and cable endpoints follow measured live jacks.
Connections list entries include “function λ”, keeping their selection/removal
path available when cables are faded. See [acceptance evidence](function-loops-verification.md).

## Cartridge rail (#137)

The bay sits above the rack toolbar and scrolls its cartridge row horizontally.
Each card shows pack name, source, branch/pin, file count and a textual status
beside its LED. Counts/status are unknown before registration. Factory and
source-owned cards have no Eject action. Bay-owned ejection uses an inline
confirmation with Cancel when sample modules or opaque CODE may depend on it.
Seating takes a GitHub shortcut or manifest URL through a labeled form. The bay
shares the code/rack draft lock and accepted-document history. It never changes
module widths or cable geometry. Short panes retain a usable minimum case height
and scroll the rack pane. See the [source and engine contract](cartridges.md).
