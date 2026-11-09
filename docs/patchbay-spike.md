# PATCHBAY spike (#142)

Scope: [#142](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/142),
Wave 5 of [#148](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/148).

Recommendation: **defer a production PATCHBAY panel**. The pinned engine already
plays Kabelsalat sources and effects, and CODE retains them without a new package.
The prototype also exposes failure-reporting and polyphony boundaries that a
production panel must resolve. This decision does not add a PATCHBAY catalog entry
or approve a visual graph editor. #143 and #144 remain separate implementation work.

Research ran on main `f83133542d14f20bb19ecf0377709f805ee25252` on 9 November
2026 UTC. All evaluation, replacement and Stop calls used `src/strudel/engine.ts`.
The opt-in harness re-exported the adapter, normal Vite-resolved `@strudel/web`,
reader, generator and save operation. It was served separately and removed before
commit; the prototype is not included in production. Browser observations and
raw numerical evidence below are separate from static source inspection.
Physical speakers/headphones were **not heard**.

## 1. Evaluation, replacement, Stop and failures

The existing app adapter supports both forms without changes:

```js
$: K(sine(sFreq).mul(sGate).mul(0.1).out())
$: note("a3*4").s("sine").K(audioin().mul(0.1).out())
```

`.out()` is necessary to write the graph's outputs. The transpiler converts bare
and chained `K` to `worklet` and preserves pattern placeholders. Core installs
`compileKabel`; superdough substitutes event frequency and gate into the graph,
compiles it, and posts generated JavaScript plus UGen schema to its
`generic-processor`. The source form replaces the signal in that processor;
`audioin()` reads its upstream signal. Ordinary superdough effects still wrap it.

[App-browser evaluation evidence](evidence/patchbay/evaluation.json) records
nonzero RMS: source 0.05613, effect 0.01126 and native control 0.01398.
Each stopped peak was zero after the bounded release wait. These levels prove
signal, not equality between differently scaled formulas.
[Production-bundle boundary evidence](evidence/patchbay/boundaries.json) measures
replacement from a 440-Hz graph to an 880-Hz graph: FFT peaks 439.45 and 878.91 Hz
(8192-sample FFT, 48 kHz), then zero PCM after Stop. Old notes may finish during
replacement; the probe waited for them before measuring the replacement.

`K(notAKabelNode(2))` reaches the adapter's genuine failure channel:
`[getTrigger] error: notAKabelNode is not defined`. In the app, #36 requests Stop;
the app-browser probe observed cancellation of the Play operation. In the
standalone adapter probe, Play resolved and the later failure event was separately
recorded: the UI subscriber, not the Play promise alone, owns late-error recovery.
Explicit Stop and subsequent native playback recovered.

A `raw` graph containing an intentional throw produced five generic nodes and
silent PCM, with no adapter failure event. Its compiled source contains invalid
JavaScript (`const r[2] = ...`), so it is a worker-initialization failure probe,
not proof that the intended throw executed inside `process()`. No
`processorerror` event was observed either. The installed generic processor
constructs a Function inside its message callback; `getWorklet` installs no
error-forwarding listener. Therefore **full #36 reporting is not established for
worker-side construction or DSP errors**. A production panel must report these
without relying on silence detection or assigning an invented source location.

An earlier probe imported a second Strudel module by a manually assembled URL.
Even its native control was silent, so its PCM/timing results were discarded.
The retained evaluation and cost files use normal Vite module resolution and
have nonzero native controls. That discarded probe is not a product failure.

## 2. Reader, source preservation and safe controls

The source form reads as CODE → MIX → OUT; the effect reads as SEQ → OSC → CODE
→ MIX → OUT. `K` and its entire graph arguments stay source-owned. The evaluation
and boundary files independently assert exact `generate(document)` source and
complete `read(saveLayout(document).source).patch` identity. This includes the
saved CODE owner; the rack does not project graph internals into controls.

A future panel could expose an independently identified numeric literal, with
its exact AST range, original delimiter/comment bytes and regenerated ownership
checked after every edit. A number in an arbitrary callback, computed value,
pattern placeholder or repeated/shared expression cannot safely become a knob
just because it appears in the text. Initially retain a trusted-code editor and
whole CODE ownership. Syntax parsing does not sandbox the graph: Kabelsalat
evaluation and raw DSP are executable code.

## 3. Bounded CPU, latency and limits

The claim tested was: Chromium process CPU and scheduled-target-to-digital-PCM
onset for a Kabel sine source or identity effect versus the corresponding native
sine chain. This is not physical listening latency or a universal voice budget.
The production Vite bundle used the pinned engine, warmed initialization, 48 kHz
audio, headless Chromium 156.0.8078.4 on Linux 7.2.15, Ryzen 7 PRO 6850U, 16
logical CPUs. Initial load averages were 0.70/0.54/0.80. No other local suite or
review ran alongside it. Browser/OS and background scheduling noise remain.

For each comparison, five A/B pairs ran at 1, 8 and 32 simultaneous lanes.
Each lane sounded 0.2 seconds every 0.5 seconds, with 0.01-second release.
Measurements covered 2.2 seconds after one second of warmup. Gain divided by lane
count prevented clipping. The effect was `.K(audioin().out())`. The source was
`.K(sine(sFreq).mul(sGate.adsr(.001,.05,.6,.01)).mul(.3).out())`, matching the native
sine's functional pitch/envelope settings; its envelope implementation and level
are not sample-identical to WebAudio's ADSR. It still incurs the underlying
superdough source allocation. This comparison does not generalize to arbitrary
Kabel graphs.

CPU is **gross browser-process milliseconds per wall second per configured lane**,
including renderer/scheduler, all browser processes and the PCM observer. It is
not isolated DSP CPU or a 100%-duty sustained-voice cost. CDP's process accounting
has visible quantization. Medians and full five-trial ranges follow:

| Lanes | Native in effect matrix | Kabel identity effect | Native in source matrix | Kabel sine source   |
| ----- | ----------------------- | --------------------- | ----------------------- | ------------------- |
| 1     | 40.87 (36.32–45.41)     | 49.94 (36.34–72.64)   | 36.35 (31.79–49.95)     | 54.50 (40.87–59.03) |
| 8     | 8.52 (7.38–9.65)        | 13.62 (11.92–15.89)   | 7.38 (6.81–7.95)        | 14.76 (14.19–14.76) |
| 32    | 4.40 (3.83–5.25)        | 9.24 (8.95–9.65)      | 2.84 (2.55–3.41)        | 8.81 (8.52–9.79)    |

The different native matrix baselines and overlapping single-lane ranges make
a universal cost ratio **inconclusive**. Both higher-lane matrices consumed more
gross CPU with Kabel. A separate non-reported timing run sampled Linux thread
CPU: its busiest thread was `Realtime AudioW` (15 native versus 80 Kabel ticks
in separate five-second, 32-lane windows). The installed generic processor runs
generated JS and UGen updates per sample, whereas native sine uses WebAudio
nodes; this is the observed DSP-thread limiter, not network or fixture creation.
The largest published trial used under one CPU-second in 2.2 wall seconds;
these totals do not exceed the machine's capacity.

The digital onset tap observed native onsets 0.008–0.021 ms after scheduled
targets; identity Kabel effect 0.633–2.033 ms (median about 1.33 ms), Kabel sine
source 0.654–2.054 ms (median 1.354 ms). The generic processor starts on a render
block boundary; 128 frames at 48 kHz is 2.667 ms. The tap timestamped the first
sample above 1e-6 after a silent gap, not a main-thread callback or Play response.
AudioContext reported 10.67-ms base latency and 40-ms output latency; those are
browser estimates, not measured physical device delay. Extra compilation latency
on a cold first note and heavy graphs is not bounded by these onset trials.

Every retained cost trial recorded nonzero PCM, expected scheduled event counts
(4 × lane count), actual generic-node creation, and zero reported adapter or
processor errors. An always-connected PCM tap ran on both sides. Samples are
synthetic; external sample decoding is outside the timed windows. The full raw
[effect matrix](evidence/patchbay/effect-cost.json),
[source matrix](evidence/patchbay/source-cost.json) and
[separate thread profile](evidence/patchbay/profile.json) retain repeats, onset
times, RMS, frame counts and environment. These prove work occurred, not absence
of every possible glitch, exact waveform equality or listening acceptance.

Polyphony is **not a dependable bound through today's adapter**. Superdough
declares `DEFAULT_MAX_POLYPHONY = 128`, but `initAudio()` passes an omitted option
to `setMaxPolyphony`; `parseInt(undefined) ?? 128` produces `NaN`, not 128.
The production probe independently observed `Number.isNaN(web.maxPolyphony)`
after app-style initialization. The cost files serialize that non-finite value
as JSON `null`; it does not mean a tested 128-voice limit.

An explicit `setMaxPolyphony(1)` did set the value to one. With overlapping
110/440-Hz notes, the native source's stolen 110-Hz component fell below -100 dB
about 0.38 seconds after the 440-Hz onset; the equivalent Kabel source retained
both components near -50 dB at the corresponding time. The
[polyphony probe](evidence/patchbay/polyphony.json) retains code, scheduled events
and FFT windows. Superdough's voice stealing calls the underlying sound handle's
Stop, while the additional generic graph retains its own gate/end lifetime.
Thus even an explicit source limit cannot be claimed to cap audible Kabel source
polyphony. This is a bounded two-note observation, not a measured maximum device
capacity. Internal graph fan-out also has no app-level voice budget. No overload
ceiling, maximum safe graph complexity, or cross-device limit was established.

## 4. Recommended shape if reconsidered

Use a Cyber text panel with a clear trusted-code boundary. A source mode needs
pattern pitch/gate IN and audio OUT; an effect mode also needs audio IN. Distinguish
the two modes rather than implying every graph consumes incoming audio. Keep
catalog width identical across Cyber looks, with reachable editor and live jack
coordinates; an expanded editor can use the existing flyout conventions and must
not shrink the rack frame. These are recommendations, not shipped UI decisions.

A mini-rack could later render a deliberately restricted graph AST, with explicit
ports and graph identity. Kabelsalat's compiled UGen/register schema is a lossy
DSP execution plan, not an editable source representation: JS callbacks, reusable
functions, branching and computed literals cannot be recovered losslessly from it.
Keep text as the authority; do not promise bidirectional graph editing until its
own source and identity proofs exist. The private design canvas was not accessed;
local exported family boards were available as presentation references.

## 5. Actual dependency and licence

`package-lock.json` installs `@strudel/web` 1.3.0 → `@strudel/core` 1.2.6 →
`@kabelsalat/web` 0.4.1, with `@kabelsalat/core` 0.4.0 and `@kabelsalat/lib` 0.4.1.
The web bundle already contains the compiler, graph library and DSP worklet; no
new npm dependency was added. Installed package metadata declares
**AGPL-3.0-or-later**, and each Kabelsalat package includes its licence file.
The app remains separately MIT-licensed; this report does not relicense bundled
dependencies. The project's upstream entry point is [Kabelsalat](https://kabel.salat.dev/).

The lockfile SHA-256 was
`655b6afecb8b5e2087cafc1dd40cbe223b1cceef4df86509c6fcb4e03567d92d`.
The temporary optimized probe bundle SHA-256 was
`266419cfe58e9ba761ae7232d3020f5d65b944557518ecfc2bb46a564c52f829`.
The probe used Vite's production build API with its opt-in HTML entry and normal
project config, then a loopback static server. Playwright used
`--autoplay-policy=no-user-gesture-required`; autoplay-denial acceptance was not
part of this spike. All transport calls still went through the app adapter.

## Acceptance and disposition

- [x] All five questions answered with browser or bounded measurement evidence,
      with static findings and remaining limits identified.
- [x] Defer recommendation recorded in [decisions](decisions.md#patchbay-142-decided-9-november-2026-utc);
      no build follow-up is required for that recommendation.
- [x] Browser observations, exact source, saved identity, scheduled events, PCM
      and physical-listening limits are stated separately.

All five questions have bounded answers above, with unsupported behavior stated
explicitly. The temporary prototype is removed; only this report and raw evidence
are committed. The recommendation is defer, so #142's conditional build-follow-up
issue is not required and none is filed. Reconsider only with worker failure
forwarding, explicit verified polyphony/lifetime behavior and a source-preserving
panel contract. This report makes no #207 diagnosis and does not turn the failed
post-#141 main browser run into a pass.
