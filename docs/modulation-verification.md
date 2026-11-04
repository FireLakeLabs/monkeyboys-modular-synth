# Generalized modulation verification (#130)

The [decision](decisions.md#generalized-modulation-130-decided-3-november-2026),
[module contract](module-spec.md#generalized-cv-130) and
[translation rule 3](translation-rules.md#3-a-cable-into-cv-modulates-a-control)
separate per-voice SMOOTH/ENV modulation from event/pattern signals. The base
contains #128's shared control bindings. The installed lockfile resolves
`@strudel/core` 1.2.6 and `superdough` 1.3.0 through `@strudel/web` 1.3.0.

## Independent deterministic proof

`src/reader/modulation.test.ts` drives generation, production reading, workspace
edits and save/reopen separately. It checks all current CV jacks against SMOOTH,
STEP, ENV and CV SEQ, preserving exact source independently from complete patch
identity and real pinned-core event values/times. It covers native pitch forms,
all supported tempo spellings, legacy STEP, shared target defaults, named/nested
utilities, two same-type sources in one argument, exponential mapping, coupled
control edits, graph refusals and unsupported object/CODE preservation.
`src/codegen/bindings.test.ts` extends the catalog with a differently named target
and jack, proving every source uses those bindings without a module adapter,
including a patched base at its omission value.

`npm run check` passed 1154 unit cases, 43 guardrails, formatting, skill integrity, lint, the reader corpus gate, TypeScript and production build.

Existing generator/library digest fixtures retain their original hashes. The new
original **Sample, scale and mix CV** exercise covers every added utility and
CV SEQ in an active route. Its MIT provenance is recorded in the corpus manifest;
the baseline membership was explicitly extended to seventeen patches after #132. Existing
patch coverage did not regress: totals became 135/150 mapped calls, 19/23 fully
readable voices, 15/17 CODE-free patches, with zero parse failures and the same
fifteen CODE blocks/unmapped calls. This is representation coverage, not audio
proof. Existing native ENV/alias, source-preservation and saved CODE regressions
remain in the gate.

## Sol review regressions

The first Sol round found three source/rack round-trip defects. Six focused
regressions failed before the fixes: RATE 16 pitch LFO ownership, shared
SMOOTH/sampled/pitch sources with inactive fields, and additive generic ENV on
native-envelope targets. Derived rates now retain full precision; source
restoration tracks the fields each adapter actually represents; generic ENV on
native targets remains CODE. Save/reopen, look edits and real event checks pass.
The slowest pitch rate also passes at the minimum and maximum catalog tempos. After rebasing onto #140 and #132, `npm ci` ran the audio-pool postinstall patch; the complete gate passed against that installed engine. The #132 catalog, pattern-time call bindings, examples and browser fixtures remain intact.

## Observed browser and PCM proof

On 4 November 2026 UTC, Node 24.22.2 and Chromium 156 were used with the locked
engine. The shared T3 preview loaded the actual app, displayed the new MODE,
SKEW and target-unit DEPTH controls, and changed MODE from SMOOTH to STEP and back;
the source changed between `.lfo()` and the existing signal argument. Its SKEW
click and type actions each timed out after 15 seconds. The focused Chromium
acceptance test then completed MODE, SKEW and CV SEQ cell edits and independently
reopened the saved rack. That test is in `tests/browser/suites.spec.mjs`, so the
existing browser workflow also runs it.

The real adapter/AudioContext probe in `scripts/modulation-browser.mjs` rendered
one `c3/8` note, observed exactly one onset spanning cycles 0–8, and measured
48 kHz WebAudio PCM for about 5.4 seconds. It excluded startup frames and compared
the 90th/10th percentile RMS windows within that single note:

| Path             | Depth | Low RMS | High RMS | Within-note ratio |
| ---------------- | ----: | ------: | -------: | ----------------: |
| SMOOTH, upward   |  +0.4 | 0.03558 |  0.09987 |             2.807 |
| SMOOTH, downward | −0.15 | 0.00912 |  0.03325 |             3.646 |
| STEP             |  +0.4 | 0.06743 |  0.06833 |             1.013 |

Each run reset effect routing before capturing its current destination gain;
otherwise old sustained notes can survive Stop and contaminate the next probe.
SMOOTH changes amplitude within one long event; STEP retains its onset-sampled
value. The downward run verifies the positive-magnitude/negative-bias workaround
for the pinned engine's inverted clamp. The independent browser test repeated
all three probes successfully. No physical listening is claimed.

Reproduce with the pinned Node and dependencies, a free port 5173, and installed
Playwright Chromium:

```sh
npm ci
npm run check
npm run test:browser -- --grep 'generalized modulation'
```

The local focused test used the task's Vite on 5177 through a temporary config
because another thread owned 5173. The committed runner retains its normal
self-managed server. The private canvas boards were not accessed; the existing
local exported design reference and catalog-driven panel layouts were retained.

## Scope and remaining integration

Native VCA/filter envelope amount semantics remain intact. DEPTH drives generic
ENV and OSC pitch; OSC's native vibrato remains sinusoidal. Pattern utilities
require STEP or explicit S&H, and ENV connects directly to CV. Unsupported engine
shapes (`rand`/`perlin` in SMOOTH) and unsupported source configs do not receive
invented audio-rate behavior. Coupled imported edits keep the established
refusal/explicit-conversion boundary.

At this verification point #129 had not landed, so MIX channel CV jacks did not
yet exist on main. Its eventual integration must apply the same per-voice
modulator after the folded final `.postgain()` and prove SMOOTH/STEP, ENV and CV
SEQ, including nested constant mixer factors. The thread landing second owns
that integration check. Physical listening, other browsers and devices remain
unverified; they are separate from the measured Chromium acceptance above.

## Full-suite CI corrections

The first full browser CI run exposed LFO panel overflow, Fit clipping after
adding OSC TUNE, a stale sixteen-module palette count, and a real playback error
in the new utility exercise. The REPL parsed `mini("…")` twice: its double-quoted
argument had already become a Pattern. The writer now uses `mini('…')`, and named
CV SEQ declarations hold the resulting Pattern directly. The reader retains
unsupported double-parsed explicit-mini forms as CODE. A pinned REPL-transpiled
event regression failed on the old writer for inline and named sequence inputs;
it passes with the corrected code.

Dense and switch-based panels use compact numeric rows without reducing text
sizes or changing HP. Fit reserves another jack target below the last rail. The
same browser matrix that failed on LFO now covers all 119 module/look combinations
after #132 at 100%, 75% and Fit; the 1024/900-pixel Fit reproductions retain the rails and
live jack centers. Palette/matrix counts come from the catalog rather than the
original sixteen-module list. No overflow, contrast, jack-size or font-size
assertion was removed.

After rebasing onto main `23c6f98` (#132), all 32 full browser suites passed
locally in Chromium, including library signal/PCM, generalized modulation and
pattern/time forms. The unchanged live-edit failure reproduction also passed
against a fresh Vite server. The run used the temporary 5177 config above.
