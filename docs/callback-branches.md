# Local callback branches (#243)

Status: implemented, bounded review approved, repository gate and complete local
browser verification passed. Hosted acceptance and protected merge history are
recorded on [#243](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/243). This contract deliberately
replaces #135's chain-only rule, using the actual merged #242 Stack model. #244
sections, #217 custom panels, #216 larger geometry and #248–251 remain separate.

## Bounded grammar and ownership

```text
callback       := identifier => expression
expression     := local-reference + supported receiver transforms
                | stack(expression, ...) + supported receiver transforms
                | expression.stack(expression, ...) + supported receiver transforms
                | (identifier => expression)(expression)
```

Every arrow is synchronous, single-identifier and expression-only. The last form
is a bounded lexical value binding, not arbitrary function evaluation: its value
is constructed once and its references resolve within the same callback owner.
Nested supported function-loop transforms introduce their own parameter/owner.
Bindings may compose and keep original names. Duplicate sibling branches are
intentional musical copies; shared transforms are single constructions, not
silently duplicated text. `superimpose` retains the original independently of its
body: `x => stack(x.fast(2), x.rev())` means original plus both added branches.
`layer`, CHUNK timing variants and unrelated aliases are not newly mapped.

SEND fans out, transforms may share their outputs, and Stack recombines them into
the owning RETURN. The graph derives scope in both directions, so RETURN-side
incomplete graphs retain function signal/ownership too. It rejects wrong-owner
returns, cross-scope pattern edges, recursive containment, ordinary cycles,
Voices MIX, OUT, source/OSC/SMPL and modulation-utility pattern members. Existing
CV attachments retain modulation signal. Missing RETURN or a broken connected
arm uses the parent's preset; disconnected sockets do not invent arms. Complete
nonempty bypassed chains retain identity. Existing chain loops and JUX presets
remain supported.

Captured immutable/global patterns are **not** projected as local pattern cables
in this increment. They remain exact CODE, including otherwise static `const`
references. Other-owner captures, computed/spread/shadowed forms, source creation
inside the callback, async/block/multiple/default/rest/destructured parameters and
arbitrary callbacks also retain CODE. An unreadable receiver suffix remains exact
with its original identifiers. An unsupported branched body falls back as a whole
call. Empty local Stack and aliases of an existing local reference also remain
CODE; lexical value bindings require a fresh supported transform output/name. Saved CODE stays CODE until explicit conversion. Discovery never executes
source or attempts to infer runtime wiring.

Local output names use existing `Patch.names`, scoped to their owning callback;
separate owners may reuse names. SEND cannot be named. Renaming a local output
referenced by opaque CODE is refused until those identifiers are edited explicitly;
new generated names avoid identifiers in nested opaque suffixes. New shared transforms use
collision-checked local identifiers and expression applications; they never emit
global `const` declarations. Local Stack uses the same conservative opaque-CODE
routing rule as global Stack, retaining hidden/custom orbit ownership. Native
postgain and Voices' virtual levels retain #242's distinct behavior.

## Source, persistence and editing

The v1 marker/envelope remains; no storage migration/clearing occurs. Existing
callback `loop` and Stack argument/receiver `path` addresses compose. Applied
local binding values/bodies add `argument: "value"` / `"binding"` at `call: 0`.
Each step validates the exact expression shape before resolving. Saved snapshots,
independent reader ownership and regenerated semantic equality gate restoration.
Unsupported/forged paths cannot grant source ownership.

Scalar edits splice the exact local literal. Source parameter renames reparse in
lexical context. Imported rewiring uses existing rack conversion with Undo;
accepted-document history retains source and full patch together. Reconnect,
delete, incomplete graphs, inactive Stack strip controls, complete OUT settings,
all names, positions, looks and disconnected state remain export/reopen identity.
No new cable renderer, module type or geometry is introduced. The sketch shown
before implementation was SEND → direct/REV branches → MIX Stack → own RETURN.
The private canvas boards were unavailable; existing local design exports and
production looks supplied the reference.

## Acceptance and proof matrix

| Requirement                                                                      | Proof                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Both examples, nested branches, continuation inputs and sharing                  | `src/modules/callback-branches.test.ts`; engine/browser matrix                                                                          |
| Owner-local DAG, scope isolation, correct returns and invalid signals            | Mutation regressions plus native keyboard invalid-return and Voices rollback                                                            |
| Branch literal edits, parameter renames, reconnect/delete and incomplete returns | Pure document/model/history tests; native pointer/keyboard patching, shared naming, Undo/Redo and Export/Open                           |
| Original/regenerated event values/counts/times across eight cycles               | Pinned core/mini unit fixtures and actual engine-boundary captured Pattern queries; superimpose 16 original + 32 fast + 16 reverse = 64 |
| Exact source and complete saved state independently                              | Exact `generate(document)`/body assertions plus deep complete-patch reopen checks                                                       |
| Nested selection and source mapping                                              | Native ITER selection/highlight, isolated nested literal edit and actual screenshots                                                    |
| Playback/live edit, failure rollback, Stop/replacement and PCM                   | `tests/browser/callback-branches.spec.mjs`, `scripts/callback-branches-check.mjs`; runtime JSON                                         |
| Deliberate spec replacement and limits                                           | Translation/module/format/design/decisions/build-plan updates; conservative fallback matrix                                             |

## Verification ledger

Initial focused tests failed seven intended cases because all five branch forms
were CODE and local sharing/wiring could not be reached. Those cases passed after
the implementation. An old test asserting fan-out rejection was deliberately
replaced with incomplete fan-out persistence while keeping cross-return/recursive
rejections. Deeper tests reproduced a global-uniqueness error for duplicate names
in independent callbacks and required opaque routing protection at local Stack.
Both have focused regressions. The first full unit run passed 2,652 cases before
the additional scope/edit/effect cases were added.

The first focused browser run completed `RESULT passed=1 failed=2 exit=1`:
mode refusal correctly left a radio unchanged while the harness used `check()`,
and insertion-order JSON comparison incorrectly rejected complete identity. The
harness now uses a real click for the refused radio and canonical object-content
comparison, retaining array order. The second run completed
`RESULT passed=2 failed=1 exit=1`: the routing expectation omitted JUX's original
left branch on default orbit 1. The corrected assertion requires both original 1
and transformed 7; no product restriction was relaxed.

Final commands/results, runtime artifact, screenshots, library reconciliation,
reviewed heads and hosted merge evidence will be recorded after completion.
Physical listening has not been performed. PCM establishes tested output and
cleanup, not subjective sound quality or universal audible equivalence.

Self-review additionally reproduced stale opaque-name references after rename,
accidental capture by an introduced name in a nested CODE suffix, and a discarded
CV resolution after unsupported-branch rollback. Focused regressions failed before
their fixes and pass afterward. A local parameter named `sine` in a branch CV
argument initially became an invented global LFO; the per-call local-reference
guard now retains that suffix as CODE. The initial full browser run was stopped
intentionally at about 40/232, exit 130, before applying that fix; it is not passing
evidence. The full suite is restarted on the corrected frozen revision.

A second targeted preservation probe found that exact saved CODE reopened safely,
but an unchanged local `.stack(x.rev())` CODE suffix expanded after an unrelated
outer sound edit. The focused regression failed with no CODE remaining. Static
Stack projection now respects any saved CODE span containing that call, and saved
CODE ownership is checked before the local-argument fallback. The same regression
passes with exact executable bytes and complete subsequent save/reopen identity.
The second local full run was stopped intentionally at 122+/232, exit 130; it is
also not passing evidence. Bounded review precedes the final restarted full run.

## Current focused verification

- `npm run check`: 2,670 unit cases / 65 files and 59 guardrails passed before the
  two additional direct rack-build fixtures; the final gate is refreshed below.
- `npx vitest run src/modules/callback-branches.test.ts`: 34/34 pass. Both issue
  examples are built with individual placement/control/cable operations as well
  as imported and edited. CLOCK is explicitly Multiply, groove off and offset 0
  for the unshifted `fast(2)` example; its normal .125 offset is not changed.
- `npm run test:browser:report -- tests/browser/callback-branches.spec.mjs tests/browser/suites.spec.mjs -g 'callback branches|local Stack|original and regenerated callbacks|function-loops-browser'`:
  `RESULT passed=4 failed=0 exit=0`, including the entire earlier #135 runtime
  script. Native capture readiness then dismissed the output-destinations popover;
  the affected native case passed 1/1 without production changes.
- Final focused rerun with `--output /tmp/callback-focused-results`:
  `RESULT passed=3 failed=0 exit=0`. [Runtime evidence](evidence/callback-branches/runtime.json)
  records all eight-cycle values/counts/begin/end times for both forms. Default
  orbit absence is normalized to the engine's orbit 1 in these comparisons;
  explicit/custom orbit 7 remains a compared event field. All six original and
  regenerated forms have nonzero PCM. Custom helper construction is exactly once,
  JUX has both orbit 1 and 7, and Stop/replacement RMS and peak are zero.
- [Panel captures](evidence/callback-branches/) were inspected for all four
  Hardware looks, full-width mode rows and retained jack geometry, plus a clear
  shared-transform naming capture and native nested selection. A transient
  destinations popover was dismissed before the refreshed captures.
- `node scripts/mix-library-audit.mjs --check`: 88 files, zero errors/failures.
  No bundled body/attribution or saved library rack needed rebuilding. The
  inventory's bounded callback example and current application hashes were
  refreshed; historical context research keeps its dated evidence with an
  explicit pointer to this replacement contract. 295 relative Markdown links in
  changed documents resolve to existing files.

Physical listening remains unperformed. Live PCM windows establish output and
cleanup, not waveform equality, subjective continuity or other-device coverage.

The refreshed complete repository gate passed **2,672 unit cases in 65 files and
59 guardrails**, plus format/skills/lint, reader coverage, TypeScript and production
build. The existing Vite chunk-size warning remains. The 34-case branch suite
includes both direct rack builds; no production behavior changed for the screenshot
readiness or explicit CLOCK fixture setup. Bounded review and the final complete
local/hosted browser gates remain pending.

Local bindings used only through opaque CODE, nested captures, or not used by the
result stay whole-call CODE so conversion cannot discard their construction or
leave an unbound identifier. A name whose output leaves its owning callback after
delete/unplug/repatch is cleared instead of promoted to a global declaration.
Names on still-local incomplete graphs remain; Undo restores the complete former
named graph. Automatic local names reserve all explicit names in that owner before
traversal, preventing a later explicit name from shadowing an earlier shared value.

## Review-fix verification

Opus round 1 found two ownership defects and a name-shadowing sound defect. All
four supplied cases failed before scoped fixes; 38 branch cases and 151 affected
module/rack/document cases then passed. `npm run check` passed **2,676 cases / 65
files and 59 guardrails**. The refreshed browser command completed
`RESULT passed=4 failed=0 exit=0`, including native owner Delete/Undo against a
colliding global/local name, prior #135 runtime checks, all six original/regenerated
PCM/event pairs and current screenshots. [Review ledger](evidence/callback-review.md)
records the decisions and pending bounded re-check. No unrelated feature or
process change was adopted.

A structural edit that would strand a CODE reference to a former local
binding without its emitted value is refused atomically. Edit the CODE reference
first. This checks known callback names and the closed RETURN dependency graph;
it neither executes CODE nor infers arbitrary global dependencies. Incomplete
preset-only bodies remain savable when their known binding state is retained.

Bounded review is **APPROVED in three rounds** on production
`fec8dfa0e26afff310c3f9a82b1d1b7d204963d2`; see the review ledger. Remaining rare
CODE limits: detached fragments do not retain former closure provenance through
arbitrary detach/delete/reattach sequences, and an explicitly typed unbound name
can cause later structural edits to refuse until CODE is corrected. The guard
checks the current RETURN dependency graph and known retained local bindings;
arbitrary CODE/global dependency validation is not adopted. Final full local and
hosted gates remain pending.

## Final local acceptance

Frozen approved production `fec8dfa0e26afff310c3f9a82b1d1b7d204963d2`, with only
approval/limit prose added at `a81737ab441ddd133f202fe4f2cbe109aa7c77df`, completed
`npm run test:browser:report`: **RESULT passed=232 failed=0 exit=0**, zero retries.
The actual footer was **232 passed (20.4m)**. Every new callback case, prior
function-loop script, both MIX cases, complete module/library/control matrix,
workspace histories/source edits, real event/PCM groups, crate audition/review,
Stop/replacement and Export/Open completed. The refreshed runtime JSON and panel
captures above come from this full run and were inspected. Physical listening
remains unperformed. Two earlier interrupted runs remain explicitly excluded.

The separate baseline-main crate failure passed on its unchanged-head hosted
rerun, and the crate cases passed here; no crate/audio/probe/threshold change was
made and no MIX regression is claimed. Hosted final-head required checks and
Full browser suites remain the protected merge gate; their actual results and
merge SHA are recorded on #243 and the PR rather than predicted here.
