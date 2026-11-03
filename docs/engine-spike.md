# Engine spike: embedding, errors and orbits

Investigated 2 November 2026 for #2 and #13. This is a runtime spike and a
translation decision; production generator integration remains #3/#4, source
identity remains #1/#14, and interaction states remain #12/#8.

The production #4 integration now uses this adapter; see
[generated playback verification](playback-verification.md) for transport,
volume, structural resets and the remaining listening limits. Findings below
record the earlier spike rather than the current integration's status.

The #36 [audio recovery contract](audio-recovery.md) now supersedes this spike's
reporting and serialized-Stop limits. It records the installed log channel,
guarded cancellation, source ownership, browser recovery and remaining arbitrary
JavaScript boundary.

## Reproduce

Use `.node-version`, `npm ci`, then `npm run dev`. Open
`/scripts/engine-spike.html` and click **Run checks**. Keep the tab active; allow
about 30 seconds. The harness uses the production adapter and real browser audio,
not mocked scheduling. It records mono PCM from the engine's output before the
physical device; the download link exports a WAV for listening. Run five times
for the recorded baseline/edit comparison. The probe is outside the shipped Vite
entry point. `npm run check` covers the adapter and its focused boundary tests.

The probe first plays shared `const`/two `$:` voices. At 90, 120 and 160 BPM it
alternates a fixed-cutoff baseline with 60 cutoff edits about 30 ms apart. It
captures scheduled target times and PCM sample energy, near-silent runs
(`abs(sample) < 1e-6`) and adjacent-sample differences. It then checks syntax and
expression-construction failures, a partial tempo side effect, three sample
banks, independent delay/reverb buses, and Stop.

## Recorded result

All five completed baseline/edit runs had regular event target intervals at the
three tempos, no new scheduling gaps, and no increase over the fixed baseline's
largest adjacent-sample difference. Each edited segment's longest near-zero run
was one sample (about 0.021 ms at 48 kHz). Across all tempos/runs the largest
sample difference during edits was 0.014993–0.015051 full scale. The run data
retains every interval, baseline and edited PCM summary; this is a continuity
finding for the tested signal, not a speed comparison or a subjective listening
verdict. All runs produced nonzero output for default/TR808/TR909 and retained
the two distinct orbit effect configurations; there were no unexpected probe
failures. The syntax/construction failures are intentional test cases.

A separate production-build check loaded the engine chunk/maps only after a
single Play click, logged AudioWorklets ready, and produced nonzero audio at the
engine output bus (sampled RMS 0.0372); Stop reached zero after 1.5 seconds for
the fixed demo. No failed network requests were observed. The browser harness
already reported user activation, so stricter fresh-profile autoplay policies
and other browsers remain unverified. An initial custom AudioNode tap returned
zero and was inconclusive; the final check tapped the real engine output bus.

## Findings

- `$:` lines and `const` definitions evaluate together. Repeating the same
  declaration on subsequent evaluations works; declarations do not collide
  across edits. A shared source can be routed to different final orbits.
- Evaluating a new pattern replaces the scheduler's pattern without stopping or
  restarting its clock. Already scheduled events are not rewritten, and sound
  controls affect new events, rather than continuously changing an existing
  sustained oscillator. The scheduler looks ahead, so the last accepted edit
  need not be audible immediately. This supports knob-driven re-evaluation;
  sample-accurate continuous control is not established.
- `initStrudel` installs a **future mousedown** listener for audio worklets.
  With a lazy import inside Play that gesture has already happened. The adapter
  calls `initAudio()` explicitly once during initialization and resumes the
  `AudioContext` before evaluating. Test first-click behavior separately from a
  warm harness: reload the app, click Play once, then inspect output.
- `evaluate` catches parse/construction errors internally and normally resolves
  `undefined`. `onEvalError` must rethrow for the adapter's `play()` to reject.
  The three original regressions failed before the fix: errors resolved,
  samples/audio were uninitialized, and Stop could be overtaken by a pending
  evaluation. They passed after the adapter changes. A fourth test covers retry
  after a manifest failure. Operations are serialized; one failed edit does not
  poison later edits or Stop. A never-settling arbitrary user evaluation can
  still block this queue; arbitrary-code cancellation is outside this spike.

## Activity hooks

`Pattern.onTrigger(callback, false)` provides an event callback while preserving
normal Web Audio output. The default second argument is `true`, which disables
the default output. Keep the observer synchronous, cheap and non-throwing. The
callback receives `(hap, currentAudioTime, cps, targetAudioTime)`; it runs during
lookahead scheduling, **before** the event sounds. Schedule the visual for
`max(0, targetAudioTime - currentAudioTime)` and cancel pending visuals on Stop
or patch replacement. Respect reduced motion in the UI.

In `@strudel/web`, the `editPattern` initialization hook can attach that
observer to each evaluated pattern without adding activity calls to saved code.
The callback's event includes voice `id` controls for `$:` branches, but it does
not identify every module that contributed to a shared/fan-out expression.
Module IDs/source ranges need deliberate generator/reader mapping in #4/#6;
voice IDs or array indexes are not stable module identity. Observe final
transformed events so ITER/JUX/etc. activity follows the actual event stream.
CODE with its own dominant trigger remains user code; an observer cannot safely
turn its default audio output back on. The probe deliberately adds observer
calls only to its own test expressions; none is added to saved patches.

## Errors and last-good playback (#12 handoff)

