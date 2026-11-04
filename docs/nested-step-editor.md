# Nested step editor study

Design study for [#146](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/146).
The production build is tracked in [#147](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/147).
Open the [interactive storyboard](design/nested-step-editor.html) locally to try every
construct and gesture at real module widths. The storyboard simulates: its small parser,
playhead and randomness are stand-ins, and it neither plays sound nor writes a patch.

Production implementation and acceptance are documented in [verification](nested-step-editor-verification.md).
The historical study below describes the pre-implementation prototype.

Machine-readable results are in [`nested-step-editor-results.json`](nested-step-editor-results.json).
The parser prototype is not merged; see [Reproducing the evidence](#reproducing-the-evidence).

The private design canvas was not accessed and no boards changed. Look styling
comes from `src/looks/looks.css`.

## Owner choices

Decided 3 November 2026 and recorded in [`decisions.md`](decisions.md#nested-step-editor-146-decided-3-november-2026).
The owner chose each recommended option, and widened #147 to include backtick literals.

| Question    | Choice                                                                     |
| ----------- | -------------------------------------------------------------------------- |
| Time layout | C: equal-time lines with focus                                             |
| Drawn set   | The set under [Constructs](#constructs), without polymeter                 |
| Gestures    | Notation keys and a floating cell tray                                     |
| Backticks   | Part of #147: the reader learns backtick literals so they reach the editor |

## Design

Show a sequence as **equal-time lines with focus**: time reads like text across up
to four equal lines, cells are as wide as their share of the cycle, and any group can
open to fill the editor. Draw every construct people write in sequencers, and
show the rest as **text cells** that keep their true time share. Edit with notation
keys and a floating cell tray; every gesture is one splice inside the literal.

`@strudel/mini` supports this. Its AST covers the whole of #146's construct list, and
every sounding event maps back to exactly one cell. Two kinds of range are not exposed
directly and must be derived, as described under [Parser check](#parser-check).

## Real panel sizes

Measured in Chromium 156 at 100% zoom, Instrument look, on the current `main`.

| Module        | Panel        | Editor area               | Today's cell                 |
| ------------- | ------------ | ------------------------- | ---------------------------- |
| SEQ (10 HP)   | 120 × 390 px | 104 × 73 px, 4 × 4 inputs | 23.8 × 16 px                 |
| DRUMS (14 HP) | 168 × 390 px | 109 × 18 px per row       | 11.9 px at 8 steps, ~5 at 16 |

Panels have a fixed height, so the editor cannot grow. A two-character note label
needs about 16 px at the 12 px readout minimum, and three characters need about 24 px.
Rack zoom scales everything equally: it makes cells bigger on screen but gives them no
more room relative to their labels, so **zoom must never change the layout**.

## Time layout options

Each option was measured on real step counts. "Labels fit" is the share of notes
whose label fits their cell with no interaction.

| Sequence                        | A: one strip    | C: equal-time lines | C, group opened |
| ------------------------------- | --------------- | ------------------- | --------------- |
| 8 flat steps                    | 13 px, 0% fit   | 52 px, 100%         | not needed      |
| 8 steps, two splits             | 6.5 px, 0%      | 26 px, 100%         | 52 px, 100%     |
| 16 flat steps                   | 6.5 px, 0%      | 26 px, 100%         | not needed      |
| 16 steps, nested two deep       | 1.6 px, 0%      | 6.5 px, 74%         | 26 px, 100%     |
| Repository patches (22 strings) | 13 px min, 69%  | 13 px min, 95%      | 13 px min, 95%  |
| #146 idioms (39 strings)        | 6.5 px min, 90% | 17.3 px min, 100%   | 34.7 px, 100%   |
| Upstream parser tests (67)      | 5.8 px min, 96% | 17.3 px min, 100%   | 13 px min, 100% |

- **A. One proportional strip.** The cycle is one row at full width. It is the most
  literal timeline, but it spends the editor's height on tall, thin cells and fails the
  module's own default sequence. It only suits DRUMS rows, which need no labels.
- **B. Uniform cells with markers.** Today's grid, with a badge on anything richer.
  Nothing moves, and each cell stays 26 px. But `@3` and `[a b]` look alike, the
  sequence no longer shows when things happen, and all nested content is hidden until
  opened. It gives up the point of the editor, so it has no column above.
- **C. Equal-time lines with focus (chosen).** The cycle divides into up to four
  equal lines, so `width = share of cycle × lines × 104 px`. The line count is the
  largest of 4, 3 or 2 that starts every line on a cell boundary; if none does, it
  uses four lines and a cell that crosses a break continues on the next line with
  dotted edges. A group too narrow for its children collapses to a count, and Enter
  opens it across the whole editor with a crumb in the legend row.

C's limit is density: the dense 16-step case above needs opening to read its inner
notes. Across all three corpora nothing nested deeper than two levels, so one or two
opens reach any note.

DRUMS rows use the same component on one line at 109 × 18 px. Cells have no labels, so
narrow cells stay usable. A row with one sample names it; a mixed row reads `mix` and
shows first letters where they fit.

## Constructs

Each mark works without colour, as #96 requires of cables.

| Construct             | Drawn form                                                                       |
| --------------------- | -------------------------------------------------------------------------------- |
| `[a b]`               | Children share the slot in proportion, inside heavy side bars                    |
| `a b . c d`           | Drawn as groups; the dots stay in the source                                     |
| `*n`                  | Keeps its slot and gains n ticks. A whole DRUMS row shows ghost copies           |
| `/n`                  | Diagonal hatching                                                                |
| `!n`                  | n linked cells with dotted joins; one token, one edit                            |
| `@n`, `_`             | Width alone. Each keeps its own spelling; drag the right edge to change `@n`     |
| `?`, `?0.3`           | Dashed border                                                                    |
| `\|`                  | Stacked lanes with a diamond; collapses to first option plus a count             |
| `,` inside a cell     | Stacked lanes; collapses to `c2+2`. Top-level `,` is lanes in SEQ, rows in DRUMS |
| `<a b>`, nested       | One cell with pager dots, showing this cycle's alternative                       |
| `(k,n,r)`             | n dots with k filled in SEQ; n computed steps in DRUMS                           |
| `:n`                  | Part of the label, in a lighter weight                                           |
| `~`, `-`              | Hollow cell with a center dot; both spellings stay                               |
| `{a b}%n`             | Text cell                                                                        |
| `0 .. 3`              | Text cell                                                                        |
| `*<2 3>`, `(<3 5>,8)` | Text cell: a patterned modifier argument                                         |
| `^a b`                | Whole sequence keeps its marker in source; no drawn form                         |

On the corpora, today's grid draws 14 of 22 repository strings and 10 of 39 idioms.
The recommended set draws all 22 and 31 of 39 fully. Of the other eight idioms, three
need a text cell beside drawn cells and five are entirely one text cell.

## Text cells

A text cell holds the exact source of one element it cannot draw: double left edge,
italic and a corner fold. Because the parser still reports the element's weight, the
cell has the correct width. It flashes when any event's location falls inside its span,
which text mode cannot do today, and its neighbors stay fully editable.

An edit must parse alone to exactly one element, or the cell keeps its old value and
says why. This stops a typed `a b` from silently changing the timing of the sequence
around it. Whole-sequence text mode remains as the escape hatch.

## Gestures

Select a cell and a tray floats beside the panel, outside module geometry. Every
action also has a key, and the key is the notation symbol, so using the editor teaches
the language.

| Key             | Action                                           |
| --------------- | ------------------------------------------------ |
| `[` `]`         | Split the step; merge a group                    |
| `*` `/` `!` `@` | Add that modifier; press again to step its value |
| `?`             | Toggle maybe                                     |
| `<` `,` `\|`    | Add an alternative, chord note or random choice  |
| `(`             | Add a Euclidean rhythm                           |
| `~`             | Toggle rest                                      |
| `+`             | Add a step                                       |
| Backspace       | Remove the last modifier, then the cell          |
| Enter, Esc      | Open a group or edit a value; back out one level |
| Arrows          | Move between cells at this level, lines or lanes |

Each editor is one Tab stop with roving focus, matching the keyboard standard from
#92. Each gesture is one undo step. A second click on a DRUMS cell toggles it, as today.

## Feedback

Match each event's source location to a cell instead of today's
`floor(cyclePos × count)`, which assumes equal steps. Keep #90's 400 ms flash, its
reduced-motion outline and its clearing rules.

- A collapsed group flashes as one cell; opening it shows the inner cell.
- `<a b>` pages with the cycle unless the cell is being edited.
- `!n` needs its copy index captured at the source, before transforms, as #90 does.
- Rests and dropped events have no flash.

## Token types and looks

One component takes a token type; only the leaf drawing changes.

| Type           | Module | Reading                                         |
| -------------- | ------ | ----------------------------------------------- |
| Notes, degrees | SEQ    | Label                                           |
| Sample names   | DRUMS  | Row name; filled cell                           |
| Numbers        | CV SEQ | Label over a level bar, so the shape reads      |
| Chord symbols  | CHORD  | Label, clipped; the tray shows the whole symbol |
| Gates          | GATES  | Filled cell, no label                           |

SEQ, DRUMS, CV SEQ, GATES and CHORD are all Hardware, so only the four Hardware looks
apply to them. The storyboard also shows Crystal and Terminal to prove the marks hold
up in the other families, should a sequencer ever join them. Looks change tokens only:
marks, widths and geometry stay the same, and nothing a look does reaches the code.

## Parser check

Prototype-quality work against the pinned `@strudel/mini` 1.2.6, using 136 strings: 22
from repository patches and 8 scale or wave arguments, 67 from the upstream parser's
own tests and 39 #146 idioms. Results are observed, not inferred.

| Question                                    | Result                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Does the tree cover the source?             | 136 of 136. Every character is claimed except separators and `^`          |
| Can gestures be source splices?             | 27 of 27 give the exact expected text and the expected events             |
| Do untouched bytes survive?                 | Yes, including tabs and newlines in messy formatting                      |
| Do sounding events map to cells?            | 4,681 of 4,681 events name exactly one leaf cell                          |
| Do locations survive transforms?            | Yes through `.rev()`; `!n` copy position survives when captured at source |
| Do two-literal voices work (GATES, CV SEQ)? | Yes. One event names a cell in each literal                               |
| Do voiced chords work (CHORD)?              | Yes. Each voiced note still names its chord cell                          |
| Does it work in the real document?          | Yes for SEQ and DRUMS: same module ID, every other byte exact             |

### What #147 must handle

1. **Derive two kinds of range.** Groups have no location, and `@`, `!`, `?` and `_` fold
   into numbers with no location. Elements do have spans, so take the group's bracket by
   matching from the element's start, and scan the operator tail after it. The prototype
   recomputes weight and repeats from that scan and compares them with the AST; they
   agreed on all 136 strings. Keep that comparison as a guard.
2. **Separate leaf from argument.** A hap's `locations` also lists modifier arguments
   (the `4` of `bd*4`), in no consistent order. Match against known leaf spans.
3. **Trim locations.** Upstream's `getLeafLocation` only strips spaces, so a location
   followed by a newline or tab includes that whitespace. Trim it before matching.
4. **Splice inside the literal.** Grid edits today may use canonical spacing inside the
   literal. Byte identity needs a narrower edit than `editDocument`'s whole-literal
   replacement. Offsets are literal start plus one for the quote.
5. **Teach the reader backtick literals.** The reader treats ``note(`…`)`` as CODE
   today, so multi-line sequences never reach SEQ. The owner put this in #147's scope.
   Prove it with the same round-trip checks as quoted literals, and keep any template
   literal with `${…}` as CODE. The event and tree checks already pass with newlines;
   the reader change itself is unproven.
6. **Random seeds are positional.** krill numbers `?` and `|` in source order, so adding
   or removing one changes what later random cells do. Strudel's own behavior; the
   prototype confirmed it, and the editor cannot avoid it without rewriting source.
7. **Add the dependency.** `@strudel/mini` is only transitive today. Pin it to the
   engine's version and import `krill-parser.js` alone: it has no imports and is 115 kB
   raw, 20 kB gzipped. Parsing does not start Strudel, so it stays testable without
   the engine. Its effect on the production bundle was not measured.

### Not verified

- Literals containing backslash escapes. Keep these in text mode until proven.
- Audible behavior. Nothing here was played; events were checked by query only.
- Touch. The tray and grip were only tried with mouse and keyboard, and touch is still
  later scope.
- Screen readers. Names and roles exist in the storyboard, but no reader was run.
- The tray's position near rack edges and at each zoom level.
- Real users. Legibility was judged from measurements and screenshots.

## Reproducing the evidence

The prototype lives on the unmerged `t3/issue-146-mini-spike` branch, under `spike/`.

```sh
npx vitest run --config spike/vitest.config.ts   # gestures, events, document
node spike/layout.mts                            # layout table
node spike/coverage.mts                          # drawn coverage
node spike/storyboard-check.mjs                  # Chromium checks of the storyboard
```

The Chromium run compares the storyboard's stand-in parser with krill on every span (136
of 136 agree), renders 396 scenario, layout and look combinations at catalog width with
no overflow, and passes 38 keyboard, pointer, zoom and playhead checks with no page
errors.
