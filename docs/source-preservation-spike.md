# Source preservation and layout identity spike

Decided 2 November 2026 for [#1](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/1)
and [#14](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/14).
This is research for the production generator (#3) and reader (#6), not either
implementation. Run the throwaway prototype with:

```sh
node --test scripts/source-spike.test.mts
```

The tests also run in `npm run check` through `test:guardrails`. Acorn is an
explicit development dependency. Nothing under `src/` imports the prototype.

## Decision: keep the document, splice edits

Keep the original source string alongside a parsed, editable projection and
source bindings. A `Patch` alone cannot preserve quote choice, whitespace,
comments, declarations, or arbitrary JavaScript. The production workspace needs
a document containing both the graph and its source provenance; do not change
`Patch` into an AST or promise `read(code): Patch` can alone support exact saves.

Use Acorn ranges as a lightweight concrete-syntax approach. An untouched save
returns the original string. A supported scalar control edit replaces only its
literal token, then reparses to obtain fresh bindings. Keep leading/trailing
argument comments outside that replacement. Whole-file regeneration remains
appropriate for a new rack with no imported source. For a structural rack edit,
#3/#6 must define a bounded replacement region and retain unaffected text; if no
safe region exists, reject that edit with an explanation rather than discard code.

The prototype projects top-level `$:` expressions, `const` initializers, and
`stack()` arguments into ordered calls with exact spans. It is deliberately not
a catalog-to-`Patch` mapper. It edits a finite numeric first argument only;
expressions, spread arguments, missing literals, and signed literals containing
embedded comments are rejected. It does not
execute JavaScript, initialize Strudel, or infer that parsing establishes safety.

Unknown calls keep their complete source, including callbacks and intervening
comments. Do not recursively extract callback calls as modules in the outer
voice. Syntax-valid but unsupported constructs can remain an opaque voice or
file region; they are not parse errors. Preserve helper declarations and other
non-voice statements even when they have no rack representation. Full JavaScript
syntax support is not a promise that every program can be represented as a rack.

## Observed proof

| Claim            | Evidence in the executable prototype                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untouched source | Seven fixtures return exact text: chained settings, named fan-out, modulation, unknown callback calls, `stack`, CRLF/Unicode/comments, helper declarations and a trailing rack marker. |
| Local edit       | `800` → `1200` → `-20` in a filter argument retains surrounding comments, single quotes, CRLF, unknown callback code and layout text. The second edit uses reparsed offsets.           |
| Opaque code      | The exact `.chunk(4, x => x.hurry(2))` suffix and preceding comment are exposed as one outer call; the nested `hurry` is not extracted.                                                |
| Parse failure    | An unfinished `.lpf(` returns original draft plus an error location, with no partial editable document.                                                                                |
| Stale mapping    | A rack edit against a different source string is rejected. Signal expressions and spread arguments cannot be overwritten as numeric controls.                                          |
| Layout identity  | Insertion/deletion, formatting, unique control edits, reordered distinct voices, repeated calls, and orbit routing are tested independently of text preservation.                      |

These checks prove source behavior and matching decisions, **not sound**.
No audio was played or heard for this spike. The prototype retains layout text
verbatim but does not parse a complete saved rack or restore disconnected state.
Catalog grouping, control meaning, full `generate(read(code))` equality and
hand-written sound equivalence remain acceptance work for #3/#6.

## Decision: stable IDs with conservative matching

Use saved opaque IDs for modules and scopes, with syntax descriptors for
reconciliation; reject chain position as persistent identity. See the
[format contract](patch-format.md#the-layout-comment-block).

Match named scopes by their unique declaration name. Match anonymous voices by a
unique full branch descriptor first, then a unique root-expression fingerprint
for edited branches, never `$:` ordinal. The root is the actual base receiver
(`lead`, `bass`) or initial call (`note("c")`), not the first downstream setting. Within a matched scope,
match unique call fingerprints first, then unique method names for argument edits.
Fingerprints describe parsed arguments, ignoring source offsets, quote style and
comments. The prototype retains full descriptors rather than trusting a short hash.
An unchanged complete call sequence can retain repeated calls by order. Otherwise,
ambiguous identical repeats get fresh IDs and automatic placement; unique calls
around them still restore. Never use nearest position to guess among duplicates.

This intentionally trades some layout continuity for avoiding wrong attachment:
changing an anonymous root, editing a branch among several with the same root,
renaming a declaration, moving a call to a different
scope, or changing the count/order of identical repeated calls can reset affected
layout. Distinct anonymous voices can be reordered safely. Identical anonymous
voices cannot be distinguished after arbitrary text edits without inline IDs;
we choose no inline metadata and do not claim to solve that ambiguity. Rack-origin
edits can carry IDs directly because their mutation owner knows which node changed.

The matcher demonstrates call identity only. A production module can own several
calls (for example delay settings), or a CV subexpression. #6 must bind those
calls/roles to one stable module ID using the catalog; #3 must emit the descriptors
that #6 consumes. Module identity is not synonymous with one AST call.

Generator-owned final-voice `.orbit(n)` routing is not a module and consumes no
module identity. The prototype opts into that rule explicitly for a known generated
fixture. Arbitrary imported orbit expressions remain source-owned and are preserved
verbatim, represented as CODE when necessary; do not infer generator ownership
from the method name or silently renumber imports. The engine track owns allocation.

## Findings for #12

Acorn offsets and columns count UTF-16 code units; ranges are end-exclusive.
Lines are 1-based and columns 0-based. For
`// 🐒\r\n$: note("c").lpf(` the tested error is offset 24, line 2, column 17.
An error location can be at end of file, not an existing character. Editor adapters
must convert their coordinate convention, including CRLF and surrogate pairs.

Ranges belong to the exact source revision that produced them. After any edit,
reparse and replace the mapping as one revision; do not apply old ranges to the
new draft. The minimal prototype uses source equality as its stale-edit guard.
Production asynchronous parsing needs revision ownership in #6/#8 as well.

A syntax failure returns no new graph. This permits retaining the last readable
rack without assigning it the current draft's ranges. Whether to dim/freeze it,
how to mark the error, and what audio should continue are #12 decisions. This
spike establishes no runtime-error mapping or last-good-playback guarantee. Syntax
success can still lead to a runtime failure; keep parse and playback status separate.
