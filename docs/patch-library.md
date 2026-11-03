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

## Loading and persistence contract

New, Open file and library loading share one replacement intent and confirmation
with **Cancel**, **Export current**, and an explicit commit action. A new intent
cancels any pending one. Browsing and selecting never stop audio or execute code.

Library loading first reads the original string into a fresh `SourceDocument`
and validates its rack. Invalid source or invalid saved layout fails before
Stop. It then uses `prepareReplacement` to await confirmed Stop and verifies
that neither the replacement intent nor the current work revision changed.
Only then does it install source and rack together and clear old rack gestures
and selection. Cancel/Close/Escape, newer work, validation failure and Stop
failure retain the current draft and rack. Once Stop has been requested,
cancellation does not resume previous playback. Stop can leave notes/tails
ringing out; it confirms scheduling, not immediate physical silence.

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

## Browser verification

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

This browser check needs WebAudio, the default sample manifests and drum audio
over the network. It remains separate from the deterministic CI gate, like the
existing workspace error suite. Nonzero PCM proves output signal, not subjective
sound quality or listening through a physical device.
