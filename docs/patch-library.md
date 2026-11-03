# Patch library (#45)

The top-bar **Patch library** button opens a modal browser alongside the existing
module picker. Collections expand and collapse using native disclosure controls;
patch buttons select details without changing the workspace or playback. The
detail pane shows the collection path, description, attribution, exercised
modules and expandable exact Strudel source. Close/Escape returns focus to the
opener. The narrow layout stacks collections above details.

## Collection and entry format

[`src/library/catalog.ts`](../src/library/catalog.ts) owns the ordered tree of
`LibraryNode` data. A collection has `kind: 'collection'`, a stable `id`, a
`title` and `children`. Children can be collections or patches; the initial
content uses at most two collection levels. Nesting is metadata only and does
not change a patch's ID or source. IDs are unique across the whole tree.

A patch has `kind: 'patch'`, stable `id`, `title`, short `description`, exact
`source`, `attribution: { author, url? }` and `exercises` (module catalog IDs).
Optional `tryThis` supplies one line shown in the selected entry’s details.
Names shown for exercises come from the module catalog. Attribution must name
the actual author/source and satisfy the source's license; the initial scripts
are original repository-owned MIT exercises. Collections do not add another
patch save format.

To add a patch:

1. Add a plain `.strudel` file under `src/library/patches/`, including any
   comments/helpers or valid existing rack metadata that should be retained.
2. Import it using `?raw` in the library catalog and add a patch node under its
   collection. Choose a new stable ID, description, attribution and the IDs of
   the modules the patch exercises. Moving a node changes only its location in
   the browser; preserve the ID.
3. Run `npm run check`. Library tests parse every source, validate fixed rails,
   verify advertised modules are active and source-bound, and require the union
   of exercised modules to cover the shipped module catalog. They separately
   check source preservation and reopened saved rack identity.
4. Load it in the browser and press Play explicitly. Confirm that it evaluates
   and produces the intended sound. Parser/control coverage alone is not an
   audio check. Verify sample resources when relevant.

The nine seeds cover an amplitude envelope, degree quantization, filter and
amplitude LFOs, a filter envelope, a TR909 drum grid, delay/reverb, ITER/JUX,
a custom helper/CODE fragment, and a three-voice mixer. The attributed
[Switch Angel trance demo](trance-demo.md) from #46 is an additional complete
patch under Complete patches → Trance, bundled in its exact supplied variant.

## Start here (#80)

