# Sound-source and effect acceptance (#131)

Observed 4 November 2026 on Node 24.22.2, locked core 1.2.6 / superdough 1.3.0.
The [catalog contract](module-spec.md#sound-sources-and-voice-effects-131) records
all eleven panels, jacks, defaults, supported ranges and engine limitations.
Issue #134 is open during this implementation; rule 4's fixed chain applies.

## Independent claims

- `src/modules/sound-effects.test.ts` imports all 32 source/call forms, checks the
  expected module controls and absence of CODE, and separately asserts untouched
  exact bytes, save/reopen of the complete rack, and actual pinned-engine onset
  events after generation. Each panel also builds from palette defaults. Literal
  edits cover numeric, string and array values without rewriting surrounding
  comments. Prior whole-voice and suffix CODE retain saved ownership.
- Specific regressions cover explicit noise silence, 16-bit crush, missing FM
  envelopes (including numeric envelope defaults), coarse-only and depth-only
  phaser calls. Speculative failed PAN projection restores the reader cursor;
  the pre-change trance source/projection/generation digests remain unchanged.
- Fixed-chain checks retain generated events and explain reverse ordering and
  shared distortion setters. PAN uses existing CV bindings; its rack reopens
  with OSC's dedicated FM OP route intact. Unsupported arguments stay exact CODE.
- `scripts/sound-effects-browser.mjs` runs in the browser acceptance workflow.
  The shared geometry probe checked all **34 Hardware panels in each of four
  looks**, including the eleven additions, at catalog widths with scrollable,
  reachable controls and live jack/cable geometry. The drawbar edit used native
  keyboard input, changed partial 2 from .5 to 1, retained saved rack identity,
  and changed the count to eight with eight reachable sliders. A native eight-move pointer drag is restored by one Undo.
- In Chromium 156.0.8078.4, **31 forms produced nonzero real WebAudio PCM** and
  scheduled events with exact source and saved identity retained. Each probe
  sampled 122,880 values. Nullary `.shape()` was preserved and recorded as an
  engine limitation; its lack of a numeric amount caused the initial actual
  playback run to fail, while `.shape(.5)` produced nonzero PCM. Nullary named
  distortion helpers are inert in the pinned engine and are never silently
  assigned an amount. The final matrix has no page errors. [Raw results](evidence/sound-effects-browser.json).

PAN CV also ran in stereo: SMOOTH/ENV changed within-note balance, STEP stayed
stable within a sustained note, and CV SEQ reached the left channel. All four source modes restored the
complete saved rack. SMOOTH/ENV depth .25 wrote native `depthabs: .5`; import
divides the AudioParam scale back into panel units. The final combined browser run passed all assertions in one session.

Shared-preview geometry passed. Its Play action timed out twice (15 s and 3 s);
Playwright provided the real playback/PCM and native-input proof. The private
canvas access was unavailable; the repository's exported
Hardware look reference was available. Physical listening, Firefox, Safari,
mobile devices, stereo SHIFT cost and maximum safe polyphony are unverified.
These are stated verification limits, not missing supported module mappings.

## SHIFT cost

Claim measured: CPU time to process one second of mono audio through each
SHIFT voice's **exact bundled** phase-vocoder processor at stretch 1.5.
`scripts/shift-cost.mjs` extracts the worklet from installed superdough's shipped
bundle, registers its actual processor in a VM, and calls its real `process`
method on every 128-frame block. It consumes and checks every output sample;
all runs have zero errors, finite nonzero PCM and the expected sample count.
It does not evaluate an unconsumed lazy pattern or measure only call generation.

Host: AMD Ryzen 7 PRO 6850U, 16 logical CPUs; Node 24.22.2; 48 kHz mono;
2048-frame FFT/window with 128-frame hop; eight seconds of 220-Hz sine input.
JIT, tables and buffers warm before timing. Five interleaved copy/SHIFT pairs
at one and four concurrent voices. CPU usage is process user+system time,
normalized by actual voices and audio seconds. Each four-voice run consumes
1,536,000 samples. This is a processor-only cost, excluding node construction,
scheduler, live browser rendering, sample fetches and audio-device overhead.

| Voices | Copy/validation median (range)   | SHIFT median (range)                   |
| ------ | -------------------------------- | -------------------------------------- |
| 1      | .289 (.245–.444) ms/voice-second | 27.078 (25.695–37.378) ms/voice-second |
| 4      | .297 (.245–.392) ms/voice-second | 28.541 (26.772–43.272) ms/voice-second |

[Raw runs, CPU model and worklet SHA-256](evidence/shift-cost.json).
`node scripts/shift-cost.mjs /tmp/shift-cost.json` reproduces the measurement.
A separate, unreported `node --cpu-prof` run found `shiftPeaks` (1658 samples),
`_transform4` (1421), `processOLA` (931) and `_realTransform4` (844) dominant;
copy/output validation (`run`, 137) and GC (61) were small. FFT/peak shifting on
one CPU is the limiter. One voice's 27 ms per audio second is about 2.7% of one
core, arithmetically plausible and consistent with four voices. It is not a
browser capacity threshold or a speedup claim.

The initial load average was 1.31/1.16/.53 on 16 logical CPUs. Other wave-three
Vite/browser work was running; a later profile-time load was 2.71/2.35/1.27.
Interleaving limits drift bias but cannot remove host contention. The ranges
capture visible variance. No CI timing threshold is introduced. Real-browser
positive/negative SHIFT PCM is the end-to-end proof that the app schedules and
outputs this effect, separately from the CPU micro-measurement.

## Verification commands

- `npm ci` with pinned Node; `npm run check` is the deterministic/CI gate.
- `node scripts/sound-effects-browser.mjs http://127.0.0.1:5131 /tmp/monkeyboy-sound-effects`
  with Vite running; also included in `npm run test:browser`.
- The reader coverage manifest includes the new exercise with MIT provenance;
  its new baseline is fully mapped. Existing patch baselines do not regress.

The existing trance acceptance also passed: 29 modules, four voices and four-cycle
onset snapshots survived repeated Play and export/reopen. Master and all four
orbit probes produced nonzero PCM, with exact source and saved/rendered rack
identity retained. [Raw trance result](evidence/sound-effects-trance.json). The
standard Playwright runner's port 5173 was occupied by another wave-three thread;
the same committed trance functions ran in an independent Playwright context
against this worktree's server on 5131.

The deterministic gate passed 1,508 tests and 43 guardrails, formatting, skill
integrity, lint, reader coverage, TypeScript and the production build.

Review/CI/merge results are recorded in the pull request; the raw browser and CPU
records above are dated observations rather than promises about every device.
