# Code-line diagnostics (#69)

The reader reports unclosed `(`, `[` and `{` at their opening token when Acorn
reaches EOF or a mismatched closer. Tokenization keeps strings, template text,
regular expressions and comments opaque, including marker-like text. Earlier
syntax errors keep their original position rather than being attributed to an
otherwise unfinished outer expression. EOF fallback uses the same comment-aware
`codeEnd` boundary as [metadata folding](metadata-folding.md).

The existing code-line numbers remain visible; rack metadata stays unnumbered,
including when unfolded. A pink gutter dot marks the diagnosed line, with the
same line, column and message as the error below the editor. A new document edit
clears that marker immediately; the next reader result installs a marker only
for its exact source revision. Revert keeps its existing last-readable-document
behavior. No parsing step executes code or accepts a partial rack.

## Observed verification, 3 November 2026

Node 24.22.2; Chrome 156 in the T3 browser preview. The
[recorded browser checks](error-positions-results.json) and
[line-eight screenshot](evidence/error-opener-line8.png) cover:

- The #65 voice with `.lpq(8` on line 8: the alert reports line 8, column 7,
  and the gutter marker aligns with that line. The accepted file and displayed
  rack module IDs/control values remain unchanged; the exact invalid draft is saved.
- Revert restores the exact last readable file and clears the error and marker.
- A comma error retains its exact code token and gutter marker. Correcting it
  clears the stale marker synchronously and accepts the readable code.
- Brackets and marker text inside strings, templates, regexps and comments do
  not change opener placement or the actual trailing metadata fold.
- Unfolding metadata leaves its lines unnumbered. Replacing an invalid draft
  with a shorter one updates the marker without a range error; Revert still works.

All seven browser groups passed with no page errors or unhandled rejections.
The browser check is an app-context module, run through the preview evaluator
against a Vite development server:

```js
await (await import('/scripts/error-positions-browser.mjs')).checkErrorPositions()
```

The focused reader regression first failed with line 9, column 13 at the end
of the expression instead of the `.lpq(` opener on line 8, column 7. It now passes,
along with parentheses, array/object brackets, mismatched closers, literal/comment
lookalikes and unchanged placement of other parse errors. `npm run check` passes:
801 unit tests, 40 guardrail checks, formatting, skill integrity, lint, TypeScript
and production build. Audio behavior was not changed or physically heard; this
verification covers diagnostic presentation and recovery, not audible equivalence.
The private design canvas was unavailable; checked-in design guidance was used.

Sol review approved in one round with `gpt-6.1-sol` on high, with no actionable
findings or code changes. The reviewer independently passed the 65 focused
reader tests and `git diff --check`. The reviewed diff was 15 files, 374
insertions and 13 deletions; this paragraph only records that review. Token usage
was not exposed.
