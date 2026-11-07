# Industrial triplet machine audio evidence

[Download the default six-cycle WAV](default.wav),
[anchor-solo MP3](anchor-solo.mp3),
[machinery-muted MP3](machinery-muted.mp3).

These files are the newly synthesized modular arrangement, not the original
recording. They are committed evidence for PR review and are not runtime patch
assets. GitHub’s token-authenticated native media upload rejected WAV and MP3
during #210, so the PR links these files directly and that route was not retried.

Rendered from clean implementation commit
`e6f3de97782c6a46b11c6335cc31431f736bb578`: **War Pigs · Industrial triplet
machine**, OUT **56 BPM**, VOL **.8**, default VCA/MIX levels. Each render starts
at bar 1, cycle zero, and covers the complete six-cycle phrase (**25.7142857
seconds**). Later commits that change only evidence, tests or documentation leave
the patch source and sound unchanged; compare `source.sha256` in
[render.json](render.json) with the patch file.

The production **File → Bounce WAV** path uses Chromium **156.0.8078.4**,
OfflineAudioContext and locked Strudel web/webaudio/superdough **1.3.0**,
core/transpiler **1.2.6**, on Node **24.22.2**. The default file is the unchanged
stereo **44,100 Hz / 16-bit PCM** download. Comparison MP3s use ffmpeg
`libmp3lame -b:a 192k` with no normalization; only MIX SOLO 1 or MUTE 2 differs.
[Render metadata, hashes and measured results](render.json) identify the files
and source. Regenerate these files after any sound change. Noise samples change
between browser sessions, so a new render will not match these bytes.

No one has listened to these as part of the implementation or automated checks.
See the [arrangement and acceptance report](../../war-pigs-industrial-triplets.md)
for attribution, test coverage, and the limits of those checks.
