# Code application and shortcuts (#70)

Editor changes are drafts until **Apply code** or **Ctrl/Cmd+Enter** accepts
and applies them. A successful apply starts playback when stopped, or updates
running playback. The silent starter still reports “Nothing reaches OUT yet”
without initializing audio. **Ctrl/Cmd+.** requests Stop from anywhere, including
the editor, rack controls and dialogs, independently of pending evaluation.
Stop ends scheduling; notes and tails may finish.

Explicit apply is the default on every page load. **Auto-apply** opts into the
250 ms acceptance debounce for this session. It updates running playback but
does not start stopped audio. Turning it off leaves subsequent edits unapplied.
Rack edits and knob drags continue to apply immediately. Rack mutations stay
locked while an editor draft is unapplied, preserving the accepted rack and
preventing a rack edit from overwriting that draft.

The editor reports unapplied changes and shows both shortcuts; the transport
button's tooltip also lists them. Parsing still diagnoses incomplete drafts
without accepting them. Invalid Apply keeps the exact draft, last accepted rack
and existing scheduling. Copy/Export include the draft; Revert restores accepted
source without starting stopped audio. Open in Strudel uses accepted source.
Surfaced runtime failures still request Stop; correcting the draft alone does
not restart audio. Explicit Apply or Play performs recovery.

Composition and repeated Enter do not trigger Apply. The shortcut runs before
CodeMirror's Enter handler, so applying does not insert a newline. Acceptance
checkpoints local editor history; unaccepted draft undo/redo stays local. Global
accepted-document undo/redo remains owned by #63. Apply is suppressed while a
replacement/restore/library dialog is active; Stop remains global.

File/library loading and New remain explicit, silent replacement operations.
A valid file is accepted even with auto-apply off; an invalid file remains a
draft beside the previous rack. Recovery restores the accepted file and exact
draft separately, with auto-apply off and no audio initialization.

## Verification

Observed 3 November 2026, Node 24.22.2 and Chromium 156.0.8078.4, against the
local Vite development server:

- `node scripts/code-application-check.mjs <url> <output-directory> --real`
  first failed before implementation because an unapplied draft changed the
  rack from two modules to five. It now passes Ctrl and Cmd Apply/Stop,
  unchanged accepted source while typing, draft undo/redo and acceptance
  checkpoints, immediate typed/dragged rack values, exact invalid-draft Export,
  composition/plain Enter, opt-in auto-apply, runtime recovery, Stop during
  pending evaluation in a dialog, silent restore and silent file loading.
- Its separate real-engine group measured RMS 0.01429 after keyboard activation,
  0.01527 while the mute remained unapplied, and 0 after applying the mute.
  Live edits take effect at Strudel's scheduling boundary; the check allows old
  notes to finish. These are observed signal levels, not performance claims.
  Physical speakers/headphones were not heard.
- The existing `workspace-errors.mjs`, `autosave-check.mjs`,
  `feedback-check.mjs` and `metadata-check.mjs` suites passed. Their live-edit
  checks now explicitly opt into auto-apply. These retain real-engine error
  injection, exact source and saved rack identity, pending/failed Stop,
  restricted storage, native Chromium composition and protected metadata checks.
- `npm run check` passed all 786 unit cases after rebasing onto `e541524` (#113), 40 guardrails, formatting, skill
  integrity, lint, TypeScript and production build. Browser checks remain
  separate from shared CI and require provisioned Chromium; real-engine checks
  also require external sample manifests. Mac hardware/OS IMEs and other
  browsers/devices were not tested; Cmd events were exercised in Chromium.

Output JSON and screenshots are written to the supplied temporary directory.
The in-page grid, connection, identity, library loading/replacement and library
rack-editing probes also passed after the rebase. They explicitly enable
auto-apply through the shared browser helper; the new application suite leaves
the initial default untouched. The application suite, including real-engine
PCM, passed again after the rebase.

After rebasing onto `b40d2d8` (#114), the full gate passed 787 unit cases and
40 guardrails. The application suite and real-engine signal group passed again;
its knob locator now uses the upstream accessible slider role. The application
behavior diff was unchanged by that rebase.

Sol review: one round with gpt-6.1-sol on high effort, APPROVE with no findings.
Review made no changes; the diff stayed at 535 additions and 60 deletions before
this final verification note. Usage was not exposed. The branch was pushed only
after approval.
