# Rack visuals acceptance

Observed 3 November 2026 for #85, #86, #96 and #88 using Node 24.22.2,
Vite and headless Chromium 156.0.8078.4. The
[design contract](design.md#rack-visual-hierarchy-85-86-96-88) owns the behavior.

## Deterministic gate

`npm ci` and `npm run check` passed: formatting, skill integrity, lint,
846 Vitest tests, 40 guardrails, TypeScript and production build. No catalog,
generator, reader, executable-code or saved-layout format changes were needed.
Existing look round trips still check source preservation and exact saved identity.

## Browser observations

Run Vite with `npm run dev`, then
`node scripts/rack-visuals-check.mjs http://127.0.0.1:5173 /tmp/rack-visuals`.
The script uses real panels, the source editor, catalog and native Chromium input.
It writes screenshots and JSON results and never starts audio.

- Before the fixes, all 13 Instrument headers used the same black gradient;
  disconnected sections had no routing state in their accessible names; jack
  names omitted signal type and no Dim cables toggle existed.
- The existing panel matrix passes all 61 module/look combinations at 100%, 75%
  and Fit (183 observations): catalog widths, control fit, typography and
  non-overlapping 24-screen-pixel jack targets remain intact.
- A mixed rack includes all six Hardware categories and an isolated OSC.
  Active Instrument bands exactly match the category colours. Header text
  contrast is at least 7.94:1 for active categories and 7.59:1 for the isolated OSC.
- The contrast probe initially found the narrow inactive ID badges wrapping
  over jack labels (1.15:1 dark text against the badge) and dimmed Learner
  subtitles at 3.84:1. Removing the redundant status suffix and increasing the
  Learner subtitle opacity fixes these cases. The final probe samples painted
  backgrounds beneath every visible default text label in the ten dimmed looks,
  accounting for inherited opacity. Every sampled label reaches 4.5:1; the
  minimum is 4.67:1 (Powder coat's Sampler subtitle). It retains gradients,
  the dimming layer and opaque badge backgrounds while hiding glyphs for sampling.
- Native output/input clicks connect the isolated OSC to MIX: its surface and
  band brighten and “not connected to OUT” leaves its accessible name. Removing
  that cable restores the dimming and accessible state.
- Native selection fades only unrelated cables. Hovering VCF overrides a selected
  SEQ; leaving VCF restores SEQ emphasis. Dim cables reduces every cable to 8%
  opacity and removes cable hit interception. Toggling and focus leave the exact
  saved source unchanged. JUX's RIGHT selector remains operable through dimmed
  cables, and its connected passthrough jack announces audio.
- Pattern dots/square centers, solid audio/circular centers and mod
  dashes/diamond centers are visible in the greyscale capture. Computed strokes
  retain exactly `#E6D35F`, `#F4A462` and `#7DB9F6`, respectively. Jack accessible
  names include the matching signal type.
- The current supplied trance demo reads as 29 panels on eight rails; it has no
  separate JUX panel, so JUX is exercised in the mixed fixture. With Dim cables
  on, all trance selectors and CODE text controls pass pointer hit checks and
  the exact supplied source remains unchanged. The full-height capture shows
  their labels and CODE text through the faded cables at natural zoom.
- No uncaught page errors occurred. The online private canvas was not accessed;
  the supplied board exports in `docs/design/` were available as references.

These are visual/input observations, not listening or playback-equivalence
claims. The contrast sample covers visible default text labels at natural zoom,
not every gradient point, arbitrary control content or all cable intersections.
The greyscale capture supplements computed signal-style checks; it is not a
clinical colour-vision study. Physical screen-reader speech, other browsers,
mobile/touch and very small Fit scales remain unverified. Browser checks require
provisioned Chromium and run separately from shared CI.

## Evidence

- [Mixed categories, routing and signals](evidence/rack-visuals/mixed-rack.png)
- [Signal distinctions in greyscale](evidence/rack-visuals/signals-greyscale.png)
- [All trance panels with cables dimmed](evidence/rack-visuals/trance-dim.png)
