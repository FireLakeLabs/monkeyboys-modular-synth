# Architecture review against Matt Pocock’s guidance

Reviewed 8 November 2026 at [`9484126`](https://github.com/FireLakeLabs/monkeyboys-modular-synth/commit/94841267a36c29be027a09fdf590b8ec1d851ed1).

The codebase conforms well in its domain modules and less well in workspace coordination. Its catalog, source-preserving document model, and playback module provide substantial **depth**: callers get considerable behavior without understanding the implementation. The best improvement is to give accepted-workspace transitions the same treatment. Today, too much of their **interface** consists of rules a maintainer must remember inside `App.tsx`.

Keep the existing architecture and deepen selected modules incrementally. A wholesale rewrite, a generic framework, or splitting every large file would not follow the guidance.

## Basis and scope

This assessment uses Matt’s [codebase-design](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/codebase-design/SKILL.md), [improve-codebase-architecture](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/improve-codebase-architecture/SKILL.md), and [deepening guidance](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/codebase-design/DEEPENING.md), pinned to skills revision `4ae2317`.

**Depth** means capability relative to everything callers must know, including ordering, invariants and failure behavior. It is not a ratio of implementation lines to interface lines. A **seam** is where that interface lives; an **adapter** supplies a concrete dependency there. Depth gives callers **leverage** and maintainers **locality**.

The scan started with recent change history. Across the latest 80 commits affecting `src`, the paths most often present included `Rack.tsx` (30), `App.tsx` (25), `reader/read.ts` (24), `codegen/generate.ts` (21), and `modules/catalog.ts` (19). These counts include merge commits and are navigation clues, not independent change counts or quality scores.

Project decisions and the module, translation, patch-format, design and engineering specs supplied domain vocabulary; no `GLOSSARY.md` or `docs/adr/` was present. Relevant issue bodies and available discussions were read, including [#76](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/76), [#200](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/200), [#202](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/202), [#207](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/207), [#217](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/217), [#218](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/218), and [#219](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/219). Proposed issue designs remain proposals.

This is a point-in-time architectural assessment kept in the repository for full-stop review, rather than a specification or decision. Keeping it here is a deliberate departure from the skill’s temporary-report destination; the [HTML visual companion](pocock-architecture-review.html) is included alongside it for review. No application behavior, saved format, or product decision changed. The interactive selection/grilling steps were omitted at the owner’s request; no detailed replacement interfaces were designed.

## What already works well

| Pocock principle                              | Assessment                                      | Evidence                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deep modules hide knowledge                   | Strong in translation                           | [`read` and `tryRead`](../src/reader/index.ts) expose a small interface over syntax projection, CODE fallback and saved-rack reconciliation. [`SourceDocument`](../src/reader/types.ts#L29) keeps original source and its rack in one revision.                                                                                                              |
| One authoritative definition creates leverage | Strong in the catalog                           | [Catalog call bindings](module-spec.md#call-bindings-128) drive reading, generation and controls. [`modules/bindings.ts`](../src/modules/bindings.ts) centralizes interpretation of that data. Specialized routing and envelope behavior appropriately remains dedicated implementation.                                                                     |
| Tests cross the caller’s seam                 | Strong in document edits; mixed in coordination | [`document.test.ts`](../src/workspace/document.test.ts#L20) edits imported source and checks unchanged executable bytes and reopened rack state. Some workspace tests instead reconstruct orchestration, discussed below.                                                                                                                                    |
| Side effects sit behind meaningful seams      | Strong foundation                               | [`createPlayback`](../src/strudel/playback.ts#L47) hides transport intent, stale work and effect resets. [`engine.ts`](../src/strudel/engine.ts#L14) owns browser audio and Strudel initialization. [`createAutosave`](../src/workspace/autosave.ts#L13) accepts a storage adapter, allowing real persistence behavior to be tested without browser storage. |
| Small modules earn their place                | Often yes                                       | Deleting [`history.ts`](../src/workspace/history.ts) would move grouping and redo-branch rules into callers. Deleting [`open.ts`](../src/workspace/open.ts#L13) would move load/Stop/current-revision ordering into callers. Neither is shallow merely because it is short.                                                                                  |

The folder structure is useful: catalog, patch, generation, reading, workspace, rack, samples and playback concepts are recognizable. The weaker locality is inside cross-concept workflows, not primarily in directory names. The import restriction in [`.oxlintrc.json`](../.oxlintrc.json) covers selected direct imports in `modules` and `patch`; it does not establish purity of every transformation transitively. That limit is already acknowledged in [standards](standards.md).

## 1. Deepen accepted-workspace transitions

**Strong · in-process policy with storage and playback adapters**

**Files:** `src/App.tsx`, `src/workspace/{document,history,finishedCode,open,autosave}.ts`, `src/library/myPatches.ts`.

[`App.tsx:115`](../src/App.tsx#L115) begins a collection of accepted-document, draft, history, save-identity and revision state. [`install`:235](../src/App.tsx#L235), [`settleDraft`:400](../src/App.tsx#L400), [`replaceWork`:571](../src/App.tsx#L571) and [`writeSaved`:688](../src/App.tsx#L688) coordinate rules across those modules. A maintainer changing acceptance must understand draft grouping, recovery writes, playback updates, replacement cancellation and which My patches entry belongs to an undo revision.

There is direct test-surface evidence: [`finishedCode.test.ts:17–36`](../src/workspace/finishedCode.test.ts#L17) implements a miniature typing/acceptance/history loop. It tests useful policy, but does not execute the production coordination in `App`. The [#202 paste/undo gap](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/202) illustrates a related policy spanning editor origin, undo and application; it does not prove this architecture caused the gap. Existing browser tests already exercise real production paths, so this is not a claim that the workflow is untested.

**Deepening:** put accepted-document transitions and the state they must update together behind one workspace module’s interface. Keep rendering, native focus and CodeMirror transactions in their adapters. Begin with draft acceptance and history; move replacement/save identity only as the same invariant requires them. Keep playback’s scheduling implementation behind its current seam.

| Before                                                                    | After                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `App → read/finish rules + history + recovery + playback + save identity` | `App → workspace transition module → existing adapters` |
| Tests reconstruct some transition rules                                   | Tests exercise the production transition interface      |

**Deletion test:** deleting the existing helpers would spread useful complexity into `App`; deleting a proposed pass-through hook would change nothing. The improvement earns its depth only if callers stop coordinating the invariants themselves.

**Leverage and locality:** one acceptance path for rack edits, explicit Apply, automatic Apply and undo restoration. Tests should drive real transitions for unfinished typing, paste/type/undo, composition, grouped gestures, stale loads and save conflicts. Assert accepted source, rack, history and adapter-visible effects independently. Replace duplicated orchestration tests only after equivalent behavior coverage exists; retain browser checks for real editor and audio behavior.

No new general dependency-injection framework is justified. Storage already has production and test adapters; playback already has a useful interface. Reuse those facts.

## 2. Make cable preview and commit share edit feasibility

**Strong · in-process**

**Files:** `src/workspace/connections.ts`, `src/workspace/document.ts`, `src/App.tsx`, `src/workspace/{connections,rackEditable}.test.ts`.

[`assessDocumentConnection`:16](../src/workspace/connections.ts#L16) tries `editDocument`. Any `RackEditRefused` becomes a warning that connecting will rewrite source into rack style. Actual edits use [`applyRackEdit`:413](../src/workspace/document.ts#L413), which additionally tries `makeRackEditable` and can still refuse. Preview therefore owns an incomplete interpretation of the commit policy.

The existing [`rackEditable.test.ts:87`](../src/workspace/rackEditable.test.ts#L87) fixture explicitly proves a proposed CV edit for which both source preservation and conversion fail. This establishes that the second failure mode is real. It does not by itself reproduce a misleading jack in the browser. [#76](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/76) provides the relevant product expectation: a jack must not appear valid for an edit later refused.

**Deepening:** let a document-edit planning module own feasibility for both preview and commit, including preserve-source, conversion and refusal outcomes. Keep graph compatibility checks and document proof inside its implementation. Bind any reusable plan to its source/patch revision so intervening edits cannot make it authoritative for another document.

| Before                                                           | After                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Preview → preserve-source attempt → predicts conversion          | Preview → document-edit planning seam                        |
| Commit → preserve-source attempt → conversion → possible refusal | Commit → same feasibility rules, current-revision validation |

**Deletion test:** removing `assessDocumentConnection` today would move its source-policy interpretation into the rack. Merely moving that function would not add depth; absorbing the complete decision into the document-edit module would.

**Leverage and locality:** one owner explains whether an edit can happen. Tests cross that interface for preserved edits, successful conversions, failed conversions, replacement/rerouting and stale documents. Preview must leave source and rack unchanged; commit must match its promised outcome on the same revision. Preserve the separate byte, saved-rack and event checks. No external adapter is needed.

## 3. Concentrate rack geometry knowledge

**Worth exploring · browser measurement adapter with in-process geometry**

**Files:** `src/rack/Rack.tsx`, `src/patch/layout.ts`, `src/looks/layout.ts`, affected browser checks.

[`Rack.tsx:280`](../src/rack/Rack.tsx#L280) measures live jack centers, clips hidden controls, clamps rail endpoints and places tools. [`Rack.tsx:996`](../src/rack/Rack.tsx#L996) separately converts drag coordinates using rail geometry and zoom; [`:1033`](../src/rack/Rack.tsx#L1033) again selects the cable frame for pointer coordinates. Knowing which coordinate space applies is part of the effective interface spread through the rack implementation.

**Deepening:** concentrate measurement ownership and coordinate conversion in a rack-geometry module. Keep DOM observation in a browser adapter; keep positions, clipping and transforms internally coherent. Its callers should not need to reconstruct which frame or scale a point belongs to.

| Before                                                                      | After                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Measurement, placement, cables and pointer handling each know frames/scales | Rack callers cross one geometry seam                              |
| Geometry policy interleaved with DOM observation                            | Browser adapter supplies measurements; module owns interpretation |

**Deletion test:** a helper that only forwards `getBoundingClientRect` is shallow. The extraction is worthwhile only if frame, zoom and clipping knowledge disappear from multiple callers.

**Leverage and locality:** coordinate policy changes in one place. Use concrete geometry cases without a browser, then retain real browser pointer, scroll and endpoint checks; synthetic rectangles cannot prove painted hit targets. No generic renderer abstraction or second rendering adapter is justified.

The [fixed-width/live-jack decision](decisions.md#looks) remains authoritative. This recommendation does not authorize look-dependent module widths, resize-driven saved-layout changes, or the arrangement proposal in [#218](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/218).

## 4. Concentrate reader projection rollback ownership

**Worth exploring · in-process, internal seam**

**Files:** `src/reader/read.ts`, reader behavior fixtures.

The reader’s external interface is already deep. Internally, recognizers manage speculative state with different rollback scopes: [FX at :840/:912](../src/reader/read.ts#L840), [function callbacks at :1238/:1262](../src/reader/read.ts#L1238), and [scalar ownership at :1531/:1557](../src/reader/read.ts#L1531). Graph, bindings, resolved declarations, depth settings, IDs and placement cursors do not all share the same lifetime. That makes adding another recognizer require knowledge of neighboring mutation rules.

**Deepening:** concentrate speculative projection ownership behind an internal seam, while preserving the different commit scopes. A failed callback can retain its enclosing function module; a failed scalar recognition must release its candidate and placement. One indiscriminate snapshot/restore policy would erase meaningful differences.

| Before                                             | After                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Each recognizer chooses what state to restore      | Explicit projection attempts own their relevant state                  |
| New recognizers learn neighboring mutation details | `read`/`tryRead` stay unchanged; implementation knowledge concentrates |

**Deletion test:** moving the recognizers into separate files with the same mutable context only moves complexity. Depth improves if their implementation stops requiring a manual inventory of rollback obligations.

**Leverage and locality:** reader extensions need less shared-state knowledge. Test failed recognizers followed by supported calls through `read`/`tryRead`, checking absence of ghost modules/bindings and placement drift. Independently check exact source, reopened rack identity and pinned-engine events. Keep an internal seam internal; add no public reader framework or adapter. This is a maintenance-risk finding, not a newly demonstrated correctness defect. Consider it alongside future reader work such as [#217](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/217), after that feature’s representation choices are resolved.

## Changes I would avoid

- **Splitting the catalog or reader just because they are large.** Catalog data and `read` already provide leverage. Private implementation files can help navigation, but exported mutable contexts or a plugin framework would expand the interface.
- **Deleting every small function.** History, source splicing and guarded replacement encode important ordering or invariants. The deletion test is about where complexity goes.
- **A new shared translation intermediate model now.** Preserving imported syntax and generating canonical syntax have different obligations. Shared catalog bindings already remove meaningful duplication. No inspected change establishes the need for a second authoritative representation.
- **A universal engine port now.** [`engine.test.ts`](../src/strudel/engine.test.ts#L36) mocks Strudel, while [`playback.test.ts`](../src/strudel/playback.test.ts#L10) mocks the engine. Those are real test seams, although module mocking/resetting is more coupled than an injected adapter. Narrow injection may be useful when lifecycle work requires it; the existing seam is not automatically wrong. A mock also cannot establish decoded-sample readiness or diagnose [#207](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/207).
- **Deleting focused tests wholesale.** Matt’s “replace, don’t layer” advice applies when tests duplicate a newly hidden implementation. Catalog invariants, parser edge cases, real engine events, saved identity and browser checks often make different claims and should survive.

## Top recommendation and order

Tackle **accepted-workspace transitions** first: it has the broadest caller knowledge and the clearest duplicated test orchestration. Pilot only acceptance/history before expanding scope. If a smaller first change is preferable, cable feasibility is the most bounded candidate with a concrete mismatch to resolve.

Then address cable feasibility, followed by rack geometry when touching view behavior. Revisit reader projection ownership with a real reader extension. Success means fewer rules callers must know and tests exercising the same production interface, rather than fewer lines or more files.

## Verification and review limits

Observed on the reviewed revision using Node `v24.22.2`: `npm ci` and `npm run check` passed, including **53 Vitest files / 2,382 tests**, reader coverage, **51 guardrail tests**, lint, formatting, TypeScript and production build. The build retained its large-chunk advisory; no bundle-performance conclusion was drawn.

The private design canvas boards were not accessed; geometry findings use source and committed specifications. No application browser suite, audio playback or physical listening was performed for this documentation-only assessment. Existing browser tests and historical evidence were inspected, not re-established. Static evidence supports the structural findings; it does not establish runtime failure frequency or audible equivalence. Proposed refactors still need their own regressions and affected browser verification.

A fresh-context read-only explorer independently examined the hotspots. The suggested council workflow could not run as specified: only Codex and Claude providers were available, rather than three providers. No substitute council or invented scores are claimed. The full-stop report review and PR verification are recorded in the PR description; this assessment does not approve the proposed refactors for implementation.
