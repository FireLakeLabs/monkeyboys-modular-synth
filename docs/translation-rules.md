# Translation rules

How a patch becomes Strudel, and how Strudel becomes a patch. These rules apply in both directions.

## Equation, chip and speech sources (#143/#144)

Catalog `soundSource` can name a selector control or a fixed sound literal.
BYTEBEAT uses fixed `s("bytebeat")`; CHIP binds WAVE to `s("z_…")`. Chained `n`
belongs to an adjacent BYTEBEAT's preset setter, otherwise retaining its existing
SEQ-source/SMPL-companion rules. Missing `n` and `.bbst` remain absent through
source-only selector defaults; explicit zeros must not disappear. Hidden selector
values remain saved independently of executable source.

BYTEBEAT formula literals are read only as `.bbexpr(pure('…'))` (including the
pinned long control alias), with a single quoted string and unshadowed `pure`.
The literal's inner range owns edits; escaping preserves code bytes. Empty custom
formula removes its setter while retaining surrounding source, returning to
presets. Bare strings, computed expressions, unsupported formulas and ZZFX arrays
stay exact CODE. Parsing checks worklet-body syntax but does not execute or
sandbox the formula. Deferred/opaque ownership is still saved CODE, including
files created before these reader additions.

SPEAK owns `.speak(lang, voice)` as a tuple of scalar controls; primitive words
remain a source-owned CODE pattern. The generated audio routing fields are inert
for dominant speech triggers. The engine adapter extracts the primitive `value`
when those fields wrap a word, so it requests words rather than speaking an object.
Effects, MIX level and OUT volume do not control speech; its cable warning is
part of the routing contract. Per-voice `.mask` still gates scheduling. Stop and
replacement cancel pending native speech behind `src/strudel/engine.ts`.

Exact imported bytes, complete saved rack identity, pinned events, and WebAudio
PCM remain separate acceptance claims. Speech's native voice enumeration,
utterance callbacks, and controlled provider tests are also recorded separately;
none alone proves physical speech output.

## The five kinds of cable

| Cable        | Colour                            | Carries                                                                                                                                               | In Strudel                                                        |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Pattern**  | yellow `#E6D35F`                  | Events in time: which note, and when. Hardware usually splits this into pitch and gate cables; a Strudel event carries both, so here it is one cable. | Mini-notation strings: `note("c e g")`, `s("bd hh")`              |
| **Audio**    | orange `#F4A462`                  | The sound itself, from a source through filter, amp and effects to the mixer.                                                                         | One chain of methods on a pattern: `.s() .lpf() .gain() .delay()` |
| **Mod**      | blue `#7DB9F6`                    | A value that moves on its own. Into a CV jack, it turns that knob for you.                                                                            | Signals scaled with `.range()`: `sine`, `saw`, `perlin`, `rand`   |
| **Function** | teal `#8CF5DA`, long/short dashed | A local chain between SEND and RETURN, with λ jack centers.                                                                                           | `x => x.a().b()`                                                  |

