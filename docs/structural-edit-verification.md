# Imported structural editing verification (#35)

Verified 2 November 2026 with Node 24.22.2, the T3 server browser on Linux,
and its real Strudel/WebAudio adapter at 48 kHz. Physical speaker output was not
heard. See the [supported matrix and refusal contract](translation-rules.md#imported-structural-edits-35)
and [saved-state contract](patch-format.md#planned-structural-source-mutations-35).

## Reproduce

Start with `npm ci`, `npm run check`, and `npm run dev -- --host 0.0.0.0`.
Paste this into Strudel source:

```js
// exact browser 🐒
const helper = x => x.rev(); // unrelated
const lead = note('c3 e3').s('sine'); // shared
$: lead.lpf(/* cutoff */ 800).gain(.25); // first
$: lead.chunk(4, x => x.rev()).gain(.15).orbit(7); // opaque routing
```

1. Add ITER on a free row, set STEPS to 2, select Monolith, and add an empty
   row. Click Play. Connect OSC OUT to ITER IN: the dangling branch is saved
   without changing executable bytes. Connect ITER OUT to VCF IN and choose
   Replace. Only `\n  .iter(2)` is inserted after the first `lead` receiver.
   The shared declaration, helper, comments, quote spelling, opaque callback,
   routing and other voice stay byte-identical.
2. Connect OSC OUT to VCF IN and choose Replace. ITER becomes disconnected,
   retaining its values and look. Removing its executable tokens leaves the
   inserted whitespace intact. Playback remains scheduled.
3. Select CODE and press Delete; confirm Delete module. The useful refusal
   explains that removing this voice would remove opaque code. Source and rack
   remain unchanged. In the observed real engine, `getPattern()` returned the
   identical non-null pattern object before and after rejection, while transport
   remained Pattern scheduled.
4. Export the inserted patch and reopen it through Open file / Open patch.
   Exported bytes matched the editor SHA-256
   `e4f648d568b45c2ee3f9cd0d595f68a10fbb9522d66c713d9227758a4e88f08f`.
   Reopened source and the complete patch object matched exactly, including
   IDs/cables, the named output `lead`, ITER's Monolith look and STEPS 2,
   disconnected/saved values, positions and five rows (including an empty row).
   Open confirmed Stop and did not autoplay.
5. Paste the independent voice below, click Play, select VCF, press Delete
   and confirm. Its statement's executable tokens disappear; the three comments
   remain exact. There is no automatic bridge. `getPattern().queryArc(0,2)`
   returned no events, transport stayed scheduled, and no audio error appeared.

```js
// delete proof
$: note('c3').s('sine').lpf(/* inside */ 800); // tail
```

## Separate proof claims

- **Source bytes:** workspace tests assert exact CRLF/Unicode, retained comments,
  unrelated declarations, shared references, CODE and imported orbit fragments.
  Multi-call removals retain comments inside arguments. The browser observed
  the same preservation across actual cable Replace actions.
- **Events:** a unit test runs trusted fixtures through real Strudel core and
  checks values/times over four cycles against independently handwritten expected
  code. Inserting DELAY changes its effect values, bypass restores the old
  events, disconnect produces no voices, and reconnect restores the voice.
  The browser's initialized mini-notation runtime also showed ITER changing the
  `c3 e3` event order in alternate cycles while retaining cutoff/gain.
- **Browser output:** AnalyserNodes connected to actual nodes feeding the audio
  destination measured nonzero output before insertion (860,160 sampled values,
  RMS 0.00895621) and after insertion (7,757,824 values, RMS 0.00227392).
  The probes cover all observed destination connections, including nodes from
  reevaluations; these are signal-presence observations, not a level comparison
  or continuity/listening claim. No physical listening was performed.
- **Saved identity:** independent reader validation must prove every planned
  binding and the saved graph before committing. Tests separately compare the
  complete reopened patch, including identical repeated-call identities and
  a subsequent literal edit that must reach the correct filter.
- **Atomic refusal:** graph/source plan and independent validation finish before
  App installs a document or calls playback. Unit tests retain the full accepted
  document on refusal; browser tests observed exact source/rack and pattern
  identity on rejected CODE deletion.

The new structural tests failed against the previous blanket refusal, then
passed with the planner. `npm run check` runs these tests with the existing
reader, rack, playback and engine suites. Browser actions above are a separate
real-engine acceptance check; they are not part of CI. Arbitrary JavaScript
rewriting, structural CV changes, shared-definition rewrites, ambiguous scopes,
opaque-code removal and the other matrix refusals remain intentionally blocked.
