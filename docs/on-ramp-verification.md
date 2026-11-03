# Palette and Start here acceptance (#79/#80)

Observed 3 November 2026 with Node 24.22.2 and Chromium through the T3 browser,
against this checkout’s Vite app. The local design-board exports were available.

## Browser observations

- At 1440 × 1000, all 16 palette chips had full names, representative catalog
  syntax and family badges, in Pattern, Sound, Shape, Modulate, Effects and Utility.
  Every text element passed a measured horizontal-overflow and no-ellipsis check.
  Name/long-name and case-insensitive call filtering passed, including empty results
  and clearing the filter. The palette scrolls independently; rack widths stay fixed.
- Start here appeared first, with First sounds → First notes → First effects →
  Pattern effects. Each selection showed its original-exercise attribution,
  workshop chapter link, exact source and one-line try-this.
- All four suggested edits worked through the actual rack controls: a drum-grid
  step, the first note, filter cutoff and sequence rate. Export/reopen restored
  the edited rack exactly; reloading restored the built-in original. Loads left
  audio stopped and required explicit Play.
- The existing library suites passed all 14 exact-source loads, nested browsing,
  Cancel/Export retention, malformed-source failure, helper preservation and New.
  All 13 rack-owned exercises accepted CV where applicable, effect insertion and
  another mixer channel, with saved identity checked separately. The exact-source
  showcase retained its explicit conversion/refusal behavior.
- Real-engine playback produced nonzero WebAudio PCM and onset events for all 14
  patches. The four new entries produced 16, 16, 16 and 64 events respectively
  over four cycles. Their measured RMS values were approximately 0.00436, 0.00210,
  0.00162 and 0.00115. These are output-signal observations, not physical listening
  or a subjective sound-quality claim.
- At 540 × 900 the library stacked collections above details without internal
  horizontal overflow; the try-this and attribution remained visible.

[Recorded results](on-ramp-results.json), [desktop](evidence/on-ramp-library-desktop.png)
and [narrow](evidence/on-ramp-library-narrow.png) screenshots retain the observations.
Physical speakers/headphones and other browsers/devices were not verified.

## Deterministic checks

`npm run check` passed formatting, skill integrity, lint, unit tests, 40 guardrail
cases, TypeScript and the production build. After rebasing onto `91ffb42`,
all 766 unit tests passed (no expected failures), and the palette/lesson browser
checks passed again. Focused checks cover category/filter
behavior, lesson order/credits, canonical generator source, restored metadata,
CV/effect/mixer edits, exact source and independently reopened rack identity.
These checks are separate from the browser playback measurements above.

After the final rebase onto `9ef4a21` (metadata folding), `npm run check` passed
786 unit tests and 40 guardrails. The palette/lesson, complete library UI and
all rack-editing browser groups passed again with the folded editor. The
reviewed behavior patch was unchanged by this rebase (`git range-diff`). Sol
approved in one round with no findings; usage was not exposed.

## Reproduction

Start `npm run dev -- --host 127.0.0.1` and open its URL in the harness browser.
Use a fresh page with audio stopped; resolve any local recovery dialog first.
At 1440 px wide:

```js
window.libraryCheck = await import('/scripts/library-check.mjs')
await libraryCheck.verifyOnRampUI()
await libraryCheck.verifyLibraryUI()
await libraryCheck.verifyLibraryRackEditing()
window.measure = libraryCheck.installAudioProbe()
```

Load a sounding patch, click Play with a real browser gesture and wait for
“Pattern scheduled” so Strudel has initialized. Then run
`await libraryCheck.verifyPatchSignals(measure)`. The suite requires WebAudio and
external sample resources and stays separate from the deterministic CI gate.
