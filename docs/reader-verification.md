# Code reader (#6)

Baseline verified 2 November 2026 for #6. Later [workspace integration](workspace-verification.md)
and [#35 structural plans](structural-edit-verification.md) extend this evidence;
[current status](build-plan.md#current-status-and-remaining-work) is owned by the build plan.

`src/reader/index.ts` exports `read(source)` and `tryRead(source)`. Parsing never
executes JavaScript or initializes audio. The reader returns a source document:

```ts
const document = read(source)
const patch = document.patch
const unchangedSource = generate(document)
```

This follows the #1/#14 decision rather than the issue's original
`read(code): Patch` shorthand. A graph alone cannot preserve comments, helpers,
quote spelling or arbitrary JavaScript. `generate(patch)` still writes a new
rack-owned file; `generate(document)` preserves the imported file exactly and
rejects direct mutation of its graph. The workspace uses source-aware rack edit operations (see the linked evidence);
callers must not regenerate imported documents from `document.patch`.

`tryRead` returns either a parsed document or an invalid draft with Acorn's UTF-16
offset, 1-based line and 0-based column. An invalid draft contains no graph or
bindings, allowing the workspace to retain its last accepted revision separately.

## Projection and preservation

Catalog `strudel` ownership selects each adapter, with the documented contextual
exception for source `s()` versus chained `.s()`. Supported literals map to
controls; catalog ranges and switches are checked before accepting them. Complete
contiguous envelope groups bind to VCF/VCA CV. LFO range/rate expressions bind
in target units, including shared signals with target-specific default depths.
Multi-call settings share module bindings; repeated primary settings remain
separate modules. Rich SEQ and DRUMS mini notation stays in their text values.

`$:` voices and direct `stack()` arguments become ordered mixer inputs. Larger
scores use nested four-channel buses, at unity gain unless a final literal
`postgain` supplies the channel value. Referenced `const` dependencies are
projected once; outputs used by multiple cables retain their declaration names.
An unlabelled final call expression is also a voice. Earlier setup statements
and unreferenced helpers remain source-owned text.

Unsupported calls retain their exact receiver suffix, including intervening
comments and callbacks, in CODE. Opaque receivers become CODE sources. If a
voice's projection cannot satisfy graph invariants, that voice becomes one CODE
source, without retaining a partial failed graph. Nested callback calls are not
mistaken for outer modules. Imported routing remains CODE unless the complete
scope matches verified generator provenance.

Bindings identify module, scope, call indices, semantic role, CV target and exact
source ranges. Scalar literal spans exclude argument comments; a signed literal
with an internal comment has no editable token binding. Coupled CV expressions,
unsupported arguments and inverse rate/tempo expressions do not advertise a
simple scalar replacement.

## Saved state

The trailing marker must be an actual JavaScript line comment, not text inside a
string. Metadata is decoded as unknown input, checked through the graph/writer
boundary, and its complete envelope compared with the writer's reconstructed
bindings and scopes. JSON property ordering is irrelevant. Unsupported versions,
unknown fields and malformed or unverifiable state produce a layout diagnostic;
the original source and block remain untouched.

When all executable statements match the saved graph's generated program, restore
the entire graph, including IDs, cable IDs, looks, positions, names, omitted
controls, OUT volume, bypassed effects and disconnected drafts. Formatting and
comments may differ; sound syntax and statement order must agree.

After external code edits, use the decided conservative scope/call matcher.
Unique fingerprints precede unique method matches; unchanged repeated sequences
can keep order, while changed ambiguous repeats get fresh IDs. Only parsed
sounding controls and verified identity/layout are applied. Saved disconnected
state and cables do not override edited code. Unmatched modules follow restored
positions without overlap. A layout diagnostic reports this limited recovery.

## Observed proof

Run `npx vitest run src/reader/read.test.ts` and `npm run check`.

- Generated fixtures recover exact source and saved graph state across all v1
  module types, fan-out/dependencies, nested mixers, CV, bypass and disconnected
  drafts. Byte equality and graph equality are separate assertions.
- Handwritten fixtures assert actual catalog values, literal ranges, channel
  order, unknown CODE text, CRLF/Unicode/comments, helpers, tempo and routing.
- Invalid metadata, stale settings, unique edits and ambiguous repeated calls
  exercise layout trust and identity separately from source equality.
- The installed Strudel event algebra queries handwritten synth, filter,
  amplitude/filter envelope, LFO and sample fixtures. For fully specified
  supported fixtures, independently regenerate the projected graph and compare
  its events with the original source. This prevents a source-only save from
  masking incorrect module mapping. A shared imported orbit fixture also checks
  exact event settings through the retained document.

No browser audio was played or heard for this pure reader change. Event equality
does not prove audible equivalence for every arbitrary JavaScript program or
late audio failure. Preserving the complete original document is the guarantee
for unsupported code. The [workspace](workspace-verification.md) now integrates live editing, metadata
replacement and proven literal/name splices. The [#35 preservation matrix](translation-rules.md#imported-structural-edits-35)
defines supported structural edits; edits without a proven plan are refused. Precise runtime error mapping
remains unverified; parser locations are independent of runtime stacks.
