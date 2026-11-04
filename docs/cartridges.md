# Sample cartridges (#137)

The cartridge bay is a setup rail above the rack. It adds sample packs without
adding modules or changing module widths. The dependent #138
[crate and tape contract](sound-crate.md) owns auditioning, sample drop slots,
SPLICE and WAVETABLE.

## Source and saved ownership

`SamplePack` in `src/samples/packs.ts` is `{ source: string; base?: string }`.
`packKey` includes both source and base. `FACTORY_PACKS` owns the two pinned
manifest/audio-base pairs previously private to the engine. The bay always shows
them; they cannot be ejected. Registration remains lazy until Play/Bounce or
opening/refreshing SOUNDS.

`Patch.cartridges` and the optional v1 envelope `cartridges` array own only calls
written by the bay. `packSetup` writes them before opaque `prelude`, tempo and
voices. Setup URLs use **single quotes**: the installed transpiler turns double
quotes into mini-notation, including arguments to `samples()`.

`seatPack` and `ejectPack` in `src/workspace/cartridges.ts` splice only this
proven leading statements, then use the existing independent source-layout validator to
prove the entire saved rack. A restored or reconciled document with matching
leading sample statements can retain ownership through unrelated voice edits. Changed/missing
setup or unverifiable metadata never grants removal rights. Plain imported
calls, including calls later retained in an opaque prelude by explicit rack
conversion, stay source-owned. The bay shows them read-only. Other setup stays
read-only too. Unsupported/computed maps stay executable; they are never
executed by the reader to invent an inventory.

GitHub shortcuts follow the installed sampler's syntax:
`github:owner/repo[/branch[/subpath]]`, defaulting to **main**. The label names
that branch; the source keeps the moving shortcut. HTTP(S) seating accepts a
`strudel.json` URL, including query strings. It follows that URL. No local-folder
loading or app-managed offline cache is introduced.

Eject warns before changing source when DRUMS/SMPL may use the inventory's names,
including banked sounds, or when CODE/unknown inventories make usage uncertain.
Cancel retains the entire file. Confirm removes only bay-owned setup. Strudel's
session registry/buffer caches are not unloaded: removing setup affects a fresh
load, and the warning says so. Accepted-document undo/redo and local recovery
retain cartridge ownership with the complete source document.

## Export

Readable Copy, Export and Open in Strudel add missing factory calls explicitly,
including pinned audio bases. Factories precede user setup so user overrides
keep their app behavior in the REPL. Existing exact factory calls are reused,
without rewriting or acquiring imported source ownership. Export restamps the
complete rack and leaves the editor/accepted history untouched. Exporting and
reopening repeatedly does not duplicate the calls. Untouched imported source
still round-trips byte-for-byte through read/generate; only the explicit export
operation adds factory setup.

Unapplied/invalid drafts and unknown/invalid metadata retain their existing raw
Copy/Export contract. They are recovery text, not a validated playable export;
no setup or unknown rack block is rewritten while rescuing them.

## Engine API for #138

All Strudel initialization, registration and playback stay behind
`src/strudel/engine.ts`. Consumers use:

- `getSamplePacks(): readonly SamplePackResource[]`: stable external-store
  snapshot, replaced when a resource changes. Historical session registrations
  can remain after ejection; filter by `cartridges(document)`/`packKey` for seated
  packs. Before initialization the snapshot is empty, meaning unknown status.
- `subscribeSamplePacks(listener): unsubscribe`: only pack changes, without
  activity-tick notifications. The regular `subscribe` also emits
  `{ type: 'sample-packs' }`.
- Each resource has `key`, `pack`, `status`, `names`, `sounds`, `base`,
  `sampleCount`, and `error`. `sounds` contains `{ name, bank }`; a bank is an
  ordered path array for `n` variants or a note-to-path-array record for pitched
  samples. `sampleCount` counts files, not sound names. Paths remain as supplied;
  `base` is the effective manifest/audio base. A bank-local `_base` remains owned
  by the installed sampler and is not represented as a variant.
- Loading clears the previous inventory; successful validated registration
  publishes names/variants/count. An HTTP, JSON, schema or registration failure
  publishes `failed` with its message. Re-evaluating the call retries manifest
  loading; it does not promise to clear Strudel's rejected decoded-buffer cache.
- Registered means **manifest registered**, never decoded/audio-ready. A missing
  entry is unknown. The LED and text distinguish unknown, loading, registered
  and failed. The aggregate `getResourceStatus()` remains a conservative
  engine/output diagnostic, independently of per-pack registration.

The adapter installs a tracked `samples` function in Strudel's evaluation scope.
It preserves source execution order, handles standalone/imported calls and inline
maps, and catches per-pack registration failures so unrelated voices continue.
Direct HTTP/GitHub fetches check HTTP status before JSON validation. Other
installed sampler prefixes remain source-owned and executable through the native
sampler, with unknown inventory. Static inline data maps can be matched to their
runtime inventory without executing code. Computed setup cannot be attributed to
a particular displayed call safely; its cartridge keeps unknown status/count
rather than claiming another call's result. Arbitrary user code is not sandboxed.

`getSampleWarnings()` shares the pack subscription and exposes unattributed missing-sound diagnostics after a manifest failure. Missing sample voices are skipped in that case so loaded voices can continue; an unrelated missing sound without an active pack failure still uses #36's Stop path.

#138 adds `loadSamplePacks(packs)` for the crate's inventory-only load and
`auditionSample(name, index)` for a one-shot voice. Both remain behind this adapter;
neither evaluates editor code or starts the transport. See
[cold-decode behavior and proof](sound-crate.md).

Late decode/output/query failures still use #36's existing surfaced Stop path.
They have no reliable pack/revision attribution; a failed manifest is the
narrow nonfatal exception. Registration alone cannot prove a sound will decode.

## Verification

See `src/workspace/cartridges.test.ts` for independent exact-source, complete
saved-rack, history/conversion and pinned-engine event checks, and
`src/strudel/engine.test.ts` for resource/failure behavior.
`scripts/cartridges-check.mjs` exercises the real browser adapter and WebAudio,
including real pinned factory manifests and deterministic user-pack HTTP faults.
It is included in the browser acceptance suite. Physical speakers/headphones
are not assessed. The private canvas boards were unavailable; repository-owned
local design exports supplied the visual reference.

Observed locally on 4 November 2026 in Chromium 156: both real pinned manifests
registered with inventories and two live LEDs; URL seating showed loading then
registered with two files; GitHub seating retained its dev branch; ejection
required consent for CODE users and Cancel preserved exact source; HTTP 503 was
reported while the synth kept producing nonzero WebAudio PCM. Readable export
contained each pinned factory once and restored the saved modules. These are
browser/PCM observations, separate from source/rack/event unit checks; no
physical audio was heard.

A focused conversion regression failed before the statement-splice fix: a
comment before a saved cartridge could make conversion duplicate its setup.
The passing check now covers conversion, subsequent seating and factory export,
retaining the comment and complete rack. Canonical graph ownership may use the
reader's complete AST proof while retaining original trivia; it does not require
a byte-identical generator spelling.

The scheduled pattern retains its failed-pack policy while a replacement waits
for setup. Each evaluation records its own manifest failures, and the adapter
adopts that policy only at pattern installation. A deferred-fetch regression
failed before this handoff fix and passes afterward. The real browser check also
holds a failed-pack retry open while the previous synth produces PCM. Both
900×768 and 1024×768 workspace checks pass with the compact cartridge rail.
