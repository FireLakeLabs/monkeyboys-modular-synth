# Sounding code tokens (#72)

CodeMirror marks the original mini-notation tokens behind sounding events in
orange. `src/strudel/engine.ts` owns Strudel location validation, reversal of
transient observer offsets and scheduled AudioContext-time delivery. The editor
uses those spans directly; it does not infer events from the rack or parse source
on each event.

The playback adapter has a separate source-feedback subscription. Events and
clears never publish React transport snapshots. Executable-body/topology and
playback-intent checks reject obsolete feedback. Layout/volume-only updates keep
the evaluated pattern, whose offsets still refer to the same executable body;
feedback then identifies the current file with its updated trailing metadata.

A CodeMirror `StateField` holds token decorations, updated by effects. Concurrent
spans accumulate, retriggers renew their 400 ms lifetime and one expiry timer
removes old marks. These transactions do not change source, selection or draft
history. A document edit clears marks immediately, before React's next render.
Exact source equality suppresses events while the draft differs from evaluated
code. Playback replacement, Stop, surfaced evaluation/resource errors, editor
cleanup and runtime motion changes clear marks and timers.

Only reader-owned Hardware/Alien spans receive marks. Cached source treatments
exclude CODE and unmapped spans, including mini-notation inside an opaque call.
A supported call can still show its actual token location in a voice that also
contains CODE; that does not assign activity to the opaque transformation.
Arbitrary code without a usable location receives no invented attribution.
Reduced motion suppresses token pulses, retaining the existing steady source
colors/glows, as it does for rack event pulses.

## Verification

Run the shared deterministic gate with the pinned Node version:

```sh
npm ci
npm run check
```

Run the real browser check against a fresh Vite development server (Chromium and
external pinned sample resources are required):

```sh
npm run dev -- --host 127.0.0.1
node scripts/sounding-tokens-check.mjs http://127.0.0.1:5173 /tmp/monkeyboy-sounding-tokens
node scripts/feedback-check.mjs http://127.0.0.1:5173 /tmp/monkeyboy-feedback
```

Observed 3 November 2026 on Linux, Node 24.22.2 and Chromium 156 at 1600 × 1000.
[Raw token results](sounding-tokens-results.json) record generated exercise and
imported/shared/later-voice highlighting, original UTF-16 offsets after an astral
character, source preservation, opaque/unmapped refusal, draft/Revert behavior,
runtime reduced motion, replacement, Stop and error cleanup. The busy trance
interval delivered repeated token effects while editor React render, treatment
and source-parser counts stayed unchanged. Instrumented adapter deliveries did
not precede the scheduled audio target by more than its existing 5 ms tolerance.
The [imported screenshot](evidence/sounding-tokens.png) shows token marks beside
the retained CODE treatment.

The existing 14-check feedback browser suite also passed, including real rack
activity, IME, selection/scroll mapping, history checkpoints, unchanged geometry,
Stop/error recovery and nonzero WebAudio PCM. These browser observations are
separate from StateField/transport unit tests and the shared check gate. No
physical speakers/headphones were heard; broader browser/device coverage and
universal audible equivalence remain unverified. The archived design boards
were available; the private live canvas was not accessed.

After rebasing onto `b40d2d8` (the palette/library and rack control updates),
`npm run check` passed again: 791 unit tests, 40 guardrails, formatting, skill
integrity, lint, TypeScript and the production build. Both browser suites passed
again on that base; the linked raw results and screenshot are from this final run.

## Review follow-up

Sol approved the behavior in one round with GPT-6.1 Sol on high reasoning effort;
25 focused tests passed. S1 was a nit: replacing invalid rack metadata located
before a later voice can preserve stripped-body/topology equality while moving
that voice's source offsets. Token feedback can then be absent until Stop/Play.
Deferred as malformed-metadata offset migration outside the normal trailing
metadata contract; source/body preservation remains unchanged. No behavior code
changed after review, and no model usage figures were returned.
