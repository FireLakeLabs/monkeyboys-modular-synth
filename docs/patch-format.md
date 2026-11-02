# Patch format

A patch has two equivalent forms:

1. **In memory:** the `Patch` object in [`src/patch/types.ts`](../src/patch/types.ts).
2. **On disk / on the clipboard:** plain Strudel code, followed by a comment block that records what the code cannot (rack layout, looks, output names).

The code is the canonical saved form. Paste it into the Strudel REPL and it plays; paste it back into MonkeyBoy and the rack is restored.

## In memory

```ts
interface Patch {
  version: 1
  modules: PlacedModule[]   // what is in the rack, where, in which look, with which values
  cables: Cable[]           // output jack → input jack
  names: Record<string, string>  // "moduleId:jackId" → name, for outputs with 2+ cables
}
```

- Module ids are the module type plus a counter: `seq1`, `vcf1`, `vcf2`.
- Positions are a row index and an offset in HP from the left of that row.
- `values` holds one entry per control id from the catalog; missing entries mean “catalog default”.
- A cable always runs from an `out` jack to an `in` jack. An `out` jack may have many cables; an `in` jack has at most one.

## The layout comment block

Decided in the [source-preservation spike](source-preservation-spike.md) (#1/#14).
The marker stays `// ── @monkeyboy rack v1 ──`. The remaining lines contain a
JSON object, each prefixed with `// `, through end of file. It is a trailing
comment block, so the saved file remains executable Strudel.

The v1 envelope uses these fields:

- `version: 1` validates the metadata format independently of the JavaScript.
- `scopes`: saved opaque IDs, an optional named declaration anchor, and full
  root/call syntax descriptors from the accepted source revision.
- `modules`: stable module `id`, catalog `type`, `row`, `hp`, `look`, and source
  bindings to scope/call descriptors and semantic roles. One module can bind
  several calls; CV bindings include their target module ID and jack/control role.
- `names`: output names keyed by stable `moduleId:jackId`, as in `Patch`.

The exact descriptor encoding and module grouping belong to the interoperable
writer/reader in #3/#6; the spike demonstrates matching with full normalized AST
argument descriptors, not a finalized serializer. Do not ship a second wire
encoding from the throwaway prototype. There is no shipped reader of the old
proposed `lead.2` line format to migrate.

## Matching rules

- A module ID is stable identity; a chain index is only a current source address.
  Allocate fresh IDs without reusing existing ones. Restored positions, looks,
  output names and CV targets follow those IDs, never a shifted chain index.
- Reconcile scopes by a unique declaration anchor, or a unique anonymous root
  full branch descriptor first, then a unique base-receiver/initial-call
  fingerprint for edited branches. Do not use the ordinal of a `$:` line as identity. Inside a
  matched scope, prefer a unique full call fingerprint, then a unique method
  name for a changed argument. Ignore trivia and literal quote style.
- A completely unchanged sequence can restore repeated identical calls by order.
  In a changed sequence, ambiguous repeats receive fresh IDs; do not guess from
  position. Unambiguous surrounding matches retain their layout. Identical
  anonymous voices, changed anonymous roots and renamed declarations may reset
  affected layout. See the spike for tested limits.
- Known generator-owned final-voice orbit routing does not consume module IDs.
  Imported routing stays source-owned unless its ownership is established.
- Without a valid matching block, auto-layout one row per voice, in chain order,
  using default looks. Unmatched modules are auto-placed after matched modules
  in their voice's row, without overlapping occupied HP. A matched module keeps
  its position and family-valid look.
- Invalid metadata must not invalidate otherwise valid Strudel or change its
  sound. #6 must validate versions, unique IDs, catalog types/looks, nonnegative
  integer positions and binding references before applying saved state. Treat
  unsupported versions as unrecognized metadata: retain original source, report
  that layout was not restored, and do not silently overwrite the unknown block.
- An untouched save preserves the block exactly. When rack metadata changes,
  write a validated replacement block for the current source revision. A
  code edit triggers reconciliation before the next metadata write. If metadata
  cannot be interpreted, require an explicit replacement action before discarding it.

## Remaining persistence questions

Knob values not expressed in code (OUT volume, bypassed settings), disconnected
modules and cables need a separate saved-state contract before persistence ships.
Stable identity does not prove that the entire `Patch` can be reconstructed from
sounding code. These are acceptance work for the generator/reader and workspace
persistence, not resolved by the layout matching spike.
