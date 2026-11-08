# War Pigs · Doom instrument (#210)

This is a new modular interpretation of the first four slow opening bars of
Black Sabbath’s composition, using Jake Brown’s public
[Ultimate Guitar transcription](https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414).
The fetched text marks 12/8, quarter = 56 and standard tuning. The
[Songsterr page](https://www.songsterr.com/a/wsa/black-sabbath-war-pigs-tab-s10137)
exposed song/track metadata only; its notation was unavailable. It supplies no
note-level corroboration. No recording or full transcription is bundled.

## Selected adaptation

One eighth slot is 1/8 Strudel cycle. Twelve slots make one slow bar, and the
four bars occupy six cycles (25.714286 seconds at OUT 56). Each SEQ stores
48 weighted slots in one source cycle, with ACCENT on that same grid before
CLOCK DIV 6. Every SEQ RATE is 1; every CLOCK explicitly has GROOVE off and
OFFSET 0. No swing is added to the compound grouping.

| Bar / cycle span | Anchor adaptation, in eighth slots     | Low support    |
| ---------------- | -------------------------------------- | -------------- |
| 1 / [0, 1.5)     | E3/B3 fifth ×9, rest ×1, D3 ×1, E3 ×1  | E2 ×9, rest ×3 |
| 2 / [1.5, 3)     | D3/A3 fifth ×9, rest ×1, G♯3 ×1, A3 ×1 | D2 ×9, rest ×3 |
| 3 / [3, 4.5)     | G♯3 ×9, rest ×1, D3 ×1, E3 ×1          | E2 ×9, rest ×3 |
| 4 / [4.5, 6)     | D3/A3 fifth ×9, rest ×1, G♯3 ×1, A3 ×1 | D2 ×9, rest ×3 |

The transcription’s high-neck E fifth becomes E3/B3; its D fifth becomes D3/A3.
The opening hammer-on is collapsed into the settled fifth. The end-of-bar
D/E slide is replaced by discrete single-note pickups. Bars 2 and 4’s open-E
and upper-string 11–12 figure becomes the selected single-note G♯3→A3 gesture;
bar 3 retains G♯3 over the low E support rather than adding another dyad.
Long ties are simplified to nine eighths plus a deliberate one-eighth breath.
These timing and voicing choices are adaptations, not an exact transcription.
No later 4/4 verse stabs, drums or full-song arrangement are included.

The warning is one B4 sine note at cycle 3, held for two cycles, ending at
cycle 5 with a .6-second release. Its 1.5-second attack and native sine vibrato
at 56/240/4 Hz with three-semitone depth give a restrained synthetic warning
contour. The note’s gate covers half the nominal 17.142857-second modulation
period: a rise and return. This is not an authentic siren sample.

## Rack and sound semantics

The bundled file is generator-owned: 20 modules, 189 rail HP, 197 HP including
pinned OUT, three 84 HP rails occupied by 71/61/57 HP. MIX names are `anchor`,
`low`, `warning`; channel 4 is spare. All three paths have dedicated orbits.
There are no CODE, AUX, wet sends, duplicated paths, oscillator noise or unison.

Anchor uses sawtooth → 12 dB LP VCF → soft DRIVE → VCA → MIX. One ENV fans to
VCF and VCA, giving equal native filter and amp ADSR. The pinned engine applies
per-note amp gain/velocity/envelope before filter and distortion regardless of
that cable drawing: VCA controls drive input, MIX `postgain` controls post-drive
balance. Each dyad note saturates separately, without shared chord intermodulation.
Defaults are cutoff 720 Hz, filter ENV amount 2, soft drive 2.5, VCA .9 and
MIX .25. Low triangle support uses VCA .3/MIX .5; warning uses .5/.6. OUT VOL
is .8. Rack cutoff/drive/MIX edits affect future onsets; held notes retain their
existing settings. A warning edit can take a phrase to sound.

## Verification and listening limits

The focused unit acceptance checks catalog-derived quantities/HP, valid actual
placement, explicit clocks, custom attribution, exact executable source and
complete saved rack identity including ENV fan-out. An otherwise valid extra
VCA fails its hard budget check. Generic library checks cover ordinary rack
edits and snapshot digests; narrowing below the occupied rail width is refused.

`tests/browser/doom.spec.mjs` exercises the actual library and production engine.
It separately checks deterministic note/onset/gate/velocity snapshots over three
repetitions, expanded start/window/gate-plus-release budgets including the seam,
a rejected overlapping-chord fixture, live PCM, native oscillator start/stop
lifetimes, connected DRIVE worklets, three orbits/no buses, per-onset edits,
Stop/replay, repeated load/Play cleanup, export/reopen and a six-cycle default
WAV through the production Bounce WAV path. The pinned oscillator includes an
additional .01-second cleanup margin; overlap calculations include it.

Measured evidence and the PR’s matching downloadable audio attachment are
recorded with the implementation revision. PCM and event checks do not prove
subjective recognizability, perceived distortion or masking. A familiar listener
must compare default, anchor-solo and warning-muted playback. No physical
listening or other-browser/device coverage is claimed by the automated suite.
Stop ends scheduling; already sounding finite notes may finish and immediate
Stop/Play may overlap old and new voices. This patch does not alter that global
transport contract.

### Observed local qualification

On 7 November 2026, Node 24.22.2, locked web/webaudio/superdough 1.3.0 and
core/transpiler 1.2.6, Chromium 156.0.8078.4:

- The three-repeat real-engine query gives **20** expanded starts per six
  cycles, **3** in the busiest sliding half-open eighth-cycle window,
  **5** simultaneous primary voices and **3** anchor voices including release
  and the .01-second native cleanup margin. The deliberately tripled-anchor
  fixture is rejected. Long gates are 1.125 cycles (anchor/low) and 2 cycles
  (warning); releases are .1/.15/.6 seconds respectively.
- Live primary oscillator scheduling independently peaks at **5**; connected
  DRIVE worklets peak at **3** during steady playback. One native vibrato
  oscillator has the expected .0583333333 Hz rate and finite gate/release lifetime.
  All three orbit slots are present once warning starts, with no buses. Repeated
  short loads/plays retain only the two triggered orbits and settle to zero
  connected DRIVE worklets. An immediate Stop/Play observed **6** overlapping
  primary oscillators, including **4** anchor voices, matching **4** active
  DRIVE worklets, and replay PCM peak **.4126**. Separately, the cumulative
  connected DRIVE peak was **6** across the repeated load/Play sequence.
  Transient restart overlap is outside the steady cap.
- The default stereo 44.1 kHz, 16-bit WAV is **4,536,044 bytes**, exactly
  **25.7142857 seconds**, peak **.53912**, RMS **.15952**, with **0** full-scale
  samples. The accent check compares the same G♯3 pitch at velocities .8 and .5 in
  anchor-solo PCM (**.14293/.11277 RMS**), separately from polyphony and low
  support. The warning-muted difference is **.01459 RMS** over the phrase;
  warning VCA/MIX were raised from .15/.2 to .5/.6 after review. Warning-muted and
  anchor-solo renders cover the same whole phrase at unchanged tempo/levels.
- The focused browser case passes library-stopped loading, bar-1 scheduler
  start, actual cutoff/drive/MIX edits on future onsets, Stop’s scheduling
  boundary over **5.5 seconds** without new onsets, finite restart overlap,
  cleanup and separate export/reopen claims. The committed render evidence
  measured master output while a known anchor was held immediately after Stop:
  **.02596 RMS / .08695 peak**. This includes any sounding low/warning voices;
  the browser test now requires nonzero master PCM in that Stop window.
  Export adds the app’s standard factory-pack setup; the original executable
  body is an exact suffix, all module/cable/layout state survives, and the
  exported file itself reopens byte-exact with its complete saved identity.

These observations qualify timing/resources/PCM. Familiar-listener recognition,
perceived drive and default/solo/muted masking comparisons remain unverified by
listening. The PR must carry downloadable audio and retain this limitation until
someone actually auditions it. The final full-suite `RESULT`, final revision,
review ledger and audio provenance belong to the PR handoff.
