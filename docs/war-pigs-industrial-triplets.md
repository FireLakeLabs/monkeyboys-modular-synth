# War Pigs · Industrial triplet machine (#211)

A new modular interpretation of the first four slow opening bars of Black
Sabbath’s composition, using Jake Brown’s public
[Ultimate Guitar transcription](https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414).
The fetched text marks 12/8, quarter = 56 and standard tuning. The
[Songsterr page](https://www.songsterr.com/a/wsa/black-sabbath-war-pigs-tab-s10137)
gave no notation here, so it supplies no note-level corroboration. No recording
was consulted, and no recording or full transcription is bundled.

The FM timbre, noise machinery and rhythm of the noise are new arrangement
choices. They make no claim about the original guitar or percussion parts.

## Selected adaptation

One eighth slot is 1/8 Strudel cycle, twelve slots make one slow bar, and four
bars occupy six cycles (25.714286 seconds at OUT 56). Each SEQ stores 48 weighted
slots in one source cycle, with ACCENT on that grid before CLOCK DIV 6. Every SEQ
RATE is 1; every CLOCK has GROOVE off and OFFSET 0. No swing is added.

| Bar / slots | Transcription, as read                                          | Anchor                           | Low                  |
| ----------- | --------------------------------------------------------------- | -------------------------------- | -------------------- |
| 1 / 0–12    | E5 with hammer-on, tied 10 eighths; D5 slides to E5             | E3/B3 ×10, D3 ×½, E3 ×1½         | E2 ×10, rest ×2      |
| 2 / 12–24   | E5 slides to D5, tied; open E with G♯ ×1, G♯ then hammer to A   | D3/A3 ×10, G♯3 ×1, G♯3 ×½, A3 ×½ | D2 ×10, E2 from 22   |
| 3 / 24–36   | Open E with G♯, tied 10 eighths; D5 slides to E5 over a quarter | G♯3 ×10, D3 ×1, E3 ×1            | E2 until 34, rest ×2 |
| 4 / 36–48   | As bar 2                                                        | D3/A3 ×10, G♯3 ×1, G♯3 ×½, A3 ×½ | D2 ×10, E2 ×2        |

The transcription’s high-neck E fifth becomes E3/B3 and its D fifth D3/A3.
Hammer-ons and slides have no continuous pitch here: the opening hammer-on is
collapsed into the settled fifth, and each slide becomes discrete single notes.
The E5 that opens bars 2 and 4 before sliding down is dropped, so the D fifth
starts on the bar line. Ties keep their written ten eighths, with no added breath
before the pickups. The sixteenth/dotted-eighth D→E in bar 1 and the G♯, G♯→A
rhythm in bars 2 and 4 follow the transcription. Low E enters under the G♯ at
slot 22, ahead of the bar line, as the open string does. These are adaptations,
not an exact transcription. No later 4/4 riff or full-song arrangement is included.

## Machinery

Noise is a new part, not a drum transcription. Each bar leaves its first group of
three eighths empty, so the anchor’s attack stands alone, then hits on the
remaining three group starts (slots 3, 6, 9 of the bar, velocities 1, .8, .9).
Slots 10–11 also stay empty for the anchor’s pickup. The only subdivisions sit in
the slot before the last group: two quarter-slot hits in bars 1 and 3, three
sixth-slot hits in bars 2 and 4. Bar 3 adds one ghost at slot 7 of the bar.

Hits are `[c3 ~]`-style events, so a hit’s gate is at most half a slot (1/16
cycle) and a written rest follows it. That bounds source lifetime as well as
loudness; a short ENV release alone would not. There are 23 hits per phrase.

## Rack and sound semantics

The file is generator-owned: 20 modules, 192 rail HP, 200 HP including pinned OUT,
on three 84 HP rails occupied by 71/60/61 HP. MIX names are `anchor`, `machinery`
and `low`, with dedicated orbits; channel 4 is spare. There are no CODE blocks,
AUX, wet sends, DRIVE, LFO, oscillator noise or unison.

- **Anchor:** triangle carrier, FM OP INDEX 1, RATIO 2.41, FM ATTACK and FM DECAY
  off. 12 dB LP at 2200 Hz, ENV AMT 1. One ENV fans to VCF and VCA.
- **Machinery:** white NOISE, 12 dB BP at 2000 Hz, RES 2, ENV AMT 1. One ENV fans
  to the BP filter and VCA. Its VCA is 1.8 because the engine turns noise down
  and a band-pass passes little of it.
- **Low:** triangle, ENV to VCA, no filter.

**FM mode is steady.** With no FM envelope calls the modulator runs at full index
for the whole note, so held dyads keep their sidebands. In the pinned engine
deviation is INDEX × modulator frequency. RATIO 2.41 places the strongest sidebands
at 1.41× and 3.41× each carrier: inharmonic, and all above the low root. RATIO 1.5
was rejected because it adds partials at half the carrier, under E3 and near the
low E2. On anchor-only renders of the settled E dyad the carriers lead at INDEX
.5–1.3 (sidebands −11.5 to −1.3 dB) and lose that lead at INDEX 1.5 (+1 dB). INDEX 2
leaves almost no carrier. FM DECAY on is the onset-only alternative: at DECAY .3
the mid-gate sidebands disappear, leaving the triangle’s own harmonics. The
fallback order in #211 was not needed.

Rack cutoff, FM and MIX edits apply at the next onset. Each voice gets its own
modulator, filter and envelope, so held notes keep the settings they began with.

## Verification and listening limits

`src/library/industrial.test.ts` checks catalog-derived quantities/HP, actual
placement, explicit clocks, steady FM, custom attribution, exact executable source
and saved identity through both ENV fan-outs, including BP-prefixed envelope calls.
An otherwise valid extra VCA fails its budget check. Generic library checks cover
ordinary rack edits and snapshot digests.

`tests/browser/industrial.spec.mjs` uses the actual library and production engine.
It separately checks onset/gate/velocity snapshots over three repetitions, budgets
including both seams, four rejected overrun fixtures, live PCM, oscillator and
noise-source lifetimes, one modulator per anchor voice, the shared noise buffer,
three orbits with no buses, per-onset edits and their rendered effect, Stop,
replay, repeated load/Play, export/reopen, and whole-phrase Bounce WAV renders.
A voice lifetime is gate + release + the engine’s .01-second cleanup.

### Observed local qualification

On 7 November 2026: Node 24.22.2, locked web/webaudio/superdough 1.3.0 and
core/transpiler 1.2.6, Chromium 156.0.8078.4. Measured values below are from the
run in [render.json](evidence/war-pigs-industrial-triplets/render.json).

| Budget, per six cycles or peak | Measured |     Cap |
| ------------------------------ | -------: | ------: |
| Expanded starts                |       45 |      96 |
| Anchor / noise / low starts    |  17/23/5 | 40/48/8 |
| Starts in any 1/8-cycle window |        4 |       8 |
| Event voices, all lanes        |        5 |       8 |
| Event voices, anchor/noise/low |    3/1/2 |   4/2/2 |
| Live primary oscillators       |        5 |       6 |
| Live FM modulators             |        4 |       4 |
| Live noise sources             |        1 |       2 |

The live modulator peak exceeds the anchor voice peak because the pinned engine
starts a modulator when it builds the note, ahead of the scheduled onset, and
stops it with the note. Every source had a finite end. All live noise hits used
one cached buffer, and a hit lived at most .328 seconds.

The default stereo 44.1 kHz, 16-bit WAV lasts exactly 25.7142857 seconds, peaks at
.548 with RMS .124 and no full-scale samples. In anchor-solo PCM, sidebands stay
.59 of the carrier at early, middle and late windows of the E dyad and in the D
dyad, with the carriers strongest. Noise hits peak at .228 alone, and both the
empty groups and the span after each gate measure 0 in the machinery-solo render.
Against the machinery-muted render, E and D carrier levels under a hit stay within
the test’s ±10% (measured ratio 1.0). Noise samples vary between browser sessions, so tests use level and envelope
bounds rather than sample digests; identical hits within a session are expected
because each starts at the cached buffer’s beginning.

**Stop** ends scheduling, not sound. A dyad held at Stop had 5.4 seconds of gate
left, and master output right after Stop measured .091 RMS. No new onset arrived
over 8 seconds, longer than the longest gap between onsets in any lane (7.5 s, low).
**Immediate Stop/Play** overlaps old and new notes: an isolated restart peaked at
6 primary oscillators, 4 anchor voices and 4 modulators, at the anchor cap and
outside steady playback. Separately, the cumulative peak across two rapid load/Play
cycles was 9 primary oscillators, 6 anchor voices and 6 modulators. Those notes
are finite: after 6 seconds no source remained scheduled and no bus existed.

### What is not established

These checks qualify timing, resources and PCM. Nobody has listened to this patch
as part of the work above. Recognizing the slow opening in default and anchor-solo,
how metallic the FM sounds, whether the anchor stays legible on weak-bass speakers,
and whether the machinery masks the anchor all remain for a familiar listener to
judge, using the [rendered audio](evidence/war-pigs-industrial-triplets/README.md).
RATIO, INDEX and level defaults were chosen from measured partials, not by ear,
so they are provisional until then. Other browsers and physical devices are
unverified. The final revision and full-suite result belong to the PR.
