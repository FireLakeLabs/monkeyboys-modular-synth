# Decisions

Locked on 1 November 2026. Change these deliberately: update this file in the same change.

## PATCHBAY (#142, decided 9 November 2026 UTC)

**Defer a production PATCHBAY module.** The [spike](patchbay-spike.md) proves
Kabelsalat source/effect PCM, Stop/replacement and exact CODE/source/saved identity
through the pinned engine. Bounded CPU and digital onset measurements cover 1,
8 and 32 lanes, without physical listening or a universal voice budget. Worker
construction failures are not reliably forwarded to #36, and an explicit
superdough voice limit did not stop an old Kabel source graph. App initialization
also leaves the installed limit non-finite. Retain these programs as trusted
CODE; ship no prototype or catalog panel. Reconsider only after failure/lifetime
boundaries and a source-preserving Cyber editor contract are proven. This is a
defer recommendation, so no build implementation follow-up is created by #142.

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
- **Catalog widths may grow (decided 4 November 2026, [#176](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/176)):** expanding a module is fine when reasonable and worth it, such as for panels that otherwise scroll. Earlier notes that existing widths stay fixed described those features, not a lasting limit. A module keeps one width across its looks, and saved patches must have a defined outcome before any width changes.
- Each look is defined by **layout rules** applied to a module’s control list, not by hand-drawing every module in every look.
- Switch looks from the module’s **right-click menu** (long-press on touch). The menu also offers “use for all modules in this family”.
- Category colours and cable colours stay constant across looks.
- **Instrument category bands (#58/#85, decided 3 November 2026):** new
  Hardware modules keep Instrument as their default look. Its header band uses
  the module's category colour with dark, contrasting text; Powder coat stays
  available. Disconnected modules keep the same band and show routing on the
  status light, replacing the darker band ([#175](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/175)).

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

- **Code application (#56, decided 3 November 2026; [#180](#usability-review-188-decided-4-november-2026) changed the default):** Ctrl/Cmd+Enter applies
  editor code and starts playback if stopped; Ctrl/Cmd+. stops from anywhere in
  the app, so the shortcuts carry over to the Strudel REPL and workshop. Finished
  code applies by itself while stopped, and only on request while playing. Until
  applied, editor changes never sound or reshape the rack, and the editor status
  reports unapplied changes. Rack edits and knob drags still apply immediately. Each
  successful apply is an accepted-document boundary for #63 undo/redo.
  [#70](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/70) owns
  implementation, shortcut discovery and integration with the existing #12
  error-state behavior; see the [contract and observed verification](code-application.md).
- **Library rack ownership (#55, decided 3 November 2026; [#181](#usability-review-188-decided-4-november-2026) removed the consent step):** module exercises
  and the planned Start here collection (#80) are authored in generator style,
  with saved rack state, so rack edits work immediately. Attribution stays visible
  in the library. Attributed showcases (#46/#47) retain exact source until a rack
  edit needs a rewrite, which then completes at once and offers Undo. Setup
  statements and CODE remain available. See [library ownership](patch-library.md#rack-ownership-55-and-75).
- **Patch library (#45):** a top-bar modal browser with nested, collapsible
  collections and explicit patch selection/loading. The initial repository-owned
  collection includes module exercises. [My patches](patch-library.md#my-patches-182)
  stores your own work in this browser; accounts and sharing remain later. Loading uses the guarded workspace replacement path and
  leaves audio stopped. See [entry and loading contract](patch-library.md).
- **Local recovery (#60, decided 3 November 2026; [#183](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/183) removed the prompt):** save the accepted file and
  unfinished draft together in browser storage. A reload restores them silently,
  with a dismissible Start new offer; restore never starts audio. Invalid drafts
  return beside the last readable rack, and a draft that could not be stored requests
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
- **Occupied inputs:** a new cable replaces the old one at once and offers Undo
  ([#179](#usability-review-188-decided-4-november-2026)).
- **Module deletion:** remove the module and its attached cables without
  reconnecting the remaining neighbors automatically.
- **New patch:** a silent MIX → OUT starter rack, with no voices and no autoplay.
- **Runtime failure:** request Stop after a surfaced evaluation/construction
  failure. Stop ends scheduling; notes and tails may ring out. Arbitrary-code
  side effects do not roll back, and unreported late errors or never-settling
  evaluations remain engine limits. The [#36 recovery contract](audio-recovery.md)
  defines observable late errors and Stop independent of pending evaluation.

## Usability review (#188, decided 4 November 2026)

The owner accepted these from the [usability review](usability-review.md). Each
issue owns its implementation, and the rules it replaces stay in force until it
lands. #179, #180 and #181 have shipped, as has the dock and File menu (#177, #178); see [messages and undo](design.md#messages-and-undo-179-181-183)
and [code application](code-application.md). The owner also approved the
[mockups](design/usability-review.html) as the design direction. They remain
sketches: their control names and pack counts are illustrative.

- **Undo replaces routine confirmations ([#179](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/179)):** deleting a module,
  replacing a cable and loading over changed work act at once and offer undo. A
  prompt remains only where undo cannot help, such as an unapplied code draft.
- **Code applies by itself while stopped ([#180](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/180)):** readable code
  auto-applies while stopped. Explicit Apply remains while playing, so typing
  cannot disturb live audio. Drafts never disable Play, which uses the last
  applied code. The Auto-apply toggle now means “also apply while playing”. The
  rack stays locked during an unapplied draft, and that state must be unmistakable
  rather than a silent dim. Auto-applied typing groups into undo steps that end at
  good stopping spots: finished code that adds or removes a module, or a short
  pause on finished code. Auto-apply waits for the same check, so a half-typed word
  never reaches the rack. This replaces the explicit default from #56.
- **Make rack-editable no longer asks first ([#181](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/181)):** a rack edit
  that needs conversion completes at once and shows “Code rewritten in rack
  style · Undo”. Undo is the safety net, and it restored Trance's exact source.
  Showcases keep their exact source until that first edit. This replaces the
  consent step from #55.
- **Jack targets depend on zoom ([#186](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/186)):** jacks keep 24 px targets at
  75% zoom and above. Below that, the rack is an overview with no live jacks and
  every cable drawn, and clicking a module or activating its keyboard navigation button zooms in.
  Connections remains complete, with selection, removal and a destination chooser
  for every cable. File/library loads use Fit, including overview. This replaces the every-zoom rule from #94.

## Unsaved import readability (#187, decided 8 November 2026)

The owner accepted overview plus readable 100% module navigation as satisfying
large-import readability: Trance fits at 41% in four 104-HP rows at 1600×1000,
with all 29 modules and 28 cables visible; pointer or Enter opens full-size
detail. Unsaved imports minimize row count across 64/84/104 HP rails, preferring
narrower rails on ties. Saved personal and bundled positions never reflow on
load or resize. Adjacent CODE blocks remain separate under the
[preservation study](translation-rules.md#adjacent-code-study-187-8-november-2026).
Explicit Arrange rack and saved-library refresh remain #218's scope.

## Arranger lane (#141, decided 8 November 2026)

The arranger writes **per-voice mask lanes**, not `arrange()` over sections. Each
connected MIX channel has a lane in the Arrange footer popover along the rack's
bottom edge, which keeps the rack frame's size; its cycles become
`.mask("<0!4 1!12>")` on that channel's voice, before gain and routing. The
[spike](arranger.md#spike-one-song-both-ways) rendered one song both ways:
masks kept one `$:` line, label and orbit per voice, round-tripped as rack state
and kept song time. `arrange()` folded voices into one CODE line, needed orbits in
shared declarations, and restarted section time, changing 24 of 200 onsets. The
reader reads only a final lane mask; `arrange()` and other masks stay
source-owned CODE. Lanes are MIX channel values, so no format change is needed.
Song length is derived from the longest lane (#230), and +/− edit lane literals
in one undoable operation rather than changing view state. Growing aligns all
arranged lanes to the new length by extending their final step. The owner chose
this explicitly on 8 November 2026: `<0!4 1!12>` becomes `<0!4 1!28>` at 32 cycles,
which deliberately changes later repetitions and supersedes the issue's
conflicting sound-preservation requirement. Unmasked channels write nothing;
no new metadata is saved. The playhead shares the header's scheduler clock,
wraps at song length, clears on Stop and freezes under reduced motion.
See the [contract and evidence](arranger.md).

## Sound picker (#227, decided 8 November 2026)

The owner chose direction A + C from the private sample-picker design canvas. See
[sound picker](sound-crate.md#sound-picker-227).

- Each sound slot opens a search popup beside its panel. **Browse all in Sounds**
  hands the search to a pick mode in the Sounds dock.
- ←/→ change a row's variant and play it.
- Kind chips follow Strudel's drum suffixes (`bd`, `sd`, `hh` and so on), which
  `.bank()` relies on. Packs need not follow them, so a short list covers Dirt
  Samples names and everything else is Other.
- The native selector is removed. This replaces #185's rule that native selectors
  remain a keyboard alternative: the popup and the dock's select-then-Enter path
  are the keyboard routes.

## Rack case (#133, decided 3 November 2026)

- OUT is pinned at the right edge of the rack frame, outside the rails, retaining
  its IN, BPM, VOL and Hardware looks. It stays visible as rails scroll.
- Rail width is saved per patch as `railHp`: 64, 84 or 104 HP. New patches use the
  widest rail visible beside the palette and code; absent metadata/fields mean 64 HP.
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

## Function loops (#135, decided 3 November 2026)

SEND/RETURN turns a chain into the final function argument of CHUNK, EVERY,
SOMETIMES, OFF, LAYER, JUX and TIME LENS WINDOW. Function cables use Alien teal
`#8CF5DA`, a long/short dashed stroke and λ jack centers. SEND shows its role
(for example, “1 of 4 chunks” or “right ear”); cable and jack hover show the
lambda. The lambda has matching teal code ink.

Loops nest and accept chain transforms, including effects, CODE and CV on their
controls. Sources (including OSC/SMPL), modulation utilities, MIX and OUT cannot
be loop members. Each loop is one local chain: no branching, named function
outputs, shared members, cross-loop RETURN or recursive containment. Incomplete
chains are savable; until SEND reaches RETURN, generation uses the preset.
Empty loops use `rev`, except JUX, which retains its four existing presets.
New modules use fixed catalog widths and Alien looks; existing widths stay fixed.

The reader accepts synchronous single-identifier arrow functions rooted in that
identifier. Readable calls become loop modules; an unsupported call keeps the
entire corresponding lambda suffix in one CODE inside that loop, preserving
its parameter and references. Blocks, async callbacks, non-receiver expressions,
unknown function identifiers and unsupported arguments remain whole-call CODE.
Existing JUX preset forms and explicit saved CODE owners remain unchanged.
Nested source addresses extend v1 with an optional `loop` path; untouched source,
saved rack identity and engine events have independent checks. Imported loop
literal/layout edits preserve source; imported loop rewiring converts the
code on edit, with Undo. See [the contract](translation-rules.md#function-loops-135)
and [verification](function-loops-verification.md).

## Sample cartridge bay (#137, decided 3 November 2026)

The bay owns setup it writes: seat adds a `samples()` call and eject removes it,
with confirmation when modules may still use its sounds. Other imported setup
stays source-owned unless saved metadata and executable source prove ownership.
Factory cartridges always stay seated. Readable Copy/Export/Open in Strudel write
their pinned manifests and audio bases explicitly, without duplicating existing
exact calls; factories precede user packs so overrides preserve their sound.
User GitHub shortcuts keep following their branch and show it on the label.
A failed manifest is reported per cartridge without stopping unrelated voices;
registered manifests do not claim decoded audio readiness. See the
[format and resource API](cartridges.md), including raw recovery export behavior.

## Multi-input routing (#136, decided 4 November 2026)

Use the issue's proposed silent CV source and shared AUX defaults. AUX has four
SENDs and one return OUT. DUCK carries its target through IN/OUT and takes the
trigger on SIDE, so targeting follows final channel orbits rather than a numeric
panel setting. AUX and audio-mod share deterministic positive bus allocation;
private sends are independent pre-mixer voices with dry and global wet output
suppressed. Audio-mod uses the two-tone double/dashed cable and `≋` jack mark.
The [translation contract](translation-rules.md#multi-input-and-cross-voice-routing-136)
records native tap/depth semantics, provenance and structural reset behavior.

## Jack discovery and connected placement (#233, decided 8 November 2026)

The owner approved both complementary connection interactions: hover/focus a
jack to discover compatible modules already in the rack, and drag from either
end onto empty rail space to choose a new connected module. This explicitly
adds connection discovery beyond the original v1 no-hints scope. Use the same
patch-aware validation, catalog definitions and workspace edit boundary for both.
New-module options use catalog defaults, name the connecting jack, preview the
actual width and snapped position on the dropped rail, and commit placement
plus connection as one undoable edit. See [interaction contract](design.md#jack-discovery-and-connected-placement-233).
