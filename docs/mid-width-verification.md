# Mid-width workspace acceptance

Observed 3 November 2026 for [#91](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/91)
in the T3 Code Chromium preview with Node 24.22.2 and Vite. The
[design contract](design.md#mid-width-workspace-91) owns the behavior.

## Browser observations

The [browser regression](../scripts/mid-width-check.mjs) exposes
`verifyMidWidth()` for a Vite page. Start `npm run dev`, set the viewport to
1024×768 or 900×768, restore any recovery prompt, then run
`(await import('/scripts/mid-width-check.mjs')).verifyMidWidth()` in that page.
It loads Enveloped synth with audio stopped. `inspectLayout()` checks geometry
without changing the document.

- Against the original app files at 1024×768, `inspectLayout()` rejected
  “Workspace needs page scrolling”: code started at y=790 and page height was
  1355 px. The initial starter reproduction was 1400 px tall.
- The final regression passed at 1024×768, 900×768 and the 1150×768 breakpoint.
  Page height equaled 768 px with no page-width overflow. Rack and code were
  alongside each other in Both; the palette scrolled horizontally without
  vertical overflow. Rack and Code buttons opened their respective full-width
  views without page scrolling.
- Selecting OSC highlighted its rack panel and source. Both → Rack → Code
  retained those highlights. Show in code selected `.s("sawtooth")` and focused
  CodeMirror; from Rack it opened Code, and from Both it retained Both. A native
  right-click and menu click at 900 px independently confirmed the reveal,
  editor focus, source range 52–69 and highlighted source.
- Switching views retained exact complete source bytes, including saved rack
  metadata. An unfinished draft, cursor selection and draft undo survived
  hiding/revealing the editor. Six cable endpoints remained aligned after view
  resizing and Fit. Internal rack scrolling remains available for larger
  content/manual zoom; fitting all controls without inner scrolling at these
  widths is not claimed.
- At 640×768, Both used two vertical panes within the viewport, retained source
  highlights and kept the horizontal palette. This was a layout spot check,
  not touch verification. At 1440×900 the existing three-column layout returned;
  Enveloped synth retained its 638 px rack viewport/scroll extent and six aligned
  cables at Fit (about 68%).

The private online canvas was not accessed; the archived boards are available in
`docs/design/`. No audio was started or heard. Touch, other browsers and very
short viewports remain unverified.

## Static and deterministic checks

`npm ci` and `npm run check` passed: formatting, skill integrity, lint,
861 Vitest tests, 40 guardrail tests, TypeScript and the production build.
The browser regression runs separately from shared CI, using the same
Chromium-provisioning exception as the existing browser suites. Unit/static
checks alone do not prove pane geometry or focus behavior.
