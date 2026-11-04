# Pattern visibility acceptance (#139)

Implemented against [#139](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/139)
and wave-four tracker [#148](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/148).
The issue had no discussion comments when fetched on 4 November 2026. #128 was
closed; waves one through three were already on main. No routing/cartridge/crate
features are included here.

## Decisions

- Probe only generator-rebuilt, validated, CODE-free upstream pattern graphs.
  Opaque setup conservatively refuses the query. Expand readable shared outputs;
  never evaluate imported source or complete downstream voices. Query four cycles
  with the accepted tempo and show a static onset/duration punchcard.
- An explicit #62 name wins over the first source `@title`; otherwise the source
  title is a display/filename fallback with no new persisted name. Preserve every
  credit byte independently of its parsed display, including through explicit
  rack conversion. URLs are inert text.
- SCOPE uses native `.analyze(id)` on the final voice signal, with the same
  analyser-ID sharing/last-setter semantics as Strudel. VIEW is catalog-owned
  presentation-only saved state. It does not rewrite code or re-evaluate audio.
- Use the actual scheduler's cycle time. Reduced motion freezes clock/progress
  and draws a static SCOPE baseline with no ongoing drawing interval.

The contracts live in [translation rules](translation-rules.md#readable-cable-probes-139),
[patch format](patch-format.md#strudel-credits-and-the-patch-name-139), and
[module spec](module-spec.md#scope--voice-analyser-139).

## Static and unit evidence

Node 24.22.2 (`.node-version`) and `npm ci` were used. Focused real-Pattern tests
compare the REV prefix before downstream `.fast(2)`/sound selection against the
independent scheduling input: 16 onsets over cycles 2–6, with reversed pitch and
quarter-cycle durations. They separately verify shared prefixes, CODE callbacks,
opaque setup, stale state, non-pattern refusal and accepted BPM. Rejected probes
leave side-effect sentinels absent; no REPL/audio initialization is called.

Separate metadata tests cover unknown/repeated tags, inert URL text, title/name
precedence, exact CRLF source through read/save/edit/rename/reopen, and complete
rack identity. The explicit-conversion test failed before credit retention was
added, then passed. Further regressions failed on reordered setup credits and
duplicated CODE credits before their fixes. An EOF-credit regression proves
retained setup still executes.
SCOPE tests distinguish exact source, full saved VIEW/look/ID identity, and real
pinned-engine analyser control events. Engine tests verify clock/tap reads do
not initialize audio and stopped taps disappear.

`npm run check` passed before review: formatting, skill integrity, lint, unit
suite, committed reader coverage, guardrail tests, TypeScript and production
build. Final-head results are recorded in the PR. The build retains the existing
large-bundle warning. The install reported the existing two moderate dependency
advisories; no dependency or infrastructure scope was added.

## Direct browser evidence

Run `node scripts/pattern-visibility-browser.mjs http://127.0.0.1:5173 <output>`
with the Vite dev server and installed Playwright Chromium. It is also registered
in the separate full-browser workflow. Observed on Chromium
156.0.8078.4, 4 November 2026:

- Real source credits appeared on the rack frame; `@title` supplied the name and
  URL text remained inert.
- The real prefix query returned 16 events, excluded the downstream faster voice,
  and created zero AudioContexts while stopped.
- Actual pointer movement over a cable opened the punchcard; Alt-click pinned
  it after leaving. Close and the Connections-list action both worked.
- Play produced nonzero per-voice waveform PCM (observed peak about 0.045), and
  the header cycle readout advanced with the scheduler. VIEW selected a live
  spectrum, preserving executable source and ongoing playback.
- Emulating reduced motion stopped canvas stroke calls and froze cycle/progress
  across several display periods, while audio kept scheduling. Removing the
  preference resumed ordinary display behavior.
- VIEW saved/reopened with the complete rack and exact CRLF executable/editor
  source. CODE downstream showed **Not probed · CODE upstream**; its side effect
  never ran, and transport stayed stopped.
- No page errors were recorded.

The shared-preview browser loaded the workspace and successfully queried the
real prefix. Its UI click automation failed twice (15-second and 5-second
click timeouts); the harness-permitted Playwright fallback supplied the remaining
interaction/audio evidence and screenshots. Artifacts are written to the chosen
output directory as `results.json`, `scope-spectrum.png`, `reduced-motion.png`
`cable-probe.png` and `trace.zip`.

Physical speakers/headphones were not heard. Other browsers/devices and
subjective audible equivalence remain unverified. The live private canvas was
unavailable; the supplied local reference-board exports were available and used.
No issue acceptance criterion remains unverified within the tested Chromium
harness; physical listening is explicitly separate from measured audio data.
