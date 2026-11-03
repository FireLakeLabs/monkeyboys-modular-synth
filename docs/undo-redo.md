# Undo and redo (#63)

The app owns a session history of accepted `SourceDocument` revisions. Source,
source bindings and the complete saved rack travel together; undo never
regenerates an earlier patch from its projection. Ctrl/Cmd+Z and
Shift+Ctrl/Cmd+Z work in the rack and source editor. The header also exposes Undo
and Redo. Restoration uses the normal accepted-document installation path,
including autosave, diagnostics and playback update.

## Boundaries and grouping

- Each successful explicit code Apply, auto-apply debounce, rack operation,
  metadata replacement, conversion, New, Open or library load is one accepted
  step. An unchanged accepted file adds no step and preserves redo.
- All live values from one knob pointer gesture form one step. Only that knob’s pointer value commits carry its grouping token;
  a preceding input blur commit remains separate. They still reach
  playback immediately. Returning to the starting file cancels that step.
  Separate gestures and keyboard/value commits remain separate steps. History
  navigation waits until a pointer gesture or composition ends.
- New accepted work after undo discards the old redo branch. Failed/refused
  edits and invalid code never enter accepted history.
- History lasts for the current page session. Recovery establishes its restored
  accepted document as a fresh baseline; prior session history is not stored.
  The recovery slot still saves the accepted file and unfinished draft together.

## Draft ownership and escape

CodeMirror history handles an unfinished draft while the editor has focus. Its
undo/redo never changes the accepted rack or audio. Acceptance and history
restoration checkpoint that local history, so one accepted change cannot be
undone again by an independent editor stack.

When local draft undo is exhausted, the next Undo discards the remaining draft
and returns to the accepted document, consuming that action. The following Undo
steps through accepted history. This also gives an invalid draft an escape path.
The header Undo, or the shortcut outside the editor, discards a pending draft
first; Redo outside the editor waits until that draft is accepted or discarded.
Ordinary rack text inputs keep their native text undo until they commit.

Undo/redo does not navigate while a replacement, recovery choice, library modal
or composition is active. Restoring a revision clears transient rack selection,
menus and cable gestures. Playback stays stopped when already stopped. During
playback, restoration applies like any other accepted edit, including existing
structural bus resets, error handling and Stop behavior. Undoing a New/Open/load
does not restart the audio that replacement stopped.

## Verification

Verified 3 November 2026 with Node 24.22.2 and Chromium 156.0.8078.4; the archived design
boards were available, and the private live canvas was not accessed.

The deterministic [history tests](../src/workspace/history.test.ts) separately
assert exact source, saved rack identity and reopen identity through layout,
look, name, cable, module deletion, code and patch replacement. They also cover
gesture grouping/cancellation, no-op acceptance, branching, boundaries and reset.
A CodeMirror regression checks local whole-file paste undo/redo through protected
metadata. `npm run check` passes, including 805 unit cases, 40 guardrails,
formatting, skill integrity, lint, TypeScript and production build.

Run the workspace acceptance suite against Vite:

```sh
node scripts/history-check.mjs http://127.0.0.1:5183 /tmp/monkeyboy-history --real
```

Its recording-adapter checks cover actual shortcuts inside/outside the editor,
visible buttons, deleted modules/cables, looks, full saved positions/names,
replacement without autoplay, one-step pointer dragging, draft undo/redo,
acceptance checkpoints, invalid-draft escape, redo branching, live transport
updates and fresh recovery history. The optional real-engine group separately
measures WebAudio PCM for sounding → accepted mute → undo sounding → redo mute,
with scheduling retained. Physical speakers/headphones are not heard; these
checks do not establish subjective continuity, arbitrary-code rollback or broad
browser/device coverage. The suite needs Chromium; real Strudel initialization
also uses external resources, so it remains separate from the shared CI gate.

The [raw acceptance results](undo-redo-results.json) record 12 passing browser
checks. PCM RMS measured 0.01433 initially, zero after mute, 0.00297 after undo
and zero after redo. No page errors occurred. The shared preview also observed
module add/undo/redo with stopped transport.

The existing feedback and explicit-code-application suites check the local
checkpoint directly, since accepted undo now intentionally changes the workspace.
Their other behavior checks remain intact.

Sol round 1 found S1 (should): a BPM blur commit was absorbed by the following
CUTOFF gesture. The added browser regression failed before the fix: one Undo
returned BPM 120 instead of retaining 140. Grouping now travels explicitly with
Numeric pointer commits through the rack edit boundary. The same regression
passes: the first Undo retains BPM 140 and restores cutoff; the second restores
BPM 120. The full 12-check browser suite, including real PCM, passes afterward.

After rebasing onto `e44907a` (#69), the App/editor integration retains opener
diagnostics and gutter markers. The full gate and 12-check history/PCM browser
suite passed again, as did the existing code-application and feedback suites.
