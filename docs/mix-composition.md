# MIX composition (#242)

Status: implementation and focused proof complete; full local/hosted gates and review pending. This document records the
bounded decisions for #242; the existing shipped rules remain in force until its
PR merges. #243 owns callback branching, #244 section `arrange()`, #216 larger
channel geometry, and #217 custom panels. Research proposals #248–251 are not
part of this change. The private canvas boards were unavailable; existing catalog
looks and local design exports supply the production presentation rules.

## Representation and panel

MIX remains one 12-HP Hardware module with four physical inputs in every look.
The catalog owns its visible MODE selector, default **Voices**, its input order,
and conditional controls/jacks. There is no separate STACK palette entry.

Voices is the existing virtual bus: independent labelled outputs with per-channel
level/CV, mute, solo, name, output pair and mask lane. Nested Voices levels multiply
at the final Voices boundary; transforms are applied to each leaf expression.

Stack produces one `stack(...)` event pattern. It accepts pattern, voiced and
opaque inputs; homogeneous known inputs retain their signal, heterogeneous or
opaque inputs remain unresolved (`any`). A known note-only Stack needs a sound
selector before audio-only consumers. This is event composition, not rendered
audio summing. Existing channel levels and every other strip setting are retained
as inactive state; Stack emits none of them, including the default 0.8 level.
The panel hides strip controls, More fields and unconnected Voices CV jacks.
The arranger excludes Stack panels. Inputs and OUT retain live geometry.

A switch with any connected Voices CV is refused before document acceptance.
Disconnecting it is a separate deliberate edit. Every switch validates the whole
graph and generation, including downstream signals and local-label boundaries.
Failure leaves the accepted document intact. Success enters accepted-document
history once, with the complete source and graph; Undo restores both together.
Mode changes are structural playback changes and reset global effects/buses.

## Static expression foundation

Bindings retain a top-level scope plus optional `path` steps `{call, argument}`.
`argument` is an argument index, `receiver` for the prefix of a chained call, or
`body` for a supported callback. These steps retain lexical location, exact AST
boundaries and source spans. Existing `loop` and `fx` addresses remain readable;
new static descent composes with callback bodies and ordered FX without hoisting
local identifiers. Parsing never evaluates source.

Plain `stack(a,b)` and `a.stack(b)` become Stack panels. Source spelling and
comments stay exact until an explicit structural rewrite; the writer emits the
canonical direct form. Nested groups remain separate graph boundaries. A `const`
definition is retained as one named output even with one use, so reused opaque
helper calls are constructed once. Named dependencies emit before their users.
Scalar edits splice only the proven literal, including repeated identical inputs.
Changed ambiguous containing expressions do not acquire old identities by ordinal.
Saved CODE remains CODE until an explicit conversion proves ownership.

Empty Stack writes `stack()` (silence); one input retains `stack(input)`. Sparse
sockets emit connected inputs in catalog order, while metadata retains the exact
socket numbers, IDs and disconnected state. More than four imported inputs use
three inputs plus a continuation Stack in socket four, recursively. `part` binds
each continuation to its first original input; no argument is discarded. Canonical
nested syntax can differ from an imported variadic spelling, while the retained
source remains byte-exact. No larger panel geometry is introduced here.

Stack ends a nested Voices path: its folded levels, CV, masks and output pair are
materialized inside the group. They cannot move past a post-Stack setter. A nested
Voices path with an active label/name/mute/solo is refused because independent REPL
labels cannot be faithfully embedded into one expression. Keep that Voices bus
outside Stack or clear those controls explicitly. Stack inside Voices is one
channel and retains the outer channel's label and lane.

## Routing contract and case matrix

A rack-owned Stack is one final event expression and receives one generated orbit
per final branch. Native delay/reverb events in that group share that orbit's send
buses; their parameters are event settings, not an audio mixer. Voices final
branches retain separate orbits. Inline FX remain per-note stages. Fan-out of a
Stack defines it once and applies each branch's transforms and final routing to
that reference. Explicit source-owned inner routing remains inside its argument;
no overriding orbit is appended to a Stack containing opaque CODE. Literal inner
orbits reserve their addresses; a matching event field does not grant ownership.

