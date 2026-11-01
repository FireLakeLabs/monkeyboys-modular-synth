# Design

The visual design lives on a Claude design canvas:

**https://claude.ai/code/artifact/3393aa60-6a3d-44b6-9c49-c6e46a06bb8b** (private; share it from the canvas’s Share menu, or export PNG/PDF and drop the files in `docs/design/`).

The canvas boards are mock-ups, not app code. Treat them as reference.

## Boards

| Board | What it shows |
| --- | --- |
| **Brand — logo** | Smiley logo, wordmark, app icon sizes, light background, app header |
| **Workspace — v1 (playable)** | The one-screen workspace: library, rack, live code. Right-click any module to switch its look; cables re-route when a look moves its jacks; the amp’s output fans out to two cables named `lead`; the code’s last lines are the layout comment block |
| **Translation key** | The three cable types, every module and the Strudel it writes, and the six translation rules |
| **Looks — hardware** | Powder coat, Instrument, Vintage lab and Learner on an oscillator, filter and envelope |
| **Looks — alien** | Crystal, Bioluminescent and Monolith on ITER and JUX |
| **Looks — cyber** | Terminal, Neon wireframe and Bare board on two CODE blocks |

The green **Locked** and blue **V1 scope** notes on the canvas match [`decisions.md`](decisions.md) and [`v1-scope.md`](v1-scope.md).

## App chrome

| Token | Value |
| --- | --- |
| Background | `#101113` |
| Panels | `#131417`, `#15171b` |
| Borders | `#24272c`, `#2a2d33` |
| Text | `#e4e6ea`; muted `#9aa0a8` |
| Rack interior | `#0a0b0d`, rails `#3b3f46 → #25282d` |

## Looks at a glance

Each look is a set of layout rules plus tokens applied to a module’s control list (see [`decisions.md`](decisions.md#looks)). Fonts are Google Fonts.

### Hardware

| Look | Panel | Name type | Knobs | Jacks | Layout rule |
| --- | --- | --- | --- | --- | --- |
| **Powder coat** | Painted in the category’s dark colour (sound `#9A4F22`, shape `#8E3457`, mod `#2B567F`, fx `#5A3E8F`, pattern `#7A6512`, util `#474C55`), fine grain | Barlow Condensed 700, 26 px, off-white | Black with off-white indicator and printed tick ring | Silver nut; outputs labelled on an off-white chip | Jacks along the bottom; printed signal-flow line above them |
| **Instrument** | Brushed aluminium | Barlow Condensed 700 on a black band, category-colour status light | Knurled with a dark cap, tick ring | Silver nut; outputs on a black chip | Jacks along the bottom inside an outlined patch box; dark recessed display in category colour |
| **Vintage lab** | Matte black, grain | Barlow Condensed 600, letter-spaced, centred, off-white with a rule beneath | Chrome skirt, black cap | Ring coloured by signal type | **Jacks along the top**, under the name; controls below |
| **Learner** | Warm white, 14 px corners, 2 px dark outline, offset shadow | Fredoka 600, lower case | Category-coloured, outlined, white pointer dot | Ring coloured by signal type | Jacks along the bottom; rounded white display |

### Alien

| Look | Panel | Name type | Controls | Jacks |
| --- | --- | --- | --- | --- |
| **Crystal** | Faceted dark teal glass, inner teal light, facet lines | Barlow Condensed 700, teal `#8CF5DA` with glow | Hexagonal crystal knobs; chevron selector | Hexagonal |
| **Bioluminescent** | Deep violet, irregular rounded corners, glowing green veins | Quicksand 700, acid green `#C2FF9A` | Glowing orb knobs; pill selectors | Glowing “pores” |
| **Monolith** | Obsidian slab with an iridescent rim, no screws | Michroma, widely spaced, centred | Lit rings instead of knobs; engraved line selectors | Thin white rings |

### Cyber

| Look | Panel | Name type | Controls | Jacks |
| --- | --- | --- | --- | --- |
| **Terminal** | Green-phosphor CRT inside a dark bezel, scanlines | VT323, `#7CFF9B` | `[ EDIT CODE ]` text button | Silver nut on the bezel |
| **Neon wireframe** | Black with cut corners, magenta-to-cyan outline, faint grid | Chakra Petch 700 with a chromatic split | Outlined `EDIT ›` button | Square, cyan glow |
| **Bare board** | Black circuit board, gold traces, “NO PANEL YET” silkscreen; code printed on a chip | Share Tech Mono | Tactile switch labelled EDIT | Silver nut, labelled J1 / J2 |

### In the code panel

| Family | Treatment |
| --- | --- |
| Hardware | Text in the module’s category colour |
| Alien | Teal `#8CF5DA` with a soft glow |
| Cyber | Off-white with a dashed gold underline |
| Named outputs | Orange `#FFC48F` on a faint orange background |
