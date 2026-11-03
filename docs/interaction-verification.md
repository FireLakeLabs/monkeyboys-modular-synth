# Interaction acceptance: #9, #10 and #11

Verified 2 November 2026 against the issue bodies, their empty discussion threads,
and the owner-approved [interaction handoff](interaction-proposal.md).
The existing implementation covered the primary flows. This change completes
warning previews, output destination selection and visible plug stacks, unique
module selection, focused deletion, cancellation, and empty-row persistence.
The exported design boards were available; the private live canvas was unavailable.

[Browser results](evidence/interaction-results.json) record 24 checks in local
headless Chromium 156.0.8078.4 on Linux, viewport 1600 × 1000, Node 24.22.2.
Two further browser regressions verify the Sol review fixes below.
[Interaction recording](evidence/interactions.mp4) shows real application controls,
not the storyboard. Browser automation used Playwright against the local Vite app.
The existing reader, generator and playback boundaries remain in use.

## Acceptance audit

| Issue | Acceptance                                                                  | Evidence                                                                                                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #9    | Vertical drag, Shift fine adjustment, double-click and labeled reset        | Browser: logarithmic cutoff drag, fine movement, Escape restoration, pointer cancellation, reset to 800 Hz. A live drag changed source and returned to Pattern scheduled.                                                                                         |
| #9    | Typed finite decimal values, bounds, explicit step/detent confirmation      | Browser: blank, out-of-range, expression, Infinity and exponent input leave source unchanged. Valid blur commits 1200 Hz. RES 1.2 proposes 1 and waits for a second Enter. Existing unit tests cover rate detents and fractional steps.                           |
| #10   | Provisional cable, valid/odd/blocked targets with explanations              | Browser: wrong signals and output-to-output drops retain the original source. Audio split previews a warning and retains signal color plus cable warning. Unit tests cover graph rules, indirect FX order and unresolved CODE paths.                              |
| #10   | Occupied input replacement, cancellation, reroute and removal               | Browser: Cancel is initially focused, leaves the original cable, and Replace commits once. Escape and blocked reroutes retain the original; accepted reroute retains cable identity. Remove disconnects one cable.                                                |
| #10   | Several cables per output, selectable destinations and editable names       | Browser: output destination buttons select individual branches, plug collars have per-branch offsets, and `lead` survives removal down to one branch. Existing source tests prove safe imported declaration/reference renames and refuse opaque references.       |
| #11   | Library placement, exact HP width, nearest free interval, no pushing/wiring | Browser: native library drag places VCF at HP 22; native move places it at HP 40 and leaves OUT at HP 12. Existing unit tests cover nearest intervals and full rows.                                                                                              |
| #11   | Full row, explicit Add row, movement and cancellation                       | Browser: full 64 HP row refuses OSC; dropping on Add row creates one row with OSC at HP 0. Cancelling native placement creates neither module nor row. Empty rows survive source acceptance and save/open. Only empty rows expose Remove row.                     |
| #11   | Deletion and unique modules                                                 | Browser: focused module-header Delete offers confirmation, Escape cancels, accepted deletion selects a neighbor. OUT's library item selects its existing instance. Unit tests protect OUT deletion, remove incident cables/names and prohibit automatic bridging. |
| #11   | New patch, export/cancel, silent MIX → OUT and no autoplay                  | Browser: exact invalid draft export, Cancel while playing, then replacement stops scheduling and installs only MIX/OUT with their cable. A stopped BPM edit remains stopped. Saved-state tests and file reopen preserve disconnected controls, layout and cables. |

## Reproduce

Run `npm ci`, `npm run check`, then `npm run dev -- --host 127.0.0.1`.

1. Start with the silent MIX/OUT rack. Click OUT in the library: its existing
   panel selects. Add VCF; click its CUTOFF readout and enter invalid text, then 1200. Enter RES 1.2 and confirm the proposed 1 with a second Enter. Drag the
   cutoff up/down, hold Shift, cancel a drag with Escape, then double-click Reset.
2. Build SEQ → OSC → VCF → VCA → OUT. Try SEQ → VCF IN and OSC → another output;
   neither changes the patch. Drop OSC on the occupied VCA IN: Cancel preserves
   the old connection, Replace commits it. Split VCA into MIX; inspect the
   warning, name the output, select a destination and try Move destination,
   Escape, an accepted move and Remove cable.
