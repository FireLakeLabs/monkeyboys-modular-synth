# Audio failure reporting and Stop recovery (#36)

Verified 2 November 2026 against the lockfile: `@strudel/web` 1.3.0,
core/transpiler 1.2.6, webaudio 1.3.0 and superdough 1.3.0. This contract
supersedes the cancellation/reporting limits in the earlier
[engine spike](engine-spike.md) and [workspace audit](error-verification.md).

## Execution and cancellation contract

`src/strudel/engine.ts` owns initialization, evaluation, output gain, failure
notifications and Stop. Patch/source transformations remain independent of audio.
The installed source establishes these boundaries:

- `web/web.mjs` forwards options to `webaudioRepl` and exports a singleton
  evaluator and `hush()`. `core/repl.mjs` awaits user evaluation, calls
  `editPattern` before scheduler installation, and catches evaluation errors;
  our `onEvalError` callback rethrows them to the submitted Play promise.
- `core/cyclist.mjs` can yield between installing a pattern and starting its
  clock. Its `onToggle` callback runs **after the first tick**. The adapter guards
  both installation and the pattern's query function with the Stop generation,
  then hushes a cancelled start through `onToggle`. A UI revision check alone
  would not prevent those events.
- Stop invalidates queued/active Play intent synchronously and calls `hush`
  directly, outside the evaluation queue. Cancelled Play promises reject;
  their eventual results/rejections are still handled. Stop confirmation means
  the scheduler was stopped, not that evaluation was interrupted.
- There is no abort API for arbitrary evaluation. An abandoned evaluation can
  still execute JavaScript, change tempo or produce other side effects. While
  it remains unresolved, new Play is refused because concurrent evaluations
  share Strudel's bindings and transforms. Editing, export, Stop and Open/New
  remain available. When it settles, its pattern cannot install; explicit Play
  can recover. If it never settles, export then reload/close the page to recover.
- Synchronous code blocking the main thread also blocks Stop, export and the
  pending warning. Browser-level tab termination is the remaining boundary;
  unsaved work can be lost. This is not a sandbox or side-effect rollback.
- Stop ends scheduling. Existing notes, effect tails and already dispatched
  asynchronous output work can finish afterward; immediate silence is not promised.
  A thrown hush reports unknown scheduling and permits an explicit Stop retry.

Live edits remain serialized. A failed live edit invalidates queued edits and
requires explicit Play after correction. Stop/replay starts a new transport intent,
so an abandoned evaluation's rejection cannot overwrite that newer intent.

## Observable failures and source ownership

The core logger dispatches `strudel.log` CustomEvents with `message`, `type`
and `data`; webaudio forwards superdough logs to it. The adapter validates the
payload and reports error-typed entries and the installed `[origin] error:`
format. Missing sounds, sample fetch/decode failures, query failures and output
callback exceptions reach this channel in the tested cases. Evaluation logs are
excluded because the Play promise already reports their exact submitted revision.
No console interception or catch-all window error handler is installed.

Late logs carry no reliable source revision, line, column or module. They use the
editor status footer with no source attribution, request Stop and retain editable
source and the accepted rack. Even a late error from older work conservatively
stops current scheduling; it is not assigned to current code. Evaluation errors
retain the submitted source for earlier-revision labeling, with no inferred stack
location. No installed hook supplies a proven runtime source range.

