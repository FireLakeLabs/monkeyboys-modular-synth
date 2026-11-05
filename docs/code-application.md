# Code application and shortcuts (#70, #180)

**While stopped**, finished code applies by itself after the 250 ms delay and does
not start playback. A finished call that adds or removes a module applies as soon as
its `)` is typed or deleted, so fast typing still gets [its undo steps](#undo-steps). **While playing**, code applies only on **Apply code** or
**Ctrl/Cmd+Enter**, so typing cannot disturb live audio, and “Unapplied changes”
stays visible. **Auto-apply while playing** opts into the same delay during playback
for this session; it is off on every page load. Stopping applies finished code
typed while playing. **Ctrl/Cmd+.** requests Stop from anywhere, including the
editor, rack controls and dialogs, independently of pending evaluation. Stop ends
scheduling; notes and tails may finish.

Apply and Ctrl/Cmd+Enter apply any readable code at once, finished or not. They start
playback when stopped, or update running playback. The Apply on the locked-rack strip
applies without starting playback, because its job is to unlock the rack. The silent
starter still reports “Nothing reaches OUT yet” without initializing audio.

## Finished code

[Parser-valid is not enough](usability-review.md): a half-typed `.l` reads as code
and collapses its voice into CODE. Readable code is finished unless:

- A chain or statement newly ends on a word with no call, such as `.l`, `.lpf`,
  `$: s`, `const lead = no`, `stack(s("bd").l)`, `.jux(x => x.l)` or
  `.lpf(sine.rang)`. A declared name is fine, as is a `Math` or `Number` constant
  such as `Math.PI`, and a bare word the accepted code already had.
- While the editor has focus, the caret is on a word, as when editing a call's name.

A complete call the rack cannot model is finished, so it applies as CODE. Strings and
comments never count as words. A paste is finished text, so it skips these rules: a
word list cannot tell `sine.rang` from a property read such as `list.length`, and a
pasted file full of property reads should still apply. Typed property reads wait for
Apply. See [`finishedCode.ts`](../src/workspace/finishedCode.ts).
Code that is readable but held for this reason reports “Unapplied changes”, and a bare
global such as `$: silence` needs Apply. Moving the caret off a word rechecks the code.

## Undo steps

Typing groups into undo steps with the token knob drags use. A step ends at the first
of these, once the code is finished: a module is added or removed; typing pauses for
1.2 seconds after the last accepted change; you leave the editor, make a rack edit or
press Play. Leaving the editor and pressing Play also apply finished code at once.
Undo therefore never lands on unreadable code or a half-typed word, unless you chose
to Apply one. A half-typed draft on top of accepted code stays with the editor's own
undo, as described in [undo and redo](undo-redo.md).

## Play and the locked rack

A draft never disables Play, readable or not, and Play uses the last applied code.
Rack edits and knob drags apply immediately. The rack stays locked during an unapplied
draft, because a rack edit would overwrite it. While stopped, every keystroke is
briefly unapplied, so the lock appears only after typing has paused for 1.2 seconds
with the code still unapplied, or at once when you leave the editor. See
[the locked rack](design.md#the-locked-rack-180).

A restored draft waits for you: it does not apply by itself, and the rack shows as
locked until you Apply, Revert or start typing.

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
replacement prompt or the library is active; Stop remains global.

File/library loading and New remain explicit, silent replacement operations.
A valid file is accepted at once; an invalid file remains a draft beside the
previous rack. Recovery restores the accepted file and exact draft separately,
with no audio initialization.

## Verification (#70)

These results predate #180, so their “unapplied while stopped” checks describe the
old default. Observed 3 November 2026, Node 24.22.2 and Chromium 156.0.8078.4, against the
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
