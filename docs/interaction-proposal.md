# Interaction proposal: values, cables, rack editing, and errors

**Five UX choices approved by the owner.** Values, cables, and rack editing
for #9–#11 are implemented and verified in [interaction evidence](interaction-verification.md).
The #12 error-state handoff below retains its separately documented engine limits.
This proposal covers [#9](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/9),
[#10](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/10),
[#11](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/11), and
[#12](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/12).
This track owns #12. Production rack work belongs to
[#5](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/5); workspace
state and live editing belong to [#8](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/8).
The owner choices select interaction policy; the linked verification reports
provide production evidence separately from this storyboard.

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

## Evidence and dependency resolution

Historical handoff prepared 2 November 2026. The storyboard is design evidence;
production acceptance comes from the reports below. The
[build plan](build-plan.md#current-status-and-remaining-work) owns current issue
status, including open #12. #9–#11 closed through
[PR #34](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/34).

Reader provenance: [PR #24](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/24)
merged the #1/#14 source spike as `d998ea93a8a8b4aab7776f570e116915da3d7474`.
Its [Findings for #12](source-preservation-spike.md#findings-for-12) established
parser coordinates, opaque-code preservation and stale-source rejection without
an audible guarantee. Engine provenance:
[PR #26](https://github.com/FireLakeLabs/monkeyboys-modular-synth/pull/26) merged
as `9cc4ef0f2393140002791daa9b78186435cd034c`; its
[engine handoff](engine-spike.md#errors-and-last-good-playback-12-handoff)
records the earlier scheduling/output observations separately from listening.

| ID  | Original dependency                                                            | Subsequent production evidence / remaining boundary                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Parser failure, exact-revision spans and no partial graph.                     | [Reader](reader-verification.md), [workspace](workspace-verification.md) and [error acceptance](error-verification.md) verify retained drafts/rack, revision ownership and parser diagnostics.                                                                                                            |
| R2  | Stable grouping, source-preserving edits and complete saved state.             | Reader/workspace tests restore full validated state; [#34](interaction-verification.md#saved-rows-and-source-preservation) adds empty rails and [#35](structural-edit-verification.md) supplies conservative structural plans. Ambiguous external matches still auto-place; unsafe edits are refused.     |
| E1  | Surfaced evaluation failures, production transport and arbitrary side effects. | [Playback](playback-verification.md), workspace and [#36 recovery](audio-recovery.md) verify explicit recovery and guarded Stop. Evaluation is not transactional; no runtime line/module mapping is proven.                                                                                               |
| E2  | Late resource/output errors, activation, Stop cancellation and orbit reset.    | #36 verifies observable logs, fresh isolated Chromium activation/retry and Stop outside pending evaluation. Playback verifies structural bus reset and generator/reader tests cover routing. Universal readiness/error detection, other-browser/device behavior and physical listening remain unverified. |

The reader's concrete diagnostic example is `// 🐒\r\n$: note("c").lpf(`:
offset 24, line 2 (one-based), column 17 (zero-based). In an editor whose
display columns are one-based that is column 18. Do not reuse these spans
after another keystroke, normalize line endings before applying them, or
equate UTF-16 offsets with user-perceived character counts.
The diagnostic can point to the end of the document; show a caret marker there
instead of requiring an existing character to underline.

The merged reader spike records receiver-aware stable-call matching and
conservative automatic placement for ambiguous repeats. The
[layout identity contract](patch-format.md#matching-rules) is implemented by the
reader/workspace, with source and saved-state checks recorded separately.

The merged engine probe records audio signal from default/TR808/TR909 banks and distinct effect settings on separate
orbits. The [decided orbit allocation](translation-rules.md#effect-orbits) gives
every final voice (including dry voices) its own orbit at the end of the branch;
#4 supplies structural effect-bus reset. Those later checks establish generator
integration and persistence separately from the spike; neither establishes
arbitrary-patch continuity or sound at the physical speaker.

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
bridge a broken chain. Disconnected parts are visibly inactive and retained in
validated saved state (R2).

Several cables may leave one output. Offset plug collars slightly so the
stack is visible; selecting the output lists its destinations so each cable
can be selected without pixel hunting. At the second cable, reveal an
editable name tag and a generated valid unique name. Renaming validates a
JavaScript identifier and rejects reserved or colliding names before commit.
Source-preserving declaration/reference edits and retaining a chosen name
after reducing to one cable are verified by the workspace/interaction reports;
unknown CODE references are refused rather than automatically renamed or inlined.

For reversed apparent FX order, explain the order actually heard; do not
reorder cables or code. Exact effect-order wording and independent DELAY/
REVERB settings follow the #2/#13 findings, with generation, structural reset
and indirect-order warnings verified in the production reports above. Shared imported orbits must not be silently
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
survive save/reopen under the reader/workspace checks; #34 also verifies empty
rail retention independently of executable source.

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

The [production acceptance audit](error-verification.md) verifies pending-operation
warnings, diagnostic ownership, retained drafts and Open/New replacement. The
subsequent [#36 audit](audio-recovery.md) resolves observable resource/output
reporting and guarded Stop, and reruns that suite. #12 remains open in GitHub for
issue-level acceptance reconciliation; the build plan records that distinction.
These reports supersede storyboard defaults where the adapter cannot expose
individual activation phases, resource readiness or a resource-specific retry.

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

The `onEvalError` adapter reports evaluation failures; #36 additionally observes
upstream resource/output logs and requests Stop when they report a failure.
Automatic detection and recovery of all late failures remain unsupported. Do not
invent a resource diagnosis: distinguish registered manifests from unverified
decoding/output, and retain manual Stop/explicit Play. No resource-specific retry
is offered because the adapter cannot reliably clear Strudel's failed sample cache.

The table retains the design states. Actual initialization uses a combined
starting message; the linked audits record the available statuses/actions.

| State / trigger                   | Rack and code presentation                                                                                                                                                                                   | Audio presentation and action                                                                                                                                                                               | Recovery                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing / parse pending           | “Reading code…”; retain and dim the last accepted rack; disable values, dragging, deletion and look/name edits.                                                                                              | Keep the existing audio status; do not evaluate an incomplete draft. Stop remains enabled.                                                                                                                  | Accept only the newest result.                                                                                                                                                                      |
| Syntax error                      | “Rack shows previous code”; mark the diagnostic line/column with underline and inline text. Keep the exact draft editable. With no accepted rack, show “Rack unavailable until code parses”.                 | If audio was confirmed running, say “Previous pattern scheduled”; otherwise “Stopped”. The parser alone cannot guarantee audible playback.                                                                  | Fix code or choose Revert to last readable code (explicitly discards the draft). If no accepted revision exists, omit Revert.                                                                       |
| Valid unsupported code            | Accept readable portions and exact CODE blocks; label “Some code has no controls”. This is not a parse error.                                                                                                | Apply only through the supported engine path; CODE remains subject to runtime errors.                                                                                                                       | Editing the CODE source may make it readable later; no automatic destructive rewrite.                                                                                                               |
| Parsed and source-mapped          | Restore rack editing and current-span selection; show “Rack matches code”.                                                                                                                                   | If stopped, stay stopped. If playing, show “Applying…” until explicit scheduling confirmation.                                                                                                              | An evaluation failure enters the next state without pretending source parsing failed.                                                                                                               |
| Evaluation / construction failure | Keep the valid current draft and its readable rack; underline a line only if the adapter provides a revision-correct source location. Otherwise use a code-pane banner with expandable technical details.    | Show “Could not apply code”. **Conservative policy: request Stop**, then show “Scheduling stopped after error” only when confirmed. Do not claim automatic rollback, even if the previous pattern survived. | Fix code and press Play explicitly. Revert to last readable code is not advertised as audio rollback.                                                                                               |
| Audio activation required         | Rack and draft stay editable. Transport says “Enable audio”; message “Click Enable audio to start playback”.                                                                                                 | A direct click attempts initialization/resume and evaluation. Do not show Playing merely because the click occurred.                                                                                        | Stay in activation/error state on failure, with Retry and details. Fresh isolated Chromium click/retry is verified in #36; native OS denial and broader browser/profile coverage remain unverified. |
| Samples loading / failed          | Keep values and source; identify bank or sample only when supplied by the engine. Show registered/loading/failed manifest status and observed failure details; decoding/output readiness remains unverified. | Do not claim Playing means all samples loaded. Report “Playback incomplete” if other voices are known to continue, otherwise “Sample status unavailable”. Do not replace the bank or sample silently.       | Retry the failed resource without rewriting code; if the adapter cannot identify/retry it, offer Stop and Play again instead of a nonfunctional Retry samples action.                               |
| Scheduled event / output failure  | Keep source and readable rack; show a workspace audio-error banner. No invented error-line location.                                                                                                         | Request Stop, retain the error, and say “Audio state unknown — Stop failed” if stopping fails. Hide activity success indicators whose evidence is stale.                                                    | Explicit Retry/Play after correction; no automatic restart.                                                                                                                                         |

**Last-good policy:** syntax failures do not submit a new pattern; previously
scheduled audio may continue, and Stop always remains available. For runtime
or output failures, prefer an explicit stop over a blanket last-good promise.
An evaluator can run `setcpm(...)` or other effects before failing. There is
no promise to roll those effects back. The workspace keeps explicit Play after
failure and labels readiness limits; `evaluate()` resolution does not prove
successful resource decoding/output.

Stop ends scheduling; existing voices and effect tails may ring out. Do not label this as immediate silence. Stop cancels pending playback intent: a parse/evaluation result arriving after
Stop must not restart audio. Playback serializes live updates and rejects stale
intent; a UI revision check alone cannot cancel engine effects.
The [#36 engine contract](audio-recovery.md) supersedes PR #26's serialized-Stop
limit: Stop bypasses pending evaluation and guards its later installation/queries.
The evaluation itself remains uninterruptible. Explicit replay waits for it to
settle or requires export/reload; synchronous main-thread blocking still requires
browser-level recovery.
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

| Issue / acceptance topic                     | Reviewable proposal                                                                           | Production evidence and remaining scope                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #9: set/reset values, detents, fine input    | Typed values, vertical dragging, Shift fine control, catalog snapping and double-click reset. | Verified: numeric validation, explicit snap confirmation, pointer/Escape cancellation, reset and live source/audio application. See [interaction evidence](interaction-verification.md).                           |
| #10: drag, three target states, explanations | Target table, persistent warnings, reroute/remove/replace and fan-out selection.              | Verified: graph validation, warnings, unresolved CODE, replacement, rerouting, removal and named fan-out selection. Imported unsafe edits remain refused. See [interaction evidence](interaction-verification.md). |
| #11: placement/full rows/deletion/new patch  | HP ghost, explicit row zone, deletion preview, silent MIX/OUT template.                       | Verified: native placement/movement, full rows, cancellation, deletion, silent replacement and complete saved state including empty rails. See [interaction evidence](interaction-verification.md).                |
| #12: half-typed/error line/last-good         | Separate draft/rack/audio state table, exact-revision diagnostics, no partial rack.           | Verified in reader/workspace and [error acceptance](error-verification.md): retained draft/rack, exact parser coordinates, revision-safe diagnostics and export.                                                   |
| #12: blocked audio, samples, runtime         | Activation, incomplete-sample, evaluation and output states with explicit recovery.           | [#36 recovery](audio-recovery.md) verifies observable failures, retries and guarded Stop in isolated Chromium; universal detection/readiness, physical listening and broader browser coverage remain unverified.   |

The owner choices and completed production evidence are distinct from the
storyboard. Keep #12's remaining issue-level acceptance reconciliation separate
from completed #9–#11 flows and #36 implementation. Preserve the explicit engine
limits rather than presenting them as unfinished reader/rack integration.
