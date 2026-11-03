# Decisions

Locked on 1 November 2026. Change these deliberately: update this file in the same change.

## Product

- **Name:** MonkeyBoy’s Modular Synth — a Fire Lake Labs project ([firelakelabs.com](https://firelakelabs.com)).
- **What it is:** a web app that is an entry point into both modular synthesis and the Strudel live-coding language. A patch and its Strudel code are two views of the same thing.
- **Engine:** Strudel’s own engine (`@strudel/web`) in the browser.
- **Licence:** see the project’s [MIT license](../LICENSE). Strudel is a separately licensed dependency under AGPL-3.0-or-later.
- **Audience for v1:** no beginner aids at launch — no hints, no explainer cards. They can be added later.

## Module families

Every module belongs to exactly one family.

| Family       | Rule                                                                               | Examples                            |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------- |
| **Hardware** | A common modular module does this to a live signal.                                | OSC, VCF, VCA, ENV, LFO, DELAY, MIX |
| **Alien**    | Strudel-native with no modular analog: it needs to see the whole cycle at once.    | ITER, JUX, REV, PALINDROME          |
| **Cyber**    | Code-only: Strudel the app can’t turn into controls yet, passed through untouched. | CODE                                |

Where a Strudel function has a close hardware cousin (`.ply()` ≈ a ratchet, `.rev()` ≈ a sequencer’s reverse switch), prefer a hardware module or a switch on an existing one. Keep Alien for things with no real equivalent.

## Looks

- Every module can switch to any look in its own family:
  - **Hardware:** Powder coat · Instrument · Vintage lab · Learner
  - **Alien:** Crystal · Bioluminescent · Monolith
  - **Cyber:** Terminal · Neon wireframe · Bare board
- Racks are built up module by module, mixing looks freely.
- **Looks never change executable code.** They are presentation only; their saved metadata changes in the trailing rack comment block.
- A look may rearrange a module’s panel (move knobs and jacks). A module’s **width stays the same in every look**, so switching looks never pushes neighbours along the rail. Cables are drawn from live jack positions and redraw to follow.
- Each look is defined by **layout rules** applied to a module’s control list, not by hand-drawing every module in every look.
- Switch looks from the module’s **right-click menu** (long-press on touch). The menu also offers “use for all modules in this family”.
- Category colours and cable colours stay constant across looks.

## Colours

| Meaning                          | Colour    |
| -------------------------------- | --------- |
| Pattern cable / pattern category | `#E6D35F` |
| Audio cable / sound category     | `#F4A462` |
| Mod cable / modulate category    | `#7DB9F6` |
| Shape category (VCF, VCA)        | `#F293BA` |
| Effects category                 | `#B9A9F8` |
| Utility category                 | `#B7BDC6` |
| Alien accent                     | `#8CF5DA` |

A module’s category colour is used for its dot on the panel and for the code it writes, so the rack and the code read as one.

## Workspace

- **One workspace:** rack and code side by side, both live and both editable. Edit the code and the rack updates; code that can’t be read becomes a Cyber block.
- **Layout is saved in the code:** rack positions, looks and output names live in a comment block at the end of the Strudel code, so a patch is a plain Strudel file you can paste into the Strudel REPL, and pasting it back restores the rack. See [`patch-format.md`](patch-format.md). Stable module IDs and conservative syntax matching preserve layout across unambiguous edits; ambiguous matches auto-place (decided 2 November 2026, #14).
- **Cables:** while dragging, valid jacks light up. Odd-but-possible patches are allowed with a plain explanation. Impossible ones are blocked.
- **Fan-out:** several cables can leave one output. That output gets an editable name, which becomes a named pattern (`const lead = …`) reused in each voice.
- **Mixer:** each mixer input becomes its own `$:` line. `stack()` is read on import but not generated.

## Interaction policy

- **Library rack ownership (#55, decided 3 November 2026):** module exercises
  and the planned Start here collection (#80) are authored in generator style,
  with saved rack state, so rack edits work immediately. Attribution stays visible
  in the library. Attributed showcases (#46/#47) retain exact source. A refused
  rack edit offers **Make rack-editable** beside the edit, discloses the rewrite
  into MonkeyBoy’s style, and completes the pending edit after consent. Setup
  statements and CODE remain available. Global undo is owned by #63; it is not
  implemented by this conversion. See [library ownership](patch-library.md#rack-ownership-55-and-75).
- **Patch library (#45):** a top-bar modal browser with nested, collapsible
  collections and explicit patch selection/loading. The initial repository-owned
  collection includes module exercises; personal library editing, accounts and
  sharing remain later. Loading uses the guarded workspace replacement path and
  leaves audio stopped. See [entry and loading contract](patch-library.md).

Owner choices for #9–#12, approved 2 November 2026. Current implementation and
issue status live in the [build plan](build-plan.md#current-status-and-remaining-work). The
[interaction handoff](interaction-proposal.md) gives detailed flows and remaining
technical limits; [interaction evidence](interaction-verification.md) records
production acceptance for #9–#11.

- **Values in v1:** typed values and vertical knob dragging, Shift for fine
  control, double-click to reset to the catalog default. This expands the prior
  v1 scope; touch remains later.
- **Occupied inputs:** offer Replace / Cancel before replacing a cable; preserve
  the old connection until confirmation.
- **Module deletion:** remove the module and its attached cables without
  reconnecting the remaining neighbors automatically.
- **New patch:** a silent MIX → OUT starter rack, with no voices and no autoplay.
- **Runtime failure:** request Stop after a surfaced evaluation/construction
  failure. Stop ends scheduling; notes and tails may ring out. Arbitrary-code
  side effects do not roll back, and unreported late errors or never-settling
  evaluations remain engine limits. The [#36 recovery contract](audio-recovery.md)
  defines observable late errors and Stop independent of pending evaluation.

## Source editor (#53, decided 3 November 2026)

Adopt plain CodeMirror 6 in #59. The [editor spike](editor-spike.md) demonstrated
real-engine mini-notation token highlighting, mapped rack rewrites, existing
source treatments, folding and code-line diagnostics. Keep event/source mapping
behind `src/strudel/engine.ts`. Use app-owned accepted source documents for #63
undo/redo, with CodeMirror history limited to unaccepted drafts and an explicit
checkpoint boundary. The [#59 adoption](editor-adoption.md) replaces the textarea with a lazy editor
and checkpoints draft history at acceptance. Chromium-native composition and the
full replacement browser suites are verified there; physical OS IME/device
coverage remains unverified.

## Brand

- Logo: a plain smiley — orange circle `#F4A462` with dark features `#1a1b20`. See `public/favicon.svg`.
- Wordmark: “MONKEYBOY’S” in Big Shoulders Display 800 over “MODULAR SYNTH” in Barlow Condensed 700, letter-spaced, in orange.
- UI type: Barlow (UI), Barlow Condensed (panel labels), JetBrains Mono (code). Each look adds its own display face (see [`design.md`](design.md)).
