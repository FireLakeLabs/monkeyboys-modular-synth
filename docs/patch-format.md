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
  names: Record<string, string>  // "moduleId:jackId" → name, retained after a split
  rows?: number                 // explicit rail count, including empty rows
}
```

- Module ids are the module type plus a counter: `seq1`, `vcf1`, `vcf2`.
- Positions are a row index and an offset in HP from the left of that row.
- Optional `rows` preserves empty rails. It is a positive safe integer greater than
  every module row index. Older v1 files omit it and derive the rail count from
  module positions (at least one row). Placement grows this count; removing the
  last module in a row does not shrink it. Explicit removal of an empty row
  shifts later rows up one, retaining module HP, looks, values and cables.
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
- Optional `rows`: the saved rail count from `Patch`, including empty rows.
- `names`: output names keyed by stable `moduleId:jackId`, as in `Patch`.
- Optional `source`: the exact executable body of a source-owned workspace file,
  without a rack block. This accepted snapshot binds saved state to imported
  source without replacing comments, formatting or unsupported statements.
  Generator-only v1 files omit it and remain readable.

The writer's types are in [`src/codegen/layout.ts`](../src/codegen/layout.ts).
A scope has `id`, optional declaration `anchor`, `root` (a JSON string encoding the
full normalized Acorn root expression), and ordered `calls` with `name` and
`arguments` (a JSON string encoding the full normalized argument AST array).
Normalization omits `start`, `end`, `loc` and `raw`; BigInt values use
`{"bigint":"<decimal>"}`. The initial direct function call is both the root and
call zero. Member calls follow in receiver order; nested callback/CV calls stay
inside their outer argument descriptor. An identifier receiver has no initial
call. Scopes include the tempo expression, declarations, and final voices.

A module binding contains `scope`, `calls` (zero-based indices into that scope),
and `role` (`module`, `cv`, `mixer`, or `tempo`). CV bindings also have
`target: {module, jack, control}`. Several bindings can belong to the same module;
several modules can bind the same outer call for CV or folded mixer gain. An
empty call list binds a root-only expression (for example an unscaled `sine`).
Omitted/bypassed/disconnected modules have no sounding bindings. A final scope's
optional `routing: {call, orbit}` identifies the exact generator-owned routing
call; it does not create a module binding. The reader must verify the full
matching descriptor before trusting that provenance, never just a call index.

Scope IDs (`scope1`, etc.) are opaque IDs for this generated revision, not `$:`
line identities. The reader reconciles them using the matching rules
below. The writer is independent of the throwaway spike. There is no shipped
reader of the old proposed `lead.2` line format to migrate.

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
- Without a valid matching block, auto-layout each voice in chain order using
  default looks. Rails are 64 HP; a voice continues on additional rows before
  the next voice begins. Mixer buses also spill onto additional rows as needed.
  Unmatched modules are auto-placed after matched modules in their projected
  row, continuing onto free space on later rows without overlapping any retained
  positions. A matched module keeps its position and family-valid look.
- Invalid metadata must not invalidate otherwise valid Strudel or change its
  sound. #6 must validate versions, unique IDs, catalog types/looks, nonnegative
  integer positions and binding references before applying saved state. Treat
  unsupported versions as unrecognized metadata: retain original source, report
  that layout was not restored, and do not silently overwrite the unknown block.
- An untouched save preserves the block exactly. When rack metadata changes,
  write a validated replacement block for the current source revision. A
  code edit triggers reconciliation before the next metadata write. If metadata
  cannot be interpreted, require an explicit replacement action before discarding it.

## Saved rack state (#3)

Every saved `modules` entry also retains its `values` object, including omitted
controls, OUT volume, bypassed settings, and disconnected CODE drafts. `cables`
retains the complete patch cable array, including IDs and disconnected paths.
Missing control entries still mean catalog defaults. Positions, looks and values
are preserved even for modules with no source bindings. `names` includes any
names allocated by the writer. These fields allow exact rack-state recovery from
an untouched generated document, separately from sounding-code reconstruction.

Sounding code is authoritative after an external edit: the reader validates and
reconciles source bindings before applying saved values or cables, using values
parsed from matching source for sounding controls. Unverifiable graph/state
entries must not override code or attach by ordinal. Invalid/unknown metadata
retains the original source as described above. See [reader verification](reader-verification.md)
for implemented restoration and stale-state reconciliation. The workspace now
replaces known metadata on accepted changes and offers explicit replacement for
unknown metadata. Source-owned envelopes also verify snapshot scope descriptors,
binding addresses and semantic ownership through an independent projection; the
saved and projected graphs' generated programs must agree before full restoration.
A live program differing from its snapshot receives conservative reconciliation.
Snapshots cannot contain nested rack blocks. Copy/Export save the exact current
draft; Open reads plain `.strudel` files. Chosen names survive reducing a split
to one branch. See [workspace evidence and limits](workspace-verification.md).

## Planned structural source mutations (#35)

The [structural-edit matrix](translation-rules.md#imported-structural-edits-35)
defines supported mutations and refusals. A plan carries explicit old-to-new
call ownership, rather than reconciling identities by a changed call's ordinal.
After splicing, parse the new body, stamp its actual scope/call addresses, and
independently validate source semantics before accepting the v1 envelope.

Export/reopen must restore the proposed patch exactly: stable module and cable
IDs, layout, looks, names, values, disconnected/bypassed state, and empty rows.
Removed sounding calls may leave their modules and cables as disconnected saved
state. No dangling source binding is retained for such modules. Source byte
preservation, Strudel event behavior and complete saved identity are distinct
verification claims; graph validity alone establishes none of the three.
