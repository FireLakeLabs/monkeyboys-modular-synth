# Interaction proposal: values, cables, rack editing, and errors

**Five UX choices approved by the owner; detailed handoff remains under PR review.**
This document specifies behavior for later implementation; it does not claim
that the production rack or workspace implements it.
This proposal covers [#9](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/9),
[#10](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/10),
[#11](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/11), and
[#12](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/12).
This track owns #12. Production rack work belongs to
[#5](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/5); workspace
state and live editing belong to [#8](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/8).
The owner choices select interaction policy; they do not prove production
reader, generator, or workspace behavior.

Open the [interactive storyboard](design/interaction-proposal.html) locally to
review the proposed states. Its scenario selector simulates outcomes. It does
not parse, generate, save, or play a patch.

## Reference and status

The archived [workspace](design/workspace-v1.png),
[hardware looks](design/looks-hardware.png), and
[translation key](design/translation-key.png) are available and were inspected.
The private live canvas was not accessed; no live-board changes are assumed.
The [original HTML](design/design-canvas.html) remains an unchanged reference.

Carry forward the workspace's library/rack/code arrangement, Instrument's
recessed value readouts, signal-colored sagging cables, pink module/code
selection, output name tags, and status beside the code. Add error messages
inside the affected pane rather than replacing the workspace with an error
page. Category and signal colors remain the [locked colors](decisions.md#colours).
Text and symbols accompany state colors. Dimming applies only to the stale
rack surface; status, error text, code, and Stop remain fully legible.

The boards contain illustrative values, extra modules, and layout syntax.
Use the [catalog](../src/modules/catalog.ts) and [module spec](module-spec.md)
for controls, widths, defaults, jacks, and unique-module rules. The board's
`slot` example does not settle the [layout format](patch-format.md).
Looks retain fixed HP width and cables follow live jack positions.

## Evidence and unresolved dependencies

Snapshot: 2 November 2026. Both reader/source and engine/orbit spike evidence
are merged on main. Keep observed behavior in those tested cases, recorded
contracts, and remaining production integration distinct.

Reader provenance: [PR #24](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/24)
merged as `d998ea93a8a8b4aab7776f570e116915da3d7474`. Its
[Findings for #12](source-preservation-spike.md#findings-for-12) and 22 passing
spike cases establish parser/source behavior: exact diagnostic coordinates,
opaque-code preservation, and stale-source rejection. The spike was approved
in two Sol rounds. It establishes no audible or runtime guarantee.

Engine provenance: [PR #26](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/26)
merged as `9cc4ef0f2393140002791daa9b78186435cd034c`. Its
[engine findings and #12 handoff](engine-spike.md#errors-and-last-good-playback-12-handoff) include the adapter fixes
and five real WebAudio probe runs. It observed nonzero output on the first
production Play and zero output after Stop once notes had rung out. The report
explicitly separates signal measurements from listening; physical speaker
output and subjective clicks were not heard. The track reports Sol approval
in one round; CI passed and its adapter is now on main. Fresh-profile autoplay
and other browsers remain unverified.

| ID  | Evidence available                                                                                                                                                                                                                                                                                                                                                   | What this proposal can rely on                                                                                                                                                                                                                                          | Still awaiting evidence / owner                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Merged reader prototype tests prove: syntax failure retains the original draft and produces a diagnostic, with no partial document. Source spans are UTF-16, end-exclusive, and revision-bound.                                                                                                                                                                      | A failed parse must not replace the rack with a partial graph. Convert diagnostic coordinates only for the exact draft revision.                                                                                                                                        | Production reader/editor integration and latest-revision ownership: #6/#8, under the merged PR #24 source contract.                                                                                   |
| R2  | Merged reader tests preserve opaque `.chunk(...)` source, comments and CRLF during numeric splices, reparse offsets after edits, and reject a stale draft.                                                                                                                                                                                                           | Distinguish unsupported but valid code from syntax errors; reject rack writes against a different draft.                                                                                                                                                                | Stable-ID matching and ambiguity rules are recorded by #14. Production binding/grouping (#3/#6) and complete saved state (#8), including disconnected modules and inactive values, remain unproved.   |
| E1  | Merged engine report records Chrome 156 / Linux tests with `@strudel/web` 1.3.0: syntax and missing-method construction failures retain the prior pattern and event callbacks. The old wrapper resolves both; the merged `onEvalError` adapter rejects, with three before/after regression tests. A failed `setcpm(60/4)` draft still changes scheduler CPS to 0.25. | A fulfilled evaluation promise is insufficient evidence of success. Previously scheduled patterns can survive these failures, but arbitrary code is not transactional. These are reported browser/scheduling observations, not an audible guarantee from this proposal. | Adapter is merged; production generator/workspace integration remains #4/#8. No claim that every runtime error preserves the old pattern.                                                             |
| E2  | Merged engine report records that missing sounds evaluate successfully and fail later at output; failed sample manifests reject initialization and can be retried, while file/decode failures occur later. `hush` stops scheduling but existing voices/tails can ring out. The merged serial play/stop queue prevents late restart for evaluations that settle.      | Separate evaluation, output, and sample states. Say “scheduling stopped”, not “silent”. Avoid claiming complete sample success or per-voice FX isolation from evaluation success.                                                                                       | Late-error/resource reporting, fresh-profile/browser activation and production #4/#8 integration remain unproved. #13 allocation is decided; generator routing and structural bus reset remain #3/#4. |

The reader's concrete diagnostic example is `// 🐒\r\n$: note("c").lpf(`:
offset 24, line 2 (one-based), column 17 (zero-based). In an editor whose
display columns are one-based that is column 18. Do not reuse these spans
after another keystroke, normalize line endings before applying them, or
equate UTF-16 offsets with user-perceived character counts.
The diagnostic can point to the end of the document; show a caret marker there
instead of requiring an existing character to underline.

The merged reader spike records receiver-aware stable-call matching and
conservative automatic placement for ambiguous repeats. The
[layout identity contract](patch-format.md#matching-rules) is decided; module
grouping, wire encoding and complete persistence still need production proof.

The merged engine probe records audio signal from default/TR808/TR909 banks and distinct effect settings on separate
orbits. The [decided orbit allocation](translation-rules.md#effect-orbits) gives
every final voice (including dry voices) its own orbit at the end of the branch;
structural edits still need effect-bus handling in #4. The spike does not prove a persistence serializer, generator
integration, arbitrary-patch continuity or sound at the physical speaker.

## #9: values in v1

**Owner choice: typed readouts plus vertical knob dragging, Shift for fine
control, and double-click reset.** This deliberately expands v1 scope; see
[value input](v1-scope.md#value-input). The knob indicates the current value.
Clicking the readout opens a compact numeric field in
place; focus selects the number, with the unit outside the field. Enter or
valid blur commits one edit; Escape restores the previous value. An invalid
blur keeps the field and inline error open without changing code or audio.
Accept finite decimal numbers in the displayed unit, including negatives for
bipolar controls; reject expressions, empty input, non-finite numbers, and
out-of-range input. Show the allowed range rather than silently clamping.

Dragging snaps to catalog steps or detents and stops at the bounds. Typed
off-detent or off-step values show the nearest allowed value and require a
second explicit commit of that value. Never silently round a typed value.
For a knob without catalog detents, the allowed numeric sequence is
`min + n × step` within the inclusive bounds, plus the exact default and max.
Decimal arithmetic must not expose floating-point residue. A logarithmic
taper affects the indicator angle and drag response, not typed units. A labeled
Reset action
restores the catalog default; resetting a CV-patched knob changes its base
value, without unplugging modulation.

Use explicit options for switches, editable cells for SEQ, and toggled cells
for DRUMS; rich imported notation uses the text mode in the module spec.
CODE's Edit action focuses its source span in the code pane when known.
An unsupported imported numeric expression stays code; do not coerce it to a
default knob value. Imported numeric literals outside a control's editable
set remain unchanged until an explicit replacement is chosen in code.

Drag upward to increase and downward to decrease. Capture the pointer so a
drag can finish outside the knob. As a proposed starting sensitivity, 200 CSS
pixels spans the full normalized range; use logarithmic normalization when
catalog taper is log. Holding Shift reduces sensitivity to one tenth, without
jumping when Shift changes mid-drag. Snap the resulting value to the nearest
allowed step or detent. Escape or pointer cancellation restores the drag-start
value; releasing the pointer keeps the last accepted value. Double-click
restores the catalog default, using the same reset path as the labeled action.
Ensure the double-click does not leave an intermediate accidental drag value.

Each accepted snapped value updates rack and source together. While playing,
submit the resulting live update through the engine adapter; do not evaluate
every raw pointer movement or each digit in a numeric field. Preserve the
latest accepted revision when coalescing superseded drag updates in #4/#8.
A cancelled drag requests its starting value as a new accepted revision; this
restores the controlled value and does not promise rollback of arbitrary code
side effects. Display “Applying…” until evaluation completes, with the #12
failure policy on rejection. Sustained notes, lookahead and the merged engine's
cancellation limits still apply.

Wheel changes and touch-specific work remain outside v1. Ordinary form
keyboard operation is available; keyboard cable patching remains later.

## #10: cables

Drag from an output. Keep committed cables in place and draw a provisional
cable to the pointer, using its effective signal color. Resolve `any` through
the connected chain; an `any` jack does not waive ENV restrictions or graph
rules. Evaluate the proposed whole graph, including downstream targets, before
offering a destination. Unknown semantics must not be labeled verified-valid.

| Target            | Appearance while dragging                                     | Explanation in a strip below the rack                                         | Drop                                                |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Valid             | Bright signal ring plus check mark                            | “OSC OUT → VCF IN · audio”                                                    | Commit once.                                        |
| Odd but possible  | Signal ring plus warning triangle; cable retains signal color | Plain consequence, e.g. “This audio split plays the voice twice; levels add.” | Allow; retain a warning on the affected cable.      |
| Blocked           | Cross mark and subdued ring                                   | Specific reason, e.g. “ENV can only feed VCF or VCA CV.”                      | Reject; original graph and source remain unchanged. |
| Not a destination | Subdued output or empty space                                 | “Choose an input. Escape cancels.”                                            | Cancel.                                             |

Hovering an occupied input previews an explicit “Replace VCF IN connection”
action. Dropping offers Replace/Cancel in the strip; Cancel is the default.
Only Replace removes the old cable and adds the new one in a single commit.
Output-to-output, incompatible signals, self-links and cycles are blocked.
The generator/validator owns the complete feasibility rules; this document
does not claim that the current jack types implement a validator.

Select a cable for Remove or Move destination. During a reroute, the old
connection remains committed until a valid destination is accepted. Escape,
an empty-space drop, or a blocked drop restores it; dragging into empty space
never deletes it. Remove disconnects just that cable. Do not automatically
bridge a broken chain. Disconnected parts are visibly inactive, pending R2's
saved-state representation.

Several cables may leave one output. Offset plug collars slightly so the
stack is visible; selecting the output lists its destinations so each cable
can be selected without pixel hunting. At the second cable, reveal an
editable name tag and a generated valid unique name. Renaming validates a
JavaScript identifier and rejects reserved or colliding names before commit.
Source-preserving declaration/reference edits and retaining a chosen name
after reducing to one cable require production #3/#6/#8 integration; do not promise automatic
inlining or renaming unknown CODE references.

For reversed apparent FX order, explain the order actually heard; do not
reorder cables or code. Exact effect-order wording and independent DELAY/
REVERB settings follow the merged #2/#13 findings; generation and warning
integration remain #3/#4/#5 work. Shared imported orbits must not be silently
split to make the rack look independent. Unrepresentable routing stays CODE.

## #11: modules and a new patch

Drag a library item onto a rail. Its ghost occupies the catalog's exact HP
width (1 HP = 12 px at 100% zoom), snapping its left edge to whole HP.
Choose the nearest free contiguous interval in that row that fits, breaking
ties to the left; show the final ghost before drop. Never overlap or push
existing modules. Changing looks does not change the interval.

If the row cannot fit it, show “No room here — drop on + Add row” and an
explicit new-row drop zone below the rack. Dropping there creates a row and
places the module at HP 0 in one commit. Cancel creates neither. The rack's
available rail length determines row capacity; keep saved HP coordinates
when the window shrinks, with rack scrolling handled by #5. Existing module
moves use the same ghost and cancellation rules. Empty rows remain until
removed explicitly; only empty rows expose Remove row.

Add a module with catalog defaults and the Instrument look for hardware
(default family looks for Alien/Cyber). Do not auto-wire it. Where a module
is unique, its library item selects the existing instance instead of creating
another. OUT cannot be duplicated or deleted while the rack is open, matching
the module spec's exactly-one rule.

Delete from the selected module's menu or a focused rack Delete action
(never while editing text). Preview “Delete VCF and its 3 cables?” with
Delete/Cancel. Commit removes that module, its incident cables, and invalid
output-name entries together; leave other modules and their positions alone.
Preserve names still attached to surviving outputs, subject to R2's identity
rules. Select a neighbor afterward. Do not reconnect neighbors automatically.
Deletion of MIX is allowed and can leave the patch silent. Unmapped CODE
dependencies require a source-edit plan; reject deletion when that plan
cannot preserve unrelated source, rather than deleting arbitrary references.

**Owner choice: New patch creates a silent starter rack:** MIX at row 0 / HP 0,
OUT at row 0 / HP 12, MIX OUT connected to OUT IN, all catalog defaults.
Show the remaining rail as empty space and the library; there are no voices
and Play does not invent a sound. This is a UI template, not a change to
`emptyPatch()`. The template's disconnected modules, default values and names
must survive save/reopen; that is R2’s remaining saved-state dependency, beyond
the decided matching contract.

New patch first offers “Replace this patch?” with Export current / Replace /
Cancel whenever work exists. Export copies/downloads the exact current code
draft, including syntax errors, plus the last accepted layout only if it is
already part of that draft; never stamp stale metadata onto invalid code.
Export does not replace the patch. Replace stops scheduling, clears draft errors
and accepted-state history, then installs the starter rack. If Stop cannot
be confirmed, surface the audio fault before completing replacement. A newly
opened or replaced patch never starts automatically. No general undo stack
or persistence schema is introduced by this design proposal.

## #12: half-typed code and failures

Keep three distinct facts: **draft source**, **last accepted readable rack**,
and **last confirmed scheduled audio**. They can represent different revisions.
“Rack and code in sync” says nothing about playback success. Only show it
when the rack corresponds to the exact current source; use a separate audio
label. A running pattern is not evidence that its samples can be heard.

On the first keystroke, invalidate pending source spans and disable rack
mutations until the current draft is accepted. Use a short 250 ms idle delay
as a proposed starting point for parsing; this is a UX default to tune, not a
measured performance claim. Apply only results belonging to the newest draft.
CODE panel edits follow the same path. Selection and inspection remain usable;
stale selections have no source highlight until remapped.

The engine track has not proved original-source/module mapping for runtime
stacks: these refer to transpiled/evaluated JavaScript. The production policy
therefore uses a generic runtime banner, with no module or line underline,
until revision-correct mapping is proven. Parser diagnostics are a separate,
proven source-location contract. An engine-reported parse location such as
`1:9` does not establish runtime stack mapping.

The merged `onEvalError` adapter reports evaluation failures; it is not a
universal subscription to scheduler, output, or sample-file/decode failures.
The sample/output rows below describe desired UX **when a failure is surfaced**.
Automatic detection and recovery of all late failures remain unsupported.
Until reliable callbacks exist, do not display a fabricated resource diagnosis
or promise automatic Stop; retain the manual Stop/Play recovery and show sample
status as unavailable when it cannot be observed.

| State / trigger                   | Rack and code presentation                                                                                                                                                                                | Audio presentation and action                                                                                                                                                                               | Recovery                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing / parse pending           | “Reading code…”; retain and dim the last accepted rack; disable values, dragging, deletion and look/name edits.                                                                                           | Keep the existing audio status; do not evaluate an incomplete draft. Stop remains enabled.                                                                                                                  | Accept only the newest result.                                                                                                                                        |
| Syntax error                      | “Rack shows previous code”; mark the diagnostic line/column with underline and inline text. Keep the exact draft editable. With no accepted rack, show “Rack unavailable until code parses”.              | If audio was confirmed running, say “Previous pattern scheduled”; otherwise “Stopped”. The parser alone cannot guarantee audible playback.                                                                  | Fix code or choose Revert to last readable code (explicitly discards the draft). If no accepted revision exists, omit Revert.                                         |
| Valid unsupported code            | Accept readable portions and exact CODE blocks; label “Some code has no controls”. This is not a parse error.                                                                                             | Apply only through the supported engine path; CODE remains subject to runtime errors.                                                                                                                       | Editing the CODE source may make it readable later; no automatic destructive rewrite.                                                                                 |
| Parsed and source-mapped          | Restore rack editing and current-span selection; show “Rack matches code”.                                                                                                                                | If stopped, stay stopped. If playing, show “Applying…” until explicit scheduling confirmation.                                                                                                              | An evaluation failure enters the next state without pretending source parsing failed.                                                                                 |
| Evaluation / construction failure | Keep the valid current draft and its readable rack; underline a line only if the adapter provides a revision-correct source location. Otherwise use a code-pane banner with expandable technical details. | Show “Could not apply code”. **Conservative policy: request Stop**, then show “Scheduling stopped after error” only when confirmed. Do not claim automatic rollback, even if the previous pattern survived. | Fix code and press Play explicitly. Revert to last readable code is not advertised as audio rollback.                                                                 |
| Audio activation required         | Rack and draft stay editable. Transport says “Enable audio”; message “Click Enable audio to start playback”.                                                                                              | A direct click attempts initialization/resume and evaluation. Do not show Playing merely because the click occurred.                                                                                        | Stay in activation/error state on failure, with Retry and details. The tested first click worked; fresh-profile and other-browser activation still need proof.        |
| Samples loading / failed          | Keep values and source; identify bank or sample only when supplied by the engine. Persistent “Sample unavailable” message includes Retry samples and details.                                             | Do not claim Playing means all samples loaded. Report “Playback incomplete” if other voices are known to continue, otherwise “Sample status unavailable”. Do not replace the bank or sample silently.       | Retry the failed resource without rewriting code; if the adapter cannot identify/retry it, offer Stop and Play again instead of a nonfunctional Retry samples action. |
| Scheduled event / output failure  | Keep source and readable rack; show a workspace audio-error banner. No invented error-line location.                                                                                                      | Request Stop, retain the error, and say “Audio state unknown — Stop failed” if stopping fails. Hide activity success indicators whose evidence is stale.                                                    | Explicit Retry/Play after correction; no automatic restart.                                                                                                           |

**Last-good policy:** syntax failures do not submit a new pattern; previously
scheduled audio may continue, and Stop always remains available. For runtime
or output failures, prefer an explicit stop over a blanket last-good promise.
An evaluator can run `setcpm(...)` or other effects before failing. There is
no promise to roll those effects back. For failure classes the merged adapter
cannot observe reliably, #8 must keep an explicit Apply/Play boundary and
label the limitation, rather than infer success from `evaluate()` resolving.

Stop ends scheduling; existing voices and effect tails may ring out. Do not label this as immediate silence. Stop cancels pending playback intent: a parse/evaluation result arriving after
Stop must not restart audio. Serializing updates, handling stale completions,
and preventing older evaluations from winning are production #4/#8 work and
must respect the merged engine contract; a UI revision check alone cannot
cancel engine effects.
PR #26 also records that a never-settling arbitrary evaluation can block its
serialized queue, including Stop. General cancellation is not supported by that
adapter; keep this limit explicit rather than promising that every draft can
always be stopped immediately.
Fixing syntax while stopped updates the rack without starting sound. Save,
Copy and Export use the current draft, not the last readable or last-playing
revision. Never auto-revert typed text after failure.

## Owner decisions and implementation handoff

The owner selected all five choices, in order:

1. **Values:** typed input plus vertical knob dragging, Shift for fine control,
   and double-click reset. Knob dragging is now in v1; touch remains later.
2. **Occupied inputs:** ask Replace / Cancel and preserve the existing cable
   until Replace is confirmed.
3. **Module deletion:** remove the module and its incident cables; leave the
   remaining modules disconnected, without automatic bridging.
4. **New patch:** a silent MIX connected to OUT starter rack.
5. **Runtime failure:** request Stop after a surfaced evaluation/construction
   failure. Existing notes and tails may ring out; rollback is not promised.

These choices are recorded in [decisions](decisions.md#interaction-policy).
The detailed interaction defaults remain reviewable implementation guidance.

| Issue / acceptance topic                     | Reviewable proposal                                                                           | Production proof still required                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #9: set/reset values, detents, fine input    | Typed values, vertical dragging, Shift fine control, catalog snapping and double-click reset. | #5/#8: gestures, pointer cancellation, units, reset and coherent source updates; invalid typed input does not apply.                                                                   |
| #10: drag, three target states, explanations | Target table, persistent warnings, reroute/remove/replace and fan-out selection.              | #3/#4/#5/#8: whole-graph validation, source-preserving names and warnings under the decided #2/#13 engine/orbit contract.                                                              |
| #11: placement/full rows/deletion/new patch  | HP ghost, explicit row zone, deletion preview, silent MIX/OUT template.                       | #3/#5/#6/#8: no overlap, cancellation, cable cleanup, complete save/reopen state under #14’s decided matching contract.                                                                |
| #12: half-typed/error line/last-good         | Separate draft/rack/audio state table, exact-revision diagnostics, no partial rack.           | #6/#8: integrate the proven #1 parser/source contract, including stale-edit rejection and CRLF/Unicode handling.                                                                       |
| #12: blocked audio, samples, runtime         | Activation, incomplete-sample, evaluation and output states with explicit recovery.           | #4/#8: integrate observed engine behavior; prove fresh-profile activation, surfaced errors, retries and Stop intent; browser observation and audible verification reported separately. |

The five owner choices are approved while production integration in R1/R2 and
the remaining limitations in E1/E2 remain open. Do not close
technical dependencies or mark production acceptance passed on the strength of
the storyboard. Before #5/#8 implementation, use the merged
reader and engine contracts, update any newly resolved limitations in the
relevant specs, and reconcile any changed constraints here.
