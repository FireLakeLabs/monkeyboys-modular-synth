# BYTEBEAT, CHIP and SPEAK verification (#143/#144)

Implementation and verification on 9 November 2026, starting from main
`fc720eee93d1cba2041f19207efcdeb9b2d7e1ee`. The pinned runtime is Node 24.22.2,
`@strudel/web`/Superdough 1.3.0 and core 1.2.6. This report keeps exact source,
saved identity, scheduled events, measured digital PCM and native speech-provider
observations separate. No physical listening was performed.

## Acceptance and implementation

| Issue criterion                           | Implementation / evidence                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #143 catalog, pinned defaults/ranges      | `catalog.ts` and the [module spec](module-spec.md#equation-chip-and-speech-sources-143144): 15 built-in BYTEBEAT equations; explicit preset/start modes; all six registered CHIP waves and all eight effect controls. Finite UI bounds are distinguished from unrestricted upstream numbers.                                           |
| #143 exact source, saved identity, events | `extras.test.ts` independently checks exact imported bytes, complete export/reopen patch identity, all 15 presets, six waves, optional setter presence, literal edits, escaped formula bytes and unsupported CODE. `extras.spec.mjs` queries the actual pattern installed by the engine and the generated/reopened pattern separately. |
| #143 code trust and failures              | Formula syntax is checked without execution; arbitrary formulas remain trusted CODE. Bare/unsupported formulas and raw ZZFX arrays stay CODE. Real browser syntax and DSP exceptions must show Audio error, restore Play and stop unrelated scheduling through #36. Failed/stopped PCM is checked separately.                          |
| #143 every family look                    | Real pointer/keyboard edits in all three Alien BYTEBEAT looks and four Hardware CHIP looks; 16 HP, reachable controls and native jack/cable geometry. Fonts finish loading before screenshots.                                                                                                                                         |
| #144 catalog, words, LANG/VOICE           | Alien SPEAK has a pattern WORDS input, SPEECH output and `.speak(lang, voice)` tuple controls. Words remain a source-owned CODE pattern. Source and full saved identity are tested independently of actual dominant-trigger events.                                                                                                    |
| #144 bypass explanation                   | Plain panel notice and both speech-to-MIX and downstream MIX-to-OUT cable warnings state that effects, MIX level and OUT volume are bypassed. Zero WebAudio PCM from speech is a routing observation, not proof of spoken sound.                                                                                                       |
| #144 Stop                                 | Production native speech requests and Stop/replacement cancellation remain in `engine.ts`. Native cancel calls are recorded; a separate explicitly controlled provider proves cancellation while its request is in progress.                                                                                                           |
| #144 availability / fallback              | Native API enumeration and utterance callbacks record actual browser/OS availability. A missing requested voice leaves `voice` unset. A controlled provider and unit test prove fallback selection without exceptions; they do not establish a working native synthesis engine.                                                        |
| Both static/browser verification          | Commands and failures below; complete local and final-head hosted browser acceptance remain shipping gates.                                                                                                                                                                                                                            |

## Pinned implementation findings

The issue's illustrative bare `.bbexpr("t*(t>>8)")` is not a reliable literal
formula with today's `miniAllStrings`: it can be parsed as mini notation. The
writer uses `.bbexpr(pure('t*(t>>8)'))`. The reader owns only that recognizable,
single-quoted constructor, retaining local helpers and unsupported expressions
as CODE. Missing `.n`/`.bbst` and explicit zero setters are semantically distinct;
mode controls retain that distinction without inventing sound-affecting defaults.

Upstream exports ZZFX registration but does not call it in default prebake; the
engine adapter now registers the pinned waves. No new sound package is added.
The first real CHIP test caught this missing registration before the fix.

A syntactically valid but failing BYTEBEAT equation initially left the workspace
Playing. The worklet did not surface the expected native `processorerror`.
A narrow hash-checked postinstall patch now forwards the actual DSP exception via
MessagePort, emits silent failed output and terminates that processor. The
adapter reports it through #36; this is an explicit whole-patch Stop, rather than
a silent loss of one voice. Actual installed-payload VM tests failed before the
patch and pass after it, with a healthy nonzero control. This exception does not
fix Kabel's separate #142 boundaries. See [audio recovery](audio-recovery.md#bytebeat-and-speech-additions-143144).

## Browser observations and limits

The native shared-browser probe ran Linux x86_64 Chrome 156 with an empty native
voice list. It forwarded real utterance requests for hello/modular/world with
`voice: null`; native callbacks reported `synthesis-failed`, with no observed
start. Stop issued native cancel. This is an unavailable speech engine, **not
successful spoken output**. Missing voice selection and missing native synthesis
are different boundaries. Other OS/browser voice inventories and actual sound
from speakers/headphones remain unverified.

The automated native-provider test forwards the real browser's `speak` and
`cancel`, records platform/user agent/voices/start/end/error callbacks, and checks
actual words and dominant scheduler events separately. Its controlled-provider
counterpart is explicitly labeled a stub. A provider with no matching voice
receives an unset voice and the requested language. That fallback selection does
not prevent OS-level `synthesis-failed` when no speech engine is available.

PCM probes sample the app's real destination gain through an AnalyserNode:
25 windows at 20 ms intervals, FFT size 8192. They require RMS > 0.0001 for every
BYTEBEAT preset and CHIP wave. Two bounded custom equations target 220/440 Hz and
must measure within 12 Hz. Stop/error checks wait for the known short fixture
tails, then require peak < 0.000001. This is digital output/FFT evidence, not
latency, CPU, loudness quality, physical listening or universal polyphony proof.

