# CODE conversion verification (#78)

Observed 3 November 2026 with Node 24.22.2 and the local Vite application in the
T3 Chromium preview. The [contract](translation-rules.md#explicit-code-conversion-78)
keeps source ownership conversion distinct from Make rack-editable's rewrite.

## Deterministic proof

`npm run check` passes. The focused
[behavior suite](../src/workspace/codeConversion.test.ts) checks individual QUANT
and VCA offers from the committed pre-77 saved file, sequential conversions,
continued literal editing, exact executable source, independently reopened saved
rack identity, retained unrelated/disconnected state and empty rails. ITER,
above-unity VCA, lowercase QUANT and grouped DELAY also convert from saved CODE.
Real Strudel query events over two cycles are compared before/after each of those
conversions, independently of source and rack assertions. Comment/CRLF retention,
stale/invalid metadata refusal, partial envelopes, custom routing and
multiple-module fragments have separate checks. Generated lowercase-scale routing
reopens with no extra CODE; an altered orbit invalidates its saved provenance.

## Browser observations

Run the app with `npm run dev -- --host 127.0.0.1`, then evaluate
`(await import('/scripts/code-conversion-check.mjs')).verifyCodeConversion()` in
that page. The script edits through CodeMirror and clicks production controls.
The suite passed:

- The legacy file shows both QUANT and VCA offers. Converting QUANT shows its
  panel and leaves the VCA CODE owner untouched.
- Undo restores the exact saved file and both CODE offers; Redo restores QUANT.
- VCA converts independently. Both actions preserve executable source, and the
  resulting saved rack reopens identically.
- An unapplied draft disables conversion and keeps unfinished text.
- Partial `.dec(.1)` and custom `.o(2)` remain CODE without a conversion offer.

The separate `verifyConversionPlayback()` export uses the real engine and a
stateful setup counter. Before the transport gate fix it failed with
“Conversion enabled during playback.” After the fix, starting/playing disables
conversion; a disabled click keeps the source and evaluation count unchanged.
After confirmed Stop, conversion succeeds with the setup counter still at one
and audio still stopped. No additional evaluation or live effect reset occurs.

The initial suite stayed stopped; the playback regression observed actual engine
scheduling and Stop. Event equality above uses
the real Strudel pattern runtime without WebAudio; no physical audio was heard,
and effect-tail listening or cross-browser/device coverage is not claimed.
