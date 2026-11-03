# Switch Angel trance demo (#46)

The library entry **Switch Angel trance demo (cosimo transcription)** lives under
**Complete patches → Trance**, with stable ID `switch-angel-trance-demo`.
Its [local source](../src/library/patches/switch-angel-trance-demo.strudel) is the
exact requested code block in [issue #46](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/46),
including its final newline. Its SHA-256 is
`4c619da7a683db3f67b544b1ac01d2c53fa6c8b2681cfcfe875395e6d58bb997`.

Attribution credits Switch Angel's [live trance demo](https://www.youtube.com/watch?v=GWXCCBsOMSg)
and custom helpers, transcribed by cosimo in
[this gist](https://gist.github.com/cosimo/b0843897efb5f23b4594cb5082be1a85).
This is the user-supplied variant, distinct from the current gist's sliders,
visualization helpers and commented-out first trancegate. Loading uses bundled
source and never fetches the gist. The entry does not label the third-party
transcription as one of the repository's original MIT module exercises.

## Reader and persistence

The normal library loader reads all four `$:` voices and retains all four
`register` statements, comments, formatting and `.o(2/3/4)` calls. Unsupported
roots, helpers and control values remain source-owned/CODE. The tempo is bound
to OUT at 140 BPM. The rack has 29 modules on nine fixed 64-HP rails; the reader's
existing wrapping handles long opaque chains and overflowing mixer buses.

The pinned engine already supports `setCpm` as an alias for `setcpm`. The reader
now discovers tempo spellings through OUT's catalog data, including this alias,
and reads its `bpm/4` expression. Changing BPM splices the numeric token while
retaining `setCpm`; canonical new rack code still writes `setcpm`.
The focused regression failed before the fix because OUT had no parsed BPM;
the same test now reads 140 and verifies a preserving edit to 138.

The imported `SourceDocument`, rather than regenerated graph code, remains the
playback/export authority. No generated `.orbit(n)` overrides are appended.
Presentation/volume edits save validated rack metadata while preserving the
executable body exactly. Tests check original source, CODE/routing, valid rails,
and full export/reopen rack identity separately. Loading restores the original
and stays stopped until explicit Play, using the #45 replacement guards.

## Pinned-engine compatibility

The checked runtime is `@strudel/web` 1.3.0 with core/mini/tonal 1.2.6 from the
committed lockfile. No dependency, adapter or supplied-source rewrite is needed.

| Feature                                       | Verification                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `setCpm(140/4)`                               | Scheduler callbacks run at `140/240` cycles/second; OUT shows 140 BPM.                                                |
| `register`, `rlpf`, `rhpf`, `o`, `trancegate` | All registrations evaluate, repeated Play replaces them consistently; `rhpf(.5)` produces a 1296 Hz high-pass cutoff. |
| `bd:2!4`                                      | Four kick events/cycle retain sample index 2; default sample manifest supplies audio.                                 |
| `supersaw`, `seg`, `rib`, gate                | Both supersaw streams produce gated events with the supplied routing, filter values, fill/clip and first-voice gain.  |
| `pulse`, `dec`, `fm(time)`, `fmh(time)`       | Pulse events and output are present; time-based FM controls vary.                                                     |
| `pan(rand)`, delay                            | Second supersaw events retain delay 0.4 and varying pan.                                                              |
| Routing                                       | Kick uses the installed audio default orbit 1; supplied `.o` calls route the other three voices to 2, 3 and 4.        |

Registrations are Strudel global side effects. Stop ends scheduling; it does not
undo helper registration, and existing notes/tails can ring out. The script's
`console.log(x)` is intentionally retained. See the existing
[engine recovery limits](audio-recovery.md).

## Browser reproduction and evidence

Observed with the real browser/engine in this implementation session:
[recorded results](trance-demo-results.json) show 140 BPM, nonzero master and
per-orbit output on initial Play, repeated load/Play and exported-file reopen.
Four-cycle event counts were 16 kick, 76 first supersaw, 76 second supersaw and
64 pulse events. Full event snapshots, including timing and controls, stayed
equal across the three runs. Stop ceased scheduling, loads stayed silent, the
rendered module identities/positions and OUT look survived reopening, and injected Stop failure retained the trance
draft/rack and Export current before a successful retry. No physical listening
or comparison with the original video performance was performed.

Run `npm ci` and `npm run dev -- --host 127.0.0.1` with `.node-version`, then open
the development URL in the harness browser. On a fresh page:

```js
window.tranceCheck = await import('/scripts/trance-check.mjs')
await tranceCheck.loadTrance()
```

Click the top-bar Play button with a real user/harness gesture and wait for
**Pattern scheduled**. Then start the longer verification without awaiting it
in a short-timeout automation call:

```js
window.tranceRun = { status: 'running' }
tranceCheck.verifyTrance().then((result) => {
  window.tranceRun = result
}).catch((error) => {
  window.tranceRun = { status: 'failed', error: String(error) }
})
```

Read `window.tranceRun` after completion. The
[browser verifier](../scripts/trance-check.mjs) observes the real adapter's
existing `onTrigger` callback without changing source or suppressing audio. It
compares four-cycle event snapshots across repeated loading/Play and an actual
export/reopen. It separately measures master and per-orbit PCM, verifies Stop
ceases event callbacks, changes an OUT look through the UI, and checks saved rack
identity on reopening the exported file. Analysis taps disconnect afterward.

The test requires WebAudio and the pinned sample resources over the network, so
it remains separate from the deterministic CI gate. PCM establishes an output
signal rather than physical listening or subjective mix quality.

## Common-call reader acceptance (#77)

Measured on 3 November 2026, before and after the #77 adapters, against the exact
bundled source (same SHA-256 above):

| Projection        | Before | After |
| ----------------- | -----: | ----: |
| All modules       |     29 |    29 |
| CODE              |     17 |    14 |
| QUANT             |      0 |     2 |
| VCA               |      0 |     1 |
| Fixed 64-HP rails |      9 |     8 |

Both `.scale("g:minor")` calls now appear as QUANT in their original chain
positions, and `.gain(1.4)` appears as an editable VCA. `.dec(.1)` stays CODE
because a partial envelope cannot supply all ENV controls without inventing
values; the custom `.o(2/3/4)` calls stay CODE because they lack generator routing
provenance. See the complete [mapping contract](translation-rules.md#common-imported-calls-77).
Existing source-owned files with saved CODE keep those exact owners; fresh plain
imports receive the new projection.

The new regression suite first failed on the four missing ENV alias groups and
on lowercase scale/above-unity gain. It now checks all sixteen ENV aliases and
all twelve lowercase roots using actual pinned Strudel functions, with source
and saved rack identity assertions kept separate. A legacy saved-file regression
also failed before the CODE retention fix; forged saved text remains invalid.

Browser observations in this session used Chromium and the real pinned engine:
[`verifyTrance()`](../scripts/trance-check.mjs) passed initial Play, repeated
load/Play, Stop and exported-file reopen. The
[recorded result](reader-aliases-results.json) has identical four-cycle event
snapshots (16 kick, 76 + 76 supersaw, 64 pulse), 140 BPM and nonzero measured PCM
on master plus all four orbits in each run. Source, saved rack state and visible
module positions/looks survived separately. The probe now accepts clean Open's
immediate replacement as well as the dirty-workspace confirmation path.

A second browser fixture used
`n("0 2 4").s("sine").scale("g:minor").att(.02).dec(.3).sus(.6).rel(.2).gain(1.4)`.
It displayed QUANT, ENV and a VCA with range 0–2. Typing DEC 0.4 preserved the
short `.dec` spelling and every other source token; ArrowUp on LEVEL changed
1.4 to 1.45. Export/Open restored the full rack and exact edited source, with
audio stopped. These observations complement the deterministic event tests;
physical speakers/headphones and other browsers were not checked.

`npm run check` passed with 820 tests, 40 guardrails, formatting/skill integrity,
lint, TypeScript and the production build. Browser checks remain separate from
that shared gate and require the engine/sample resources. The private design
canvas boards were not available in this harness; no look or panel layout was
changed.

Sol round 1 found an additional legacy-file case: an entire voice saved as CODE
before QUANT passthrough support was lost during root projection. A fixture
captured through the base reader/save/edit path at `92e40810` reproduces the
invalid-metadata failure. The retention check now runs before receiver projection
as well as at suffixes; the regression verifies the saved CODE look, identities,
positions, complete call ownership and exact source after reopen.
The same legacy fixture also opened in the browser as CODE → MIX → OUT with
its saved Bare board look visible, exact export and audio stopped.

After rebasing onto `e44907a` (#118), the complete gate passed again with 829
tests and 40 guardrails. The reviewed change's stable patch ID was unchanged.
Sol approved in two rounds after the saved whole-voice compatibility fix.
