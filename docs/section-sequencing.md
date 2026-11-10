# Section sequencing (#244)

Status: implemented with focused proof; bounded review, the complete frozen local
browser suite and hosted protected merge gates remain pending.

## Panel sketch and representation

SECTIONS is a Hardware Pattern module, 16 HP in every look. The private canvas
boards were unavailable; the committed exports and current catalog layouts are
the presentation reference. Before implementation the proposed panel is:

```text
SECTIONS             Section sequencer
ORDER                 [1 2 3 4]
CYCLES 1              [4]
CYCLES 2              [4]
CYCLES 3              [8]
CYCLES 4              [4]
IN 1  IN 2  IN 3  IN 4  NEXT       OUT
```

ORDER is a permutation of the four socket numbers. Empty sockets are skipped;
their durations remain saved. Every CYCLES value is a finite positive numeric
literal in cycles, without a UI maximum or decimal rounding. NEXT accepts only
an unnamed, exclusively consumed SECTIONS OUT and appends its tuples to this same arrange call. It does
not nest/restart a continuation arrangement. Ordinary numbered inputs can contain
an independently nested SECTIONS output. More than four imported tuples use NEXT
panels, with every original ordered duration preserved. No tuple is discarded.
This is a sequence continuation contract, not Stack associativity. Named/shared
NEXT refuses atomically to avoid duplicating opaque construction; use a numbered
input for reusable nested sequences. Ordinary SECTIONS output supports naming/fan-out.

The v1 envelope retains ordinary controls/cables, including disconnected and
inactive state. Tuple-expression source paths additionally address an array
element; continuation ownership uses the existing part offset. Imported numeric
duration edits and nested argument edits splice their exact proven spans. ORDER
and structural rewiring use the existing explicit conversion-with-Undo boundary.

## Case and routing matrix

| Case                                                                 | Chosen behavior                                                                       | Required proof                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Direct/named/repeated sections; Stack-composed sections              | Native arrange; shared declarations constructed once                                  | exact source, full saved identity, pinned events         |
| Notes before OSC; downstream time/effect transforms                  | Retain section boundary and homogeneous input signal                                  | graph refusals, events, native connection                |
| Fractions, source period 3 with lengths 1/2/4, two full arrangements | Native section-local phase                                                            | compare original pinned engine, explicit boundary values |
| More than four tuples, nontrivial periods/fractions/nesting/setters  | NEXT flattens tuples in their original order                                          | independent original/generated events                    |
| Outer Voices mask/name/mute/solo/output pair                         | One outer voice; mask counts song time after arrange                                  | source/events/browser                                    |
| Nested Voices                                                        | Materialize levels/masks/output inside each tuple; refuse active independent labels   | atomic refusal/events                                    |
| Native delay/reverb                                                  | One final generated orbit per branch, buses shared across sections; tails can persist | actual browser sends/PCM                                 |
| Inline FX                                                            | Per-note processing and release lifetime                                              | actual browser/PCM                                       |
| Fan-out                                                              | One named declaration; final native routing per branch                                | construction count/events/buses                          |
| Explicit/opaque custom routes                                        | Preserve ownership; never append an overriding orbit                                  | source/events/browser isolation                          |
| Computed duration/tuple/spread, shadowed arrange, unresolved helper  | Exact CODE, no execution to infer wiring                                              | negative source/save cases                               |
| Callback-local sections                                              | Remain CODE; #243 grammar is unchanged                                                | lexical regression suite                                 |

The footer Arrange remains the #141/#230 per-voice mask editor. It does not
restart patterns. The historical spike's 24/200 difference is historical evidence;
the new increment must independently reproduce its phase counterexample.

## Verification ledger

Implementation and independent focused source/save/events/browser/PCM checks
are complete. Full local and hosted acceptance remain pending.
Physical listening has not been performed.

Initial proof: five positive reader cases failed before implementation; ten CODE
fallback cases passed. First section suite now passes 35 cases. A new native-phase
assertion exposed the implementer assumption that pass two repeats pass one; the
pinned original yields c2 at8 and g2 at24. Expectations now come from the pinned
operation, not a timeline reset model. The first full unit pass caught a shadow
resolver variable collision introduced while generalizing stack to arrange;
existing registration regressions caught it and remain intact after the fix.