The first collection follows the [Strudel workshop](https://strudel.cc/workshop/getting-started/):
First sounds → First notes → First effects → Pattern effects. It contains four
original repository-owned MIT exercises, with a link crediting the corresponding
workshop chapter and a one-line `tryThis` in each entry. These are original rack
patches, not copied workshop source. The lessons progress from drum sounds/rests
to pitched notes, filter/room controls, then rate and right-channel reversal.

Each `.strudel` file is authored in generator style with complete saved rack state;
all rack edits use the normal rack-owned path. Loading, attribution, stopped audio,
Cancel/Export and restoration use the same library contract below. The module
exercise collections and exact-source attributed showcase remain available after it.
See [palette and Start here verification](on-ramp-verification.md).

## Rack ownership (#55 and #75)

The [#55 owner decision](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/55#issuecomment-6612111085)
chooses both approaches. The nine module exercises (including Three-voice sketch)
are committed as generator-style `.strudel` files with complete validated rack
metadata. Loading still preserves their exact stored source; no load-time rewrite
is needed. Their attribution remains in the library detail pane. The
Start here collection (#80) follows this authoring rule too.

Showcase entries keep the exact attributed source, including comments and
formatting. If source preservation refuses a rack edit, a prompt beside the
control/jack offers **Make rack-editable** and explains that it rewrites the code
in MonkeyBoy’s style before completing the attempted edit. Cancel and Escape
leave the accepted source/rack untouched. A draft edit, replacement or newer rack
edit cancels the pending conversion; a revision check prevents stale retries.
Conversion installs source and rack together through the normal playback update,
without starting stopped audio. Reloading the library entry restores its original.

Conversion applies the generator’s control/default and dedicated-orbit conventions.
Opaque chain fragments stay CODE, and non-rack setup statements (helpers,
registrations) remain in a saved `prelude`, in their relative order before the
rack program. Formatting and surrounding comments may change. Mixed helper/pattern
multi-declarations must be separated in code before conversion. Arbitrary setup
side effects and routing hidden behind custom functions have no universal semantic
or audible equivalence guarantee. Export before converting if the original needs
to be retained; global undo/redo remains #63.

The focused library tests require each exercise to accept VCF/VCA CV where present,
effect insertion, mixer level changes and an additional mixer channel. They check
source ownership and reopened rack identity independently. The workspace conversion
fixture checks real Strudel event values/times separately, including the intended
CV change; generator-assigned orbit IDs are excluded from that comparison.
See the [#75 observed browser acceptance](library-rack-verification.md).

## Loading and persistence contract

New, Open file and library loading share one replacement intent. Confirmation
with **Cancel**, **Export current**, and an explicit commit action protects changed
work. It is skipped when accepted source and draft exactly match the starter or
the last successfully loaded library entry. The comparison includes saved rack
metadata, so looks, positions and nonsounding controls count as changes too.
Unfinished drafts, opened files and restored local work remain protected.
A new intent cancels any pending one. Browsing and selecting never stop audio
or execute code.

Library loading first reads the original string into a fresh `SourceDocument`
and validates its rack. Invalid source or invalid saved layout fails before
Stop. It then uses `prepareReplacement` to await confirmed Stop and verifies
that neither the replacement intent nor the current work revision changed.
Only then does it install source and rack together and clear old rack gestures
and selection. Cancel/Close/Escape, newer work, validation failure and Stop
failure retain the current draft and rack. Once Stop has been requested,
cancellation does not resume previous playback. Stop can leave notes/tails
ringing out; it confirms scheduling, not immediate physical silence.

Skipping confirmation still uses this same validation, confirmed Stop and revision
guard. Only successful New/library replacements establish a new clean snapshot.
Confirmation actions stay orange in every placement; the warning names New or the
specific library patch/file being loaded.

Successful loading leaves playback stopped until explicit Play. It does not
normalize formatting, append rack metadata on load, or regenerate source from
the rack. Unsupported expressions remain CODE and helper declarations/comments
remain in the retained document. Loading is parsing, not execution or sandboxing.
Editing uses the normal source-aware workspace behavior and does not mutate the
built-in source. Reloading the entry restores that original.

Copy/Export writes the exact current draft. Rack edits stamp validated trailing
metadata while preserving executable source. Open uses the usual reader to
restore saved looks, positions, output names and nonsounding values. Library
collection paths and selection are browser metadata and are not exported. See
[patch format](patch-format.md) and [translation rules](translation-rules.md).

## Original #45 browser verification

Observed in this implementation session: the UI and real-engine checks passed,
including nonzero output for all nine seeds and recovery after injected Stop
failure. [Recorded results](patch-library-results.json) separate signal evidence
from physical listening, which was not performed.
The final UI check also passed after the focus fix; a real Escape key restored
focus to the library opener. The [desktop](evidence/patch-library-desktop.png)
and [540px layout](evidence/patch-library-narrow.png) were visually inspected;
the narrow dialog stacked its columns with no internal horizontal overflow.

Run `npm run dev -- --host 127.0.0.1` and open its URL in the harness browser.
The browser-only module [`scripts/library-check.mjs`](../scripts/library-check.mjs)
can be imported through the development server. It does not ship in the app.
Run on a fresh page, with audio stopped:

```js
window.libraryCheck = await import('/scripts/library-check.mjs')
window.libraryUIResults = await libraryCheck.verifyLibraryUI()
window.libraryMeasure = libraryCheck.installAudioProbe()
```

Click the top-bar Play button with a real user/harness gesture to activate audio.
Then start the longer test without awaiting it in a short-timeout automation call:

```js
window.libraryRun = { status: 'running' }
libraryCheck.verifyPatchSignals(libraryMeasure).then(async (signals) => {
  const stopFailure = await libraryCheck.verifyLibraryStopFailure()
  window.libraryRun = {
    status: 'passed', signals, stopFailure, ui: libraryUIResults,
    physicalListening: false,
  }
}).catch((error) => {
  window.libraryRun = { status: 'failed', error: String(error) }
})
```

Read `window.libraryRun` after completion. The UI group covers nested browsing,
attribution, Cancel/Export current, malformed source failure, all nine silent
loads, helper-preserving edits, reset to the original, export/reopen and New.
The real-engine group measures nonzero WebAudio PCM for each seed after explicit
Play and stops each one. The Stop-failure group injects a throwing observer at
the real adapter boundary, proves exact draft/rack retention and Export current,
then removes the observer and retries Stop. It does not claim a physical device
failure. Unit tests also cover cancellation while Stop is pending.

## Replacement confirmation verification (#61)

Observed on 3 November 2026 in Chromium through the T3 browser against the Vite
app. Before the fix, `verifyReplacementConfirmation()` failed with
`Enveloped synth: clean workspace still asks for replacement`; the confirmation
background was gray (`rgb(32, 35, 40)`). After the fix:

- `verifyReplacementConfirmation()` passed starter → library → library → New
  without confirmation/autoplay. Edited code, a look-only change and an invalid
  draft prompted; Cancel and Export retained work. Both New and library warnings
  named their actions, with orange confirming buttons (`rgb(244, 164, 98)`).
- `verifyLibraryUI()` passed all ten exact-source library loads, malformed-source
  retention, helper edits, saved rack export/reopen, file protection and New.
- After a real Play gesture, `verifyReplacementCancelPlayback(measure)` retained
  exact source and rack through both New and library Cancel, kept scheduling, and
  measured nonzero WebAudio PCM before/after (RMS 0.00418 / 0.00349). This is signal
  evidence; physical speakers/headphones were not heard.
- `verifyLibraryStopFailure()` retained draft/rack/export through an injected
  real-adapter Stop failure and recovered on Stop retry.
- A separate check started an unedited library patch, then New skipped the prompt,
  stopped scheduling and installed the two-module starter. A replacement requested
  in the same task as a draft edit still prompted before the reader debounce.
- Open's warning named `example.strudel` and kept its orange action. The trance
  loader passed; after reloading/restoring its unedited local copy, New prompted
  and Cancel retained exact source with scheduling stopped.

Run the first two exports from [`scripts/library-check.mjs`](../scripts/library-check.mjs)
on a fresh page, with no recovery dialog. Install `installAudioProbe()` before the
first Play gesture; then call `verifyReplacementCancelPlayback(measure)` on a
playing library patch. The existing trance loader also accepts clean direct loads.
`npm run check` passed separately: 701 tests passed, 19 expected failures,
40 guardrail tests, lint, formatting, skill integrity, TypeScript and production build.

This browser check needs WebAudio, the default sample manifests and drum audio
over the network. It remains separate from the deterministic CI gate, like the
existing workspace error suite. Nonzero PCM proves output signal, not subjective
sound quality or listening through a physical device.

For #75, `libraryCheck.verifyLibraryRackEditing()` drives all nine exercises through
CV, effect insertion and mixer channel edits, checks attribution and export
identity, then verifies a nearby showcase refusal, Cancel, explicit conversion,
retained registrations and a later CV edit. The signal group also queries real
Strudel onset events independently of source/rack checks.
