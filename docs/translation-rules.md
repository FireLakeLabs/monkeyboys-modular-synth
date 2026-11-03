# Translation rules

How a patch becomes Strudel, and how Strudel becomes a patch. These rules apply in both directions.

## The three kinds of cable

| Cable       | Colour           | Carries                                                                                                                                               | In Strudel                                                        |
| ----------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Pattern** | yellow `#E6D35F` | Events in time: which note, and when. Hardware usually splits this into pitch and gate cables; a Strudel event carries both, so here it is one cable. | Mini-notation strings: `note("c e g")`, `s("bd hh")`              |
| **Audio**   | orange `#F4A462` | The sound itself, from a source through filter, amp and effects to the mixer.                                                                         | One chain of methods on a pattern: `.s() .lpf() .gain() .delay()` |
| **Mod**     | blue `#7DB9F6`   | A value that moves on its own. Into a CV jack, it turns that knob for you.                                                                            | Signals scaled with `.range()`: `sine`, `saw`, `perlin`, `rand`   |

Alien and Cyber jacks accept any cable type; the cable keeps the colour of whatever enters.

## The six rules

### 1. One voice, one expression

Everything between a pattern source and the mixer chains into a single expression of method calls, in the order the cables run.

```js
note("c2 eb2 g2")
  .s("sawtooth")
  .lpf(800)
  .delay(.4)
```

### 2. Each mixer input is a `$:` line

Every cable into MIX becomes its own `$:` line, playing alongside the others. `stack()` means the same thing; the reader accepts either, the generator writes `$:`.

```js
$: bass
$: drums
// same as stack(bass, drums)
```

### 3. A cable into CV turns a number into a pattern

An unpatched knob writes a plain number. Patch an LFO into it and the number is replaced by a signal sweeping from the knob’s value up by the LFO’s depth.

```js
// knob alone
.lpf(800)
// LFO patched into CUTOFF
.lpf(sine.slow(4).range(800, 2400))
```

### 4. Sound settings ignore order; pattern changes don’t

Strudel runs filters and effects in its own fixed chain, so their order in the code does not change the sound. If the cables say otherwise, the rack flags that cable and shows the order you will actually hear. Modules that rewrite the pattern — QUANT, every Alien module, every Cyber block, SEQ’s rate — act in cable order, and the generator must preserve it.

```js
// these two sound the same
.lpf(800).delay(.4)
.delay(.4).lpf(800)
// these two don't
.ply(2).degradeBy(.5)  // drops single hits
.degradeBy(.5).ply(2)  // drops whole pairs
```

### 5. No module? It stays code

Anything the reader cannot map goes into a Cyber CODE block that carries it through unchanged, so importing never changes how a pattern sounds.

```js
  .jux(rev)                   // JUX, alien
  .chunk(4, x => x.hurry(2))  // CODE, cyber
```

### 6. Split an output and it gets a name

Drag more than one cable from an output and that output gets a name. The code defines everything upstream of it once, as a named pattern, and reuses it in each voice the cables lead to.

```js
const lead = note("c2 eb2 g2").s("sawtooth")
$: lead.delay(.4)
$: lead.jux(rev)
```

Splitting an _audio_ output means the voice plays twice in Strudel, so levels add up — the same as sending one signal into two mixer channels.

## Effect orbits

Each final audible voice gets a dedicated positive integer `.orbit(n)`, including
voices with no active send effects. Allocate `1, 2, …` in the same deterministic
mixer-channel traversal order used for the emitted `$:` lines (a voice wired
directly to OUT is a single final voice). Do not combine voices because their
current effect settings happen to match. Parameter edits and DELAY/REVERB bypass
changes retain the allocation while the final voice set and order stay the same.

Append routing at the end of the final voice expression, after pattern transforms,
CODE and mixer gain. Shared `const` patterns carry no generator-owned orbit: each
fan-out branch gets its own final routing call.

```js
const lead = note("c3 e3").s("sawtooth")
$: lead.delay(.4).delaytime(.375).delayfeedback(.5).orbit(1)
$: lead.room(.5).roomsize(4).orbit(2)
$: s("bd*4").orbit(3)
```

Strudel has one delay and one reverb bus per orbit. Separate buses prevent
voices from overwriting each other's delay time/feedback or reverb size; even
identical settings remain separate so editing one voice cannot affect another.
Both effects on one voice use that voice's orbit. This is routing metadata, not
an extra module or a catalog control.

