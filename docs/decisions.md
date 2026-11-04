# Decisions

Locked on 1 November 2026. Change these deliberately: update this file in the same change.

## Product

- **Name:** MonkeyBoy’s Modular Synth — a Fire Lake Labs project ([firelakelabs.com](https://firelakelabs.com)).
- **What it is:** a web app that is an entry point into both modular synthesis and the Strudel live-coding language. A patch and its Strudel code are two views of the same thing.
- **Engine:** Strudel’s own engine (`@strudel/web`) in the browser.
- **Licence:** see the project’s [MIT license](../LICENSE). Strudel is a separately licensed dependency under AGPL-3.0-or-later.
- **Audience for v1:** no beginner aids at launch — no hints, no explainer cards. They can be added later. **Strudel calls on palette chips are core product UI, not beginner aids** (#57/#79); each module shows catalog-owned syntax alongside its name and family.

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
- **Instrument category bands (#58/#85, decided 3 November 2026):** new
  Hardware modules keep Instrument as their default look. Its header band uses
  the module's category colour with dark, contrasting text; Powder coat stays
  available. Disconnected modules use a darker band and readable light text.

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

- **Code application (#56, decided 3 November 2026):** Ctrl/Cmd+Enter applies
  editor code and starts playback if stopped; Ctrl/Cmd+. stops from anywhere in
  the app. Explicit apply is the default, with auto-apply as an opt-in toggle,
  so the shortcuts carry over to the Strudel REPL and workshop. Until applied,
  editor changes never sound or reshape the rack, and the editor status reports
  unapplied changes. Rack edits and knob drags still apply immediately. Each
  successful apply is an accepted-document boundary for #63 undo/redo.
  [#70](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/70) owns
  implementation, shortcut discovery and integration with the existing #12
  error-state behavior; see the [contract and observed verification](code-application.md).
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
- **Local recovery (#60, decided 3 November 2026):** save the accepted file and
  unfinished draft together in browser storage. On load, offer explicit restore
  or discard before editing; restore never starts audio. Invalid drafts return
  beside the last readable rack, and a draft that could not be stored requests
  the browser's departure warning. Storage failures otherwise stay quiet. See
  [recovery format and limits](patch-format.md#local-workspace-recovery-60).

Owner choices for #9–#12, approved 2 November 2026. Current implementation and
issue status live in the [build plan](build-plan.md#current-status-and-remaining-work). The
[interaction handoff](interaction-proposal.md) gives detailed flows and remaining
technical limits; [interaction evidence](interaction-verification.md) records
production acceptance for #9–#11.

- **Values in v1:** typed values and vertical knob dragging, Shift for fine
  control, double-click or focused Backspace to reset to the catalog default. Knobs also
  expose slider semantics, arrow/Shift-arrow stepping and Home/End (#92); see
  [panel input and zoom](design.md#panel-controls-and-rack-zoom-81-82-84-92-94-95). This expands the prior
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

## Rack case (#133, decided 3 November 2026)

- OUT is pinned at the right edge of the rack frame, outside the rails, retaining
  its IN, BPM, VOL and Hardware looks. It stays visible as rails scroll.
- Rail width is saved per patch as `railHp`: 64, 84 or 104 HP. New patches use the
  widest complete case that fits the window; absent metadata/fields mean 64 HP.
  Resize never reflows or changes saved width. Users can zoom or scroll.
- New metadata omits OUT coordinates; legacy files still read with exact source
  retention. See [format compatibility](patch-format.md#in-memory).
- Rack focus collapses palette and code, and restores the previous view.
  [The implementation and observed proof](output-panel-verification.md) record
  the width-reduction refusal and browser coverage.

## Generalized modulation (#130, decided 3 November 2026)

- Every catalog CV jack accepts LFO in SMOOTH or STEP mode, ENV and CV SEQ.
  New LFOs use SMOOTH; absent MODE in older saved racks means STEP. Existing
  signal expressions and native envelopes retain exact source and saved identity.
- SMOOTH uses the pinned core's per-voice `.lfo()`; STEP uses the existing
  event-sampled signals. RATE remains a period in cycles, with `sync = 1 / RATE`.
  SKEW is saved independently and applies to the engine's skewable waveforms.
  `rand`/`perlin` require STEP; they are not supported audio-rate shapes.
- ENV keeps native VCA/filter calls. Other CV controls use `.env()` with absolute
  target-unit depth; OSC TUNE uses semitone pitch-envelope/vibrato calls.
  Native pitch vibrato is sinusoidal; SHAPE/SKEW do not alter that engine form.
- S&H, ATTENUVERTER and MOD MIX operate on pattern signals. A SMOOTH source
  enters this path through S&H; direct pattern transforms require STEP. ENV is
  a per-voice control modulator and connects directly to CV, not utility IN.
  CV SEQ and utility outputs carry absolute target values. ATTENUVERTER provides
  linear/exponential ranges; exponential endpoints must be positive.
- The pinned engine clamps negative generic LFO depths incorrectly on gain
  parameters. Downward non-frequency modulation therefore writes a positive
  magnitude with `dc: -1`; frequency targets retain signed depth and `dc: 0`.
  This is executable Strudel, with no app-only playback shim.

See [the module contract](module-spec.md#generalized-cv-130),
[translation rule 3](translation-rules.md#3-a-cable-into-cv-modulates-a-control),
and [separate event/browser proof](modulation-verification.md).

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

## Undo and redo (#63, decided 3 November 2026)

Use app-owned accepted-document history for rack and code, including saved rack
identity. Each acceptance is one step; a continuous knob pointer gesture groups
its live values. CodeMirror owns only unfinished draft undo/redo. Once that local
undo is exhausted, Undo discards the remaining draft before traversing accepted
history. Acceptance checkpoints local history. Recovery starts a fresh session
history, and undo never starts stopped audio. See the [contract and proof](undo-redo.md).

## Nested step editor (#146, decided 3 November 2026)

SEQ, DRUMS rows, CV SEQ, GATES and CHORD share one editor for nested mini-notation.
Cells are as wide as their share of the cycle, on up to four equal-time lines; a DRUMS
row is one line. A group too narrow for its children collapses, and Enter opens it
across the whole editor. Zoom never changes the layout.

Draw `[ ]`, `.`, `*n`, `/n`, `!n`, `@n`, `_`, `?`, `|`, `,`, nested `<…>`, `(k,n,r)`,
`:n` and rests. Show `{…}%n`, `..` and patterned modifier arguments as text cells: one
element of exact source that keeps its time share, so an exotic token no longer sends
the whole sequence to text mode. Text mode stays as the escape hatch.

Each action is in a floating cell tray and on a key that is its notation symbol. Each
gesture is one splice inside the literal and one undo step, using `@strudel/mini`'s
parser and source locations. #147 also teaches the reader backtick literals. See the
[study and evidence](nested-step-editor.md).

## Rack metadata in the editor (#54/#68, decided 3 November 2026)

Keep the v1 file format and fold its trailing rack comment block to one line by
default with CodeMirror. The reader's comment-aware marker detection owns the
boundary; marker-like strings and earlier comments remain visible. Metadata is
read only even when unfolded, while whole-file paste and Open can replace it.
Copy and Export retain the complete file. A compact v2 format (#74) is not
planned; revisit only if exported file size becomes a problem. See the
[editor contract and verification](metadata-folding.md).

## Brand

- Logo: a plain smiley — orange circle `#F4A462` with dark features `#1a1b20`. See `public/favicon.svg`.
- Wordmark: “MONKEYBOY’S” in Big Shoulders Display 800 over “MODULAR SYNTH” in Barlow Condensed 700, letter-spaced, in orange.
- UI type: Barlow (UI), Barlow Condensed (panel labels), JetBrains Mono (code). Each look adds its own display face (see [`design.md`](design.md)).

## Mixer channel labels (#129, decided 3 November 2026)

MUTE, SOLO and channel NAME live in executable Strudel labels (`_$:`, `S$:`,
`bass:`), so pasting into the REPL retains their behavior. They do not remove
voices or renumber effect orbits. Mute takes precedence over solo; names and
nested routing follow the [translation rule](translation-rules.md#mixer-channel-labels-and-routing-129).
Per-channel output pairs and level CV are catalog-owned. #130 landed first;
#129 integrates its shared SMOOTH/STEP LFO, ENV and CV SEQ adapters with MIX.
Scalar/pattern levels fold into one postgain before per-voice audio modulation;
outer bus factors scale absolute modulation depths. Canonical generated source
retains generated metadata on Save; other source keeps its independent imported
ownership proof. Saved layout, exact source and engine events remain separate
acceptance checks.

## Ordered effect chains (#134, decided 3 November 2026)

Cable reordering is allowed when generated code parses, evaluates and reads back
to the same rack. Matching effect stage orders retain native calls; inversions
and repeats use bare control chains inside `FX`. This also permits two VCFs or
DRIVEs in series. The catalog bindings determine stage membership; #131 owns the
new modules. Shared stages propagate inline processing to their overlapping
branches. Order information is a note showing the audible chain.

Preserve native imported execution and explicit inline execution separately in
saved module state; do not reinterpret reversed native source as inline audio.
Proven pre-134 generated envelopes migrate to explicit native execution while
retaining source and all existing rack identity fields. DELAY/REVERB inside FX
are per-note inline effects, with release-bounded tails, while native calls use
orbit sends. Final-voice orbit allocation is unchanged. The pinned engine cannot
isolate 24 dB filter duplication per FX stage; refuse that ordered mode rather
than misrepresent it. See [rule 4](translation-rules.md#4-effect-stages-follow-cable-order-134)
for reader limits and [verification](ordered-effects-verification.md) for evidence.
