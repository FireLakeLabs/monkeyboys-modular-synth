# Doom audio evidence

[Download the default six-cycle WAV](default.wav),
[anchor-solo MP3](anchor-solo.mp3),
[warning-muted MP3](warning-muted.mp3).

These files are the newly synthesized modular arrangement, not the original
recording. They are committed evidence for PR download and are not runtime
patch assets. GitHub’s token-authenticated native media upload rejected WAV and
MP3 content types; the PR links these files directly for download instead.

Rendered from clean implementation commit
`febaadb5603a32d1880f56fd9f4afaa73dd07084`: **War Pigs · Doom instrument**, OUT
**56 BPM**, VOL **.8**, default VCA/MIX levels. Each render starts at cycle zero
and covers the complete six-cycle phrase (**25.7142857 seconds**). Later commits
that only add these evidence files leave the patch source and sound unchanged.

The production **File → Bounce WAV** path uses Chromium **156.0.8078.4**,
OfflineAudioContext and locked Strudel web/webaudio/superdough **1.3.0**,
core/transpiler **1.2.6**, on Node **24.22.2**. The default file is the unchanged
stereo **44,100 Hz / 16-bit PCM** download. Comparison MP3s use ffmpeg
`libmp3lame -b:a 192k`, with no normalization; only MIX SOLO 1 or MUTE 3 differs.
[Render metadata, hashes and measured results](render.json) identify the files
and source independently. Regenerate these files after any sound change.

Familiar-listener recognition, perceived drive and masking remain unverified
by listening. See the [arrangement and acceptance report](../../war-pigs-doom.md)
for source attribution, test coverage and the finite Stop/replay overlap limit.