Manifest status is unknown before initialization, loading during registration,
registered after both manifests and audio initialization succeed, or failed after
an observed resource/output error. Registered manifests do **not** prove sample
readiness: `superdough/sampler.mjs` logs `loaded-sample` **before** awaiting
`decodeAudioData`. The editor status footer’s Audio engine info control explains that
decoding/output are unverified and retains an observed-failure indicator across
Play retries. Its concise “Ready” label means stopped transport, not sample
readiness; see the [#73 status contract](design.md#editor-status-73). No global "samples ready"
state is inferred. Successful initialization retries registration; Strudel caches
rejected audio-buffer promises, so retrying the same failed sample can require a
reload. No resource-specific retry action is offered.

Reporting is limited to errors upstream emits. Its logger deduplicates identical
messages within one second; logs omit precise resource metadata for some failures.
User code can replace logging, invoke engine APIs directly, or launch detached
work outside the adapter. Neither universal failure detection nor cancellation
of arbitrary side effects is claimed.

## BYTEBEAT and speech additions (#143/#144)

BYTEBEAT formula syntax is checked without execution at panel mutation and
again before real WebAudio output, including source-owned CODE. A syntactically
valid formula can still throw in the DSP worker. The pinned postinstall patch
forwards that worker exception once through its MessagePort, zeros the failed
processor output and ends that processor. The adapter validates the message and
reports it through the same late-failure channel as engine logs. The workspace
then shows Audio error and explicitly stops the patch, instead of silently
losing only BYTEBEAT while unrelated voices keep scheduling. No source/module
location is inferred from the worker message. Arbitrary trusted code can still
block a worker; this does not make formulas safe or interruptible.

This is a narrow hash-checked exception in
`scripts/patch-strudel-audio-pools.mjs` and `scripts/bytebeat-worklet-patch.mjs`,
covering the installed worklet source and both consumed ESM bundles. Remove it
when the pinned upstream processor reliably reports exceptions through an
adapter-observable channel. Installed-payload VM tests exercise the actual
bundled processor; real-browser failure and stopped PCM are separate evidence.
It does not repair Kabel's different construction/lifetime limits in #142.

The adapter explicitly registers the pinned ZZFX sounds after audio initialization;
upstream exports that registration but does not run it in its default prebake.
SPEAK uses a dominant trigger, unwrapping routed primitive words before requesting
a native utterance. Stop calls `speechSynthesis.cancel()` synchronously, including
while evaluation is pending; accepted pattern replacement also cancels previous
speech. Speech bypasses Superdough, effects and all app volume controls.
A missing requested voice leaves the utterance's voice unset for browser-default
selection. Missing Web Speech APIs produce no request. An OS with no speech
engine can still report native `synthesis-failed`: successful fallback selection
is not proof of native speech output. See [observed browser limits](extras-verification.md).

## Reproduction and evidence

Use the pinned Node version, `npm ci`, then:

```sh
npm run check
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
# In another terminal, with Playwright Chromium provisioned:
node scripts/workspace-errors.mjs http://127.0.0.1:5173 /tmp/monkeyboy-audio-recovery
```

The browser suite asserts workspace behavior using deterministic adapter fixtures,
then real Strudel in fresh isolated Chromium contexts with
`--autoplay-policy=user-gesture-required`. It reproduces a 503 manifest,
one-shot resume denial, missing sample, invalid audio bytes, construction throw,
late output callback throw, a one-shot real scheduler `clearInterval` failure,
a never-settling evaluation and an abandoned evaluation that later resolves.
It checks no audio initialization before Play, explicit retry after errors,
unknown scheduling on failed Stop, draft/rack retention, export and Open/New
safety, no scheduler restart on abandoned completion and replay after settlement
or reload. Source preservation and saved rack identity remain separate from audio
checks. Browser fault injection establishes recovery for those faults, not native
OS denial, every browser or every audio device.

The focused unit regressions first failed on queued Stop (timeout), queued Plays
running after Stop, and an abandoned rejection overriding explicit replay. They
now pass, alongside guards for initialization, output logs and the start/query gap.

Committed [run data](audio-recovery-results.json) records the browser assertions
and measured PCM. PCM taps the real WebAudio output before the physical device:
synth output remains nonzero through an invalid draft and falls to zero after
Stop plus release time. Physical speakers/headphones were **not heard**; no
subjective or cross-device audible-continuity claim is made. The browser suite
remains separate from the deterministic shared gate because it needs Chromium
and external sample resources.

## Cartridge manifest failures (#137)

The [cartridge adapter](cartridges.md#engine-api-for-138) now catches and reports
individual manifest failures without rejecting initialization or unrelated
voices. Its per-pack registration snapshots supply the bay LEDs and inventory;
the aggregate diagnostic can still report a failure. This supersedes the older
all-or-nothing factory-prebake behavior above. Late sample decode/output/query
logs retain the existing Stop/recovery contract and uncertain attribution.
