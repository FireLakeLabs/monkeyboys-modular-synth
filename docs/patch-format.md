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
  name?: string            // patch title, separate from output names
  modules: PlacedModule[]   // what is in the rack, where, in which look, with which values
  cables: Cable[]           // output jack → input jack
  names: Record<string, string>  // "moduleId:jackId" → name, retained after a split
  rows?: number                 // explicit rail count, including empty rows
  railHp?: 64 | 84 | 104         // rail width; omitted means 64 HP
}
```

- Module ids are the module type plus a counter: `seq1`, `vcf1`, `vcf2`.
- Rail positions are a row index and an offset in HP from the left of that row.
  OUT belongs to the case: its in-memory coordinates are canonical zeroes, and
  new layout blocks omit its `row` and `hp`. Legacy OUT coordinates are accepted
  and normalized without changing executable source, IDs, look, values or cables.
  An unchanged imported file retains its exact original bytes, including those
  legacy coordinates, until a rack edit restamps the block.
- Optional `rows` preserves empty rails. It is a positive safe integer greater than
  every rail module row index (excluding OUT). Older v1 files omit it and derive the rail count from
  module positions (at least one row). Placement grows this count; removing the
  last module in a row does not shrink it. Explicit removal of an empty row
  shifts later rows up one, retaining module HP, looks, values and cables.
- Optional `railHp` is exactly 64, 84 or 104 HP. Missing saved fields default to 64 HP. Plain files without a saved block
  receive initial compact placement over 64/84/104 HP rails: minimize row count,
  preferring narrower rails on ties. This never reflows saved personal or bundled
  positions. New patches select the widest rail visible at 100% beside the
  palette, code and pinned output; the width is then saved,
  never recomputed on resize. The toolbar changes it without moving modules.
  Reductions that strand a module outside the rail are refused. Placement and
  reader reconciliation use the saved width; smaller windows zoom or scroll.
  Invalid widths or off-rail saved positions invalidate metadata while retaining
  the executable source unchanged. Unknown metadata is never silently replaced.
- Saved rack identity compares object contents independently of key insertion
  order, while retaining module and cable array order. Adding `rows` after
  widening a rail must not reject a layout-only move.
- Optional module `fx: true` retains an explicitly imported inline FX stage;
  `fx: "native"` retains fixed-order native execution when cable order differs or
  overlaps explicit FX. Absence uses automatic rack-owned order selection. These
  execution choices are saved independently of controls, positions and looks.
  Proven pre-134 generated envelopes are checked with the former native writer
  before migrating affected modules to `"native"`; executable source and all
  existing identity fields remain unchanged.
- `values` holds one entry per control id from the catalog; missing entries mean the catalog default, except declared `legacyDefaults` (LFO MODE remains STEP in older v1 racks). New modules explicitly store controls whose defaults changed.
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
- Optional `name`: the patch's display title; see [patch names](#patch-names-62).
- `scopes`: saved opaque IDs, an optional named declaration anchor, and full
  root/call syntax descriptors from the accepted source revision.
- `modules`: stable module `id`, catalog `type`, `row`, `hp`, `look`, and source
  bindings to scope/call descriptors and semantic roles. One module can bind
  several calls; CV bindings include their target module ID and jack/control role.
- Optional `rows`: the saved rail count from `Patch`, including empty rows.
- Optional `railHp`: the per-patch width described above. OUT has no `row` or `hp`
  in newly written `modules` entries; its bindings and other fields are retained.
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

An optional binding `fx` is a nonnegative argument index inside its outer FX
call. Repeated same-type arguments therefore retain distinct identities without
guessing from their values. Nested control literals retain their actual source
spans. The scope/call AST descriptor still contains the complete FX argument AST;
no nested calls are flattened or promoted to final voices.

A module binding contains `scope`, `calls` (zero-based indices into that scope),
and `role` (`module`, `cv`, `mixer`, or `tempo`). CV bindings also have
`target: {module, jack, control, path?}`. Optional `path` records a nested modulation input route (`in`, `in2`, or slash-separated combinations), distinguishing same-type sources inside one utility argument without guessing identities from values. Several bindings can belong to the same module;
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
- Context-specific ENV/SMOOTH LFO calls can share a saved identity only through matched CV
  targets and saved call bindings, with equal effective source settings. An absent
  shared depth permits independently verified target-unit defaults. Divergent
  uses remain separate modules; equal values alone never merge independent ENVs.
- Known generator-owned final-voice orbit routing does not consume module IDs.
  Imported routing stays source-owned unless its ownership is established.
- Without a valid matching block, auto-layout each voice in chain order using
  default looks. Rails use a valid saved `railHp`, or 64 HP without one; a voice
  continues on additional rows before
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
Missing control entries mean catalog defaults or their explicit `legacyDefaults` compatibility values. Positions, looks and values
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

### Saved neighbors that no longer fit (#176)

Saved positions are absolute, so they cannot follow a module that grows. No
catalog width has changed, so no saved patch reaches these cases today. They
define what any future width change inherits. Opening a patch never rewrites its
source in either case:

- **Past the rail:** the saved block is invalid, as for any off-rail position. The
  executable source stays exact and the rack auto-lays out.
- **Onto a neighbor:** the saved positions restore as written and the panels
  overlap. Rack edits are refused with “Modules cannot overlap” until a move
  separates them, and that move is the first change to the saved block.

Check both before widening a module. An overlap blocks editing until the person
moves it, so a change that creates overlaps in existing patches needs its own plan.

## Patch names (#62)

The editable header title is stored as optional `name: string` in `Patch` and
in the existing v1 trailing rack envelope. It is presentation metadata, distinct
from fan-out `names`; renaming never changes executable Strudel, module IDs,
wiring, layout or control values. No format version bump is needed. Older
files, plain Strudel and New patches omit it and display **Untitled patch**.
A non-string name makes the metadata invalid under the existing preservation
policy; it does not invalidate the executable source.

Enter or blur commits a trimmed title; Escape cancels the input. An empty title
becomes **Untitled patch**. The field is unavailable while code is unapplied or
metadata needs explicit replacement, so a rename cannot discard a draft or
unknown metadata. Accepted-document Undo/Redo and local recovery retain the title
with the complete file. External code edits retaining valid metadata retain its
name even when sounding module identity requires reconciliation.

Loading a library entry uses its title, stamping only validated rack metadata
before guarded replacement. The bundled original and every executable byte
(including attributed showcase comments and formatting) stay unchanged. Copy and
Export still write the complete current draft. Export uses the current accepted
name as the filename stem, replaces filesystem separators, reserved punctuation
and control characters with `-`, strips trailing dots/space and avoids a duplicate
`.strudel` suffix. An empty sanitized stem falls back to **Untitled patch**.
The full display title remains in metadata regardless of filename sanitation.
WAV bounce uses the same stem with a `.wav` extension; see the
[bounce contract and verification](wav-bounce.md).
Open restores it from metadata rather than the external filename; older unnamed
files still open byte-for-byte under the default title.

See [unit and browser verification](patch-names-verification.md).

## My patches (#182)

`localStorage` key `monkeyboy.patches.v1` holds a JSON envelope with `version: 1` and
`patches`, each with `id`, `name`, `source`, `savedAt` and `revision`. `source` is the exact
accepted file, or the exact draft when one was unapplied, so reopening one is the
[round trip](#in-memory) every file already has: sound, formatting and saved rack state
stay separate checks. `name` lets the library list entries without reading them. No
rack metadata changes. An envelope that cannot be read is reported and never rewritten.

## Local workspace recovery (#60)

The browser keeps one recovery copy in `localStorage`, under
`monkeyboy.workspace.v1`. Its JSON envelope has `version: 1`, `source` (the exact
accepted Strudel file, including its saved rack block) and `draft` (the exact
editor text). Rack edits and readable code acceptance save the complete accepted
file; draft input is saved synchronously before the reader's debounce, including
invalid or composing text. Unknown rack metadata stays in the source unchanged.

On load, a validated local copy comes back silently, with a message offering
**Start new**. It brings back the accepted rack and the draft independently,
without executing code or starting audio. A restored draft is diagnosed but remains unapplied until you Apply or
edit it, leaving the accepted rack in place. See
[code application](code-application.md). Export keeps its exact text; Revert explicitly discards that
draft in favor of the readable file. Start new, like loading a file or library
patch, replaces the copy only after the guarded replacement succeeds, and Undo
returns to the restored work.

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

## Opaque setup on a rack conversion (#75)

`Patch` and its v1 envelope may include optional `prelude: string`. It holds
non-rack setup statements retained when a rack edit converts the code. The
generator writes them before the tempo and rack-owned
expressions, tracks their declaration scopes and reserves their identifiers
against generated output names. CODE fragments may refer to those helpers.
The string must parse and must not contain a recognized voice or tempo scope;
malformed or non-string saved values invalidate metadata. No code is executed
while reading or converting it. Older files omit this field and remain valid.

A prelude is trusted as saved rack state only while the live source still starts
with it. Editing setup code externally falls back to source-owned reconciliation;
its old saved prelude cannot override that live edit. Exact source, setup
semantics, generated event values and saved graph identity remain separate checks.

## Reader additions and saved CODE (#77)

A new call adapter does not replace an existing file's explicit saved CODE
owners. For an unchanged scope, the reader retains a contiguous saved CODE
fragment only when its complete call bytes match the stored text, allowing the generator’s leading indentation outside the CODE tokens. It still
checks source ownership and generated graph agreement independently. Altered
source reprojects conservatively; forged CODE text invalidates metadata instead
of overriding executable source. Plain files without saved CODE use the new
adapters. See the [legacy-file regression](../src/reader/aliases.test.ts).

## Harmonic drawbars (#131)

`ControlValue` also accepts a readonly numeric array for HARMONIC's `partials`.
The existing v1 JSON field retains every bar, module ID, look, position and cable;
no format-version change is needed. The graph validates finite 0–1 values and
1–16 entries before generation or mutation. Unsupported source arrays stay CODE.

## Function-loop ownership (#135)

V1 retains the same cable shape and marker. SEND/RETURN are catalog jacks; cable
kind is derived from endpoints and loop membership. Optional per-module
`functionParameter: string` preserves an imported lambda identifier (new loops
use `x`). Graph validation requires a valid identifier on a loop owner.

A binding may carry `loop: number[]`: each index identifies a call whose final
argument is the next single-parameter receiver-chain lambda. `calls` then indexes
that innermost chain. Absent `loop` keeps the original top-level address format,
including old JUX presets and saved CODE. Scope descriptors still contain the
entire nested AST. Readers validate every path against the source snapshot and
independently compare projected ownership and graph semantics before trusting
saved state. Exact generated files restore incomplete loops and disconnected
members as well as closed nested loops. External edits do not infer nested module
identity from a changed callback's ordinal. See [verification](function-loops-verification.md).

A binding inside an ordered effect stage within a function carries both `loop`
and `fx`. Resolve the lambda path first, its local `calls` next, and the FX
argument last. Source and graph validation preserve both addresses; no format
version or old JUX/CODE ownership is replaced by this combination.

## Crate and tape (#138)

Sample choices, loop points and SPLICE/WAVETABLE settings use existing module
`values`; new module types are catalog IDs. Missing SMPL SAMPLE/loop points mean
empty/0/1, retaining old saved racks. Pack ownership remains #137's `cartridges`
contract. Crate drawer/filter/variant selection and auditioning are local view
state, excluded from the v1 envelope. No decoded buffers or local files are saved.
Exact imported source and explicit CODE owners retain their existing ownership
rules. See [separate round-trip and browser proof](sound-crate.md).

## Cartridge setup ownership (#137)

The optional v1 `cartridges: { source: string; base?: string }[]` field records
bay-owned sample setup separately from the opaque, read-only `prelude`. The
writer emits its canonical single-quoted `samples()` calls first. Restoration
validates the saved field and its source projection; bay removal additionally
requires matching leading setup statements in a restored/reconciled document. Imported calls do
not gain ownership merely by matching a URL or living in `prelude`.

Readable exports explicitly add the two pinned factory manifest/audio-base pairs
before user setup and preserve the complete saved rack. Existing exact calls
are reused. Source read/generate still retains exact imported bytes; raw draft
and invalid/unknown-metadata exports remain unchanged for recovery. See the
[ownership, ordering and API contract](cartridges.md).

## Multi-input routing identity (#136)

The v1 graph format needs no cable-kind field. An audio output connected to a
catalog `cvTarget` is an audio-mod cable; derive this per connection, since the
same output can also carry ordinary audio to MIX. GATES, SWITCH, AUX and DUCK use
catalog controls and explicit jack-to-jack connections. Bus IDs and DUCK orbit
targets are derived executable routing, never editable rack control values.

A complete generator-validated program/metadata match restores the full graph,
including private send/trigger voices and named SWITCH inputs. Edited or
unproven cross-voice calls retain source ownership; do not infer their graph
from integer bus/orbit addresses. Exact source, complete rack identity and engine
events are checked independently in the [routing matrix](routing-verification.md).

## Strudel credits and the patch name (#139)

Real line comments of the form `// @title …`, `// @by …`, `// @license …`,
`// @url …`, and other `@tag value` entries supply rack-frame credits. Tags
are matched without case, repeated entries remain in source order, and unknown
tags are displayed too. Strings, templates and block comments are not metadata.
Values are rendered as text, including URLs; they never become HTML or executable
links. This is a view of the accepted source, not a second saved credit object.

An explicit nonblank #62 `name` wins over the first nonempty `@title`. Without
that name, `@title` supplies the header and export/WAV filename fallback; without
either, the existing **Untitled patch** fallback applies. Merely displaying or
submitting the same fallback adds no saved name. Renaming writes only the #62
field and leaves the original title and every other credit visible and unchanged.
Library names retain their existing precedence. Editing a source title updates
the fallback after Apply; it never overwrites an explicit name.

Untouched files, source-aware edits, save/export/reopen and recovery retain the
original comment bytes, whitespace, repetitions and line endings. Explicit
Conversion on a rack edit still relinquishes general formatting, but
retains exact credit comment tokens and their line endings, without duplicating
comments already inside retained setup statements or CODE. Standalone credits
and setup retain their relative order in the generated prelude. A final comment
without a newline receives a separator before following generated code.
If regenerating voices would reorder credits embedded in CODE, conversion
refuses atomically with an explanation, preserving the original title and file.
No format-version change is needed. SCOPE's `mode` is saved with its other
module values; its catalog `presentationOnly` flag permits metadata-only edits
even on imported source. TAP retains the ordinary executable call binding.

See [independent source, saved-rack, event and browser proof](pattern-visibility-verification.md).