| Failure                                           | Observed behavior                                                                  | Contract for later UI work                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Invalid JS (`note("c3"`)                          | `SyntaxError`; old pattern continues scheduling                                    | Show failed draft separately from accepted playback; adapter rejects                    |
| Construction error (`note("c3").missingMethod()`) | `TypeError`; same old pattern continues                                            | Same distinction; do not claim playback stopped because evaluation failed               |
| `setcpm(60/4)` before that construction error     | Old pattern remains, tempo changes to 60 BPM                                       | Arbitrary JS evaluation is not transactional; no complete last-good rollback promise    |
| Missing sample/sound at output time               | Evaluation succeeds; later output logs an error, and affected events can be silent | A resolved evaluation does not establish successful audio output or sample availability |
| Sample-map fetch/JSON failure                     | Initialization rejects; next Play can retry                                        | Surface initialization failure separately from code parse failure                       |
| Audio file/decode failure after map registration  | Happens lazily at trigger time                                                     | Keep this separate from manifest readiness; first sample trigger can be missed          |
| Stop                                              | New scheduling ceases; already started/scheduled notes and send tails can ring out | Transport Stop is not an immediate hard audio mute                                      |

The installed REPL catches query/scheduler errors and output-trigger errors in
separate paths; its evaluation callback is not a universal error channel. No
production late-error subscription or transactional rollback has been added.
Parse errors include parser locations (the probe reports `1:9`), while runtime
errors can contain stacks from transpiled/evaluated JavaScript. A runtime stack
is not a proven mapping to a rack module or original source range; #12 should
show the error without inventing a precise module/line highlight. These
limitations were shared with the interaction-design track; that track owns the
resulting UX decisions.

## Workspace recovery boundary (#12)

The [workspace error audit](error-verification.md) reproduces manifest, resume,
construction, missing/decode sample, late output and never-settling evaluation
failures against the installed engine. It defines the 10-second pending warning
and export/reload fallback without claiming cancellation. #36 owns remaining
resource/output subscriptions and in-page recovery. Synchronous code blocking the
main thread cannot be interrupted by the workspace UI; asynchronous work that
never settles keeps the serialized Stop pending. These are execution limits,
not parser errors or source rollback.

## Samples and deployment

`@strudel/web` loads synths, but no external sample banks by default. Its
`prebake` hook now awaits these two pinned maps on first engine use:

- [Dirt-Samples manifest](https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/strudel.json)
  with audio base
  `https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/`.
- [tidal-drum-machines manifest](https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/tidal-drum-machines.json)
  with audio base
  `https://raw.githubusercontent.com/ritchse/tidal-drum-machines/6577395a4d05031728ced2ec3e5637fa89d8be48/machines/`.

The explicit bases override moving `_base` URLs in the manifests. Dirt-Samples
provides default `bd`/`hh`/`sd`; the drum-machine map provides the catalog's
`RolandTR808` and `RolandTR909` banks. Omit `.bank()` for the default bank;
`.bank('')` fails mini-notation parsing in this engine version. Audio files load
and decode on demand; registering a map does not preload its audio. Use normal
browser HTTP caching, with no service worker or application offline cache.
A map outage currently blocks first Play, including the fixed synth demo, and
is reported as initialization failure; retry is supported.

Local browser checks confirmed cross-origin manifest/audio loads and nonzero
sample output. Hosted-origin CORS/cache and PCM checks passed after deployment; see the
[dated hosting verification](deployment-verification.md#rollback-and-engine-follow-up).
Issue #22 owns hosting and workflows and received the source URLs and first-click
findings. This change adds no infrastructure, CSP or proxy rules.
Previously opened hosted tabs also depend on the retained lazy engine chunks
already handled by #22.

## Orbit evidence and allocation

The real engine retained delay time/feedback `.125/.2` and `.5/.6`, and reverb
size `2` and `6`, on separate orbits at the same time. The installed
`superdough` creates one delay and reverb node per orbit, then updates their
parameters on subsequent triggers; it does not create an independent bus per
voice. The upstream [orbit documentation](https://strudel.cc/learn/effects/#orbits)
warns about this shared state too.

The decision is [one dedicated orbit per final voice](translation-rules.md#effect-orbits).
Do not optimize by comparing knob values. Preserve arbitrary imported routing
and exclude only proven generator routing from module identity. When a new
patch or changed final voice ordering reassigns orbit numbers, #4 must reset
old global buses (`resetGlobalEffects` is exported by this version) as part of
structural replacement; re-evaluation and `hush` do not do that automatically.
Resetting disconnects existing buses and tails, so it belongs to explicit
structural replacement, not a normal knob change. The adapter does not guess
whether an arbitrary code edit changed the routing graph.

## Verification environment and limits

The observed browser is Chromium 156 on Linux x86_64, stereo output with
48 kHz PCM capture, default engine audio configuration, and multi-channel orbit
routing disabled. Node is 24.22.2. The lockfile resolves `@strudel/web` 1.3.0,
core/transpiler 1.2.6 and webaudio 1.3.0. The machine had 16 logical CPUs and
load averages 0.32/0.38/0.26 before the runs; no competing audio verification
was active. Samples were first decoded lazily, then reused from browser/memory
cache on subsequent runs. The baseline/edit pairs use the same synth and
capture path; there is no throughput or speedup claim. Scheduling and browser
lookahead, not pure code-generation time, bound when edits reach the output.

Recorded signal/scheduling results are separate from human listening: physical
speaker output and subjective clicks were **not heard** in this harness. A
clean PCM/cadence result supports this tested patch, not every patch, device,
browser or load level. Sustained notes, slow networks, high polyphony, mobile
Safari and a hard-mute UX are not established by this spike. See the committed
[run data](engine-spike-results.json) for the baseline/edit comparison and errors.
The [Strudel embedding guide](https://strudel.cc/technical-manual/project-start/)
and [sample documentation](https://strudel.cc/learn/samples/) provide upstream
context; installed source and runtime observations above determine this
version's behavior.