Only calls with **known generator provenance** can be excluded from module
matching and mapped to a final voice's routing. Their source ranges remain part
of the retained document and do not consume a module identity. Never infer
ownership from a literal integer alone. Imported shared, patterned, computed or
otherwise unrepresentable orbit routing stays exact source/CODE; do not silently
renumber, relocate or append an overriding orbit to it. Import normalization would require explicit user intent; the shipped reader
preserves such routing as source/CODE.

Adding, deleting or reordering final voices can renumber the allocation. Engine
integration (#4) must distinguish this structural replacement from a parameter
edit and reset the old global effect buses when the allocation changes, so tails
cannot transfer to a different voice. It must also reset buses when loading a
new patch. Do not reset them on every knob edit. This is implemented by the
allocator/generator and playback structural replacement boundary; see
[generator/reader checks](reader-verification.md#observed-proof) and
[playback evidence](playback-verification.md#playback-contract). The
[engine findings](engine-spike.md) retain the original runtime observations.

## Generated code conventions

- `setcpm(bpm/4)` first, written as `setcpm(120/4)` so the BPM stays readable. v1 assumes four beats per cycle.
- Named patterns (`const`) next, in rack order.
- Then one `$:` line per mixer input, in channel order, with final voice routing as defined in [effect orbits](#effect-orbits).
- Top-level voice and named pattern chains write one method per line with two-space
  indentation, including envelope and effect settings. Separate setup, declarations
  and voices with blank lines; omit semicolons.
- Generated modulation chains stay inline, including named LFO declarations,
  transforms and destination scaling: `.lpf(sine.slow(4).range(800, 2400))`.
  CODE fragments keep their exact text and surrounding line breaks so a trailing
  line comment cannot swallow the next call.
- Repository-owned rack library patches use this generator style. Imported files,
  attributed showcases and retained CODE/prelude keep their source formatting;
  loading an older saved file does not reformat it or change its rack identity.
- Knobs at their default value are omitted when Strudel’s own default matches (for example `.speed(1)`, `.postgain(1)`). Where the module’s default differs from Strudel’s, it is always written.
- Numbers are written with up to three decimal places and no trailing zeros.
- The layout comment block comes last. See [`patch-format.md`](patch-format.md).

For #67, verified on 3 November 2026: the [generator regressions](../src/codegen/generate.test.ts)
failed with the old multiline CV output and pass with inline direct, transformed
and shared LFOs. They separately check source ownership and identical saved rack
recovery from old line breaks. `npm run check` passes. In the local Chromium
browser, loading **LFO sweep and tremolo** showed inline filter/gain chains;
changing CUTOFF from 400 to 800 kept the chain inline and the rack synchronized.
Pasting the same saved file with old multiline CV formatting retained every source
byte and restored the identical eight-module rack. These are observed editor and
persistence checks; audio was neither played nor heard for this formatting change.

## Reading code

OUT recognizes `setCpm` as the pinned engine's alias for `setcpm`, including
the literal `bpm/4` form. Supported BPM edits retain imported spelling; new
rack-owned generation stays lowercase. The [#46 trance fixture](trance-demo.md)
checks its exact source, custom routing and separate saved-state/event behavior.

Built-in [library patches](patch-library.md) use this same reader, preserving
exact original source, opaque helpers and CODE. Parse and validate before the
guarded Stop/replacement; install source and rack atomically after confirmed Stop,
without source regeneration or autoplay.

The production API is `read(source): SourceDocument` in `src/reader/`, with the
graph at `document.patch`. `generate(document)` returns retained source;
`generate(document.patch)` writes a new rack-owned file and is not an imported
save. `tryRead` returns a location diagnostic and no document on syntax failure.
See [reader evidence](reader-verification.md) and the implemented
[workspace editing contract and limits](workspace-verification.md).

- Parse with a JavaScript parser (Strudel itself uses `acorn`) and walk method chains.
- `$:` labels and `stack(…)` arguments become mixer channels. `const` declarations used more than once become named outputs.
- Each recognised call maps to a module and control values via the module catalog (`src/modules/catalog.ts`).
- Unrecognised calls in a chain become a CODE block holding that call’s exact source text, in place.
- A voice that cannot be read at all becomes a single CODE block acting as its source.
- Auto-placement uses catalog widths and spills long voices and mixer buses onto
  additional 64-HP rails. Placement and source ownership are separate: wrapping
  a voice must not rewrite its expression or turn readable modules into CODE.
- Retain the original document and source ranges alongside the rack graph. An
  untouched document round-trips exactly, including formatting, comments,
  statement order and layout text. Supported rack value edits splice only the
  affected literal and reparse; refuse unsafe or stale edits rather than silently
  regenerate imported code. See the proven approach and limits in the
  [source-preservation spike](source-preservation-spike.md).
- Preserve non-voice statements and opaque regions as source-owned content. A
  syntax-valid unsupported voice becomes CODE; a syntax failure returns a
  diagnostic and no new graph. Never partially apply the failed draft to the rack.
- Syntax diagnostics use the reader's comment-aware trailing metadata boundary.
  Unclosed brackets at EOF or a mismatched closer point to their opening token;
  other parse errors retain their code token. The editor displays a gutter marker
  without accepting the invalid draft; see [verification](error-positions.md).
- Persistent module identity uses stable IDs and conservative source matching,
  not chain positions. See [matching rules](patch-format.md#matching-rules).
  Multi-call modules and CV expressions need catalog-owned semantic bindings.
- Parsing is not execution or sandboxing. Source equality, sound equivalence and
  saved rack identity are separate checks for the production reader/generator.

## Rack generator contract (#3)

`generate(patch)` in `src/codegen/generate.ts` is a pure writer for a new,
rack-owned document. It does not accept imported source or replace the
source-preserving editing contract above. The generator validates IDs, controls,
layout, jack references, cardinality, signal compatibility (including through
Alien/CODE passthroughs) and rejects cycles. Incomplete/disconnected chains are
silent. No OUT means no voices; an empty rack uses the catalog tempo. ENV may
only connect directly to VCF/VCA CV, as specified in the module catalog/spec.

MIX is a virtual bus: recursively visit connected channels in catalog channel
order. Nested mixer levels multiply into one final `.postgain(product)`; repeated
Strudel `postgain` settings would overwrite rather than multiply. Transforms
after MIX apply to each leaf voice. Final gain is written after transforms and
before routing. MIX fan-out names each leaf expression with a numbered suffix,
rather than generating `stack()`. The levels remain on final branches, including
when an intermediate bus has a named output.

Shared declarations follow rack-array order except that dependencies are emitted
first. Missing output names become deterministic collision-free `mb_<moduleId>`
names; chosen names are recorded in the rack block. Explicit names must be valid
JavaScript identifiers, unique, and must not shadow generator-used Strudel
functions/signals. ENV has no independent expression: fan-out repeats its
context-specific envelope calls at the destinations. Shared LFO outputs name the
unscaled signal; each destination supplies its own `.range(base, base + depth)`.
Absent LFO depth uses the target knob's catalog modulation default. An explicit
depth is in target units and must fit every connected target's range. Rate and
range operations on these continuous signals commute.

CODE text is kept exact inside the surrounding generated expression. Source CODE
is parenthesized, with a newline before the closing parenthesis to preserve a
trailing line comment. Chained CODE must start with `.`; malformed active CODE
rejects generation. Unconnected CODE drafts are saved without parsing. A chained fragment beginning
with `.` and no upstream receiver is also silent and retained; reconnecting its
input restores its chain role. Recognized
CODE-owned orbit references (including computed `["orbit"]` and opaque callbacks)
propagate through named outputs; the generator adds no overriding routing to
those voices. Positive integer literal orbits in active CODE (including shared
named expressions) are reserved before allocating generated voices from the
remaining positive integers. This avoids overwriting an imported bus. Dynamic
routing hidden behind arbitrary code cannot be inferred. The reader verifies
complete generator provenance before treating routing as owned; otherwise it
retains routing in source/CODE. See [reader projection](reader-verification.md#projection-and-preservation).

Numbers have at most three decimal places. CODE literals remain verbatim. The
writer does not mutate the patch and always writes a complete trailing rack block.

An explicitly saved output name keeps its declaration even when only one branch
remains. Workspace edits use `editDocument`, which splices proven imported literal
or declaration/receiver ranges and reparses. Imported sounding structural edits use the explicit [preservation matrix](#imported-structural-edits-35); edits outside that matrix remain editable in source.
Look and position edits change only trailing metadata, preserving executable
bytes and avoiding audio re-evaluation.

## Imported structural edits (#35)

A structural edit requires an explicit source plan, followed by an independent
reader/graph check before either rack or playback is updated. The supported
matrix is conservative; a graph-valid cable is not necessarily source-editable.

| Operation                                 | Supported source-owned case                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/remove disconnected modules or cables | Metadata only when sounding code is unchanged.                                                                                                                                                                                                                                                                                            |
| Insert/remove a chain module              | Connect a supported catalog transform into an existing chain, or bypass it by repatching. Existing roots and the relative order of surviving modules stay fixed. Multi-call settings travel as one owned group. Explicit inactive/default calls and unchanged CV groups retain their exact source while surrounding chain modules change. |
| Connect/replace a sounding cable          | Extend a chain or bypass/replace transforms within the same final mixer channel. Retain the existing root and declaration boundaries.                                                                                                                                                                                                     |
| Disconnect a voice or delete its module   | Remove an independent top-level `$:` statement with fully supported catalog code. Deletion does not bridge neighbors. Keep all comments/whitespace and save the remaining disconnected graph.                                                                                                                                             |
| Reconnect a disconnected voice            | Append an independent `$:` expression from supported catalog modules, without creating/changing shared declarations or names.                                                                                                                                                                                                             |
| CODE and imported orbit routing           | Retain existing fragments byte-for-byte and in order. Insertions around them are allowed; removing, copying or moving opaque fragments is refused. No overriding routing is appended.                                                                                                                                                     |

All untouched tokens, comments, whitespace, unrelated declarations and statements
stay exact. Removing catalog calls removes only their executable tokens; comments
inside those calls remain as trivia. New calls use generator formatting. Reconnected voices whose old executable tokens were removed use generator formatting too; retained comments stay at their original positions. A plan
records the new call ownership explicitly, so repeated calls need no heuristic
identity matching during an authorized rack edit. The independent reader still
must prove the saved graph and all bindings agree with the edited source.

Refuse changes to roots, shared-declaration topology/names, mixer structure,
structural CV routing, reordered surviving groups, ambiguous scope ownership,
whole-voice removal containing CODE, and removal of a `stack()` argument or bare
unlabelled voice. Refuse any remaining case that fails independent source/graph,
routing provenance or saved identity validation. Explain that the user can make
that structural edit in code. Refusal is atomic: source, rack and scheduled audio
stay at the accepted revision. These limits do not restrict canonical rack-owned
generation or the existing proven literal/name edits.

Cable target previews (#76) run the same source-aware edit boundary before a
jack is marked valid, including the proposed replacement or moved cable.
Source-refused targets show the blocked state and a plain explanation beside
the jack on hover and focus. Activating such a target retains the explicit
conversion offer below; it does not commit the cable without consent. Supported
imported edits remain available. See [browser evidence](interaction-verification.md#cable-refusal-preview-76).

## Explicit rack conversion (#55/#75)

The imported preservation matrix still governs edits until a user consents to
**Make rack-editable** at a refusal. Conversion regenerates the proposed graph,
retains opaque setup as [prelude metadata](patch-format.md#opaque-setup-on-an-explicit-rack-conversion-75)
and keeps CODE fragments, then completes that proposed edit atomically. Subsequent
rack edits use the canonical generator path. Library exercises are already authored
this way; attributed showcases retain exact source until consent. See
[library ownership and conversion limits](patch-library.md#rack-ownership-55-and-75).

## Source-independent grid views (#66)

The reader retains imported SEQ/DRUMS notation as strings. Grid eligibility is a
pure projection of that notation using catalog limits, independent of source
ownership or saved array representation. Plain SEQ tokens/rests/alternations and
DRUMS flat or generator-repeated rows render as grids; unsupported timing, grouping,
row shapes or lengths retain text with a reason. No parsing or view switch
rewrites the accepted source or evaluates Strudel.

Grid edits use the existing literal spans. Array values serialize to mini-notation
with the generator's drum writer and SEQ length rules; imported string sequences
retain their full written length. The source/graph validation boundary still
proves every accepted edit and restores the exact proposed saved rack. Changes
inside the edited literal may use canonical spacing/quotes; every surrounding
byte remains exact. Text mode applies on Enter or blur, without a separate Apply
button; CODE's existing explicit Apply behavior is unchanged.
