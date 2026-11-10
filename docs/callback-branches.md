# Local callback branches (#243)

Status: implementation and focused proof in progress; final full checks, bounded
review and hosted/protected merge remain pending. This contract deliberately
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
call. Saved CODE stays CODE until explicit conversion. Discovery never executes
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
