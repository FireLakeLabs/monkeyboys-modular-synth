# Dub afterimage audio evidence

[Download default six-cycle WAV](default.wav) · [dry anchor MP3](dry-anchor.mp3) ·
[delay-muted MP3](delay-muted.mp3) · [reply solo MP3](reply-solo.mp3) ·
[low solo MP3](low-solo.mp3).

Actual audio files for PR review; these are a newly synthesized arrangement,
not Black Sabbath’s recording, and are not runtime patch assets.

**War Pigs · Dub afterimage**, source revision
`711e9ed99b0e185699eba0d2bff61247377bc79b`, OUT **56 BPM / VOL .8**, default
VCA/MIX levels, starts at bar 1 / cycle 0 and covers all six cycles
(**25.7142857 seconds**). Default WAV is the unmodified production
**File → Bounce WAV** download: stereo **44,100 Hz / 16-bit PCM**. Comparisons
change only the controls named in [render.json](render.json); MP3 encoding uses
`ffmpeg -codec:a libmp3lame -b:a 192k`, without normalization.

Chromium **156.0.8078.4**, OfflineAudioContext, pinned Strudel
web/webaudio/superdough **1.3.0**, core/transpiler **1.2.6**, Node **24.22.2**.
The provenance JSON includes source/file SHA-256 hashes, measured event/source
budgets, PCM levels, isolated float-PCM tap timings and tail measurements.
Later test/document/evidence changes do not change the sound when this source
hash still matches. Refresh the audio after any sound-affecting change.

No one has listened to these as part of this implementation. Human recognition,
timbre, reply clarity, delay audibility and masking remain unverified. The first
repeats start on the dry pickups at slots **10/22/34/46** (also on low E2 at
22/46); every third repeat reaches the next downbeat at **12/24/36/48**,
including the next phrase’s opening hit at 48.
Compare default with delay-muted at those points and judge whether the echo is
audible and the opening emphasis stays clear. The reply-solo file helps expose
the echoes separately. See the
[arrangement and verification record](../../war-pigs-dub-afterimage.md).

These committed files and immutable PR links make the audio downloadable. They
are **not native GitHub media attachments**; #212’s explicit attachment delivery
acceptance remains separate until native upload succeeds or the owner decides
whether this concrete delivery is acceptable.
