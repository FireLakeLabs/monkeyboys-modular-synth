# Ordered effects verification (#134)

Observed 4 November 2026 with Node 24.22.2, the committed lockfile and Chromium
through Playwright. The private design canvas boards were unavailable; the
repository design spec supplied the UI reference.

## Deterministic checks

`src/codegen/effects.test.ts` independently checks native matching order,
reordered/repeated stages, pinned-core event values, exact imported source,
argument-specific literal edits, full saved/reopened rack identity, CV and filter
ENV ownership, shared declarations/final orbits, native imports and custom
routing, conservative CODE, explicit prior CODE ownership and proven pre-134
migration. Bypassed effects must not turn an otherwise native send into an
inline effect. Source/identity assertions are separate from event assertions.

`npm run check` passed, including reader coverage, guardrails, TypeScript and the
production build. The final PR records the current test counts and review.

## Real browser observations

The committed `scripts/effects-check.mjs` probe runs in the existing full browser
suite as **ordered FX chains preserve rack/source and schedule real audio**. It
loads generated files through the editor, clicks actual Play/Stop controls,
observes the “You hear” notes, captures the real scheduled Strudel pattern and
samples the live engine's output AudioNode. It then imports a multi-argument FX
call, edits the second VCF literal, and independently reopens the exact saved
rack while preserving surrounding comments/formatting. The successful test
attaches JSON results and a screenshot.

The observed notes identified VCF → DELAY → REVERB for native sends,
REVERB → DELAY → VCF for the reordered inline chain, and VCF → VCF for repeated
filters. No reversed-order cable warning remained. All three scheduled four
onset events per cycle on orbit 1, with mixer postgain outside FX.

Native events carried top-level `cutoff`, `delay` and `room`; reordered events
carried `FX: [{room: 0.5, roomsize: 4}, {delay: 0.4, delaytime: 0.375,
delayfeedback: 0.5}, {cutoff: 800, resonance: 1}]`. Repeated filters carried two
separate cutoff/resonance entries. This is direct event evidence that ordering
and repeats reach the engine independently, rather than overwriting one setter.

Each case sampled 71,680 PCM values. Observed RMS was 0.009745 (native sends),
0.004980 (reordered inline sends), and 0.005897 (repeated filters). These establish
nonzero output for those patches; they are not a controlled sound-quality or
performance comparison. Native versus inline sends intentionally differ in
routing and note-tail lifetime. The acceptance test does not claim that swapping
two commuting linear filters must change their sound.

The local browser command used a temporary Playwright config pointing at this
worktree's port 5134 because another wave-three worktree occupied the default 5173. The committed CI entry uses the repository's normal browser config.

## Limits and decisions

- No physical listening or non-Chromium/device coverage was performed.
- The pinned engine's outer-voice 24 dB filter duplication cannot be isolated per
  FX argument. Ordered generation refuses that mode and import preserves it as
  CODE. Native 24 dB remains supported; two ordered 12 dB stages or a local ladder
  stage are supported and covered separately.
- One readable FX argument must project to one catalog stage. Unsupported or
  multi-stage arguments keep the enclosing FX call as exact CODE atomically.
- Amp ADSR/gain, DJ orbit filtering and final mixer/routing settings remain outer
  voice controls. Native and explicit inline execution are distinct saved state.
- #131 owns sound/effect module additions; stage membership follows catalog call
  bindings. Integration with landed modules is checked before merge.
