# User-defined modules: registration wrappers and subpatches (#247)

Research disposition, 9 November 2026: **go for a bounded original-call wrapper
in [#217](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/217)**.
`register()` supplies a Pattern method and curried function, not a rack module,
control schema, isolated instance, safe parser, or portable package. Keep macros
and a hybrid as later proposals. This study ships no production panel, reader
adapter, MIX change, catalog consolidation, or patch-format extension.

## Authority and scope

The owner explicitly directed: “$orchestrate the work of that tracker ticket.
Full send on the items being worked. For the research, feel free to run those
in parallel if it makes sense. For the others, I'll leave the parallelization
to your discretion.” The authorized plan is on
[#241](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/241).
This wave owns [#247](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/247),
feeding the still-open implementation #217. Recommendations here do not adopt a
new product direction. Owner-selected dual-mode MIX remains #242; #216 owns
larger mixer geometry. No active users permits rebuilding repository-owned rack
representations, not changing music/attribution, deleting personal storage, or
dropping exact unsupported source. No such rebuild is needed by this research.

Inputs read: #247/#217 and their discussion (none at the initial read), #46's
exact requested script, #78's explicit saved-CODE conversion, #241's execution
plan, module/catalog/types, translation, patch format, design, engine and recovery
contracts. The private design boards were unavailable; this is a nonvisual study
and makes no panel-layout observation.

## Evidence and reproduction

Application base: `d9f06ddc12b135221eec247150c23cce0dadf6c3` (PR #240).
[Runtime results](runtime-results.json) record the actual application revision,
lockfile, fixture, prototype, runner and experiment hashes, installed versions,
full queried onset values/times, assertions summarized below and limits. The
research scripts were additional working-tree files at that revision; their
hashes, rather than the application revision alone, identify the experiment.

- Node **24.22.2**, npm **11.19.1**, Chromium **156.0.8078.4**.
- `@strudel/web` **1.3.0**; core/mini/tonal/transpiler **1.2.6**;
  superdough **1.3.0**; Acorn **8.19.0**; Playwright **1.64.1**.
- Lockfile SHA-256 `655b6afecb8b5e2087cafc1dd40cbe223b1cceef4df86509c6fcb4e03567d92d`.
- The exact [bundled fixture](../../../src/library/patches/switch-angel-trance-demo.strudel)
  retains SHA-256 `4c619da7a683db3f67b544b1ac01d2c53fa6c8b2681cfcfe875395e6d58bb997`.
  Attribution remains Switch Angel/cosimo, as in [#46](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/46).
  Do not substitute the later live gist variant.
- Pinned source: `node_modules/@strudel/core/pattern.mjs:1605–1694`,
  `register`, SHA-256 `d562fa5f23ad204588d343165ed02376b5874ca74280c248dfe87b56738c0abd`.
  The npm lockfile's integrity identifies the distributed package. These are
  installed-source observations, not claims about current upstream documentation.

```sh
npm ci
node --test docs/research/user-defined-modules/prototype.test.mjs
npm run check
# Inspect occupied ports first. Use a free port; never kill a peer's server.
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
# In another terminal, with Playwright Chromium installed:
node docs/research/user-defined-modules/runtime.mjs http://127.0.0.1:5187 /tmp/register-results.json
```

The [prototype](prototype.mjs) imports only Acorn and has no evaluator, network,
React, browser or audio dependency. Six [behavior tests](prototype.test.mjs)
cover exact blocks, unused definitions, source-only edits, computed/pattern
arguments, shared definition identity, ambiguous registrations, stale bindings
and exact research-envelope reopen. The setup/body sentinel remains zero after
discovery. These tests are an explicit research command, outside the normal
Vitest manifest; `npm run check` still lints/formats these files.

The [controlled program](runtime.strudel) and [runner](runtime.mjs) execute only
repository-owned fixtures through the existing `src/strudel/engine.ts` `play` /
`stop` boundary in fresh Chromium contexts. Autoplay permission is enabled for
this adapter experiment. Querying events happens in explicitly submitted setup;
the scheduled pattern is `silence`, volume zero. This does not expose arbitrary
import evaluation through discovery or the production cable probe.

Observed assertions:

| Claim                              | Evidence/result                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact imported source              | Existing `read`/`generate` retains the bundled source; saving layout retains the same executable bytes.                                                                                                                                                                 |
| Existing complete saved rack       | `saveLayout` then `read` reports restored; deep equality checks every module/value/look/position/name/cable and other patch field (29 modules). This is the existing CODE rack, not new custom panels.                                                                  |
| Discovery identity/persistence     | Four exact definitions, seven candidate member calls; unused `rhpf` creates no call. `research-247-1` JSON round-trip restores all definition/call identities and argument source. Forged ranges/versions are refused.                                                  |
| Argument edit                      | Only the first `.rlpf(0.539)` argument becomes `1.25`; definition bodies, other instance values and `.o(2/3/4)` bytes remain exact. No clamping to the suggested 0–1 display range.                                                                                     |
| Edited pinned events               | That first supersaw cutoff changes from `(12*.539)^4` to **50625**; every other queried event field/time remains deep-equal.                                                                                                                                            |
| Exact fixture event compatibility  | Four-cycle onset counts **16 / 76 / 76 / 64**; supersaw cutoffs match supplied `rlpf` arithmetic; orbit fields remain absent / 2 / 3 / 4. Both real block bodies, including `console.log(x)`, execute unchanged.                                                        |
| Forwarding/pattern/computed inputs | Gain `.4`; pattern gains `.25/.75`; computed `.25*2` gives `.5`. Aliases produce equal queried events.                                                                                                                                                                  |
| Shared state                       | Two pure-argument calls return gains **1 and 2**, requerying the first retains **1**. Patternified query-time calls advance **[1,2] → [3,4]** on a repeated query.                                                                                                      |
| Redefinition/lifetime              | Already constructed pattern and captured old returned function keep gain `.2`; a new method call uses replacement gain `.4`. Stop and a submitted program without that registration leave the method installed; page reload removes it.                                 |
| Subpatch/callback comparison       | Explicit `macro247(input, level, cutoff)` and registered `compound247` give identical events for the tested input; `.off(.25,x=>x.forward247(.5))` equals the native gain callback. Explicit separate state factories give **1/1**, unlike shared registration **1/2**. |

No PCM was sampled and no physical listening occurred. No custom panel,
keyboard/configuration/Undo UI, live knob behavior, scheduling continuity,
per-instance DSP lifetime, sound quality or cross-browser compatibility was
observed. `getClock().running === false` after Stop is adapter state evidence,
not a new measurement of tail silence. Existing dated [trance playback evidence](../../trance-demo.md)
is separate from this experiment. No full local application suite is needed for
these docs-only research paths; no production `src/`, dependencies or browser
runner changed. Hosted Full browser suites remains a pre-merge gate whenever it
runs. See the [review ledger](review-ledger.md) for final checks/revisions.

## Pinned API: syntax and semantics

The function's JavaScript `length`, not the names of parameters, decides arity.
The final parameter receives the incoming Pattern when invoked as a method.
Names such as `pat` or `x` carry no type guarantee. The body must actually return
a compatible Pattern for patternification to work; synchronous syntax alone
cannot prove that. A helper can ignore its receiver and construct a new source
(the probe changes sine to triangle), so registration cannot establish
passthrough, audio, source/transform or CV semantics.

| Form                                                                   | Pinned API                                                                                                                                                         | Recommended first #217 subset / prototype disposition                                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register('name',(a,p)=>p.gain(a))`                                    | Installs `Pattern.prototype.name`, `strudelScope.name`; returns a curried function.                                                                                | Direct top-level literal single name, sync arrow/function with simple named parameters, exact method-call arity. Prototype examines labelled top-level receiver chains only.             |
| Synchronous block body                                                 | Supported, including side effects and captured names.                                                                                                              | Preserve the entire body; analyze only bounded forwarding/arithmetic facts. Exact `rlpf` and `trancegate` blocks are primary cases. Body is never replaced with a generated expression.  |
| `register(['a','b'], fn)`                                              | Recursively registers aliases and returns an object of returned functions.                                                                                         | Proven runtime; defer discovery of alias arrays in first prototype. Exact CODE until alias collisions and scope identity are established.                                                |
| Two-parameter helper with multiple method inputs                       | Special case sequences inputs instead of rejecting them. The probe needs two incoming onsets to observe both values; a single onset observes the first.            | Exact-arity calls only initially; do not infer extra independent panel parameters from this convenience syntax.                                                                          |
| Other wrong arity                                                      | Method throws; tested two explicit arguments plus receiver expects two inputs.                                                                                     | CODE with arity explanation. Receiver is never exposed as a numeric argument.                                                                                                            |
| Defaults/rest/destructuring                                            | JS `length` stops at a default/rest. `(a=.5,p)` has length zero and the tested method call expects **−1** inputs.                                                  | CODE; do not treat a JS default as a usable panel reset or reconstruct a signature.                                                                                                      |
| Pattern/string/computed argument                                       | `reify` then patternify; pure values use the immediate path, patterns can invoke the callback during queries with inner-join semantics.                            | Preserve full expression AST/range/text. Only literal numbers qualify for prototype numeric gestures; explicit text editing remains possible.                                            |
| `patternify=false`                                                     | Still reifies inputs; probe receives an object with `__pure=.6`, not a JS number. Underscore methods call the original function without the wrapper's reification. | Additional options and underscore variants remain CODE initially; do not advertise false as ordinary scalar arguments.                                                                   |
| `preserveSteps` / custom `join`                                        | Further register parameters affect step/join behavior in pinned source.                                                                                            | Source-inspected only; no runtime assertions here. Preserve exact CODE, scoped unresolved until tested.                                                                                  |
| Standalone/curried returned function                                   | Last argument is an explicit receiver; curry may return another function.                                                                                          | Runtime capture of old returned function tested. Root/partial-application calls, variable-returned registrations and sources remain CODE in prototype.                                   |
| Async/generator, dynamic name/function, nested registration, shadowing | General JS can produce effects the parser cannot infer.                                                                                                            | No imported execution. Prototype declines nested/direct-unsupported registration environments and simple `register` shadows; general lexical/effect resolution is explicitly incomplete. |
| Captures / nested calls                                                | Lexical dependencies and global mutations are ordinary JS; may occur at construction, query or trigger time.                                                       | No inlining or purity/isolation guarantee. Preserve setup/order; annotate unknown dependencies.                                                                                          |

Prototype `candidate` means **syntax candidate only**, not “safe to project into
a rack.” For example, a separate setup statement may overwrite a prototype or
an unresolved body may do so when queried. The prototype deliberately does not
implement general lexical resolution, effect analysis, built-in collision
detection, computed member calls, named reuse or nested callback discovery.
It must never be wired into automatic production conversion. #217 must add a
conservative scope/binding resolver and reject unresolved mutation/shadowing,
including aliases/destructuring/reassignment and competing built-in names.
The exact `o` fixture is source-owned custom routing even though its body can be
recognized as forwarding to `.orbit`. It grants no generator route ownership.

## Three models compared

| Model                   | What an instance owns                                                                                                               | Good first use                                                                                         | Cost/risk and disposition                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original-call wrapper   | One exact call and its argument slots; shared patch-local presentation definition. The original setup/function owns behavior/state. | Imported `.trancegate(1.5,45,2)`, `.rlpf(.539)` with **Edit controls…**.                               | Smallest path to #217. Retains side effects/order; cannot promise isolated instances or internal editable rack. **Recommend first.**                                                                              |
| Reusable subpatch/macro | Explicit graph body, input/output ports, parameter-to-node bindings, instantiation policy and local IDs.                            | An authored gain+filter chain with input Pattern, output Pattern, bindings `level→gain`, `cutoff→lpf`. | Needs graph encapsulation/hygiene and source provenance; captures/state cannot be recovered automatically from arbitrary register bodies. **Defer production.**                                                   |
| Hybrid                  | Original opaque call by default; optional independently authored/proven macro descriptor for supported definitions.                 | Same panel UI for a trusted helper and a future explicit subpatch.                                     | Shared presentation descriptors are useful, but automatic expansion loses side effects, captured state and source identity. Require an explicit operation and separate proof. **Later, no automatic conversion.** |

Concrete compared executable code is in `runtime.strudel`:

```js
const macro247 = (input, level, cutoff) => input.gain(level).lpf(cutoff)
register('compound247', (level, cutoff, pat) => {
  return pat.gain(level).lpf(cutoff)
})
// Both tested for s('sine*2'), level .4, cutoff 800.
```

That event equality proves this stateless operation for this fixture, not
arbitrary helper expansion or audio equivalence. Repeating/fanning out a macro
must preserve each original node's order, omission and independent bindings.
An explicit factory can create local state; one register function shared by two
calls does not. JSON must never serialize live closure objects or claim it can
resume them. Adding a panel does not sandbox trusted executable source.

## Proposed definition, instance and binding contract for #217

This is a design recommendation, not an adopted on-disk format. Keep existing
`Family`, `JackSignal`, control presentations, fixed HP and source binding paths.
Do not create a fourth family or a new signal type taxonomy. Compile patch-local
presentation descriptors into the existing renderer through a registry; the
built-in catalog remains authoritative for built-ins and suggestion rules.
Dynamic definitions must not register their method names into the global
built-in ownership table.

Recommended saved records:

- **Definition:** stable opaque `definitionId`; explicit schema revision;
  lexical scope identity; exact registration/setup dependency snapshot plus AST
  descriptors; literal method name; receiver index; ordered parameter IDs and
  names; body/signature fingerprints; fixed `hp`, family and presentation controls.
  A digest detects change, it does not prove uniqueness or identity. Same name
  or identical bodies in two scopes must never merge by hash/name alone.
- **Instance:** ordinary stable module ID/layout/look plus `definitionId` and
  source binding `(scope, nested path, call, argument index)`. Independent current
  values come from each call's AST/source, never from another instance. Use the
  #242 address extension once settled; do not fork `loop`/`fx` path semantics.
- **Argument:** distinguish `{kind:'number', value, source}` from
  `{kind:'expression', source}` (selectors also retain exact literal mappings).
  Range/step/reset metadata belongs to presentation, outside executable current
  values. Expressions never become numbers because a knob was selected.
- **Metadata provenance:** separate `author/user` settings, proven `analysis`
  facts with source evidence, and optional `suggestion` descriptors. Free-form
  comments, parameter names and one call value are not machine constraints.
- **Port descriptor:** initially one receiver and returned Pattern using
  existing CODE/unknown signal treatment. Known forwarding can document a role;
  arbitrary bodies cannot promise audio output or arbitrary typed jacks.
  `cvTarget` is not generated from a parameter name. New custom CV wiring is
  outside #217. Explicit multiport macro ports/bindings are a later schema.

Validation must reject unknown versions, duplicate IDs/slots, out-of-bounds or
mismatched bindings, nonfinite numeric presentation settings, min≥max, step≤0,
invalid family/look/HP, duplicate selector choices, unmapped toggle/dropdown
literals and executable reset expressions outside the selected value type.
A range may guide dragging; existing values outside it remain visible and
editable without clamping/rounding. Require an explicit reset mapping/value;
absence disables reset rather than copying today's call as a default. Reset is
an intentional value edit, not a JS function default or automatic omission.

For `rlpf`, analysis can show `(12*x)^4` cutoff mapping (not linear Hz input).
A user can choose display 0–1; the tested 1.25 is not invalid JavaScript and stays
50625 Hz in queried events. For `trancegate`, forward roles through `rand.mul`
and `.rib(seed,length)` only as far as the pinned call semantics establish:
density includes 1.5; offset/loop length are cycles, not evidence that the
argument called seed is integer-only. `console.log(x)` remains in the block.
`o` stays an opaque routing call regardless of configured label/selector.

### Reconciliation, editing and lifecycle

The prototype's envelope is intentionally more conservative than a production
resolver: the entire source revision must match for an edit; IDs use ranges and
survive only exact reopen. A range is an address, not stable cross-edit identity.
`editArgument` splices one validated expression and rediscovers all bindings;
`reopen` independently rederives discovery rather than trusting stored ranges.
No production trailing rack fields are added. The production proposal above
needs stable IDs and independently validated snapshot ownership, not this
research envelope. Definition/control/instance persistence for real panels,
invalid metadata, actual Undo and live edits remain #217 acceptance work.

On production import, establish only unambiguous definitions and call ownership.
Unused definitions have no instances. Saved CODE is retained until the explicit
#78 conversion model is invoked. A fresh supported import may show its panel;
configuration cannot convert an ambiguous call into a safe binding.

Configuring/applying/cancelling changes presentation only. An argument edit
changes its exact slot only. Accepted-document history records both types of
edit, shared definition settings and independent values together; Undo restores
the old source/settings/identities and never starts stopped playback. Reopening
restores validated metadata while stopped, not captured runtime state.

Definition/signature edits invalidate affected bindings and control mappings.
Offer an explicit reconfigure/rebind from the new source; preserve old metadata
until the existing invalid/unknown-metadata replacement policy permits change.
Do not move values to another parameter by name or ordinal after a signature
change. Duplicate/redefined names or unresolved shadowing fall back to exact
CODE with local reasons. An unchanged independently proven scope can retain
identity; reordering ambiguous same-name calls cannot. No automatic migration
based only on a body hash, current argument values or screen position.

Evaluation/replacement retains global registrations. Stop cannot remove them or
undo captures/side effects. #217 must not promise otherwise or install a competing
registration manager. Closed source documents without their definitions must
remain unresolved even if a prior program left matching methods in the page.
Playback still follows [engine recovery](../../audio-recovery.md); a reload is
an explicit recovery boundary, not automatic hidden evaluation during import.

Fixed-per-definition width means every instance of that definition uses one HP
in every family look. Initial HP can be deterministically chosen from a bounded
supported argument count, then saved; changing control presentation should use
More/scroll rather than silently widening neighbors. A future explicit width
change must validate all instance placements atomically and refuse overlap or
rail overflow. Cables follow live jack positions. This is a recommendation;
no panel, width or hit target was rendered/tested here.

## Authoring, encapsulation and portability

First flow: import/configure existing helper, as #217 already requests. Discovery
is deterministic and local; no AI/network suggestions or live execution are
needed. A later **create from code** flow can accept explicit sync helper code
and metadata, parse it, preview the intended call and preserve dependencies;
validation is not a sandbox. It should reuse #217's definition schema rather
than introduce a second authoring panel format.

Encapsulating selected rack modules is a different later operation: select a
closed subgraph, enumerate boundary inputs/outputs and parameter targets,
reject crossing state/routing/feedback dependencies, retain internal IDs/order
and provide an exact source/graph/event proof. #242's nested-expression/MIX Stack
must stay one combined Pattern when appropriate; do not flatten a callback-local
stack into independent final voices. #243/#244 retain their own scopes. A future
hybrid may display this explicit subgraph behind the same UI, but cannot infer it
from arbitrary register body text.

Whole-patch portability today means exact definitions, setup order, immutable
and mutable capture declarations, dependency/import/sample URLs, attribution
and calls travel together as source; external resources still need availability.
A helper fragment referencing `base247` is not self-contained merely because it
has an argument panel. Closure values are neither dependencies to inline nor
serializable state. Patch-local identity should be namespaced by document;
copying two same-name helpers into one patch needs explicit collision resolution,
not silent replacement/global registration by opening a file.

A later portable module package would need an explicit versioned source/dependency
manifest, licensing/attribution, engine compatibility, public name/version/identity
policy, update consent and deterministic collision handling. Pin definitions and
dependencies per imported patch; never silently update another patch's helper.
Reject unproven extraction while allowing complete-file export. No hidden AI,
network registry, closure snapshot, cross-patch sharing or package manager is
needed for #217. Broader authoring/encapsulation/packaging remains deferred;
this report does not launch their implementation or require their adoption.

## Coordination and acceptance disposition

#245 owns the API inventory, whose committed schema is
`docs/research/strudel-api-coverage/schema.md`, schema v1 with family
`api:register`. Its export/prototype/source-only/app-override distinctions agree
with the source/runtime split above. This study adds helper-specific semantics;
a literal registration count or catalog match is not proof of a sound backend.
#246 owns whole-catalog context/consolidation; this study preserves current
context and order and proposes no consolidation. Final links/reconciliation are
recorded in the review ledger after those commits are available. Neither study
is a blanket prerequisite for #217 or #242.

All #247 research deliverables are represented here: bounded executable
prototype; pinned API and syntax dispositions; three-model comparison; exact
required fixtures including block bodies, expressions, duplicate/signature edits,
shared mutable state and subpatch; independent source/reopen/events evidence;
proposed schema/control/jack/geometry/history/lifecycle/portability contracts;
explicit unresolved forms and production limits. #217 retains the complete
production UX/browser acceptance. The existing module/translation/patch/design
specs link this research boundary without treating the proposal as shipped.
Scoped issue linkage and final verification/review/merge references are in the
[ledger](review-ledger.md).