All ten new-panel look screenshots were inspected at 1600×1000 after fonts
loaded: readable labels, fixed width, native controls and live cable endpoints.
The private canvas was unavailable; local archived exports supplied the reference.
The existing rack frame and arranger footer remain in place.

## Commands and retained failures

- `npm ci` on pinned Node 24.22.2 completed, including the hash-checked dependency
  patch. `npm run check` passed after the worker patch; final verification is
  recorded below when complete.
- First focused run: **RESULT passed=6 failed=3 exit=1**. Findings: missing CHIP
  registration, an incorrect test expectation of one rather than two propagated
  speech cable warnings, and the real BYTEBEAT DSP reporting gap. Captures were
  retained at `/tmp/extras-focused1-artifacts`; no retries were configured.
- After those fixes, focused run with two workers on strict 5174:
  `npm run test:browser:report -- --config /tmp/extras-playwright.config.mjs tests/browser/extras.spec.mjs tests/browser/auto-apply.spec.mjs -g 'BYTEBEAT|CHIP|bytebeat|chip|speak|SPEAK|readable half-typed'`:
  **RESULT passed=9 failed=0 exit=0**, 39.3 s. Captures:
  `/tmp/extras-focused2-artifacts`, log `/tmp/extras-focused2.log`.
  A separate checkout's full suite overlapped this focused run briefly; no
  performance or failure-cause inference is made from that overlap. The full
  verification run waits for an exclusive machine handoff.
- The inherited main runs remain failed:
  [42542065710](https://github.com/FireLakeLabs/monkeyboys-modular-synth/actions/runs/42542065710)
  (194 passed / one auto-apply Stop-button timeout) and
  [42546562588](https://github.com/FireLakeLabs/monkeyboys-modular-synth/actions/runs/42546562588)
  (193 passed / that cleanup plus DRUMS silent baseline). The accepted CODE/source
  assertions are retained; test cleanup now uses the global Stop shortcut instead
  of depending on a transient Stop button. The PCM threshold is unchanged. No
  #207 cause is inferred from these failures or later success.

## Complete local run and raw feature evidence

On clean feature head `fba3a6ee12037ad2d74e046d966c842ce8b97a4b`, final
`npm run check` passed: **2,535 unit tests**, **53 guardrail tests**, reader
coverage, lint/format/skills and production build. The initial final-check attempt
caught a test stringification warning; narrowing CODE text to a string resolved it.

Exclusive full local run, strict 5174, two workers and zero retries:

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/extras-full-results.json PLAYWRIGHT_HTML_OUTPUT_DIR=/tmp/extras-full-report npm run test:browser:report -- --config /tmp/extras-playwright.config.mjs --reporter=line,html,json
```

**RESULT passed=202 failed=1 exit=1**, 15.3 minutes. Source was unchanged throughout;
all child script drivers received 5174 explicitly. The retained original log is
`/tmp/extras-full.log`, report `/tmp/extras-full-report`, captures
`/tmp/extras-full1-artifacts`. The sole failure was the generic library signal
check asking `exercise-speak` for nonzero WebAudio PCM (measured RMS
0.0000003227). Its screenshot shows Playing, accepted source, SPEAK and its bypass
notice. The dedicated native-provider test correctly measured speech bypass.
The library check now classifies only this known speech-only fixture, requiring
dominant speech events and RMS < 0.000001. Every audio fixture retains its original
RMS > 0.0001 assertion. This is a verification correction; no production behavior
changed after the complete run. The affected complete library audio/Cancel/Stop
test is rerun separately; the failed original is not counted as a clean pass.

The full module-exercise matrix passed, including a nonzero DRUMS baseline with
the unchanged threshold. This does not diagnose prior silence or #207.

Raw feature evidence from that original complete run is committed separately:

- [BYTEBEAT](evidence/extras/bytebeat.json): all 15 presets, exact source/full saved
  identity assertions, actual and generated events, custom equations and PCM.
  Preset RMS ranges from 0.00338 to 0.01017; custom tones measure 222.65625 and
  439.453125 Hz at 48 kHz; stopped peak is zero.
- [CHIP](evidence/extras/chip.json): six waves, all exposed effect controls,
  independent source/identity/events and PCM; RMS 0.00613–0.01224, stopped peak zero.
- [Failures](evidence/extras/failures.json): actual syntax and DSP error messages
  with a simultaneous native voice; stopped PCM is zero in both cases. Repeated
  messages are from separate scheduled processor instances, each reporting once.
- [Native speech](evidence/extras/speech-native.json): HeadlessChrome
  156.0.8078.4/Linux x86_64; zero voices, four actual word requests with unset
  voices, four native `synthesis-failed` errors, zero starts/ends. WebAudio PCM is
  zero. No successful native speech or physical listening is claimed.
- [Controlled speech provider](evidence/extras/speech-controlled.json): explicitly
  stubbed provider; one in-progress hello request, unset voice, Stop clears its
  speaking state. This is cancellation/fallback proof, not native speech output.
- Look geometry: [BYTEBEAT](evidence/extras/bytebeat-looks.json),
  [CHIP](evidence/extras/chip-looks.json), [SPEAK](evidence/extras/speak-looks.json).
  Screenshots are retained with the full-run artifacts. The long custom equation
  display scrolls within 96 px so controls and jacks remain reachable.
