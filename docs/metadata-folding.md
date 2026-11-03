# Protected rack metadata (#68)

The [#54 decision](decisions.md#rack-metadata-in-the-editor-5468-decided-3-november-2026)
keeps the v1 file intact and folds its trailing rack block with CodeMirror.
The marker remains visible on one line, followed by an unfoldable placeholder.
Its payload stays in the editor document, Copy, Export and local recovery.

`src/reader/metadata.ts` owns comment-aware marker detection, shared with the
layout reader. The editor hides only a standalone marker whose remainder is
trailing comment lines. Strings, templates, block comments and marker comments
before executable statements are not folded. Unknown metadata can be folded
and inspected without granting trust to its contents or replacing it.

Typing, cut, deletion and partial paste cannot change the block or its separating
newline, even when unfolded. Whole-document paste and Open are explicit file
replacement paths; rack rewrites can update metadata. While a draft contains an
unfinished string/comment, the editor maps its previously established boundary
instead of exposing the saved block. A file whose saved rack is fully restored
is accepted byte for byte; absent/reconciled layout still receives a current
source-bound envelope. This fixes an existing acceptance path that unnecessarily
restamped valid imported files.

The gutter numbers code lines only. Acorn EOF errors after a trailing block
are capped at the last non-whitespace code position, including the location in
the displayed message. Errors already inside code keep their positions. This
is not the more precise opener diagnosis or inline error presentation owned by
#69. Copy/Export of invalid drafts still retain their exact source.

## Observed verification, 3 November 2026

Node 24.22.2, headless Chromium 156.0.8078.4. The
[focused browser results](metadata-folding-results.json) and
[folded Enveloped synth screenshot](evidence/metadata-folded-synth.png) record:

- Silent starter and library loading fold automatically with coloured code visible.
- Copy, Export, Open and native clipboard paste retain full source bytes;
  the pasted file independently restores the complete saved rack.
- Real keyboard edits cannot change unfolded metadata, its separator or delete
  the document through select-all. Enter and continued typing still add code
  lines before the separator.
- Valid code acceptance, an unfinished comment and Revert preserve the fold;
  marker-like strings, block comments and earlier marker comments remain visible.
- Unknown metadata and invalid drafts export unchanged; EOF errors point to code
  and metadata gutters remain unnumbered even when unfolded. No page errors occurred.

The existing feedback suite also passed all 14 groups, including native Chromium
IME, selection/scroll through rack rewrites, local draft history, category
styles, Cyber editing, reduced motion and real Strudel events/nonzero WebAudio
PCM. The workspace error suite passed all 9 UI and 8 real-engine groups,
including exact CRLF export, pending/failed Stop and abandoned evaluation.
The autosave suite passed all 7 recovery/storage groups. Library UI and rack
editing passed for all ten entries and all nine exercise patches respectively,
with no page errors. `npm run check` passed: 751 unit tests, 17 inherited expected
failures, 40 guardrail checks, formatting/skill integrity, lint, TypeScript and
the production build.

After rebasing onto `91ffb42` (#111's reader identity fix), the full gate passed
again: 775 unit tests with no expected failures and 40 guardrail checks. The
focused metadata browser suite and all nine library exercise rack-edit groups
also passed again, with no page errors. The implementation diff was unchanged
by the rebase.

Sol review approved in one round with `gpt-6.1-sol` on high, with no actionable
findings or code changes. The reviewed diff remained 20 files, 771 insertions
and 26 deletions before/after review; later additions only record rebase proof.
Review token usage was not exposed.

Regression proof first observed the unfinished expression on line 2 reported
inside metadata at line 8; the test now reports line 2. A browser replacement
also exposed an old fold mapping onto a marker-like string. Its focused unit
regression failed with two folds, then passed with only the trailing block
folded. A final-line typing regression failed before protecting only the
separating newline, then passed with continued typing after Enter.

Run the deterministic gate with `npm run check`. Browser checks run against a
Vite development server with Playwright Chromium installed:

```sh
node scripts/metadata-check.mjs http://127.0.0.1:5180 /tmp/mms-metadata
node scripts/feedback-check.mjs http://127.0.0.1:5180 /tmp/mms-feedback
node scripts/workspace-errors.mjs http://127.0.0.1:5180 /tmp/mms-errors
node scripts/autosave-check.mjs http://127.0.0.1:5180 /tmp/mms-autosave
```

The feedback/error suites use the shared editor adapter for explicit whole-file
paste fixtures; actual keyboard protection and native clipboard paste are
exercised by the focused suite. Source bytes, saved rack identity and PCM are
separate observations. Physical listening, physical OS IMEs and other browsers
or devices were not verified. The private design canvas was unavailable; the
checked-in design guidance was used.
