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

The [usability review](usability-review.md) and its [mockups](design/usability-review.html)
record refinements, tracked in [#188](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/188). The mockups and [owner decisions](decisions.md#usability-review-188-decided-4-november-2026)
are approved, and each issue builds its part.

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

The app fills the window and the page itself never scrolls; the dock, rack and code
each scroll on their own. Selection tools, prompts and destinations float
over the rack, and Connections and notes open as one-at-a-time footer popovers, so
the rack frame keeps its size. Chrome buttons share one style in `src/index.css`.

The header's **File** menu holds New patch, Open file, Patch library, Save patch, Export,
Bounce WAV and Open in Strudel (#178, #182). It is a button that shows and hides plain buttons, so
Tab, Enter and Space work as usual, Escape returns to File, and a click elsewhere
closes it. An action returns focus to File first, so a dialog it opens returns there
too. The code pane keeps Apply code, Auto-apply while playing and Copy, plus its status
bar, and the rack toolbar is one row at 1600 px.

Visible text is plain: rail widths read Narrow, Medium and Wide, rows read Row 1, and
packs are added, not seated. Exact engine detail stays behind the ⓘ control, so
nothing overpromises readiness.

The left dock has **Modules**, **Sounds** and **Packs** tabs (#177), and each tab has
one vertical scroll. Modules groups compact chips by the six categories,
using two columns where whole words fit and a full row for longer names,
with the catalog-owned Strudel call on each chip, the title in its tooltip and accessible
description, and a filter on names and calls (#79). Labels wrap without ellipsis; rack
module widths stay fixed. Sounds opens on search; searching opens every matching bank,
and sounds load on the first visit. Packs holds the cartridge list, and a pack warning
also shows on the tab, so it is seen from any tab. The tabs stay usable while the rack
is locked. The Patch library opens the nested collection browser from #45. It uses the
existing dark surfaces, orange primary action and Barlow panel typography. See the
[library interaction contract and observed layouts](patch-library.md).

An editable patch name sits beside the brand. Enter or blur saves it; Escape
cancels. New and unnamed files display **Untitled patch**; library loads use the
entry title. Export uses a sanitized filename while metadata retains the full
name. See [persistence and compatibility](patch-format.md#patch-names-62).

**Bounce WAV** in the File menu takes a cycle count and downloads the applied patch
under the same sanitized name. It stops playback and leaves explicit Play
available afterwards. See [bounds, engine contract and observed PCM](wav-bounce.md).

The header owns the single Play/Stop control and a catalog-backed BPM readout.
A muted 20 px GitHub mark follows Play/Stop at the right end of the header,
with a 44 px target, a hover highlight and a visible keyboard focus ring.
Its “View source on GitHub” link opens the project repository in a new tab,
keeping the patch open. It remains available in rack focus.
BPM edits use the same source-preserving operation as OUT; OUT and code edits
update the header. Stop remains available while starting, applying, stopping or
recovering unknown scheduling, including with an invalid draft. Playing a patch
with only proven tempo setup reports “Nothing reaches OUT yet” and brings OUT's
highlighted input into view; it does not initialize audio. Unclassified imported
statements still reach the engine because reader coverage does not prove silence.

New racks place MIX at the right end of the visible first rail, with OUT pinned beside it
at the right edge of the rack frame, outside the scrolling rails. Palette clicks
fill free space from the left. Clicks and drag previews share the same placement
search: nearest whole HP on the requested rail, then the next free rail or a new
one, without shifting neighbors. Saved and imported positions are retained.

Open file opens the hidden file picker.
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

| Look            | Panel                                                                                                                                                | Name type                                                                   | Knobs                                                | Jacks                                             | Layout rule                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Powder coat** | Painted in the category’s dark colour (sound `#9A4F22`, shape `#8E3457`, mod `#2B567F`, fx `#5A3E8F`, pattern `#7A6512`, util `#474C55`), fine grain | Barlow Condensed 700, 19 px, off-white                                      | Black with off-white indicator and printed tick ring | Silver nut; outputs labelled on an off-white chip | Jacks along the bottom; printed signal-flow line above them                    |
| **Instrument**  | Brushed aluminium                                                                                                                                    | Barlow Condensed 700 on a category-colour band with dark text, status light | Knurled with a dark cap, tick ring                   | Silver nut; outputs on a black chip               | Jacks along the bottom inside an outlined patch box; plain values on the panel |
| **Vintage lab** | Matte black, grain                                                                                                                                   | Barlow Condensed 600, letter-spaced, centred, off-white with a rule beneath | Chrome skirt, black cap                              | Ring coloured by signal type                      | **Jacks along the top**, under the name; controls below                        |
| **Learner**     | Warm white, 14 px corners, 2 px dark outline, offset shadow                                                                                          | Fredoka 600, lower case                                                     | Category-coloured, outlined, white pointer dot       | Ring coloured by signal type                      | Jacks along the bottom; rounded white display                                  |

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

Knobs sit in columns, two on an 8 HP panel and three from 12 HP, with the label
and value under each knob. Values print as plain text on the panel and turn into
a field when clicked. Panels group switches before knobs after
sequence/grid/text editors, with the same visual and keyboard order. Compact drum
rows place the sample beside its step cells. Panel labels are at least 11 px and
values at least 12 px. Rail labels and module IDs use opaque dark backgrounds for
consistent contrast across looks.

Short switches are buttons (#174): off/on is a lit push button with
`aria-pressed`, and two to four options are a segmented control of native radios
in a named `radiogroup`, so arrow keys work. Neighboring push buttons, such as
MUTE and SOLO, share a line. Longer lists stay a compact dropdown, as does any
list whose labels would not fit the panel, using the
[catalog rule](module-spec.md#switch-presentation-174). A label shares its
control's line when the panel is wide enough. Each look sets the `--control-*`
tokens in `src/looks/looks.css`, which own how these controls read.

Panels stay slim (#175). The header holds the name, its title and the status
light in about 38 px. A title or a spaced name may take a second line rather than
clip, and a word with more letters than the panel has HP tightens instead.
Module IDs appear only on hover, focus or selection; panel names for assistive
technology still include them. ACCENT rests on one line and opens over the controls below it while focused, so nothing moves.

A module keeps its full category color whether or not it reaches OUT. Routing
shows on the status light, lit green when connected and an empty ring when not,
with a tooltip and the panel's existing “not connected to OUT” name. The light
appears in every look. On Instrument it also flashes white on each event.

No module scrolls at default size in any look (#176), and no catalog width changed
to get there. MIX stands as four channel strips, each with a fader, M and S, and
SPLICE fits with a shorter text box. Rarely used fields move to a More flyout
beside the panel, dark like the nested editor's tray so it reads the same beside
every look. The flyout takes focus when it opens and follows its panel as the rack
scrolls. It opens on the free side and stays full size at any zoom. Escape closes
it and returns focus to More without changing rack status; Escape still cancels an
active cable or placement gesture when no flyout consumes it. Clicking outside
closes it. OSC keeps its secondary supersaw fields in More and fits in both pitch
modes in all four Hardware looks.

Panels overlap two rails, each with one hole per HP, and the pinned OUT panel has
matching rails. Looks that have screws on their boards show two fixing screws.

The rack toolbar offers Fit rack and manual 75%, 100%, 125% and 150% zoom.
Fit recalculates when the viewport or row count changes; zoom is local view
state and changes neither source nor saved rack positions. Cable measurements,
wire pointers and module placement convert viewport coordinates back to rack
coordinates. Fit leaves an extra 24 screen pixels below the rails for wrapped
jack targets. Jacks reserve at least 24 screen pixels, growing their layout boxes
when zoomed out and wrapping into additional rows as needed; [#186](decisions.md#usability-review-188-decided-4-november-2026) limits this to 75% and above. Every cable stays drawn; clipped live jack endpoints pin to the visible patch-box edge.
Below 75%, panels are navigation targets: click or focus and Enter/Space zooms to
100% and centres the module. Rail controls and every jack are inert; the
independently sized pinned OUT keeps VOL and BPM available. Internal scrolling is
hidden, and cable visibility is All. Connections still lists every cable and
supports selection, removal and a complete destination chooser for repatching.
Moving a cable selected on the canvas opens that chooser automatically.

The rack frame retains at least 430 px of height on desktop; short workspaces scroll
the rack pane instead of shrinking the rails and pinned OUT into thumbnails. The
mid-width workspace retains its 200 px minimum so the rack and code views fit
alongside each other.

See the [browser matrix, screenshots and verification limits](rack-feel-verification.md).

## Messages and undo (#179, #181, #183)

A short message replaces routine confirmations. Deleting a module, replacing a
cable and loading over changed work act at once and say so, as in “Deleted OSC and
2 cables · Undo”. A clean load has nothing to take back, so it stays quiet. A load
that stopped playback says “Playback stopped”, because Undo does not restart it.

One message shows at a time, low in the window, so it never moves the rack. It
stays for 12 seconds, and hovering or focusing it holds it open. Escape from inside
it or its × dismisses it. It sits in a polite live region that stays mounted, so
screen readers announce each new message. Its Undo works by mouse and keyboard, and
Ctrl/Cmd+Z does the same thing.

Undo must take back the action it names, so any newer edit, draft or undo retires
the message. Only the live values of the same knob gesture keep it. After a delete,
focus moves to the next module, which is also selected. After Undo it returns to the
restored module, or the jack of a restored cable, and otherwise to Redo.

A rack edit that needs a rewrite completes at once and says “Code rewritten in rack
style · Undo” every time, joined to any other message, as in “Deleted QUANT · Code
rewritten in rack style”. An edit that cannot be converted explains why in the same
place, with no Undo because nothing changed.

A prompt remains only for an unapplied code draft, which Undo cannot restore. It floats
over the workspace, because a File action can run while the rack or code is hidden. It
offers Cancel, Export code and the action. While a replacement waits for audio to
stop, the message offers Cancel.

Double-clicking a library patch, or pressing Enter on it, loads it. A single click
and Space only select. A file or library load opens at Fit, including overview below 75%. New keeps the current zoom.

A reload restores the last work silently, with its draft, and the message offers
Start new. Start new is itself undoable.

## The locked rack (#180)

The rack stays locked during an unapplied code draft, and that must be plain before
you try a knob. An orange strip across the top of the rack says “Rack locked”, gives
the reason and offers the way out: Apply and Revert for a draft, Revert alone with
“Fix the code or revert to unlock” for unreadable code, and Replace metadata when the
saved rack cannot be read. Apply and Revert return focus to the editor. Hatching covers the rack, OUT and the module list, and the
cursor becomes not-allowed. The words, hatching and cursor mean the lock never relies
on color alone, and the strip sits in a polite live region, so it is announced.

A touch on the rack or module list pulses the strip. They are `inert`, so that touch
reaches the nearest parent, which reports it. Reduced motion keeps the outline and
drops the movement.

The strip must not flicker. While stopped, every keystroke is briefly unapplied and
half-typed code is briefly unreadable, so the rack only looks locked after typing has
paused for 1.2 seconds with the code still unapplied, or as soon as you leave the
editor. Header controls and the code footer follow that same state, and source colors
stay in place while you type. Panels rebuild when accepted code changes the patch, not
when the lock appears or on each keystroke, so a Revert keeps them as they were.

## Module menu and grid activity (#89, #90)

Look choices show miniature panels using the existing look/category styles, with
labels and a selected checkmark. Delete uses the same destructive colors in the
menu and selection tools, and acts at once. Escape and an outside primary click
close the menu and return focus to that module's header; Show in code retains its
editor-focus action. There is no Close menu item.
Delete and Backspace remove the selected module or cable from anywhere in the rack,
except in text fields, the code editor and controls that use those keys themselves.

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

## Controls and the cable layer

Cables are drawn over the panels, and selecting on press wakes a module's cables, so
a cable can appear under the pointer between press and release. Interactive panel
controls therefore stay above the cable layer, as jacks do. New controls need the
same treatment. Cable paint keeps its signal-specific dots/dashes; a separate
continuous transparent stroke owns hover and selection. Faded cables pass the
pointer through both strokes. Test controls with a real pointer click on a panel that has a cable
crossing it: a synthetic click or a hit-target check passes while real clicks are lost.

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
state. Both is the default: rack and code share the space below the dock
side by side. Rack gives the rack the full width; Code gives the editor the full
workspace and hides the dock. At 700 px and below, Both divides that space
vertically. The workspace uses the viewport height; each pane scrolls internally
when its content needs more room, leaving the view controls and transport reachable.

The dock becomes a 150 px band across the top with the same three tabs, and each tab
keeps its one vertical scroll. Chips fill the width. Module widths and saved positions
remain catalog-owned. View changes keep the editor mounted, retaining drafts,
selection and undo. Show in code opens Code from Rack, preserves Both when both
panes are visible, and focuses/selects the module's source after revealing it.
Selection highlights survive returning to either view. View choices never write
source or saved rack state. Wider screens keep the existing three-column layout.

See [browser observations and limits](mid-width-verification.md).

## Output panel and per-patch rails (#133)

OUT keeps its catalog IN, BPM and VOL controls and all four Hardware looks, but
occupies a fixed case panel to the right of the rail viewport. Rail
scrolling never moves OUT. A cable to a jack scrolled out of the rail viewport
ends at that viewport's edge, so it never crosses OUT. In a short pane, OUT scales to keep its controls and
IN visible; rack focus restores the available height. Cables use measured jack centers in the frame's SVG
coordinates, refreshed on scrolling, zoom, resize, look and workspace changes.
The panel cannot be moved, duplicated or deleted. Selecting OUT in the palette
selects the existing panel.

The rail-width control offers 64, 84 and 104 HP and saves that choice per patch.
New patches choose the widest rail visible at 100% beside the palette and code,
and 64 HP when none fits; files without a saved
width stay at 64. The normal palette/code columns can still require zoom or
scroll. Changing the window or a look never moves rail modules. A width reduction
that would strand a module is refused. MIX starts at the visible rail's right end;
palette insertion and drag previews retain the nearest-free-interval rule.
Fit rack uses the rail viewport after reserving space for OUT.

**Focus rack**, in the rack toolbar, hides the palette and code at every window size. **Restore
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

A rack footer popover shows a neutral “You hear” note listing stage module names
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

## Sound crate and tape (#138)

The dock's Sounds tab opens on search. Seated packs, including both factories, have
sections; bank-prefixed names have labelled drawers. Each sound is a draggable card
with previous/next variant controls and an audition action. Searching retains pack
sections and opens matching banks. A first visit or refresh loads inventories through the
engine without applying source or starting transport. Historical unseated registry
entries are excluded. Manifest status and errors retain #137's distinctions.

DRUMS row names accept cards. SMPL, REVERB IR, SPLICE and WAVETABLE have catalog-owned
drop slots with native selectors as a keyboard alternative; clearing restores an
empty slot. WAVETABLE offers only seated `wt_` sounds. Imported unavailable values
are shown without adding them to the available inventory.

SMPL's tape has B/E/LB/LE markers on separate lanes, all measured over the same
sample strip. Pointer dragging and left/right arrows edit the associated fractions;
Home/End reach 0/1. A pointer gesture is one accepted undo group. LOOP is explicit.
The existing numerical controls and applied code update those same marks. SPLICE
shows one razor mark per division across the full sample strip, following COUNT
in every Hardware look; its count/mode/order controls own the code.
All controls remain inside the existing panel scroller; widths and jack positions
follow the existing look/zoom rules. See [acceptance and limits](sound-crate.md).

## Cartridge list (#137)

The dock's Packs tab is a bay of cartridge shells (#184): notched shells with grip
ridges and a pack-colored stripe, laid out as a single column in the 180 px dock
and as a shelf when the dock spans the window at mid and narrow widths. Each label
shows the pack name, its branch or pin, a sound count and a worded status (not
loaded, loading, ready or failed) beside its LED, so status never relies on color.
Counts/status are unknown before registration. The source URL stays off the shell:
a readout below the bay shows source, ownership and file count for the cartridge
under the pointer or with focus, and pressing a label pins it for touch. Screen
readers get the same detail as the label's description. Failures are listed below
the bay in words. Factory and source-owned cartridges have no Eject action;
bay-owned ones carry a keyboard-reachable Eject that uses an inline confirmation
with Cancel when sample modules or opaque CODE may depend on it.
The empty slot at the end of the bay is the way to add a pack: it opens a labeled
form for a GitHub shortcut or manifest URL, and Escape or Cancel closes it. The
list shares the code/rack draft lock and accepted-document history. It never changes
module widths or cable geometry. See the [source and engine contract](cartridges.md).

## Audio-mod cables (#136)

An audio output entering CV uses an orange 7-px stroke with a blue 3-px dashed
center (`3 7`), retaining both a double stroke and a dash rhythm in greyscale.
The receiving CV jack has a `≋` center and announces “audio-mod”; cable hover
and the Connections list name the same kind. The source output remains audio
when it also feeds MIX. Live jack measurements and every existing look/visibility
mode continue to own geometry and emphasis. GATES uses filled gate cells in the
shared nested editor. See [observed routing proof](routing-verification.md).

## Pattern visibility and credits (#139)

The header's compact cycle readout and progress bar follow Strudel's actual
scheduler and state the BPM-to-`setcpm` relation. Reduced motion freezes these
visuals. The rack frame shows an expandable **Patch credits** disclosure above
the toolbar, with source metadata rendered as text; explicit patch names keep
precedence over the original source title. Credits remain usable in rack focus.

Yellow pattern cables open a static four-cycle punchcard on hover. Alt-click pins
it; the Connections list's **Probe cable** and **Close probe** offer native button
operation. An unavailable prefix states **Not probed** with its reason. Probe
state is local view state and never changes wiring or saved layout. The card
lists event values and gives each duration mark a value/time title.

SCOPE adds a recessed waveform/spectrum canvas above its catalog controls, at its
fixed 14 HP width in every Hardware look. Reduced motion draws a static baseline
and labels it **Motion paused**, without continued sampling. No existing module
width or cable geometry changes. The local exported reference boards were
available; the live private canvas was unavailable. See the
[observed acceptance record](pattern-visibility-verification.md).

## Arranger lane (#141)

**Arrange** sits in the rack footer beside Connections and opens as one of the
same one-at-a-time footer popovers, spanning the rack's full width along its
bottom edge. Like the others it floats over the rack, so the rack frame, Fit zoom
and pinned OUT keep their size; an inline lane shrank the frame and pushed Fit
below the 75% overview threshold. Its summary counts arranged channels
(**Arrange (2)**). The panel has the song length (− / + in cycles) and a one-line
hint. Each connected MIX channel is a row: its name (channel NAME, else the module
feeding it), one 18 px cell per cycle with a brighter edge every four cycles, and
the exact code it writes in code ink (`.mask("<0!2 1!2>")`, or _every cycle_).
Playing cycles use the audio orange. Rows scroll inside the panel beyond about six
rows or the width of the song. The panel is inert while the rack is locked. See
the [interaction contract](arranger.md#contract).

## Sound assignment (#185)

Dragging a seated sound outlines compatible panels and dims other modules. The
native drag image names the sound and variant. SMPL, SPLICE, REVERB and compatible
WAVETABLE panels accept a drop anywhere; DRUMS keeps individual row targets.
WAVETABLE accepts seated `wt_` sounds only. Select a module and double-click a
sound or press Enter on its card to assign without dragging; single click
continues to audition. For DRUMS this opens a row chooser showing each row's
notation. Choose a row with pointer or keyboard to apply; opening or cancelling
the chooser changes nothing. No row is guessed. Native selectors remain keyboard alternatives. Source-aware
mutations retain bank/refusal rules. Overview consumes panel clicks for zoom
and refuses sound assignment until detail view, without initiating wiring.

## Unsaved import placement and readability (#187)

Initial placement for imports without saved layouts packs module order over
64/84/104 HP rails, selecting fewer rows and narrower rails on ties. Fit includes
both dimensions. The owner accepted overview plus pointer/keyboard navigation to
readable 100% detail on 8 November 2026; Trance's 29 modules and 28 cables fit in
four 104-HP rows at 41% on a 1600×1000 window. Saved layouts retain their exact
positions and width. No adjacent CODE merging is implemented; see the
[study](translation-rules.md#adjacent-code-study-187-8-november-2026).
