# Build plan

Foundations first; visual polish late. Each step has a matching GitHub issue.

## Build order

1. **Module catalog.** `src/modules/catalog.ts` holds every v1 module as data (controls, ranges, defaults, jacks, Strudel functions). _Started in the initial commit, with integrity tests._
2. **Patch → code generator.** A pure function `generate(patch) → string`, following [`translation-rules.md`](translation-rules.md). Done when unit tests cover every module, CV routing (LFO and ENV into VCF and VCA), fan-out naming, several mixer channels, omitted defaults and the layout block.
3. **Play through Strudel.** Wire `src/strudel/engine.ts` to the generator: play, stop, re-evaluate when values change. Load sample banks at start-up. Done when a patch built in code plays in the browser and a value change is heard without restarting.
4. **Rack UI in one look.** Render modules from the catalog in a single look (Instrument is the most neutral), with cables drawn from live jack positions, selection, and a minimal way to change values (see below). Done when every v1 module can be placed, patched and adjusted.
5. **Code → patch reader.** Parse Strudel with `acorn`, walk chains, map calls through the catalog, fall back to CODE blocks. Done when round-trip tests pass: `generate(read(code))` reproduces `code` for generated code, and hand-written examples import without changing their sound.
6. **Looks.** Layout rules for all ten looks; the right-click menu with “use for all”. Done when every module renders in every look in its family and cables follow.
7. **Workspace polish.** Fan-out name tags and renaming, the layout comment block read and written, live two-way editing with sensible behaviour while code is half-typed.

## Prove early

These are the two biggest unknowns. Spike them before or alongside steps 2–3.

- **Round-tripping code.** Reading arbitrary Strudel into a patch and writing it back without losing the user’s formatting and comments. Try a concrete-syntax approach (keep source ranges from the parser and splice changes in) before committing to full regeneration.
- **Embedding the engine.** `@strudel/web` exposes `initStrudel`, `evaluate` and `hush` on import. Confirm re-evaluating on every knob change is smooth enough, that `$:` lines and `const` work through `evaluate`, and how to hook per-module activity (for the alien glow and activity lights).

## Design still open

- **Changing values in v1.** Drag-to-turn and touch are “later”, but v1 needs something. Proposal: drag up/down on a knob, Shift for fine, double-click to reset, click the value to type a number.
- **Dragging a cable.** Which jacks light up, the explanation shown for odd patches, how blocked targets look.
- **Adding and removing modules.** Drag from the library onto a rail; where a module lands when a row is full; rows growing; deleting a module and its cables.
- **New patch.** What an empty rack shows (just MIX and OUT?).
- **Half-typed code.** What the rack shows while the code does not parse (freeze and dim the rack, mark the error line, keep the last good patch playing).
- **Errors.** Audio blocked until a click (browser autoplay rules), samples failing to load, code that throws at runtime.

## Technical questions

- **Orbits.** Delay and reverb are per-orbit send effects in Strudel. Voices with different effect settings probably need their own `.orbit(n)`. See [`module-spec.md`](module-spec.md#reverb--room).
- **Layout block matching.** Whether derived addresses survive edits. See [`patch-format.md`](patch-format.md#open-questions).
- **Sample sources.** Which banks to load at start-up, from where, and whether to cache them.
- **Types for `@strudel/web`.** The package ships without TypeScript types; `src/strudel/strudel-web.d.ts` declares the few functions used.
