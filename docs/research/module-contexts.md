# Module contexts and consolidation study (#246)

**Recommendation: preserve independent semantic nodes; simplify discovery and
optionally group panels.** The approved exception is dual-mode MIX (#242).
Source-specific controls already share several panels appropriately. None of the
other relationships below justifies replacing an arbitrary chain or fan-out with
one exclusive mode. In particular, do not turn quoted ADD on note events into
transpose, CHUNK variants into aliases, or native setters into ordered FX.

Status: research proposals, **not adopted product decisions**. Application
behavior, catalog and saved format are unchanged by this study. The whole-catalog
[matrix](module-contexts-matrix.md) covers **59** modules. Its
[machine-readable evidence](module-contexts-evidence.json) contains every current
control, range, omission, conditional mode, call binding, jack and alias directly
from the catalog, alongside per-module judgments and observations. This is a
catalog context overlay, not a competing full Strudel API inventory.

## Authority and reproducibility

The owner explicitly authorized on tracker [#241](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/241):

> “$orchestrate the work of that tracker ticket. Full send on the items being
> worked. For the research, feel free to run those in parallel if it makes sense.
> For the others, I'll leave the parallelization to your discretion.”

The assigned scope is [#246](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/246).
The owner permits rebuilding **repository-owned** library rack representations
because there are no active users. This does not permit changing music or
attribution silently, clearing personal storage, discarding exact unsupported
source, implementing other consolidations, or shipping user-defined panels.
Only MIX Voices/Stack is selected. #243 owns local callback branches; #244 owns
section `arrange()`. The old per-voice mask arranger remains independent.

Production baseline: `d9f06ddc12b135221eec247150c23cce0dadf6c3` (PR #240,
closed #238). Node **24.22.2**; locked `@strudel/web`/`superdough` **1.3.0**,
`@strudel/core`, `mini`, `tonal`, `transpiler` **1.2.6**. Core package gitHead:
`0e26d4e741500f5bae35b023608f062a794905c2`. Other package gitHeads are absent,
not guessed. The evidence records source SHA-256 values and the exact committed
lockfile hash. Refresh these observations if application sources/packages change.
The earlier 58-module/name scan was preliminary; ADD makes the current count 59.

```sh
npm ci
node scripts/module-contexts.mjs
npm run check
```

The reproduction uses Vite's closed module runner (no HTTP listener) and the
existing pure Strudel kernel fixture, mini and tonal/voicing registrations. A
plain Node import of the browser-oriented core bundle fails on its Kabelsalat
named export; this is why it uses the established test-kernel boundary. It does
not initialize the browser engine or add a playback adapter. The `events()`
helper evaluates **only original literal research fixtures** in this repository;
production `read()` never evaluates imported source. No corpus file or CLI input
enters evaluation. Setup sentinels and an invalid sample URL are read/saved
without running or fetching them.

Observed reproduction: `RESULT module-contexts modules=59 comparisons=48
reader=63 fallbacks=59 examples=8 failures=0`. Every module's committed exercise has its actual catalog
owner, byte-exact document generation and complete saved graph equality after
save/reopen. Each module also has a concrete fallback/source-preservation counterexample; OUT retains opaque tempo setup without inventing a binding. The 63 additional reader/document cases separately check exact source
and saved identity; 48 comparisons query real pinned event values and whole/part
times over `[0,4)`. Hashes cover complete event arrays; samples/counts remain
inspectable. Equality in one four-cycle fixture is a bounded observation, not a
proof over all inputs. Source implementations establish the general claims.
These cases are not a new community-coverage baseline and do not modify #145.

**Audio limits:** no browser, new PCM measurement, performance benchmark or
physical listening here. #247 has the local browser allocation. A consumed
backend field is source evidence of implementation, not audible acceptance.
Existing reports cited below are prior evidence and are not reruns of this study.
Private design-canvas boards were unavailable; the local design exports/specs
are the presentation reference. No visual claim about the real app is made.

## Reading the evidence

Roles are contextual. `s`, `n`, `add`, `fast`, `range` and `velocity` do not have
one universal module owner. For instance `add` is a chain panel on a voiced
pattern or MOD MIX inside a numeric CV argument; the same name says nothing
about the receiver's value shape. The matrix's owned-name list is catalog data,
not a claim that every export or argument shape is supported. Complete controls
in JSON expose methods not listed in a module's explicit `strudel` array.

Each row distinguishes **engine context** (what the pinned operation reads or
consumes), **reader/graph context** (what we recognize and can wire), and a
**panel judgment** (keep/group/selected merge). `group` means an optional visual
container with independently addressable internal nodes, not semantic identity.
Unmeasured sound/UX and arbitrary callback behavior remain explicit unknowns.

Source anchors used in the case studies (all installed files hash-pinned in the
evidence; package licenses remain their own):

| Key | Pinned source / repository contract                                                                                                        | What it establishes                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| S1  | `@strudel/core/controls.mjs`, `createParam`, `registerControl`, `registerMultiControl` (lines 11–96)                                       | Root/chained setters merge event fields; aliases share registrations; packed fields and indexed controls differ.    |
| S2  | `@strudel/core/pattern.mjs`, arithmetic table and prototype expansion (1020–1125), `register` (1605), `layer`/`superimpose` (796/810)      | Plain arithmetic/control arithmetic, patternified arguments, callback arity and copies.                             |
| S3  | Same file, `_chunk`/chunk/back/fast (2558–2621), firstOf/every/lastOf (1995–2026), off (2236), within (2730)                               | True aliases versus timing variants; callback operations are not limited to our single-chain grammar.               |
| S4  | `superdough/synth.mjs`, stock registry (23–80), supersaw (154–210), pulse (296–365), noise (412–458), `getOscillator` (506–565)            | Which source backend consumes PW, unison, density, partials, noise and FM.                                          |
| S5  | `superdough/helpers.mjs`, `applyFM` (414–480); `sampler.mjs`, `onTriggerSample`/buffer construction                                        | Indexed FM matrix, optional envelopes; sampler speed/slice/loop and native pitch-envelope context.                  |
| S6  | `superdough/superdough.mjs`, native/FX stage construction (around 650–960)                                                                 | Fixed stage order, repeatable FX, outer 24db setting, send versus inline room/delay.                                |
| S7  | `@strudel/tonal/tonal.mjs` scale/transpose operations; `voicings.mjs` voicing (176–214)                                                    | Degree versus semitone operations; voicing consumes chord/dictionary/anchor/mode/offset context.                    |
| R1  | [`read.ts`](../../src/reader/read.ts), `soundOwner`/`soundAt`, root/chain construction, companion logic (52–114, 703–900, 1600–1682)       | Adjacency, literal ranges, context-sensitive sound ownership, CODE fallback.                                        |
| R2  | [`graph.ts`](../../src/codegen/graph.ts), `functionMembers`; [`functions.ts`](../../src/modules/functions.ts), `isLoopChain`               | One chain/local scope; source/utility exclusion and signal restrictions are ours.                                   |
| R3  | [translation rules](../translation-rules.md), [patch format](../patch-format.md), [module spec](../module-spec.md), [design](../design.md) | Exact ownership, FX/orbit provenance, control/range/omission defaults, saved identity and fixed width across looks. |

## Contexts that must not become false requirements

**Sound-specific consumption is real; lexical adjacency usually is not.** S1
constructs fields without requiring an OSC, filter or sample panel. C02, C05–C08
and C12 compare a setter before its source/activation with one after it. The
independent event fields agree. For example `note("c2").pw(.2).s("pulse")` and
`note("c2").s("pulse").pw(.2)` agree as events; only the latter has a native PW
control in our reader. The pulse backend consumes `pw`; stock sine does not.
Retaining an inert PW field on sine does not prove audible pulse-width behavior.

S4 similarly supports supersaw unison/detune/spread and crackle density. HARMONIC's
current `s("user").partials([...])` adjacency is a reader convention: stock
non-sine waves can also enter the custom-wave path with partials. `s("user")`
without partials falls back to triangle, while sine bypasses that custom path.
FM is consumed by stock/pulse/supersaw oscillator paths, with up to eight indexed
operators in S5; its event field on a sample does not make the sampler FM-capable.
Do not fuse FM OP exclusively to OSC or confuse CHIP's `zdelay` with DELAY.
BYTEBEAT's formulas, CHIP and SPEAK remain separate backend/UI domains.

**Voice recognition depends on an audio boundary in today's graph.** C01 proves
root `s("saw")` is OSC via #238's alias, but `s("sine")` still projects as
DRUMS + implicit SMPL. Chained `note("c2").s("sine")` is SEQ + OSC. C08/C09 show
that the implicit sampler can leave complete native ADSR or FX as CODE where an
explicit oscillator path exposes ENV/VCF. Bare unvoiced `note("c2").add("12")`
is whole-voice CODE, whereas appending `.s("sawtooth")` exposes ADD. These are
reader/graph restrictions, not proof that the engine requires drums, an instrument
before every transform, or one oscillator per sequencer. C11 also verifies
`s("bd").gain("1 .5")` as VCA + CV SEQ: patterned gain is not universally CODE.

**Arithmetic depends on values.** C03 reproduces #238: `note("c2").add("12")`
warns and keeps `note: "c2"`; `mini("48").add("12").note()` gives 60. It is not
permitted to repair the owner's apparent intent by transposing. `transpose` is
semitone-aware; QUANT's `scaleTranspose` is diatonic (C04). Numeric `mul`/`add`
ordering also differs. ADD, MOD MIX and OSC TUNE serve distinct contexts. A
future generic value-math panel must expose receiver/type and independent ordered
instances, rather than absorb every arithmetic-looking function into a source.

**Companions do not authorize invented defaults.** Partial ADSR setters are legal
engine programs (C08); requiring a complete group is our lossless reader rule.
A standalone `resonance(25)` cannot acquire default cutoff 800. `roomsize`/`ir`
without a room send cannot acquire ROOM .5. Native and generic additive ENV have
different behavior. Source absence is different from the new-panel preset:
PHASER depth-only does not activate phaser, FM's absent envelopes stay off,
WAVETABLE imports use 0/0/none, and explicit zero/reset setters must survive.
Existing [#239](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/239)
owns omitted roomsize rather than duplicating it here.

**Native call order is not necessarily DSP order.** C09 shows different native
fields commute in events and a repeated native cutoff takes its last value.
Two `.FX(lpf(...))` calls retain two ordered stage objects. S6 constructs native
stages in fixed order; rule 4 uses FX for generated repeats/inversions. A visual
merge must retain the native/inline execution choice, not turn the written order
of native imports into audio-order authority. LO-FI spans coarse and crush;
COMP spans transient and compressor. One panel can already own nonadjacent stages;
the effect planner must still see all of them. Outer `ftype:24db` cannot be
isolated per FX filter, an actual backend limitation, not merely a panel gap.

**Callbacks are scope, not a hardware feedback wire.** S2/S3 accept operations
beyond our receiver-chain projection; C14/C15 prove nested/branched functions are
valid. `firstOf` and `every` agree; `lastOf` changes phase. `chunkBack` changes
traversal; `fastChunk` uses evolving source cycles rather than repeating them.
`layer` omits the implicit original that `superimpose` includes. OFF copies
pattern events; ECHO repeats/gain-scales events; DELAY buffers audio. Generic
loop merging cannot erase these distinct contracts. Current callbacks prohibit
OSC/SMPL and branches in the graph even though engine lambdas can set `s` or
return `stack(...)`. #243 owns opening local branches after #242; it does not
need a new loop-language interpreter or arbitrary JS evaluation.

**Routing is a separate authority boundary.** C20 retains opaque `.orbit(7)` and
`.bus(7)` as CODE. Values alone cannot prove generated AUX/DUCK/audio-mod ownership.
MIX channels select final output pairs; PAN changes per-note pan; JUX creates
separate panned event branches; SCOPE analyzes final per-note audio, not the
intermediate cable location. OUT tempo and app master volume have different
owners. `samples`, `register`, and other setup remain prelude/CODE unless a
specific source/metadata contract establishes ownership. #217/#247 own helper
panels; a registered helper name must not invent signal or routing semantics.

## Recommendations, with rack and code examples

These are structural sketches, not screenshots or implemented interactions.
`{ ... }` means a proposed optional visual container; `→` retains actual cables.
Before/after code is deliberately identical for visual groups. Thus grouping
requires no music rewrite. A mode-addition example changes only representation
of the same imported call; selecting a different mode is an explicit musical edit.
Every proposal inherits the preservation and interaction contract below.

### P1 — Keep SEQ/DRUMS separate from sound selection; offer a source group

Optional grouping of OSC/NOISE/HARMONIC/SMPL with their existing controls is a
better palette/discovery experiment than replacing them with an exclusive
universal sound node. Sample selection and sequencing are independently reusable;
one source may feed two instruments, and repeated selectors override earlier
fields. WAVETABLE/SPLICE, BYTEBEAT, CHIP and SPEAK keep their specialist panels.
Keep FM OP independent; offer contextual discovery beside supported oscillators.

```text
Before: SEQ a → OSC sine → VCF → MIX
             ↘ OSC square ─────→ MIX
After:  SEQ a → { OSC sine → VCF } → MIX
             ↘ { OSC square } ───→ MIX
```

```js
// Before and after optional grouping: exact same calls and named reuse.
const a = note("c2 e2")
$: a.s("sine").lpf(800)
$: a.s("square")
```

C01/C02/C05/C17 and S1/S4/S5 reject mandatory SEQ+OSC, OSC+FM or SMPL+DRUMS merges.
A one-panel source mode may remain useful as a **creation shortcut** only if its
expanded nodes/ports remain accessible. New source presets must not reset hidden
controls, imported fields or source aliases. Grouping should never hide which
branch owns the selector. Tradeoff: a clearer palette against larger panels and
source-dependent controls. Effort medium/high: grouping metadata, focus and
layout; no DSP dependency. Proposal, not permission to change widths or sources.

### P2 — Keep ENV/LFO/utilities independent; optionally group a target and modulator

```text
Before: ENV e → VCF.CV       e → VCA.CV
After:  { ENV e → VCF.CV }   e → VCA.CV  (external cable still visible)
```

```js
// Before and after: per-target rendering; sharing the ENV node is saved identity.
$: note("c2").s("sine").lpf(800).lpq(1).lpenv(4)
   .lpattack(.01).lpdecay(.2).lpsustain(.5).lprelease(.1)
   .attack(.01).decay(.2).sustain(.5).release(.1).gain(.5)
```

A native envelope is event-triggered, not a standalone free-running pattern.
LFO STEP, SMOOTH, CV SEQ and S&H differ in timing and units. Shared LFO/ENV nodes
can render destination-specific defaults/depths; grouping cannot move depth to a
single global knob. MOD MIX's two numeric inputs, utility ordering, ENV's direct
CV restriction and audio-mod buses remain explicit. C03/C08/C11 plus [modulation
contract](../modulation-verification.md) support keep; current PCM is not rerun.
Tradeoff/effort medium: discoverability without losing fan-out; defer generic
math expansion until receiver/target shape and within-note behavior are proven.

### P3 — Group related effect controls visually; retain stage nodes and execution

```text
Before: OSC → DELAY → REVERB → MIX
After:  OSC → { DELAY → REVERB } → MIX
Before: OSC → VCF 400 → VCF 1200 → DRIVE → MIX
After:  OSC → { VCF 400 → VCF 1200 → DRIVE } → MIX
```

```js
// Before and after: native sends remain native, ordered filters remain FX.
$: note("c2").s("sine").delay(.3).delaytime(.2).room(.4).roomsize(2).orbit(0)
$: note("e2").s("square").FX(lpf(400)).FX(lpf(1200)).FX(soft(.5)).orbit(1)
```

Do not make DELAY/REVERB/ECHO mutually exclusive modes or fold DRIVE/FOLDER/LO-FI
into one exclusive distortion selector: they can coexist, repeat and reorder.
LO-FI and COMP may visually expose their two existing sections, but splitting or
merging their semantic representation needs the same all-stage planner proof.
Default/omission repair belongs to #239; it is a prerequisite for relying on bare
room reconstruction, not a reason to merge more effects. C09/C12 and S6 establish
the counterexamples. Effort medium for visual groups; high for any new compound
stage ownership. No new semantic merger is recommended.

### P4 — Extend CHUNK variants as explicit modes; keep loop nodes independent

```text
Before: SEQ → OSC → CODE chunkBack(4, rev) → MIX
After:  SEQ → OSC → CHUNK[backward] (SEND → REV → RETURN) → MIX
```

```js
// Before and proposed after reader/panel support: same original call.
$: note("c2 e2 g2 b2").s("sine").chunkBack(4, x => x.rev())
```

Recommend CHUNK forward/backward/fast modes using S3's actual variants; no claim
of alias equivalence. Preserve distinct repeated/nested CHUNKs, each's count,
callback parameter and scope. `slowChunk` aliases may point to forward; `fastChunk`
is a different mode. Recognizing `every` as an alias of `firstOf` belongs to the
existing EVERY panel; `lastOf` remains its explicit other mode.

```text
Before: SEQ → OSC → CODE every(4, rev) → MIX
After:  SEQ → OSC → EVERY[first] (SEND → REV → RETURN) → MIX
```

```js
// Exact alias spelling survives support and unrelated edits.
$: note("c2 e2").s("sine").every(4, x => x.rev())
```

C14/C15 demonstrate difference/alias behavior and current CODE. Estimated effort
small/medium for these bounded additions using catalog function-loop variants,
source addresses and existing UI. Keep SOMETIMES, OFF, JUX, TIME LENS and LAYER
separate; a universal loop mode panel would increase hidden controls and confuse
copy/time/probability roles. Multi-callback `layer`/`echoWith` and `inside`/`outside`
are deferred candidates; require explicit arity/index semantics before mapping.

### P5 — Implement selected dual-mode MIX without swallowing expression structure

```text
Before: CODE stack(note(...),note(...)) → OSC → MIX Voices → OUT
After:  SEQ a ─┐
        SEQ b ─┴→ MIX Stack → OSC → MIX Voices → OUT
```

```js
// Before and selected #242 representation: same combined pattern before voicing.
$: stack(note("c2"), note("e2")).s("sine")
```

C13 proves stacked notes can share a downstream selector and factory/chained
`stack` agree in this fixture; already-voiced branches can also differ and must
retain their separate `s` fields. Voices labels, mute/solo, postgain, arrange masks,
channels and final orbit allocation cannot automatically become Stack inputs'
properties. Placement of `.s`, effects and routing after the combination matters.
Nested/shared declarations and source-preserving mutation need #242's expression
ownership proof. #216 still owns larger mixer geometry; #243 and #244 consume the
same foundation. Effort high, already owned: no duplicate issue here.

### P6 — Keep CHORD/QUANT/ARP independent; expand voicing controls on their owner

```text
Before: CHORD → OSC → MIX, or CODE chord.dict.anchor.voicing → OSC → MIX
After:  CHORD[optional voicing controls] → OSC → MIX
        QUANT / ARP still remain separate chain nodes where used
```

```js
// Before and proposed after supported voicing controls: exact original call order.
$: chord("Cm7").dict("ireal").anchor("c4").voicing().s("sine")
```

S7 consumes dictionary/anchor/mode/offset in `voicing`; they are not evidence for
merging ARP, scale, MIDI note constructors or generic transpose into CHORD. C04
shows bare chord is legal but not already voiced, ARP can operate on stacked
notes and scaleTranspose differs from semitone transpose. Recommend a bounded
literal voicing-context increment (dict/anchor/mode/offset), preserving order,
source omission and separate indices/scale calls. General custom dictionaries,
computed voicings, imported registrations and arbitrary chord pipelines remain
CODE/#217. Effort medium, subject to inventory priority and a future adoption
choice; source support alone is not sound proof.

### P7 — Keep routing/setup/CODE as separate domains

```text
Before: OSC → DUCK(target), trigger → DUCK.SIDE → MIX → OUT
After:  same distinct nodes; optional route grouping exposes SIDE and final outputs
```

```js
// Before and after visual grouping of an imported opaque route: no reassignment.
$: note("c2").s("sine").orbit(7).channels("3:4")
```

AUX bus returns, private audio-mod/DUCK send branches, output channels, SCOPE taps,
setup calls and app volume do not collapse to one sound/effect mode. Existing
routing provenance checks must remain authoritative. CODE must remain available
as a complete expression, suffix and callback-local fragment. #217 owns custom
helpers; #247 recommends wrappers preserving original calls/context rather than
inferring wiring from helper names. #247 also demonstrates that a user registration can overwrite built-in `o`/orbit globally; event field names alone cannot identify the executing implementation. Effort small for clearer discovery, high for
new semantics; no routing rewrite or new generic setup panel is recommended.

## Cross-cutting cost and preservation contract

Every proposed group/mode must pass these checks before adoption. This is a
future acceptance contract, not a claim that a grouping implementation exists.

| Dimension             | Required outcome                                                                                                  | Why it matters here                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Order and repeats     | Retain one editable ordered instance per operation, with native/FX choice intact.                                 | Repeated transforms, noncommuting time operations and filter stages are not mutually exclusive modes.  |
| Fan-out / named reuse | Expose each internal output and name; preserve branch-local changes and counts.                                   | P1/P2/P5 must not duplicate a shared definition or move a source setter across the split.              |
| Independent CV        | Preserve every existing target jack and independent modulator; retain per-target units/defaults.                  | A single group-level modulation knob cannot replace distinct target fields.                            |
| Nested scope          | Keep local receiver, callback identifier, source addresses and scope boundaries.                                  | P4 and #243 cannot lift inner transforms or routing to the parent voice.                               |
| Defaults / resets     | Distinguish absence, explicit zero, preset and inactive saved value.                                              | A mode change must not erase previous selections or invent cutoff, room send, FM envelope or a sound.  |
| Sound / routing       | Source equality, event equality and PCM are separate; retain opaque orbits/buses/setup exactly.                   | Event objects do not prove sampler/FM support, effect tails or device output channels.                 |
| Width / looks         | One width per catalog type across its looks; collapsed group must not strand modules or cables.                   | #216 geometry and current fixed-width look contract remain independent.                                |
| Keyboard / selection  | Every internal node/control stays reachable by keyboard, code selection and Connections; expand before focusing.  | Fewer palette chips can otherwise conceal sound source and cable ownership.                            |
| Undo                  | One group/ungroup or explicit mode edit is an accepted-document undo step; no autoplay on reload.                 | Exact original source and graph must return together.                                                  |
| Persistence           | Group identity is presentation metadata referencing stable node IDs; no executable ownership by group ordinal.    | Save all nodes/cables/names/looks/inactive values/disconnected state, including external group cables. |
| Library refresh       | Rebuild repository-owned rack metadata deliberately; preserve music and all credits; prove sources independently. | No unnecessary legacy topology shim is required, but personal files/storage are not discarded.         |

Grouping loses its advantage if it makes the panel wider than the visible detail
view or requires scrolling through incompatible controls. Start with palette
contextual discovery and an optional expandable group, not a large universal
instrument/effects panel. Keep source/operation selection and currently active
controls visible; place advanced independent controls behind accessible sections.
The private canvas cannot settle this product choice. A future visual grouping
story must show a simple mockup and get owner adoption before production changes.

No format/version change is selected here. A future replacement of module types
may rebuild bundled representations instead of retaining legacy topology shims,
with explicit migration/refusal for personal saved files and independent exact
CODE/credit preservation. Do not interpret old generator-owned orbit metadata as
permission to rewrite edited opaque routing. Existing #218 owns library layout
refresh; this research does not regenerate its racks.

## Inventory reconciliation and prioritized stories

Pending final reconciliation with #245's committed
`docs/research/strudel-api-coverage/` inventory. The overlay will join canonical
families by its schema's `api:<canonical spelling>` IDs, distinguishing aliases
from packed fields and contextual ownership. Do not close #246 until its actual
priority families and final corpus observations have been reconciled here.

Provisional priorities: #242–244 structural work first; bounded CHUNK variants and
EVERY aliases next; voicing-context controls after inventory occurrence evidence;
optional grouping as a design proposal. General receiver/value arithmetic,
multi-callback transforms, arbitrary setup/register and unsupported backends stay
CODE/deferred. Corpus occurrence is an input to prioritization, not proof that
every name needs a panel. Existing #217, #216, #239 and #242–244 retain ownership.

Bounded stories filed under the owner's research-follow-up grant:

- [#248](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/248): proposed CHUNK forward/backward/fast modes and missing EVERY aliases. Existing loop contracts apply; #243 still owns branches.
- [#249](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/249): proposed literal CHORD dictionary/anchor/mode/offset controls; no ARP/QUANT merge or custom dictionary interpreter.
- [#250](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/250): one nonproduction optional source-group design prototype; owner adoption precedes production implementation. Other group domains remain proposals, not a broad new feature backlog.

All three explicitly require owner adoption before production. Each includes bounded acceptance and separate preservation/behavior evidence. #245 owns [#251](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/251), the focused `sound` alias importer improvement; this study does not duplicate it.

Selected additional candidates, to reconcile with inventory priority rather than
expanding into one ticket per name:

| Candidate family                                    | Role / constraint / counterexample                                                                                                                                                                                                | Verdict and dependency                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chunkBack`, `fastChunk`, forward aliases; `every`  | Callback-local operations; C14/C15 distinguish variants and prove the alias. S3 pins timing, not panel adjacency.                                                                                                                 | Proposed modes/alias on existing owners, #248.                                                                                                                          |
| `dict`, `anchor`, `mode`, `offset`, `voicing`       | Sound-independent harmonic context; C24 shows context may precede chord setter, while reader keeps the pipeline CODE.                                                                                                             | Proposed bounded controls, #249.                                                                                                                                        |
| `sound`                                             | Exact pinned alias of `s`; root/chained context still matters.                                                                                                                                                                    | #251, owned by inventory thread.                                                                                                                                        |
| `inside`, `outside`                                 | Function-loop time scale context; same receiver does not imply same timing. C22 returns differing four-cycle events and exact reader CODE.                                                                                        | Defer additions; could reuse function-loop infrastructure after scope/range/corpus proof, not an alias of EVERY or CHUNK.                                               |
| `layer`, `echoWith`, `chunkInto`                    | Multi-function/index/inside-loop contracts differ from implicit-original LAYER, scalar ECHO or CHUNK. C14 proves layer/superimpose differ; S2/S3 establish arities.                                                               | Keep CODE; #243 is a structural prerequisite for branches, not blanket support for arbitrary callback shapes.                                                           |
| `sine2`, `rand2`, `irand`, `steady`, other signals  | Numeric/continuous argument sources, not audio oscillators. C21 distinguishes bipolar versus normalized, random integers and continuous constants versus discrete pure. All three tested unrecognized CV forms remain exact CODE. | Defer mode/utility additions; normalize only with explicit unit/timing semantics, preserve event subdivision and target ranges. Existing STEP/SMOOTH distinction stays. |
| Pattern-valued `note`/`n`/`s` and computed controls | Argument/receiver forms; not necessarily missing names. C25 retains patterned chained sound selection as CODE; C11 already supports patterned gain.                                                                               | Prioritize bounded source/argument-reader work after #242, based on inventory examples; no evaluate-to-infer wiring.                                                    |
| FM indexed controls/matrix                          | Generated control family with actual S5 backend consumption, not 81 independent panels. C16 distinguishes indexed event fields.                                                                                                   | Defer multi-operator design/PCM; keep FM OP and arbitrary indexed calls as CODE until scoped.                                                                           |
| `samples`, `register`, custom setup/routing         | Side-effecting setup, captures, registry identity and routing provenance. C18/C20 parse without execution and retain opaque source.                                                                                               | #217/#247 for wrappers; intentional CODE elsewhere.                                                                                                                     |

## Verification and review ledger

- `npm ci`: passed on Node 24.22.2; lockfile unchanged; installed source patch verified.
- Reproduction: 59 exercised modules, 48 pinned event comparisons, 63 reader/document cases, 59 per-module fallback cases and 8 report examples; zero failures.
- `npm run check`: passed (2,585 unit cases, 53 guardrails, committed reader coverage, formatting/skills/lint/typecheck/build); rerun after inventory adapter.
- Coverage guard: deliberately removed one annotation; the command rejected it, then passed after byte-exact restoration.
- Local browser/PCM/listening: not run; application behavior unchanged; no server.
- Inventory reconciliation, bounded Opus review, PR/hosted checks and protected merge: pending.

Implementation provenance: GPT-6.1 Sol in T3 Code through the Codex harness.
Review policy therefore selects the latest advertised Opus; actual provider,
model, reviewed commit, findings and usage will be recorded after it runs.
