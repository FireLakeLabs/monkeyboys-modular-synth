# Patch format

A patch has two equivalent forms:

1. **In memory:** the `Patch` object in [`src/patch/types.ts`](../src/patch/types.ts).
2. **On disk / on the clipboard:** plain Strudel code, followed by a comment block that records what the code cannot (rack layout, looks, output names).

The code is the canonical saved form. Paste it into the Strudel REPL and it plays; paste it back into MonkeyBoy and the rack is restored.

The built-in [patch library](patch-library.md) stores exact Strudel strings and
collection/attribution metadata as repository data. Loading reads a fresh source
document; editing never changes the built-in original. Export/reopen uses this
same format. Collection nesting and browser selection do not enter rack metadata.

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

The [code view](metadata-folding.md) folds the trailing block to one line by
default and protects it from typing, cut, deletion and partial paste, including
when unfolded. Whole-file paste and Open replace the full document; Copy and
Export include every metadata byte. A file whose saved rack is fully restored
is accepted without restamping its metadata. Code edits that require
reconciliation still write a current envelope. Metadata lines have no editor
line numbers, and EOF syntax errors are capped at the end of code. This leaves
the v1 format unchanged (#54/#68).

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
call; it does not create a module binding. The reader must verify that exact
final call descriptor against validated generator provenance, never just a call
index or integer argument. Literal edits elsewhere in a matched voice retain
routing ownership. If module matching is ambiguous, a unique proven route with
the same receiver and call names, or an unchanged suffix after an anonymous root
edit, can retain routing without assigning module identities. The matched route
must also retain its saved voice position so saving agrees with the writer's
allocation. Reading and saving use the same routing matcher.

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
- **Catalog mode identity (#99, decided 3 November 2026):** SEQ `note`/`n`
  and VCF LP/HP/BP calls (including their envelope calls) may retain identity
  through a mode switch. After exact matches, compare unique semantic method
  keys, keeping cutoff, resonance, envelope amount and envelope phases distinct.
  Anonymous SEQ roots must retain their arguments. A unique receiver plus call
  sequence can distinguish edited split branches; both old and new keys must
  be unique. Repeated ambiguous modes/branches still receive fresh IDs.
  A unique tempo call of the same spelling retains OUT identity when its
  argument changes; multiple tempo calls do not establish identity.
- A completely unchanged sequence can restore repeated identical calls by order.
  In a changed sequence, ambiguous repeats receive fresh IDs; do not guess from
  position. Unambiguous surrounding matches retain their layout. Identical
  anonymous voices, changed anonymous roots and renamed declarations may reset
  affected layout. See the spike for tested limits.
- A matched MIX restores occupied channel numbers only when every projected
  incoming endpoint has one saved destination on that mixer, without duplicate
  channels or changing voice order. Parsed gains and their editable spans follow
  those channels; saved unoccupied channel levels remain silent state. Folded
  nested buses or ambiguous endpoints do not establish channel ownership.
- Context-specific ENV calls can share a saved identity only through matched CV
  targets and saved call bindings, with equal parsed envelope values. Divergent
  uses remain separate modules; equal values alone never merge independent ENVs.
- Known generator-owned final-voice orbit routing does not consume module IDs.
  Imported routing stays source-owned unless its ownership is established.
- Without a valid matching block, auto-layout each voice in chain order using
  default looks. Rails are 64 HP; a voice continues on additional rows before
  the next voice begins. Mixer buses also spill onto additional rows as needed.
  Unmatched modules are auto-placed after matched modules in their projected
  row, continuing onto free space on later rows without overlapping any retained
  positions. A matched module keeps its position and family-valid look.
- Invalid metadata must not invalidate otherwise valid Strudel or change its
  sound. The reader validates versions, unique IDs, catalog types/looks, nonnegative
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

## Local workspace recovery (#60)

The browser keeps one recovery copy in `localStorage`, under
`monkeyboy.workspace.v1`. Its JSON envelope has `version: 1`, `source` (the exact
accepted Strudel file, including its saved rack block) and `draft` (the exact
editor text). Rack edits and readable code acceptance save the complete accepted
file; draft input is saved synchronously before the reader's debounce, including
invalid or composing text. Unknown rack metadata stays in the source unchanged.

On load, a validated local copy offers **Restore last patch** or **Discard saved
patch** in a modal before editing can overwrite it. Restore brings back the
accepted rack and the draft independently, without executing code or starting
audio. An unfinished draft is diagnosed but remains unapplied until explicit
Apply (or opting into auto-apply), leaving the accepted rack in place. See
[code application](code-application.md). Export keeps its exact text; Revert explicitly discards that
draft in favor of the readable file. Discard removes the copy and keeps the
silent starter. Loading a file/library patch or choosing New replaces the copy
only after the existing guarded replacement succeeds.

Storage access, quota, malformed envelopes and unsupported envelope versions
fail quietly: editing, playback and export remain available. Failed writes keep
the previous copy. If a draft cannot be saved, leaving/reloading requests the
browser's standard unsaved-work warning; browsers can suppress that warning
without prior interaction, on mobile termination, or on crashes. Export remains
the durable fallback. No recovery is guaranteed when browser storage is blocked,
cleared or evicted. No initial starter is saved over an unchosen recovery copy.
Invalid/unsupported envelopes are ignored without being deleted on load.

This is one recovery slot per origin, shared across tabs; the last successful
write wins. There is no multi-tab merge, history, account sync or offline cache.
The browser verification is `node scripts/autosave-check.mjs <dev-server-url>
<output-directory>` after installing Playwright Chromium. Its results distinguish
exact source, saved rack identity and stopped audio from audible verification.

Observed 3 November 2026 with Node 24.22.2 and headless Chromium 156.0.8078.4:
the recovery suite passed readable/rack edits, reload and immediate tab-close,
byte-exact source/export, full saved rack identity, long and short invalid drafts,
Revert/correction, discard, blocked access and quota failures. Restore created
zero AudioContexts; both storage-failure cases showed the native departure
warning and retained the draft when navigation was cancelled. No page errors
remained. The short-draft regression first failed with a CodeMirror range error;
mapping decorations through input transactions fixed it. The existing feedback
suite (native Chromium IME, selection/scroll, activity/reduced motion and real
Strudel PCM) and library UI/rack-editing groups also passed. Physical listening
and other browsers/devices were not verified. The full workspace error/recovery
suite also passed after making its reload step choose Restore explicitly.
`npm run check` passed: 615 unit cases, 53 inherited expected failures, 40
guardrails, formatting/skill integrity, lint, TypeScript and production build.
After rebasing onto `686e80d` (#65), the full gate passed again (699 unit cases,
19 inherited expected failures, 40 guardrails), as did the complete recovery
browser suite. The recovery behavior diff remained unchanged.

## Structural source mutation plans (#35)

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

## Opaque setup on an explicit rack conversion (#75)

`Patch` and its v1 envelope may include optional `prelude: string`. It holds
non-rack setup statements retained when the user explicitly chooses Make
rack-editable. The generator writes them before the tempo and rack-owned
expressions, tracks their declaration scopes and reserves their identifiers
against generated output names. CODE fragments may refer to those helpers.
The string must parse and must not contain a recognized voice or tempo scope;
malformed or non-string saved values invalidate metadata. No code is executed
while reading or converting it. Older files omit this field and remain valid.

A prelude is trusted as saved rack state only while the live source still starts
with it. Editing setup code externally falls back to source-owned reconciliation;
its old saved prelude cannot override that live edit. Exact source, setup
semantics, generated event values and saved graph identity remain separate checks.
