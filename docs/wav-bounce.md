# WAV bounce (#140)

**Bounce WAV** beside Export renders the applied patch from cycle zero. The
cycle input defaults to 4 and accepts whole counts from 1 to 128; the adapter
also refuses nonpositive/nonfinite tempo and durations above 10 minutes. These
bounds limit the pinned renderer's in-memory stereo buffers. Output is
44.1 kHz, stereo, 16-bit PCM with exactly `cycles / cps` seconds, including only
tails inside that range. OUT's catalog-backed master volume applies to the
offline output. Bounce is disabled for unapplied/invalid drafts and while a
bounce runs. It captures accepted source, name and volume at click time;
later edits do not change that download.

The filename uses [#62's sanitation](patch-format.md#patch-names-62), with `.wav`
instead of `.strudel`, including **Untitled patch.wav** for unnamed patches.
For example, `Café / drums.strudel` downloads as `Café - drums.wav`. Bounce does
not rewrite executable source or saved rack metadata, create an undo step,
or start live playback afterwards. Explicit Play starts it again.

## Pinned engine boundary

Verified against the lockfile's web/webaudio 1.3.0, core/transpiler 1.2.6 and
superdough 1.3.0. All engine access stays in `src/strudel/engine.ts`; no module
definitions or call mappings are added.

- Stop invalidates existing Play/live-edit intent before evaluating the exact
  file with `evaluate(code, false)`. The offline guard returns the raw pattern,
  without live activity decorations or scheduler start. Tempo comes from the
  pinned scheduler after evaluating setup statements.
- `renderPatternAudio` closes the current context, installs an offline context
  and output controller, awaits `superdough` for every onset in time order, then
  renders and downloads. Sample triggering awaits fetch **and decodeAudioData**
  before connecting nodes. Offline time stays zero while loading, so cycle-zero
  samples are not skipped. Manifest registration and the upstream early
  `loaded-sample` log still do not establish global readiness.
- The live scheduler retains its original context in a closure. Closing it
  would leave Play with a dead clock. The adapter preserves that context and
  controller, clears effect buses, suspends it, and passes a disposable context
  for the renderer to close. A `finally` restores the same live context and
  controller, resumes it and restores master gain, including failures before the
  renderer's own cleanup. Existing tails are cleared; scheduling stays stopped.
  Dispatched live output promises drain before the swap: a cold live sample can
  still be decoding after Stop, and otherwise connects nodes across contexts.
  Superdough 1.3.0 also reuses pooled filters/worklets without a context check.
  The hash-verified `postinstall` fix in `scripts/patch-strudel-audio-pools.mjs`
  rejects nodes belonging to another context in both bundled entry points and
  the upstream source. `npm ci` applies it without changing pinned versions;
  unexpected dependency bytes fail installation and require deliberate review.
  Remove this fix when the pinned upstream enforces context ownership.
  The same pinned patch gives `webAudioTimeout`'s cleanup gain its explicit
  context, rather than the current global context. Offline `onended` callbacks
  can run after live restoration; using the global context threw an uncaught
  cross-context connection error even when the WAV and replay had PCM. The
  browser regression captures uncaught errors and failed before this fix.
- The pinned renderer catches per-event output/decode errors, logs them and can
  still download a partial/silent WAV. The adapter captures observable errors,
  rejects completion and warns **Downloaded WAV may be incomplete** through
  [#36's error path](audio-recovery.md). Evaluation failures download nothing.
  Both retain editable source/rack and require explicit Play/Bounce after
  correction, with no invented source locations.

Stop invalidates pending arbitrary evaluation immediately. Its eventual pattern
cannot install, and Play is refused until that evaluation settles. Offline
rendering/sample loading has no cancellation API: once started it must finish
before Play, and Stop does not promise to cancel its download. A hung sample
request or uninterruptible JavaScript can require export/reload. Arbitrary side
effects, external outputs and custom output callbacks are not universally
captured or rolled back. The upstream rejected sample-promise cache can require
a reload to retry the same bad resource.

## Observed proof

On 4 November 2026, pinned Node 24.22.2 and `npm ci`:

- `npm run check` passed: 935 unit cases, 43 guardrails, unchanged reader coverage,
  formatting/skill integrity, lint, TypeScript and build. Focused tests cover
  raw source/range/volume, concurrent Play refusal, restoration on render
  rejection, pending-evaluation Stop recovery, failure ownership, explicit replay
  and both filename extensions.
  The immediate cold-Play/Bounce regression first failed because rendering
  started with a dispatched output still pending; it passes after draining.
  A real-browser filtered-patch regression first failed with cross-context
  connections after live nodes returned to the pool. It checks filtered WAV
  PCM and explicit replay after the install-time ownership fix.
- The shared T3 browser ran `scripts/bounce-check.mjs` against Vite. The focused
  Playwright **WAV bounce and live audio recovery** case passed too, in a fresh
  context with `--autoplay-policy=user-gesture-required`. It belongs to the
  separate browser acceptance gate, not the deterministic `check` command.
- Actual `Café - drums.wav` downloads were 705,644 bytes: 4 seconds for 2 cycles
  at 30 cpm, stereo 44,100 Hz / 16-bit PCM. A cold `bd*4` sample had all eight
  onset windows at RMS **0.14431754**, including the first 120 ms at cycle zero.
  Decoding was delayed another 350 ms; rendering began after that promise
  settled. This measures file PCM, not perceived sound.
- Independent checks retained exact source and full saved rack identity, and
  queried eight raw `bd` events over `[0, 2)`. Subsequent Play used the same live
  context/output and measured RMS **0.07937**. A real invalid-audio decode failure
  surfaced the incomplete-WAV warning; evaluation failure downloaded nothing.
  Source remained editable and explicit correction/Play produced RMS **0.12761**.
  Physical speakers/headphones and other browsers/devices remain unverified.
  The filtered regression measured WAV first-hit RMS **0.09559** and subsequent
  live replay RMS **0.09042** after released nodes had populated the live pool.

Repeat with Vite and `verifyBounce()` from `/scripts/bounce-check.mjs` after a
user gesture, or provision Playwright Chromium and run:

```sh
npm run test:browser -- --grep 'WAV bounce'
```

The suite inspects Blob bytes while allowing native downloads. Decoder delay
and offline-start instrumentation are test-only. It also checks invalid counts,
unapplied drafts, Bounce while playing, failures and live PCM after recovery.