Audio outputs entering CV use the fifth kind, **audio-mod**: an orange double
stroke with a blue dashed center and a `≋` jack mark. They write `.bus(n)` on the
source and `.bmod({ b: n, c: "control" })` on the destination; see
[multi-input routing](#multi-input-and-cross-voice-routing-136).

Passthrough chain jacks retain their incoming signal. SEND/RETURN carries a local function rather than an audible voice; see [function loops](#function-loops-135).

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

### 3. A cable into CV modulates a control

An unpatched knob writes a number. The catalog's jack target and control binding
select the same control for every CV source, including future mixer channel jacks.

```js
.lpf(800) // knob alone
.lpf(800).lfo({ c: "lpf", sync: .25, depthabs: 1600, dc: 0, shape: "sine", skew: .5 }) // SMOOTH
.lpf(sine.slow(4).range(800, 2400)) // STEP, sampled once per event
.lpf("<400 800 1200>") // CV SEQ, absolute values
.postgain(.2).env({ c: "postgain", a: .01, d: .2, s: .5, r: .1, depthabs: .4 })
.lpf(sine.segment(8).mul(1).range(400, 2400).add(mini('<0 200>'))) // utilities
```

New LFOs default to SMOOTH. Missing MODE in old v1 racks means STEP through
catalog `legacyDefaults`; creation stores the new default explicitly. Importing
old signal/native-envelope code never rewrites it. RATE is the period in cycles;
SMOOTH uses reciprocal `sync`, while STEP retains `.slow()`/`.fast()`. DEPTH is
bipolar in the target knob's catalog units. Downward non-frequency SMOOTH uses
positive `depthabs` and `dc: -1` to avoid the pinned engine's inverted clamp;
frequency targets use signed depth and `dc: 0`. Shapes and engine limits are in
[the module spec](module-spec.md#generalized-cv-130).

ENV keeps VCA's native ADSR and VCF's native prefixed ADSR/amount calls. Other
controls get `.env({ c, a, d, s, r, depthabs })`. OSC TUNE uses native semitone
`.penv()`/pitch ADSR or SMOOTH `.vib(hz).vibmod(semitones)`; STEP and CV SEQ
replace `.transpose()`'s argument. Zero/omitted base controls are still emitted
when patched, so the modulator always has a target node/control.

S&H is the explicit boundary from SMOOTH to pattern utilities. Other utility
inputs require STEP/numeric patterns; ENV is attached directly to CV. Utilities
and CV SEQ return absolute values in destination units. They do not receive an
additional destination `.range()`. Source imports recognize these forms without
evaluation; unsupported configs retain CODE. Coupled imported edits that cannot
preserve source convert the code on edit, with Undo.
Generic ENV objects on native VCA/filter targets retain CODE, preserving their additive behavior rather than substituting native ADSR. Shared saved sources reconcile only fields represented by each adapter, retaining inactive pitch/sampling settings.
Exact source, complete saved identity and real engine events are checked
independently; [browser PCM](modulation-verification.md) proves within-note motion.

### 4. Effect stages follow cable order (#134)

The catalog-owned `VOICE_EFFECT_ORDER` records the pinned superdough chain:
SHIFT → transient → LP → HP → BP → vowel → coarse → crush → shape → distort → tremolo →
compressor → pan → phaser → delay → reverb. Active catalog call bindings select
stage membership, including every stage of compound LO-FI/COMP panels; source settings, amp gain/envelope, DJ filter/orbit settings,
and pattern transforms remain outer voice controls.

A rack-owned path whose stages follow this order uses native calls. An inversion
or repeated stage uses chained `.FX(...)` calls, one bare control chain per module:
` .FX(lpf(800).lpq(1)).FX(lpf(1200).lpq(1))`. Each stage retains its CV/ENV
settings. Pattern transforms stay at their cable positions. Named outputs retain
shared stages; if one branch needs FX, overlapping paths also use FX so outer
native processing cannot jump ahead of a shared stage. A rack note states the
chain actually heard, replacing the old reversed-send warning.

Native imported setters retain their fixed-order behavior even when written in
a different order. An explicit FX argument retains its inline behavior even when
its order could otherwise use native calls. The reader accepts bare catalog
control chains representing one stage, including supported CV/complete filter
ENV groups. Helpers, spreads, pattern transforms, multi-module arguments,
unrecognized settings and nested FX keep the entire enclosing FX call as exact
CODE. Existing saved CODE owners remain CODE. Literal edits address the chosen
argument and preserve every surrounding source byte; structural edits still need
independent source/graph proof and may be refused.

The pinned engine reads 24 dB duplication from the **outer voice**, so it cannot
isolate that mode per FX stage. Ordered 24 dB VCF generation is refused with a
reason; such imported arguments stay CODE. Use two 12 dB VCFs for a steeper
ordered filter. Local ladder settings work inside FX. Native 24 dB filters keep
their established behavior. FX does not move amp ADSR or DJ orbit filtering into
per-note stages.

Pattern changes — QUANT, the [pattern/time modules](module-spec.md#pattern-and-time-132),
Alien modules, Cyber blocks and SEQ rate — continue in cable order.

### 5. No module? It stays code

Anything the reader cannot map goes into a Cyber CODE block that carries it through unchanged, so importing never changes how a pattern sounds.

```js
  .jux(rev)                   // JUX, alien
  .chunk(4, x => x.hurry(2))  // CHUNK with WARP inside its function loop
  .chunkBack(4, x => x.hurry(2)) // CODE, cyber
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

**Ordered FX and sends (#134).** Outside FX, DELAY and REVERB remain the shared
send buses described above. Inside FX, superdough creates **inline per-note**
wet/dry stages (including inline feedback delay), then processes the outer voice
settings. Inline delay needs positive send, time and feedback. Reordered/repeated
send modules therefore change from orbit sends to inline effects. Their tails
are bounded by the note's release; imported `FXrelease` remains CODE and can
extend that lifetime. FX stages do not allocate or share an orbit: final voices
still receive dedicated routing, and imported/custom routing stays untouched.
Outer mixer postgain/channels/routing remain outside FX. Event checks independently
assert nested FX values, send settings and final orbits; the [browser proof](ordered-effects-verification.md)
checks actual scheduled events and nonzero WebAudio output.

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

## Catalog call bindings (#128)

The [binding format](module-spec.md#call-bindings-128) lives on controls in
`src/modules/catalog.ts`. Simple chain calls use it in both directions, including
OSC, SMPL, VCF, VCA, DELAY, REVERB, ITER, QUANT and JUX. Control order determines
write order. Omission values and effect bypass dependencies are catalog data;
reader grouping preserves repeated settings as distinct modules. VCF method
variants set MODE and only merge settings of the same mode. QUANT's lowercase
root normalization and JUX's supported identifier/single-call callback forms
retain exact imported spelling, without executing callback text.

A numeric binding uses its jack's `cvTarget` to discover modulation. LFO ranges
retain the knob's base and target-unit depth; saved ownership records the actual
jack and control IDs. ENV assembly remains context-dependent: VCA writes ADSR
before gain; VCF writes its amount and prefixed ADSR after cutoff/resonance.
SEQ, DRUMS, LFO, ENV, MIX, OUT and CODE retain dedicated adapters where their
source, multiple calls or context cannot be represented by a single binding.
Aliases remain catalog-owned; unsupported arguments still become CODE.

This is an internal refactor: generated executable text, call ownership, routing,
layout metadata and imported source preservation must remain byte-identical.
Generator fixture hashes cover full files, and library hashes cover each
regenerated file plus the independent reader projection, frozen before the
refactor. Source retention, saved rack identity and Strudel event behavior remain
separate verification claims.

### Observed proof (3 November 2026)

On Node 24.22.2, `npm run check` passed 864 tests and 40 guardrails, plus
formatting, skill integrity, lint, TypeScript and production build. The 63
pre-refactor digest snapshots still match: generator fixtures cover all sixteen
modules, and every library entry (including the trance demo) retains its full
reader projection and regenerated file. Existing tests separately check exact
source, saved rack identity and real Strudel events. A catalog-only test module
also writes/reads a new numeric call and routes LFO CV through a differently
named jack/target without adding a module adapter. An intentional VCF binding to
VCA's `gain` failed the catalog integrity check before the valid catalog was
restored. Sol approved in one round with no findings; its additional comparisons
reported identical results for 3,000 reader inputs and 1,500 generated patches
against `461783d`.

Browser observations are separate: Chromium 156.0.8078.4 passed the existing
`verifyLibraryUI`, `verifyPatchSignals`, `verifyLibraryRackEditing` and
`verifyTrance` harness groups. All fourteen entries loaded exact executable
source and matching racks without autoplay, produced real Strudel events and
nonzero WebAudio PCM, and accepted their supported CV/effect/mixer edits with
export identity intact. The trance demo retained 29 modules, four voices and
identical four-cycle event snapshots through repeated Play and export/reopen;
master and all four orbit probes produced nonzero PCM. The UI suite also retained
helper/CODE source and restored changed rack looks on reopen. No page errors
were observed. Shared preview loaded the library UI; after two Play-click
automation timeouts, Playwright supplied the playback checks. Physical listening
and other browsers/devices remain unverified; no #128 acceptance criterion is
otherwise outstanding.

## Common imported calls (#77)

Recognition retains exact executable bytes; aliases are catalog-owned reader
adapters, while new rack-owned generation uses the canonical long names.

| Imported form                          | Projection and limits                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.scale("g:minor")`                    | QUANT accepts the catalog's twelve roots with uppercase or lowercase tonic letters and its seven named modes. Only the control value normalizes to `G`; source stays exact. Its passthrough jacks allow scale before or after sound selection without relocating the call. Unsupported spellings, patterned/computed scales and extra arguments stay CODE. |
| `.gain(1.4)`                           | VCA LEVEL now spans 0–2, including gain above unity. Literal edits preserve the call and surrounding source; default 0.8, step 0.05 and CV depth limits are unchanged. Out-of-range or unsupported patterns remain CODE.                                                                                                                                   |
| `.att/.dec/.sus/.rel`                  | ENV aliases for `attack/decay/sustain/release`, including mixed long/short names in the existing complete, ordered ADSR group followed by scalar `.gain()` for VCA CV.                                                                                                                                                                                     |
| `.lpa/.lpd/.lps/.lpr` (and `hp`, `bp`) | Filter ENV aliases, with the same complete group and matching VCF target requirements as long names. Each literal retains its own control binding and original method spelling.                                                                                                                                                                            |
| Partial `.dec(.1)`                     | CODE. ENV writes all four ADSR controls; absent parameters are not equivalent to the catalog defaults, and no missing controls are invented. Computed, patterned, incomplete or unmatched envelope groups stay CODE.                                                                                                                                       |
| `.o(2)` / imported `.orbit(2)`         | CODE. `o` in the trance demo is a custom registration, not pinned-engine routing provenance. Literal integers do not prove generator ownership. No routing is removed, renumbered or replaced.                                                                                                                                                             |

The [alias regressions](../src/reader/aliases.test.ts) check exact source,
full saved rack identity and real Strudel control events separately, including
alias-preserving ENV and above-unity VCA edits. The
[trance acceptance](trance-demo.md#common-call-reader-acceptance-77) records the
measured CODE count and separate browser observations.

## Rack generator contract (#3)

`generate(patch)` in `src/codegen/generate.ts` is a pure writer for a new,
rack-owned document. It does not accept imported source or replace the
source-preserving editing contract above. The generator validates IDs, controls,
layout, jack references, cardinality, signal compatibility (including through
Alien/CODE passthroughs) and rejects cycles. Incomplete/disconnected chains are
silent. No OUT means no voices; an empty rack uses the catalog tempo. ENV connects directly to any catalog CV target; mod utilities accept pattern signals as specified above.

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
functions/signals. ENV and SMOOTH LFO have no independent pattern expression: fan-out repeats their
context-specific per-voice calls at the destinations. Shared LFO outputs name the
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

Control values have at most three decimal places; derived modulation Hz/sync rates retain full precision. CODE literals remain verbatim. The
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
Targets that need a rewrite show a warning state and say so beside the jack on
hover and focus. Activating one converts the code as described below. Supported
imported edits remain available. See [browser evidence](interaction-verification.md#cable-refusal-preview-76).

## Rack conversion on edit (#55/#75/#181)

The imported preservation matrix governs edits until one cannot preserve source.
That edit then converts: it regenerates the proposed graph, retains opaque setup as
[prelude metadata](patch-format.md#opaque-setup-on-a-rack-conversion-75)
and keeps CODE fragments, and completes atomically with “Code rewritten in rack
style · Undo”. Undo restores the exact prior source and redo the exact converted
source, as one history step that includes any knob gesture around the rewrite. After
Undo the same edit converts again and reports again. A conversion that fails, such
as mixed helper and pattern declarations, changes nothing and explains why. Subsequent
rack edits use the canonical generator path. Library exercises are already authored
this way; attributed showcases retain exact source until that first converting
edit. See [library ownership and conversion limits](patch-library.md#rack-ownership-55-and-75).

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

The planned nested editor (#147) replaces this whole-literal rule with splices inside
the literal, so bytes between tokens survive as well. See its
[parser requirements](nested-step-editor.md#what-147-must-handle).

## Explicit CODE conversion (#78)

A saved CODE owner that the current reader can represent as one complete module
shows **Looks like QUANT: convert?** (using the matched catalog name) on its panel.
Recognition alone never replaces a saved CODE owner. Conversion accepts a new
ownership revision through normal workspace history; Undo restores the exact
previous file and CODE owner. Unapplied drafts disable the action. Conversion
requires confirmed stopped transport; while starting, playing, stopping or in an
error state the disabled button says to Stop playback first. This avoids
re-evaluating opaque setup or resetting live effect tails for an ownership change.

The offer requires identical source spans/call ownership from a fresh projection,
ordinary chain jacks, valid replacement wiring, and independently validated saved
rack identity. Partial matches, multiple-module fragments, contextual ENV/CV,
disconnected CODE and any conversion whose persistence cannot be proven stay
CODE. New modules use their family's default look and take the old block's free
position; unrelated modules, disconnected state, rails, names and cable IDs are
retained. Only the chosen owner and its cable/name references change.

Executable source, comments and formatting stay exact; only trailing rack
metadata changes. Generated routing remains owned. Its scope validation accepts
the reader's documented lowercase-to-uppercase scale tonic normalization, while
requiring the same routing call and orbit and retaining independent graph/source
validation. Conversion does not rewrite a patch into generator style or add
missing controls to the executable source.

See the [conversion checks](../src/workspace/codeConversion.test.ts) and
[separate browser observations](code-conversion-verification.md).

## Pattern/time call bindings (#132)

The [module table](module-spec.md#pattern-and-time-132) records the pinned-engine
forms, families, controls, widths and omissions. Tuple argument lists, mode-specific
arity, conditional seed emission and the CHORD source are catalog-owned. Cable
traversal writes every call in place, before or after sound selection. A repeated
setting starts another node instead of overwriting an earlier call. CHANCE keeps
seed zero distinct from an absent seed; otherwise a surrounding random context
could change its events. A seeded DRUMS gate reads as CHANCE, while the old
unseeded DROP form retains its existing DRUMS owner.

Literal division is parsed without executing code. Pattern arguments retain
numeric precision instead of rounding swing to three decimal places. Imported
fractions and comments remain byte-exact; safe argument edits replace only their
own literal/division span. Mode/arity changes on imported files retain the existing
conservative editing/refusal contract. Saved CODE ownership remains authoritative.
Source bytes, saved rack identity and actual onset events have independent
[acceptance checks](pattern-time-verification.md); PCM is measured separately.

## Mixer channel labels and routing (#129)

Each connected MIX channel still emits a final labelled expression. Default is
`$:`, MUTE is `_$:`, SOLO is `S$:`, and NAME `bass` is `bass:`. Prefixes compose:
`Sbass:` solos bass and `_Sbass:` retains both saved flags while muted. The pinned
REPL ignores labels starting or ending in `_`, then solos remaining labels
starting in `S` with length greater than one. Mute therefore wins. Names use
JavaScript label identifiers without leading `S` or trailing `_` to avoid changing
those flags; `$` and leading underscores are reserved for generated prefixes.
Repeated leaf names get deterministic numeric suffixes because duplicate named
labels would replace earlier REPL patterns. Fan-out declaration names are separate.

A muted channel remains an emitted voice and retains its allocated orbit. Soloing
does not remove other expressions or renumber their routes. Plain-code import
reads all expression labels, including muted and soloed channels, preserves the
exact source and maps their flags/name to MIX. A subsequent code label change
must override stale saved mixer values, without changing the orbit allocation.

The channel OUTPUT pair emits `.channels("3:4")` before final `.orbit(n)` and
omits the default `1:2`. For nested buses, mute/solo flags accumulate, the last
nonempty name and last nondefault output pair on the path win, and scalar or
STEP LFO/CV SEQ levels multiply into a single final `.postgain()` after transforms.
Constant factors are folded; patterned factors use `.mul()` with a signal as the
receiver. SMOOTH LFO and ENV use #130's shared per-voice modulator after that
folded gain, scaling their absolute depth by the remaining bus factors. Their
AudioParam contributions retain the pinned engine's additive semantics.
CV ownership records the actual mixer jack/level and utility path from the catalog.
Imported unrepresentable products remain exact CODE, while generated files
recover the full nested saved rack. Imports with custom orbits retain CODE and
never gain overriding routing. Conditional settings and default omission do not
rewrite an imported document; literal edits still use proven source spans and
unsupported structural edits convert the code on edit, with Undo.

New single-call controls use catalog bindings, including text ACCENT rows and
conditional modes. Multi-word scale spaces write colon-separated engine names.
DELAY SYNC fractions retain their exact numeric value rather than the general
three-decimal display convention. The [module spec](module-spec.md#panel-extensions-129)
records their supported ranges, engine defaults and omission rules.

New companion bindings require a compatible adjacent owner; when ownership or
mode cannot be proved, their calls remain CODE rather than creating a module
with active defaults. An explicit final default output pair after opaque earlier
settings remains CODE so omission cannot expose an earlier routing pair. Mixed
`delaytime`/`delaysync` calls also remain CODE: explicit seconds win in the pinned
engine regardless of call order. Previously saved CODE ownership remains exact.

Canonical executable source that exactly equals generation of its current rack
keeps generated metadata when saved. Its entire graph is thereby proven without
inventing imported owners for folded mixer paths. Source-owned files with any
other formatting or code retain their exact source snapshot and the existing
independent projection/ownership validation. Unrepresentable folded pattern gains
remain CODE in their original call position, including before opaque routing.

## Arranger lanes (#141)

A MIX channel's ARRANGE value writes `.mask("<1!4 0!4>")` on each final voice
through that channel, after transforms and before the folded `.postgain()`,
mixer modulation, `.channels()` and routing. Nested buses add one mask per hop,
inner first; masks only filter events, so their order is not heard. Fan-out
branches carry their own channel's mask. Orbit allocation, labels and gain are
unchanged, so a lane edit is a parameter edit, not a structural replacement.

The reader treats a voice's `mask` as the channel's lane only when its single
argument is lane text (`0`/`1` steps with optional `!n` inside `<…>`, at most 256
cycles) and only postgain, mixer modulation, `channels` and `orbit` follow it.
Patterned, mid-chain or repeated masks and `arrange()` stay exact
CODE. Imported lane literals edit in place, and clearing one removes only its mask call; adding a lane where no mask exists
converts the code on edit, with Undo. Saved-rack reconciliation carries the lane
with the channel, like its NAME and OUTPUT. See the [spike and contract](arranger.md).

## Function loops (#135)

Catalog `functionLoop` owns the method, scalar argument controls, optional method
variants/arity, default function, SEND role and optional active mode. Generation
walks the closed RETURN chain back to SEND, emitting its transforms in cable order
as the final argument: `.chunk(4, x => x.ply("2").rev())`. Nested loop modules
recursively emit their own callbacks. Incomplete/empty loops use the preset;
JUX still uses RIGHT. Function outputs stay local, without fan-out declarations.
CODE separators protect line comments from swallowing following calls or closers.
No app-only playback adapter is introduced.

The reader never evaluates callbacks. A synchronous arrow with one identifier
parameter and a receiver chain on that identifier can project into SEND/RETURN.
All readable calls become modules. If a call is unsupported, the whole suffix of
that lambda becomes one exact CODE in that loop; an independently readable outer
loop stays visible around an inner CODE fallback. The original parameter is
saved as optional `functionParameter` so opaque references keep their meaning.
An identity lambda, a block/async callback, or a body not rooted in its parameter
stays whole-call CODE. Unknown function identifiers and unsupported arity/ranges
also stay whole-call CODE. `rev` is the new modules' empty preset; the four existing
JUX forms still read as RIGHT presets without loop members. Numeric `.ply(2)`
reads as RATCHET's text value `2`; new generation quotes its mini-notation.

Bindings keep the top-level scope, plus optional `loop: number[]` locating each
containing call's final lambda, and local `calls` inside that body. Exact source
snapshots independently verify these addresses, controls and graph semantics.
External changes restore nested identities only when the complete enclosing
lambda matches; ambiguous changes auto-place. Source-aware scalar edits carry
fresh descriptors while retaining IDs, comments and lambda identifiers. Source
owned loop wiring changes convert the code on edit, with Undo; generated racks support normal connection, replacement, deletion and undo.

Graph validation permits one chain per loop, nested loops and attached CV. It
rejects sources, modulation utilities, MIX, OUT, branches, shared members, named
function outputs, wrong-owner RETURN and recursive containment. Broken chains
remain saved and do not sound in place of the preset. TIME LENS must be in WINDOW
before its loop can be connected; a connected loop prevents an incompatible mode
switch. This does not change ordinary audio/modulation cycle rejection.

The [acceptance record](function-loops-verification.md) separates exact-source,
saved-state, event, browser and PCM evidence.

A closed nonempty chain whose controls all bypass their calls writes `x => x`,
preserving identity instead of selecting the empty-loop preset.

Effect order is planned independently for the main voice and each closed function
body. SEND is the local receiver boundary, not an audio feedback connection;
RETURN paths are not merged with the outer effect path. An inner `.FX(...)`
keeps both its lambda `loop` path and argument `fx` address. Native imported
setters retain their execution choice. Incomplete function chains contribute no
sounding effect stages or audible-chain note.

## Multi-input and cross-voice routing (#136)

The fifth cable kind is **audio-mod**: orange with a blue dashed center, a double
stroke, and `≋` CV jack centers. Its accessible signal name and Connections entry
say **audio-mod**. It connects an audio output to a catalog CV input. Ordinary
pattern, audio, modulation and function cables retain their existing marks.

- **GATES → SEQ GATE** writes `note("c2 eb2 g2").struct("x ~ x x ~ x ~ x")`.
  GATES supplies rhythm while SEQ supplies pitch. SEQ RATE precedes `struct`;
  imported timing after `struct` stays a separate transform after that rhythm.
  GATES uses the shared nested editor and has no standalone audible output.
- **SWITCH** writes `"<0 0 1 2>".pick([a, b, c, d])`. Inputs 1–4 correspond to
  zero-based selectors 0–3. Array values in the panel write a cycle alternative;
  text mini-notation retains its exact timing. Empty inputs are `silence`.
  Each input is one pattern expression. Named input declarations retain their
  source bindings and independent rack identities. A selector can use all the
  existing mini-notation timing operators, rather than a second timing engine.
- **AUX** has four SEND inputs and one audio OUT. Every sender writes `.bus(n)`;
  the return starts `s("bus").n(n)` and passes through the ordinary processing
  chain to MIX. Its return opens once per cycle with the engine's native envelope.
- **DUCK** carries the target voice through IN/OUT; the trigger voice patches
  into SIDE. The trigger writes `.duck(n).duckattack(.2).duckdepth(.8)` for the
  orbit of each final channel reached by that DUCK. Nested mixers and fan-out
  retain all target orbits (`.duck("1:2")`). Renumbering channels retargets DUCK;
  a source-owned target orbit is refused rather than normalized or guessed.
  An active DUCK feeding only AUX/CV sends is refused: those taps precede orbit
  output, so there is no audible channel orbit there to duck.
- **Audio → CV** writes `.bus(n)` on a private sender and
  `.bmod({ b: n, c: "lpf" })` on the destination. The explicit catalog call name
  keeps targeting correct when later companion settings are emitted. OSC TUNE
  targets `freq`: this engine modulates oscillator frequency, in relative
  frequency units, rather than applying an event-sampled semitone transpose.
  Other controls use native `bmod` relative depth (1), including MIX postgain.
  The CV input retains its ordinary base knob and supports one incoming cable.

AUX and audio-mod share one positive integer bus namespace. Allocate from 1 in
OUT's deterministic dependency traversal order; one AUX owns one bus, and every
CV fan-out from the same output shares its source bus. Skip literal source-owned
addresses found in CODE/setup sends, returns and bus modulators. This is separate
from orbit allocation. Knobs, looks and other presentation changes retain bus
addresses. Final audible voices take the ordinary orbit slots first; private
send/trigger voices follow, each with its own orbit. Bus send and SIDE branches
are independent voice paths for effect-order planning.

Send/trigger patterns run as private voices with `.dry(0).delay(0).room(0)`.
This prevents both dry sound and global send tails leaking into the audible mix.
Patching the source into MIX as well adds one audible branch. Sends are pre-mixer:
MIX level/mute/solo controls the dry channel, independently of AUX/CV/SIDE sends.
When a channel is soloed, private dependencies also receive `S$:` labels so the
REPL's global solo filter retains them. Their dry and wet outputs remain zero.
The pinned controller allows DUCK to precede its target's first note: it starts
that orbit's gain envelope without an output connection, then attaches the
actual target channel pair when the first audible event arrives. Structural
reset/replay clears these nodes together with ordinary orbits.
As in native superdough, `.bus()` taps postgain **before orbit delay/reverb**;
inline FX processing before the tap stays in the signal. Audio fan-out evaluates
patterns separately, so random/noise branches are independent realizations.

Playback compares the actual generated bus allocation as well as module/cable
topology. A structural replacement, new patch, or changed allocation calls the
engine's `resetGlobalEffects()`, whose pinned controller disconnects and clears
**both** audio buses and orbit effects. Parameter edits retain existing nodes.
An explicit Stop/replay also resets routing. Arbitrary imported setup side
effects remain outside the app's rollback contract.

Exact writer-validated executable syntax proves a saved routing graph as a whole,
including private voices and multi-input connections. The reader restores that
graph only after validating its complete metadata against the writer. A bus
integer is never provenance. Imported AUX/DUCK/bmod routing, changed bus calls,
computed routing and unsupported SWITCH forms remain source-owned CODE.
Untouched documents retain every source byte; saving/reopening preserves their
independently projected rack. GATES and four-reference SWITCH forms also have
source-aware adapters; unsupported or ambiguous forms retain CODE. Safe canonical
rack edits regenerate the complete graph; unsafe edits to source-owned routing
convert the code on edit, with Undo.

## Readable cable probes (#139)

Hover a yellow pattern cable for a static punchcard, or Alt-click to pin it.
Connections → select a cable → **Probe cable** provides a keyboard-accessible
route; **Close probe** dismisses it. The query covers four whole cycles starting
at the current scheduler cycle, or cycle zero while stopped. It shows onset
positions/durations and event values; the first 32 distinct values get rows.
It is a snapshot, with no moving playhead or cable animation.

Only a validated readable upstream graph supplies executable probe input. The
planner traverses every upstream dependency, including function RETURN bodies
and CV, refuses CODE, invalid/stale ownership and non-pattern cables, removes all
unrelated modules/output names/setup, then uses the production generator to
expand that precise chain prefix. Probe numeric formatting retains full imported
precision, including fractional SEQ rates; it does not apply the three-decimal
formatting of a new rack-owned file. It does not slice/evaluate imported JavaScript
or use the complete final voice. Later transforms are excluded, and a readable
prefix before downstream CODE can still be queried. Shared readable declarations
expand from their graph rather than being looked up in imported JS globals.

Opaque setup/declarations/tempo and unclassified statements conservatively
produce **Not probed**. A comment-only conversion prelude is safe. Proven bay-owned cartridge setup is
ignored as setup data, never executed by the probe; source-owned or computed
`samples()` calls still refuse probing. Parsing is not
sandboxing, and the normal explicit Play action still has the existing arbitrary
JavaScript boundary. No probe calls REPL `evaluate`, initializes AudioContext,
starts scheduling, loads sample manifests or writes source/rack state. The engine
constructs only the fresh generator-owned expression and uses the real pinned
Pattern `queryArc` with the accepted BPM's cycles-per-second. Unsupported or
incomplete prefixes explain why they were not probed instead of inventing events.

SCOPE uses native `.analyze(id)` events in the voice chain; waveform/spectrum is
presentation state. Its analyser access and the actual scheduler cycle clock stay
behind `src/strudel/engine.ts`. The header spells out `setcpm(BPM / 4)` and four
beats per cycle. Reduced motion freezes the clock readout/progress and SCOPE;
changing the preference cancels/resumes their display intervals. Probe cards and
credits have no animation. See [verification](pattern-visibility-verification.md).

## Sample selection and slicing (#138)

Crate drops use ordinary catalog control values and one accepted-document edit.
SMPL writes `.s("name:n")`, with neutral BANK/N; REVERB writes `.ir("name:n")`;
WAVETABLE writes the selected `wt_` sound and its position/warp controls; SPLICE
writes the selected sample and its mode's scalar/tuple call. No inventory, preview
audio, or local file handle enters executable source or rack metadata.

A DRUMS drop splices the chosen row's sounding atoms, retaining rests, grouping,
indices on other rows and timing modifiers. With one effective downstream sampler
bank/index, the operation makes those settings explicit in the other atoms before
clearing the sampler overrides. This preserves other rows while allowing a card
from a different bank. Different sampler banks/indices on a fan-out (including an
unbanked SPLICE/WAVETABLE sibling), or a downstream sound selector, require dropping
on the sampler instead; the operation refuses atomically rather than changing another
voice's sound. A SPLICE/WAVETABLE selection under an inherited nonempty sampler bank
also refuses, naming the BANK to clear. No shared upstream setting is changed
implicitly by those drops.

The reader recognizes a single literal `wt_` selector with neutral import defaults.
A literal sample followed by a supported slice/splice/chop/striate can own a SPLICE
panel. Lookahead validates the complete call before creating that owner; an invalid
or computed argument cannot introduce the panel's default slice call. Counts are
1–64 integers; slice/splice also take literal order text. Array cut points, computed
arguments and other unsupported forms remain exact CODE. Existing saved CODE
ownership stays authoritative. Imported mode/arity changes convert the code on
edit, with Undo; literal sample, count, order and tape edits
preserve surrounding source. Source, complete saved rack and engine events have
independent [acceptance checks](sound-crate.md).

## Adjacent CODE study (#187, 8 November 2026)

Decision before reader changes: retain separate CODE modules. A CODE block owns
source call spans and its place in a voice's routing chain; apparent adjacency on
a rail is not source adjacency. Across scopes, setup statements, callback bodies
and shared references, combining text would require a new ownership/binding
representation and independent mutation proofs. Concatenating display text does
not prove executable byte preservation or full saved module identity. Existing
saved layouts may also name these blocks independently. This bundle changes
only unsaved placement; it does not merge CODE or invent ownership. Fewer rows
come from packing catalog widths, with no change to source spans or module IDs.