Initial browser run: RESULT passed=0 failed=2 exit=130, with one interrupted
native-creation case. Four-look field/history/selection/geometry checks completed,
and all four screenshots were inspected. Export assertion omitted the documented
factory cartridges; native creation used IN 1's wrong accessible name; Stop sampled
700ms after Stop, with no per-condition numeric diagnostics. Its combined
Stop/replacement failure cause remains unconfirmed. Export/name corrections are
harness changes. A 3s natural-decay window passed with unchanged thresholds; paired
700ms/3s diagnostics are being added to distinguish decay, scheduling and bus
cleanup under the existing Stop contract. No immediate-silence claim is made.

Current deterministic gate: `npm run check` passed **2,739 tests / 67 files and
59 guardrails**, plus reader coverage, format/skills/lint, TypeScript and build.
The Vite chunk-size warning is inherited. New snapshot entries cover only the two
new authored patches, including their explicit saved titles; no previous patch
snapshot or executable source changed.

`npm run test:browser:report -- tests/browser/sections.spec.mjs --output
/tmp/sections-focused2-results` completed **RESULT passed=3 failed=0 exit=0**.
The original/regenerated event pairs queried 32 cycles with exact values and
begin/end comparisons: 43/43 nontrivial nested/NEXT events, 128/128 native sends,
128/128 inline FX, 128/128 custom-route events and 256/256 fan-out events. All ten
PCM windows were nonzero. Custom constructions were twice per complete program;
orbits remained 7/8, native sharing remained one orbit, and fan-out used 1/2.
Two tail windows in the rested section had RMS about .0031, one retained native
bus and no new section event. Stop after natural decay was below .0001; reset
replacement had zero RMS and zero orbit entries. These are bounded observations,
not PCM waveform equality or physical listening. Stronger live-send identity and
paired decay diagnostics are refreshed in the final evidence.

The source/save audit is **90 files** (83 bundled patches, including 60 exercises
and 23 root patches, plus 7 fixtures), zero errors/failures. The new original
Changing rooms manifest member changes coverage to **303/318 calls, 33/37 voices,
21/23 CODE-free patches**, retaining all 15 old unmapped calls. The historical
294/309 denominator is not relabeled. Inventory/context provenance is refreshed
against current inputs; their original research counts remain explicitly dated.

## Current evidence and bounded limits

The refreshed focused runtime proof is [runtime.json](evidence/section-sequencing/runtime.json).
Nine original/regenerated 32-cycle event pairs retain every value and begin/end:
32 and 48 terminal-comment section/Stack onsets, followed by 43, 128, 128, 128,
256, 192 and 64 onsets respectively. All eighteen PCM windows are nonzero. The
two added pairs extend runtime coverage; library/corpus denominators are unchanged. Named opaque reuse constructs its helper once and retains orbit 7;
custom separate branches retain 7/8; native fan-out uses 1/2. The outer Voices
mask only schedules events in its playing song cycles. Actual native delay/reverb
objects and orbit count 1 persist across .75/1/.5 live duration edits, with nonzero
PCM; they do not accumulate.