3. Fill one 64 HP rail with MIX, OUT, DRUMS, VCF, SEQ and ITER. Try adding OSC to
   that full rail, then drag it onto Add row. It lands at row 2 / HP 0. Add an
   empty rail, export, replace the patch and reopen the file: all three rails
   return. Remove an empty rail explicitly. Delete a selected module via its
   menu or focus its header and press Delete; confirm that attached cables are
   removed and neighbors are not automatically reconnected.
4. Play a simple sine voice. Drag cutoff while playing; Cancel New patch and
   check scheduling continues, then Replace. The silent starter stays stopped.
   Edit BPM while stopped: it does not autoplay. Repeat New patch from a syntax
   error and Export current: it saves the exact current draft.

The browser probes observed post-master WebAudio RMS 0.0192843 across 49,152
sampled values for the sine fixture. This proves nonzero browser output; physical
speaker output and subjective continuity were not heard. A mixed coarse/fine
cutoff drag applied successfully, New patch Cancel kept scheduling, and Replace
confirmed Stop before installing the starter.

## Saved rows and source preservation

`Patch.rows` and the v1 envelope's optional `rows` retain empty rails. The reader
validates positive safe integers and rejects counts smaller than module positions.
Older v1 files derive rows from their module coordinates. Explicit empty-row
removal closes that gap, shifting later row indices while preserving HP, looks,
controls and wiring. Adding/removing empty rails changes metadata only, including
for imported source with CRLF, comments and opaque code.

The first Sol review found an incorrect inactive label for a MIX with unity
channel gain (its generated call is omitted), and row loss when deleting the last
module from an older v1 file without `rows`. Both were reproduced before fixing
and verified afterward in unit tests and the browser. Inactive labels now mean
no route to OUT; source ownership remains separate. Deletion stamps the current
rail count before removing modules, including for older files.

Focused regressions failed before the fixes: OUT was deletable, warning previews
and saved empty-row operations were absent, CODE paths were labeled valid, and
an intervening ITER hid a reversed FX order. They pass afterward. Separate
workspace tests verify exact imported bytes, saved rack identity and rejection
of malformed row metadata; these do not claim sound equivalence on their own.

The #9–#11 flows are complete within v1's desktop pointer scope. Touch, keyboard
cable patching, other browsers, human listening and #12's remaining engine limits
are unverified or deferred. Imported sounding structural edits without a proven
source-preservation plan continue to be refused with an explanation. Arbitrary
JavaScript effects, late sample/output failures and never-settling evaluations
retain the documented [engine limitations](engine-spike.md).

## Cable refusal preview (#76)

Observed 3 November 2026 using the T3 preview browser against the local Vite app
at 1280 × 800, with Node 24.22.2. The private design canvas was unavailable;
the repository's archived references were available.

The focused `src/workspace/connections.test.ts` regression first failed because
an imported filter CV target returned `valid` even though completing that cable
threw `RackEditRefused`. It now passes: the preview checks both graph validity
and the actual source-preserving edit, without changing the accepted document.
Supported imported replacement, exact reopened rack identity and canonical
post-conversion CV editing also pass. `npm run check` passes separately.

The browser probe in [connection-check.mjs](../scripts/connection-check.mjs)
uses the rendered rack, pointer events and focused button activation. Run
`npm run dev`, then execute in that page:

```js
await (await import('/scripts/connection-check.mjs')).verifyConnectionTargets()
```

Observed browser results:

- LFO → imported VCF CV is dimmed and marked × before drop. Hover shows
  “This patch came from code. Add the cable in code, or make the rack editable.”
  beside the jack. Dropping opens the existing conversion offer; Cancel retains
  exact source and saved rack state.
- Keyboard focus shows the same reason, linked through `aria-describedby`.
  Make rack-editable still completes the pending cable after explicit consent.
- A supported imported ITER insertion stays valid. Its occupied input offers
  Replace / Cancel, retains source before confirmation and commits without a
  source refusal. Exported source reopens with restored rack metadata.
- Type-incompatible targets remain blocked and do not mutate source or offer
  conversion. The transport stays Stopped throughout.

Native preview mouse click/hover additionally confirmed the local tooltip and
blocked style visually. Native Tab moved from VCF IN to CV with the same reason;
Enter opened conversion and cleared the tooltip. These checks cover the existing
desktop keyboard activation path, not a broader keyboard patching design or
screen-reader certification. No audio behavior changed or listening claim was
made.

The existing `verifyLibraryRackEditing()` browser suite also passed for all nine
module exercises and the attributed showcase, including Cancel, stale conversion
invalidation, conversion retry, subsequent CV and exported rack identity.
