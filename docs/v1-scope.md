# v1 scope

## First modules

Sixteen modules, chosen so that between them every feature of the app gets exercised: all three families, all ten looks, all three cable types, CV modulation, envelope routing, multiple voices, fan-out, effect-order warnings and import of unreadable code.

| Module | Family   | Why it is in v1                                                 |
| ------ | -------- | --------------------------------------------------------------- |
| SEQ    | Hardware | Note pattern source                                             |
| DRUMS  | Hardware | Sample pattern source, multi-row grid, Euclidean rows on import |
| QUANT  | Hardware | A hardware module that changes the pattern, so order matters    |
| OSC    | Hardware | Synth sound source                                              |
| SMPL   | Hardware | Sample sound source with banks                                  |
| VCF    | Hardware | Filter; CV input takes LFO or ENV                               |
| VCA    | Hardware | Amplifier; CV input takes ENV or LFO                            |
| ENV    | Hardware | Writes different code depending on where it is patched          |
| LFO    | Hardware | Continuous modulation into any CV jack                          |
| DELAY  | Hardware | First effect; effect-order warnings need two                    |
| REVERB | Hardware | Second effect; almost all real Strudel code uses `.room()`      |
| MIX    | Hardware | Several voices, one `$:` line each                              |
| OUT    | Hardware | Tempo and output                                                |
| ITER   | Alien    | Alien module with a knob                                        |
| JUX    | Alien    | Alien module with a switch                                      |
| CODE   | Cyber    | Code-only blocks; target for unreadable imports                 |

The rest of the catalog (EUCLID, CLOCK, CHANCE, NOISE, FM, RAND, CRUSH, PAN, REV, PALINDROME and more) ships shortly after, without new app features.

## Value input

Owner decision for #9: v1 includes typed value readouts, vertical knob dragging,
Shift for fine control, and double-click reset to the catalog default. This
explicitly brings knob dragging into v1; touch-specific work remains later.
See the [interaction handoff](interaction-proposal.md#9-values-in-v1) for
validation, snapping, drag cancellation and live-update behavior. Implementation
belongs to #5/#8.

## Motion defaults

| Element                           | Default                                                          | Alternatives considered            |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Alien glow                        | Steady when idle; pulses on each event (≈400 ms fade)            | Constant breathing loop; no motion |
| Activity lights (Instrument look) | Flash on each event, same timing                                 | —                                  |
| Cyber cursor                      | Solid; blinks (~1 s cycle) only while you are editing that block | Always blink; never blink          |
| Cables                            | No flow animation                                                | Optional “show signal flow” later  |
| Reduced-motion setting            | No pulses or blinking; glows stay steady                         | —                                  |

## Later (deliberately not v1)

- A touch-friendly UI (end goal). Pointer knob dragging is included in v1 as described above.
- Keyboard patching and screen-reader support.
- Hints and explainers (including plain-language knob labels as a setting that works on every look).
- Accounts and share links.
- Logo drawn by Fourier epicycles (splash or loading screen).