[Paired Stop diagnostics](evidence/section-sequencing/runtime.json) record original
and regenerated source independently. At 700ms after Stop, 600ms windows have RMS
about .00020–.00021; at 3s they are about 3.2e-7–3.4e-7 (49,152 samples per window). The silence
threshold stays .0001. Scheduler running is false immediately after Stop, trigger
counts stay unchanged, and the same single bus remains during natural decay.
A reset replacement has zero RMS and zero orbit entries. This follows existing
[Stop semantics](playback-verification.md#reproduce): scheduling ends while notes
and tails can finish; Stop is not a hard mute. The initial uninstrumented combined
failure has [no individual numeric metrics](evidence/section-sequencing/initial-browser-failure.json),
and its exact cause remains unconfirmed. The later paired measurements are new
controlled observations, not retroactively attributed metrics.

Four current [look captures](evidence/section-sequencing/) and native creation,
nested selection/argument editing and ORDER/trivia editing captures were inspected.
A later native harness expected RATE 2→2.25, but the unchanged catalog detents move
2→3; its run completed 2/1 and the corrected native case passed 1/0. This changes
no application behavior. The source-aware ORDER/trivia duration regression did
find a product refusal: dense tuple positions were used for saved physical
sockets. Its failing-before unit probe now passes, as does native editing with
comments preserved. Exact matched calls prove socket/span remapping; changed tuple
lists forfeit ambiguous old order rather than override live source. Current
focused section tests pass 58/58, including nine tuples, fractional periods,
external source changes, repeated refs and complete sparse/incomplete state.

**Legacy representation limit.** The original synthesized
[pre-244 file](evidence/section-sequencing/pre-244-code.strudel) was generated with
the actual main `3ba7659` writer/layout modules; [the compatibility probe](evidence/section-sequencing/legacy-code.json)
records their hashes, complete old patch and current projection. Conservative
opaque-arrange routing can reject that old final-orbit provenance with
`Layout not restored: Unverifiable rack bindings or metadata`. The complete file
stays byte-exact and its arrange remains whole CODE; the saved OUT volume .23
projects as default .8, disconnected VCF cutoff 1450/res12/Vintage and saved title,
empty rows and inactive MIX level .37 do not restore. Their original values remain
in the untouched serialized file. This is not current-format full identity, audio
or PCM proof. No existing bundled patch/reader fixture contains arrange or changes
its prior audit/hash/layout; the compatibility fixture is a separate documented
probe, outside the 90-file bundled audit. The owner permits breaking old rack
representation; no speculative legacy migration or ownership expansion is added.
Unknown metadata is retained and must be explicitly replaced before rack edits;
no personal storage is cleared. The bounded reviewer is asked to assess this limit.

Physical listening, other browsers/devices, arbitrary JavaScript inference and
universal PCM waveform equivalence remain unverified. No performance claim is made.

A final source-ownership regression found that generated parentheses around a CODE
input could bind the enclosing arrange instead of its tuple expression. After an
external duration edit, a saved `note(...)` CODE input expanded to SEQ. The failing
probe now passes: wrapper-only margins select the correct native expression path,
and retained root CODE proves its full stored byte span against parsed offsets,
including leading/trailing comments. Two additional comment cases failed before
that span fix. All 122 affected section/composition/callback cases and the full
repository gate now pass **2,747 tests / 67 files plus 59 guardrails**. Existing
bundled snapshots/hashes remain unchanged; only the two new patch entries exist.
The refreshed 90-file audit and 60-module context command remain clean.

The final pre-review browser refresh completed **RESULT passed=8 failed=0 exit=0**
for the section, MIX and callback specs on the frozen production behavior. Current
captures/runtime evidence above come from that run and were inspected again.
The earlier 10/0 run also covered the complete module-exercise and prior function
loop scripts; the final complete local suite still remains after review. The
inventory was independently regenerated to a second path with byte-identical
output, the context default check and 90-file audit passed, and 308 relative links
in changed documents resolved. Main predecessor checks/browser have now succeeded
per parent verification; no predecessor main result remains pending.

## Review corrections

Round 1 found a sparse NEXT source-edit refusal: a saved three-tuple sequence
could span two sparsely populated panels while the reader projected one dense
panel. Exact-call restoration now maps the entire ordered NEXT chain, including
empty panels, instead of requiring equal per-panel tuple counts. Three exact
physical-socket edits failed before the fix. Five sparse/empty-panel cases now
pass with comments and long decimals retained; forged continuation offsets remain
invalid. Native panel editing and history passed separately in the browser, retaining
each exact literal and source comment without conversion.

Parent review also demonstrated silent musical loss from a terminal CODE line
comment at a section or nested Stack boundary. Saved identity alone passed while
the second musical input was swallowed. Seven regressions failed before a shared
lexical separator fix: first/last section and Stack inputs, nested Voices, inline
FX and NEXT. The minimal native-control fixture now emits c3,e3,c3,e3 at cycles
0,1,2,3. Its CODE suffix retains ownership across an external duration edit, with
ordinary explicit conversion offers preserved. The guard checks actual terminal
comments rather than the spelling // inside strings. Normal generated formatting
and existing bundled projections remain unchanged.

Current focused section coverage is 70/70 and the complete deterministic gate
passes 2,759/67 plus 59 guardrails. See the [bounded review ledger](evidence/section-review.md)
for independent versus supplied evidence and the outstanding round/gates. The
refreshed section/MIX/callback browser run completed **RESULT passed=9 failed=0
exit=0**. All four actual look captures plus native create/source/order captures
were inspected. The sparse NEXT native case also passed alone with its exact
before/after source and saved state recorded in [sparse-next-edits.json](evidence/section-sequencing/sparse-next-edits.json).

Round 2 independently closed sparse NEXT restoration and separator safety, but
found that an extended terminal comment could be owned only up to its old saved
prefix. Three plain/Stack/arrange CODE edits then produced syntax errors. Parent
review also combined an outside prefix comment with a duration edit and observed
unchanged CODE auto-expand. Seven musical fixtures reproduced that separate
ownership failure. Retention now proves complete trivia boundaries on both sides:
outside block/line comments stay outside CODE, and an extended comment cannot be
partially claimed. All ten failing-before cases pass, including CODE replacement,
comment preservation and save/reopen. The ordinary CODE conversion contract and
callback grammar remain unchanged. Current focused section coverage is 73/73;
the full deterministic gate is 2,762/67 plus 59 guardrails. Final browser/review
and protected merge gates are tracked in the review ledger.

The actual native CODE edit path is “Edit in source”, followed by Apply code.
Four extended/outside-comment fixtures pass with native Undo/Redo and complete
source/save identity; [before/after records](evidence/section-sequencing/code-trivia-edits.json)
retain the literal source and patch fields. The source edit is explicit: a new
supported gain expression may project as VCA; unrelated duration/trivia edits
retain the unchanged CODE. The pure rack CODE replacement tests prove the separate
explicit CODE ownership path. New harness failures and their bounded corrections
are [recorded separately](evidence/section-sequencing/review-browser-attempts.json),
without changing product behavior or PCM thresholds.

The final affected section/MIX/callback command completed **RESULT passed=10
failed=0 exit=0** after the R2 corrections. Actual four-look captures were inspected
again; native CODE/sparse-source/history artifacts and all nine runtime event/PCM
pairs were refreshed. No silence threshold or Stop semantics changed. Bounded
round 3, the full local suite and protected hosted gates remain pending.

R3 approved the tested comment cases, but parent then demonstrated the same P4
state loss for ordinary `.gain(.5)` CODE with no terminal comment. The just-started
237-test run was stopped (36 passed, two interrupted, 199 not run, exit130), so it
is not full-suite evidence. Three new plain/arrange/nested-Stack regressions fail
before the bounded correction. End equality now admits that unchanged plain
suffix while retaining exact-call fallback spans and the complete-comment/token
guards. Explicit conversion accepts an outside trivia margin without changing
source bytes or dropping its independent identity validation. Source/save state
and musical events remain distinct claims. Round 4 uses the existing review-loop
state-loss budget exception; a complete frozen local rerun remains required.

The P4 correction also aligns CODE suffix classification with the writer's first
token rather than the first character. Six owned-leading-comment variants exposed
that discrepancy before the fix. Nine plain/owned-block/owned-line cases, each
with outside block and line margins, now retain exact CODE and source/save identity.
Current sections pass 82/82; source/library/conversion/callback guards pass
556/556, with all 422 existing library cases unchanged. The full deterministic
gate passes 2,771/67 plus 59 guardrails. No corpus denominator or CODE fallback
expectation was weakened. The actual native CODE case additionally exercises the
plain no-tail variant; the complete local 237-test run still requires a restart.

Final R4 affected browser coverage completed **RESULT passed=10 failed=0 exit=0**,
including five actual native CODE edits/history fixtures, all four looks, nine
original/regenerated event pairs and separate PCM/bus/tail/Stop/replacement proof.
The literal no-tail outside-comment/duration source and full saved state are in
[the refreshed artifact](evidence/section-sequencing/code-trivia-edits.json).
The interrupted full run remains non-acceptance; bounded R4 and a fresh complete
237-test local run remain required.