| Case                                             | Representation / result                                  | Independent proof                                                                            |
| ------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Pattern inputs → Stack → OSC                     | One group before sound selection                         | reader/source/save; pinned events; Chromium modes/geometry/Undo/pointer patching/Export/Open |
| Voiced inputs → Stack → FX/OUT                   | One group, shared final send orbit                       | reader/source/save; events; Chromium send objects + nonzero PCM                              |
| Mixed known or CODE inputs                       | Explicit unresolved group; CODE stays exact              | graph/source/save; explicit/custom routing source/event/PCM cases                            |
| Empty / one / sparse / seven inputs              | Explicit group and continuation panels; sockets retained | reader/source/save; sparse graph/save regression                                             |
| Stack → Voices                                   | One labelled channel, independent outer controls         | labels/source/save; Chromium modes/geometry/Undo/pointer patching/Export/Open                |
| Voices → Stack                                   | Materialize settings inside group; refuse active labels  | pinned events + atomic refusal regressions                                                   |
| Connected CV → switch                            | Refuse atomically; no hidden live cable                  | model regression; Chromium modes/geometry/Undo/pointer patching/Export/Open                  |
| Note-only Stack → switch to Voices               | Refuse incompatible pattern input/downstream signal      | model regression                                                                             |
| Valid switch                                     | Unity Stack; inactive settings retained; one Undo step   | model/history; Chromium modes/geometry/Undo/pointer patching/Export/Open                     |
| Direct/chained/static nested + named fan-out     | Exact lexical paths, one shared definition               | reader/source/save; pinned events                                                            |
| Inner gain/mask/channels + outer setters         | Preserve scope/order/repeats; never fold across Stack    | pinned events including postgain .3/.7 → outer .5                                            |
| Native sends / inline FX / explicit inner orbits | Sharing and isolation follow above routing contract      | pinned events; Chromium send objects + nonzero PCM                                           |
| Computed/spread/shadowed or callback branching   | Exact CODE; no execution to infer wiring                 | reader/source/save; registration/receiver/prototype shadow negatives                         |
| Forged paths / old source metadata / saved CODE  | Conservative refusal/preservation                        | forged-path and saved-CODE regressions                                                       |

## Verification record

The first focused run reproduced five failures for direct/chained/nested groups,
named reuse and second-identical-input editing. Those six initial tests then
passed, followed by empty/single/seven-input and atomic switch/history cases.
Pinned-engine fixtures compare complete onset values/times separately from exact
source and saved graph identity. Generator-owned orbit allocation is separately
asserted rather than counted as a music-equivalence field; explicit source-owned
orbits compare unchanged. The [runtime evidence](evidence/mix-composition-runtime.json) records Chromium
156.0.8078.4 / Node 24.22.2, five original/regenerated case pairs, eight onset
events per form, complete event values and PCM windows. Native Stack used orbit
1; Voices used 1/2; explicit and custom routes used 7/8; inline FX created no
native delay/reverb buses. Original/regenerated RMS was nonzero in all ten
windows (0.00496–0.00736). A mode-only replacement removed the old second bus;
a live level edit retained the new shared bus and RMS 0.01350. Stop ended the
clock and reached RMS 2.17e-8 after bounded tails; empty replacement reached zero
PCM and zero orbit objects. The custom helper ran exactly twice per form, not
once per query/use. This is measured output and routing evidence, not bitwise
PCM equality, physical listening or an arbitrary-helper purity guarantee.

Focused `npm run test:browser:report -- tests/browser/composition.spec.mjs` passed
with `RESULT passed=2 failed=0 exit=0`. It uses native radios/Undo/Redo, keyboard
editing of the second nested input with exact comments, pointer fan-out/Undo,
real Export/Open, all four Hardware looks and live cable endpoint assertions.
Export adds the existing factory cartridges; every pre-existing rack field is
compared independently. [Panel screenshots](evidence/mix-modes/) were inspected
in every look. The new mode row initially displaced channel four; its dedicated
geometry guard failed with a 132.90625-px row offset before the CSS fix and passed
with all four strips aligned. The initial harness-only focus/API/detent/export
expectations were corrected without changing product contracts or thresholds.

`node scripts/mix-library-audit.mjs --check` covers **81 bundled patches plus
7 reader fixtures**, 88 files total, all with validated layout, exact source/body
and complete save/reopen identity. See [audit data](evidence/mix-library-audit.json).
The new `pre-242-mix.strudel` fixture retains the complete former exercise. Tests
compare every former module/state field except the intentional melody split, and
all untouched cables; pinned events independently prove unchanged music. The
MIX exercise is the sole rebuilt bundled body. Other library bodies/attribution
are unchanged. Trance's generated-projection digest changes because opaque `o`
is recognized as potential source-owned routing, so generation adds no override;
its retained original source and projection digest remain unchanged.

The repository gate passed with 2,632 unit cases and 59 guardrails before the
final literal-`o` reservation regression; final full-gate and full-browser results,
model review and hosted gates will be recorded before completion. Physical
listening has not been performed.

The coordinator's pinned gain counterexample was inspected in its original
`work/mix-stack-gain-counterexample.json` (core 1.2.6, eight events over [0,4),
outer postgain .5 versus incorrect .15/.35 leaves). The production regression
reproduces that distinction without inferring PCM from the event values.
