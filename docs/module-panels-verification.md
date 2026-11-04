# Module panels and mixer labels (#129)

Observed 4 November 2026 on Node 24.22.2, with `npm ci` and the committed lockfile.
The base includes #128's catalog bindings and #145's corpus coverage gate.
The private design canvas was not accessed; the repository's supplied board exports
and existing fixed-width panel system supplied the visual reference.

## Static and pure behavior proof

`npm run check` passes formatting, skills, lint, unit tests, committed reader
coverage, guardrails, TypeScript and production build. The focused
[`panels.test.ts`](../src/codegen/panels.test.ts) and explicit
[control cases](../src/testing/panelCases.ts) exercise all 42 added controls.
Exact source retention, generated saved rack recovery, imported save/reopen
identity and installed Strudel events are independent assertions. Plain imported
orbits remain CODE, preserving the existing provenance boundary.

Additional cases cover multi-word scales, conditional omission, inactive saved
values, unpatched Hz drones, label changes overriding stale metadata, all four
mixer CV inputs, and nested levels folded into one final postgain. The real
core/mini/tonal event algebra is queried over four cycles. Unit event checks do
not simulate REPL label filtering; that is independently exercised below.

Focused regressions were observed failing before their fixes:

- Without omitted-time inference, SYNC 3/16 imported as fixed `.delaytime(.375)`.
  The regression failed on the unexpected delaytime call, then passed with the
  corrected engine-default inference. The trance projection/generation digest is
  deliberately updated for its bare `.delay(.4)`; exact supplied source is unchanged.
- An older source-owned rack without the newly introduced MODE value initially
  became invalid. Its regression failed `invalid` versus `restored`. Exact saved
  syntax and call ownership now retain that historical saved projection; the
  original source, IDs, layout and values survive save/reopen. New imports infer
  SYNC; external code changes are reprojected instead of trusting stale values.

Sol round 1 identified repeated imported `postgain` setters incorrectly becoming
nested mixers, and enclosing labels disappearing when `stack()` was expanded.
Five added cases failed before the fixes. Earlier setters now remain CODE; a
terminal scalar setter retains Strudel's last-setter behavior, including explicit
unity after opaque settings. Expanded stack leaves inherit mute/solo/name.
The checks separately compare source bytes, saved identity and actual events;
the browser REPL also compares original versus regenerated labelled stacks.

## Browser and runtime proof

Run `node scripts/panels-browser.mjs <vite-url> <evidence-directory>`. It is also
registered in the separate full browser acceptance workflow. Chromium
156.0.8078.4 observed:

- All 42 added controls display their restored values and remain reachable by
  scrolling their fixed-width panels. PW disappears after switching pulse to
  sine; DRIVE disappears after switching ladder to 12db; both stop emitting.
  Editing a muted channel's name writes `_bass:` through the actual input.
- Pulse PW, supersaw voices, ladder drive, velocity, sync delay, reverb fade and
  sample index fixtures all produced nonzero WebAudio PCM (RMS above .0001).
  This proves execution and output, not a subjective judgment of timbre.
- Two STEP LFOs with opposite depths write `.range(.2,.8)` and `.range(.8,.2)`
  on separate MIX levels. Their output was nonzero. Muting both through their
  actual panel controls reduced measured RMS below .00001.
- The pinned Strudel REPL evaluated `_$:`, `S$:`, named and combined `_Sname:`
  labels directly. Muted events disappeared, solo selected the intended voice,
  mute won over solo, and surviving events retained their original orbit 1/2.
  No page errors were observed.

Existing `verifyLibraryUI`, `verifyLibraryRackEditing` and `verifyTrance` browser
groups also passed. All fourteen library entries retain exact executable source
and matching racks without autoplay; the rack editing group retains helper/CODE
and export identity. The trance demo retained 29 modules and four-cycle events:
16 kick, 76 events per supersaw voice and 64 pulse events. Master plus all four
orbit probes produced nonzero PCM through repeated Play and export/reopen;
exact source and saved/rendered rack identity remained true.

Shared T3 preview loaded the app, but two Apply clicks timed out after 15000 ms;
the repository's Playwright harness supplied the interaction/runtime proof.
Physical listening, multichannel hardware output and other browsers/devices were
not verified. Output pair correctness is proven in code/events; hearing physical
channels 3/4 requires a capable interface. #130 owns SMOOTH LFO, ENV and CV SEQ
integration; when it lands second it must verify those sources against these
catalog-owned mixer CV targets. No Wave 3 work is included.
