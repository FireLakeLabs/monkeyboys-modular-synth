# Pinned Strudel API coverage (#245)

This research inventories the pinned surface and identifies bounded importer work.
It changes no application behavior. The 256 literal registration sites without
catalog ownership are **candidates**, not 256 unsupported musical features.
Reader support depends on arguments, position, ownership and graph shape; backend
sound support requires separate evidence.

## Direction and revision

On 9 November 2026 the owner authorized tracker [#241](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/241):
“$orchestrate the work of that tracker ticket. Full send on the items being worked.
For the research, feel free to run those in parallel if it makes sense. For the
others, I'll leave the parallelization to your discretion.” #245 owns inventory,
#246 owns contextual/consolidation conclusions and #247 owns helper-panel research.
The owner selected dual-mode MIX in #242. Other consolidation/custom-panel ideas
remain proposals. Old repository-owned racks may be rebuilt because there are no
active users; that does not authorize music/attribution changes or personal-data
deletion. No rack rebuilding or production feature work occurs here.

Application base: `d9f06ddc12b135221eec247150c23cce0dadf6c3`, after #238/PR #240.
Node **24.22.2**. Locked packages: web/webaudio/superdough **1.3.0**;
core/mini/tonal/transpiler/draw **1.2.6**; supradough **1.2.4**.
[Inventory provenance](inventory.json) records lock integrity, every scanned source
hash, the actual installed ESM entry hashes, application inputs and counting rules.
Reproduction depends on these input hashes, not git metadata or mutable remote
refs; the command also works in shallow CI checkouts and source archives.
The patched web entry's bytes are authoritative for this app. Published bundles
can embed a dependency snapshot; matching installed source package versions does
not prove that every embedded implementation equals its separately installed file.
The inventory therefore cross-references source candidates against the actual web
bundle, rather than treating all installed source files as loaded APIs.

## Reproduce and consume

```sh
npm ci
npm run inventory:strudel
node --test scripts/strudel-api-inventory.test.mts
npm run check
```

`inventory:strudel` is offline by default and writes deterministic JSON without a
clock field. `--output /tmp/inventory.json` selects another destination. It uses
Acorn for dependency/corpus bytes and the actual production reader/writer for
[33 controlled examples](examples.json). It never evaluates imported documents,
initializes Strudel/audio, starts a server or runs a browser.

The [JSON Schema](inventory.schema.json) and [field contract](schema.md) describe
v1. `aliasToFamily` maps runtime spellings to canonical family IDs; use
`aliasToFamily.lpf` → `api:cutoff`, `lpq` → `api:resonance`, `sound` → `api:s`,
and `pr`/`polyrhythm` → `api:stack`. Canonical setter names follow the first
registered event field, not the catalog spelling. `families[].controls` carries
the matching catalog control definition, including bounds, argument shape,
companion/merge policy, modes and omissions. Dedicated source/ENV/CV/loop adapters
remain distinct from these simple bindings. The #246 overlay owns further panel
interpretation, with this alias index as its join contract.

A fresh report-only wild measurement is:

```sh
npm run inventory:strudel -- --wild --output /tmp/strudel-api-wild.json
npm run coverage:reader:wild -- --output /tmp/reader-wild.json
```

The default inventory instead consumes the committed
[wild observation](wild-observation.json), with its original revision, input
hashes, pinned manifest, source hashes, attribution and licensing. It does not
pretend to refetch or remeasure those sources. Refreshing that observation is a
reviewed research update: replace it with the wild member of the fresh report's
`corpus` array, retain the measured base/Node/input provenance, and explain changed
counts/hashes or fetch failures. The script rejects a recorded manifest mismatch.
Downloaded code stays in memory; no wild source is vendored. Reader/corpus
baselines and #145 licensing remain unchanged.

## Counting rules and scope

The initial scan is revised as follows, with no coverage percentage inferred:

| Measure                                             |                        Preliminary |          This command |
| --------------------------------------------------- | ---------------------------------: | --------------------: |
| Catalog modules                                     |                                 58 |                    59 |
| Distinct ownership names, including catalog aliases |                                203 |                   205 |
| Literal registration count                          | 400 distinct `kind:firstName` keys | 401 source call sites |
| Registrations with no catalog-owned spelling        |                  255 distinct keys | 256 source call sites |

The preliminary scan deduplicated by `${kind}:${firstName}`. Its retained
`strudel-api-ownership.json` has 400 groups, 255 without an owned spelling
(SHA-256 `0fa2238f0db325abb6ea3f09bcf2cb0d603e5b7339afba3b8609a151702c2433`).
Reconstruction against the pinned sources gives **401 literal sites / 256
unowned sites**, or **400 distinct keys / 255 unowned keys** after that
name-key deduplication. The sole duplicate key is `register:cpm`:
`core/pattern.mjs:2047` and `core/repl.mjs:206`. The pattern source explicitly
notes that the REPL redefines `cpm`, using its current cps as divisor. The
registration-key count is therefore not a count of distinct implementation
semantics. `repl.mjs` registers `cpm` here, not `all`; the earlier report's
omitted-`all` hypothesis was incorrect. The one-count difference comes from
this duplicate key, not alias or packed-control expansion.

Per-file sites: controls 282, euclid 6, impure 1, pattern 78, pick 12,
repl 1, signal 20, speak 1. Numbered declarations count once here, before expansion.
A literal registration site is one Acorn call to `register`, `registerControl` or
`registerMultiControl` whose required names/count can be statically read. Tests,
benchmarks, comments and documentation examples do not count.

The broader inventory has **1,100 candidate families**, **1,017 web exports**,
**1,013 names in statically discovered initialization namespaces**, and **127 direct
Pattern class/prototype entries** before generated setters/operators (methods, accessors, prototype assignments
and one constructor entry; `_steps` has a getter and a setter). The historical
JSON count key is `bundleDirectPatternMethods`; it counts entries, not unique
callable methods. `api:constructor` is retained only as raw class evidence, not
an independently callable API or rack feature. These are
intersecting surfaces, never quantities to add. They include utilities,
constructors and class methods, not just musical transforms. Default `evalScope`
receives core, mini, tonal and webaudio namespaces plus hush/evaluate;
engine exports alone do not imply REPL scope membership. REPL evaluation separately injects nine helper spellings, including
`setcpm`/`setCpm`, `setcps`/`setCps`, `all` and `each`. These have
`repl-evaluation-scope` availability, not package-export or initialization-scope
availability. The transpiler is supplied to the REPL, not added to these four
initialization namespaces. An exported symbol
is not by itself proof that its value is callable or non-undefined. App `samples`/`speak`
overrides are recorded separately. Class methods such as Fraction arithmetic and
Pattern queries are not candidate rack panels merely because they are callable.

Alias families group registered aliases and exported identifier aliases.
`registerControl(['s','n','gain'], 'sound')` has setter names `s`/`sound` and three
packed event fields, not four aliases. `registerMultiControl` expands eight
numbered variants per declaration. The finite nested FM loop adds **81 matrix
setters** (`fmi00`…`fmi88`, with `fm00`…`fm88` aliases), including prototype-only
names absent from top-level exports. The composer matrix records operations and
`in/out/mix/squeeze/squeezeout/reset/restart/poly` variants. This distinguishes
`.add` and its timing modes instead of declaring arithmetic absent because no
literal registration owns it.

Three names have overlapping definitions: numbered-FM aliases `fmi1`/`fmh1`,
and `density` (fast alias versus crackle control). Bundled registrations place
the density control last; `aliasToFamily.density` points to `api:density`,
while `api:fast.names` retains its historically declared alias. Catalog/control
association follows the final bundled name candidate, without conflating those
two behaviors.
`aliasCollisions` retains both sources and marks effective ownership unresolved;
these are not grounds to merge the two operators into one behavior. The
**40 unresolved dynamic sites** include factory bodies whose parameters are
intentionally open, implementation wrappers and sites also explained by bounded
expansion. They are discovery uncertainties, not 40 missing APIs. Open-ended
`register`, `createParam`, arbitrary user factories and runtime sample registries
cannot be exhaustively enumerated without execution. Bundled internal methods
are recorded separately with internal/unresolved visibility. Generated underscore
variants such as `_pianoroll` and `_scope` may still appear as
`unknown-or-external` in corpus call classification; that category includes
unresolved generated methods, not just external code. Private underscore
implementation wrappers are not all promoted into musical families. Dynamic
sound registry content and fetched sample names remain runtime data, not proof
of available or decoded audio.

Every family carries source evidence and independent reader/generator/backend
states; untested behavior is explicitly `unknown`. Exports, literal recognition,
editable values, graph shape, exact bytes, saved identity, event equivalence and
PCM are separate claims. No completeness or global audio-support ratio is claimed.

## Observed reader and corpus evidence

The controlled examples are positive/negative pairs, not a generated snapshot of
constants. Every example passes production `read`, `generate(document)` exact
byte retention and `saveLayout`/reopen full patch equality. The command fails if
an expected CODE boundary changes. It records projected values/modules and CODE
separately. Examples expose several useful distinctions:

- `note("c2").s("sawtooth").cutoff(800).resonance(25)` is editable; 51 remains
  CODE without clamping. A recognized perlin/range/slow expression maps to STEP
  LFO; an arbitrary callback is not run to discover a cutoff.
- `gain("1 .5")` maps to VCA plus CV SEQ; an unresolved `gain(levels)` remains
  CODE. Patterned values are not universally unsupported.
- Complete ordered ADSR and supported FX stages project after an explicit sound
  boundary. Bare `s("bd")` with the same suffix can remain CODE because the
  implicit sampler boundary differs. That is a reader/graph restriction, not an
  engine requirement. Partial `.dec(.1)` remains CODE rather than inventing ADSR.
- A literal ADD can be editable without transposing an already wrapped note
  pattern. Existing `src/reader/acid.test.ts` proves those pinned pure-event
  semantics and actual pre-note numeric offsets; no new runtime probe is added.
- Top-level independent stack voices project; a nested stack with shared trailing
  sound, callback branches, section `arrange()` and nondefault voicing arguments
  remain CODE at this revision. Existing #242–244/#249 own those expansions.
- `orbit`, bus/duck/mod routing and custom helpers can have generator adapters
  while opaque imports remain exact CODE. An imported address is not provenance.
- The engine registers built-in `orbit`/`o`, but the trance fixture explicitly
  registers its own `o`. Raw occurrence spelling is not implementation identity.
  Declared custom/possibly shadowed occurrences are excluded from pinned-family
  occurrence totals and marked separately in each patch's `callDispositions`.

Production-reader coverage is unchanged from the actual #145 foundation:

| Tier                  | Mapped calls | Readable voices | No-CODE patches | CODE | Parse/fetch failures |
| --------------------- | -----------: | --------------: | --------------: | ---: | -------------------- |
| Committed (22 files)  |      294/309 |           32/36 |           20/22 |   15 | 0 / 0                |
| Pinned wild (5 files) |        19/69 |            0/17 |             0/5 |   46 | 0 / 0                |

The committed tier is exactly the 22 entries in
`corpus/reader/committed.json`, referencing root `src/library/patches/*.strudel`
files. It excludes the 59 generated exercises under
`src/library/patches/modules/*.strudel`; 294/309 is therefore **not coverage of
every bundled library patch**. #246 separately exercises every catalog module in
its [context matrix](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/246)
(`docs/research/module-contexts.md` and its machine evidence, landing separately).
The manifest corpus is authored around the catalog and is not representative
of community expressiveness. The wild tier is the existing tiny convenience
sample: cosimo's pinned Switch Angel transcription and four brucelane files,
with full attribution/URLs in the artifact. One transcription overlaps the
committed showcase, so these are not independent population samples. This report
copies no external source and asserts no redistribution license.

#145's denominator counts outer production-reader chain calls. The inventory's
separate syntactic counts include calls inside arguments, helpers and setup;
those measure occurrence frequency, not projected readability. Both remain in
`corpus`, with separate tier totals. The largest wild unmapped names are `o` (6),
`note` (4), `color/n/sound/spiral` (3 each), then `_pianoroll/arrange/beat/dec/rlpf`
(2 each). Known names can be unreadable because of argument/shape or whole-voice
fallback. Custom helpers (`rlpf`, `trancegate`, `acidenv`) and visualization calls
are different work from missing literal source aliases.

## Musical priorities and bounded stories

[Priority data](priorities.json) records value, effort, dependency/risk and
confidence. The generated `priorities[].corpus` adds raw syntactic occurrences
and unmapped outer-call occurrences per tier. Groups overlap and are not an
additive denominator. Ranking is engineering judgment informed by those counts,
not a popularity score or an owner decision to implement every proposal.

| Rank | Musical family                                | Recommendation / owner                                                          | Evidence and limits                                                                                                                                     |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Nested layers, branches, sections             | Existing #242 → #243/#244                                                       | Shape examples; two wild arrange calls. Preserve section-local time and routing. Large structural prerequisite, already authorized.                     |
| 2    | Ordinary sound selection aliases              | New [#251](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/251) | Three wild sound calls; controlled root/chained cases fail while s equivalents project. Small importer change, no new panel.                            |
| 3    | Reusable musical helper controls              | Existing #217, informed by [merged #247](../user-defined-modules/README.md)     | Four committed/six wild register calls, plus custom-helper occurrences. Closure/collision/source boundaries make this large and risky.                  |
| 4    | Patterned values and companion forms          | Audit one bounded form at a time; #246 context overlay                          | Many note/n/dec/fm names are already available; CV SEQ already covers numeric notation. Do not file a blanket “missing names” ticket.                   |
| 5    | Harmonic range/voice leading                  | Existing proposal #249                                                          | Default CHORD works; nondefault voicing remains CODE. Controlled value, sparse sample demand; medium scope.                                             |
| 6    | Phrase-transform modes/aliases                | Existing proposal #248                                                          | #246 owns pure-event comparisons for differing chunk variants and every/firstOf alias. Sparse corpus; reuse existing panels.                            |
| 7    | Deep FM matrix and numbered modulation        | Defer until backend audit and demand                                            | 81 matrix setters plus numbered controls; availability is established, audible contribution for all forms is unknown. No panel-per-setter backlog.      |
| 8    | Visualizations and external output transports | Intentional CODE / deferred                                                     | Wild visual calls occur, but native SCOPE already uses analyze. Current default output is WebAudio; MIDI/OSC setter fields do not configure transports. |

#246's [#250](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/250)
remains a nonproduction visual grouping proposal requiring owner adoption before
production. #216 retains MIX geometry, #200 retains one-call source mutation and
#239 retains omitted reverb-size semantics. #238 is closed and not duplicated.
Only #251 was newly filed by this item, with source/identity/event/browser proof
requirements and explicit unsupported-form limits; linked on #241 and #245.

## Verification and limits

See the [review ledger](review-ledger.md) for reviewed heads, findings and gate
results. Focused command tests parse hostile fixture bytes without creating their
sentinel file, reject treating comment/string text as API calls, distinguish
packed fields from aliases, discover class/prototype methods and bounded FM
expansion, and reproduce byte-identical reports twice. Real reader examples test
source preservation and saved identity independently. Existing production tests
retain pinned-event coverage; JSON Schema validation separately checks the
committed machine artifact.

No application, dependency, corpus source or reader baseline is changed. No
local browser suite, dev server, audio initialization or physical listening is
claimed. #247 retains the local browser allocation. Hosted Full browser suites
must finish on the PR head whenever triggered by the tooling paths; their result
is gate evidence for unchanged application behavior, not a new API/audio audit.
The remaining unknown family forms and backend states are explicit research
limits, not unfinished production implementation acceptance.
