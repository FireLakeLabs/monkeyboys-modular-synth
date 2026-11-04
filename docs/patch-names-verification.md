# Patch names verification (#62)

Observed 3 November 2026 with Node 24.22.2 and Chromium 156, using the local
Vite app through T3's browser preview. The [contract](patch-format.md#patch-names-62)
stores the optional title in the existing v1 rack metadata.

## Deterministic checks

`npm ci` and `npm run check` passed: formatting, skill integrity, lint,
861 unit tests, 40 guardrail checks and the TypeScript/production build.
The final gate and naming browser suite also passed after rebasing onto main at
`9145577`. The ten [naming checks](../src/workspace/naming.test.ts) independently verify:

- Executable source preservation, complete rack state and exact reopened files.
- Rack value/look edits, external code reconciliation, explicit conversion,
  accepted-document undo/redo and recovery with an invalid draft.
- Every library title, without changing its bundled original or executable bytes.
- Older unnamed files, blank title fallback, malformed/unknown metadata retention,
  Unicode and filename sanitation.

The initial naming tests rejected renames because saved-identity comparison
depended on the newly added field's JSON insertion order. Comparing the name
separately fixed that refusal; the same cases then passed. Graph identity and
all remaining saved-state checks still run at the existing boundary.

The Sol review caught Escape materializing the unnamed display fallback as
metadata. A focused regression first failed with added name/source metadata, then
passed after unchanged display names became a no-op. It requires unchanged source,
no stored name and no undo entry. The browser suite additionally passed Escape
on a fresh unnamed starter with unchanged recovery storage.

## Browser observations

On a fresh unnamed starter, run:

```js
await (await import('/scripts/patch-names-check.mjs')).verifyPatchNames()
```

All five groups passed: Enter/blur commits, Escape cancellation, Undo/Redo,
Unicode filename sanitation, exact export and Open despite an unrelated external
filename, old unnamed files, blank titles, New, every one of the 14 library
entries, draft protection, exact invalid-draft export, Revert and saved recovery.
The library loads all remained stopped. Reloading and explicitly choosing
**Restore last patch** restored **Recovery sketch** with byte-exact accepted
source and a Ready transport.

Native browser typing renamed the patch to **Evening café / lead**. Export
downloaded **Evening café - lead.strudel** (12,109 bytes). After another rename,
uploading that downloaded file through Open restored the full metadata title
and Ready transport. The downloaded bytes and reopened editor text shared SHA-256
`47a75a30267b6830415587b7e1e8c0406c8989153817f8fb876700dfdb32b61b`.

The existing `verifyLibraryUI` and `verifyOnRampUI` browser checks passed with
the updated title metadata contract. They cover malformed-source refusal,
Cancel/focus restoration, all entry loads, helper/CODE editing, export/reopen,
New and the four Start here exercises. The trance loader separately passed its
exact executable-source, title, rack and stopped-transport checks. Its audio
suite was not rerun. The broader `verifyLibraryRackEditing` call exceeded the
preview's 15-second evaluation limit; no completed result is claimed for it.

The header was inspected at 1280 × 800 and 768 × 900; name, library and transport
remained reachable. The local design board exports were available as references.
The [desktop screenshot](evidence/patch-name.png) records the named workspace.

These checks establish UI behavior, source bytes and saved identity. Playback
was not started or heard for this metadata-only change; audible continuity and
other browser/device coverage remain unverified.
