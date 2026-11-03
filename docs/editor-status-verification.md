# Editor status footer (#73)

Observed 3 November 2026 in Chromium 156 through the shared browser preview,
against the Vite development build and committed dependency lockfile. The
archived workspace board in `docs/design/workspace-v1.png` supplied the visual
reference; the private live canvas was not accessed.

## Browser observations

`scripts/editor-status-browser.mjs` checks the actual editor and Strudel engine:

- Exactly one footer directly follows the editor, containing sync state, cursor,
  engine status and info. Stopped transport says Ready, with caveats hidden.
- Backward selection uses the active head's one-based line/column. Inserting a
  line updates the mapped coordinates; Revert restores the exact accepted file.
- Unapplied drafts report their sync state there. Parser errors show line/column
  in the footer, keep their gutter marker, and clear on Revert.
- First real engine initialization reports Loading samples, then Playing.
  Caveats stay behind Audio engine info.
- A real unsupported method call surfaces recovery guidance and expandable
  runtime details in the footer. Correcting and applying resumes playback.
- A one-shot injected scheduler `clearInterval` failure reports Audio state
  unknown. Header Stop remains enabled, and retry returns to Ready. The
  existing engine retains the prior error details until successful replay.

At 760 × 900 the footer stayed directly beneath the editor without horizontal
overflow, and keyboard Enter opened the info disclosure within the viewport.
The existing `checkErrorPositions()` browser suite also passed all seven checks,
including source/rack retention, opener markers, metadata folding and Revert.
The 1280 × 800 layout was visually inspected in the shared preview.

The [captured results](editor-status-results.json) record these assertions.
Runtime error attribution, sample readiness, cancellation and tail limits remain
those of [#36](audio-recovery.md); this presentation change does not extend them.
Physical audio was not heard or measured for this UI change.

## Reproduction and static checks

Use `.node-version`, `npm ci`, `npm run check`, and start Vite. In a fresh browser
page, run:

```js
await (await import('/scripts/editor-status-browser.mjs')).checkEditorStatus()
```

The suite replaces editor text and exercises playback, so use an isolated test
page. It installs the Stop fault before Strudel initialization; reload before
repeating. The browser check requires external sample manifests and is separate
from the shared CI gate. Existing browser-suite expectations use the new plain
transport labels; their engine/source assertions are unchanged.

`npm run check` passed: formatting, skill integrity, lint, 829 unit tests,
40 guardrail checks, TypeScript and the production build. These static/unit
results are separate from the browser observations above.
