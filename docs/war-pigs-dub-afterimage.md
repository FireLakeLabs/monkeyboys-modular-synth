# War Pigs · Dub afterimage (#212)

An original spatial arrangement of the first four slow opening bars of Black
Sabbath’s composition, using Jake Brown’s public
[Ultimate Guitar transcription](https://tabs.ultimate-guitar.com/tab/black-sabbath/war-pigs-tabs-58414)
as documented in [#212](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/212).
The issue records slow 12/8, quarter = 56, standard tuning. The transcription
could not be fetched again in this implementation session. The
[Songsterr page](https://www.songsterr.com/a/wsa/black-sabbath-war-pigs-tab-s10137)
still supplies no readable note-level corroboration here. The selected-note
mapping below follows the issue’s source evidence and the prior opening
adaptation; no original recording was heard. No recording, lyrics or full tab
is bundled.

## Selected adaptation

Four quarters remain one Strudel cycle. Each SEQ stores 48 weighted eighth
slots in one source cycle, before CLOCK DIV 6. RATE 1, GROOVE off and OFFSET 0
keep a six-cycle phrase: four 1.5-cycle bars, sixteen 3/8-cycle dotted-quarter
groups, 25.714286 seconds at OUT 56. There is no global meter change or swing.

| Bar / slots | Dry anchor                                 | Low roots            | Independent reply |
| ----------- | ------------------------------------------ | -------------------- | ----------------- |
| 1 / 0–12    | E3/B3 ×8½, rest ×1½, D3 ×½, E3 ×1½         | E2 ×10, rest ×2      | B4 at slot 9      |
| 2 / 12–24   | D3/A3 ×8½, rest ×1½, G♯3 ×1, G♯3 ×½, A3 ×½ | D2 ×10, E2 from 22   | A4 at slot 21     |
| 3 / 24–36   | G♯3 ×8½, rest ×1½, D3 ×1, E3 ×1            | E2 until 34, rest ×2 | E4 at slot 33     |
| 4 / 36–48   | As bar 2                                   | D2 ×10, E2 ×2        | A4 at slot 45     |

The source’s high E and D fifths are moved down to E3/B3 and D3/A3. The opening
hammer-on is collapsed into its settled fifth. Slides become discrete notes;
the fleeting E before the D fifth in bars 2/4 is omitted. G♯ remains chromatic,
with no scale quantizer. The pickup positions, including the half-slot G♯→A,
and fixed accents retain the long/short hierarchy. This version trims the
source’s ten-eighth holds to 8½, leaving an authored breath for a reply at
slot 9 of each bar. Even at OUT 240 the held source’s .05 s release plus .01 s
cleanup finishes before that reply and before the single-note pickup.
Low E anticipates bar 3 at slot 22; it does not double every ornament.

The four upper replies are new arrangement choices, not transcribed parts or
cloned anchor audio. Each lasts one eighth slot; their twelve-slot spacing
leaves three empty dotted-quarter groups between reply starts. Their native
1/8-cycle delay is a separate, quieter echo, not the dotted-quarter rhythm.

## Rack and engine semantics

Twenty modules occupy 189 rail HP (197 with pinned OUT), on three 84 HP rails
occupied by 49/79/61 HP. Catalog widths and graph validation prove placement.
MIX names are `anchor`, `afterimage`, `low`; input 4 is spare. No CODE reserve,
unison, FM, noise, drive, siren, reverb, audio fan-out, inline FX or new engine
capability is involved.

- Dry square anchor: ENV .01/.2/.75/.05 seconds, VCA .18, MIX .8. No effects.
- Triangle replies: 12 dB BP at 650 Hz, RES 2, ENV AMT 1; one ENV fans to filter
  and amp with .01/.2/0/.15. VCA .8, PAN .6, MIX .6. PAN precedes delay in the
  native effect chain. The zero sustain leaves the first repeat exposed at 56.
- Triangle low: ENV .01/.3/.7/.1, VCA .24, MIX .5. No effects.
- Only orbit 2 has delay: SYNC 1/8 cycle, send .2, positive feedback .25.
  The three final paths retain dedicated orbits. No AUX/audio buses exist.

The pinned native delay has a one-second ceiling. The selected tap is .535714 s
at 56, .75 s at 40 and .125 s at 240. Requests for 1/4 or 3/8 cycle at 56 clamp;
event arguments alone cannot establish their PCM spacing. Source gates and
releases bound source voices; native feedback is an IIR bus and is qualified
separately by an operational -60 dB tail threshold, not a finite-silence claim.

MIX, pan and filter values apply to new notes. Delay time/feedback bus edits are
scheduled when the next reply onset supplies them (up to 6.43 s here). Existing
notes keep their per-note settings. Setting DELAY MIX or feedback to zero
bypasses new sends; it does not silence the old bus or reset its feedback.
Restore positive feedback to hear new echoes. Structural patch replacement
resets effect buses on the next Play. Stop ends scheduling; notes and bus tails
can ring. Immediate Stop/Play can overlap old and new voices and lies outside
the steady-state voice caps.

## Verification

The focused unit suite covers collection/credit, exact source, saved identity,
ENV fan-out edits and real pinned-engine event equality separately. It checks
the catalog-derived module budget and rejects an otherwise valid extra VCA.
The shared library rail-width test now expects refusal when an unchanged rack
cannot fit a narrower rail; it retains all source and identity checks for widths
that do fit.

The focused browser suite loads the actual bundled entry and exercises production
Play, Stop, rack edits, reload recovery, export/reopen and File → Bounce WAV.
It independently checks expanded events over three phrases, sliding half-open
windows and release/cleanup overlap across both seams at OUT 40/56/240, plus
negative start/density/overlap/gate cases. Live source start/stop observation
is separate from event budgets; delay buses and audio taps are counted separately.
The isolated-reply fixture uses the production engine’s Bounce path and observes
float PCM before 16-bit WAV quantization, fitting a scaled waveform to each tap
rather than comparing envelope peaks. Live Stop tail PCM is measured separately.

Observed results and rendered audio are recorded after final qualification.

## Listening and delivery limits

No audio-perception capability is available in this session. PCM output,
waveform comparisons and events establish signal behavior, not recognizability,
perceived stereo space, timbre, masking, or listening approval. A familiar
listener must compare the dry-anchor, default and delay-muted renders. Defaults
were selected by arrangement and signal measurements, not by ear. Natural
source/tap overlap at faster tempos is allowed. These are design caps and one
pinned Chromium qualification, not a universal performance guarantee.

The private design canvas was not accessed; this patch introduces no UI design.
