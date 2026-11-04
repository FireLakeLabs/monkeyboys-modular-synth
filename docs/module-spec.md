# Module spec

The sixteen v1 modules and subsequent catalog additions. For each: its controls, value ranges and defaults, its jacks, and the Strudel it writes and reads.

The machine-readable version of this spec is [`src/modules/catalog.ts`](../src/modules/catalog.ts). The app already consumes it for the module library. **The catalog is the runtime source of truth** and this document describes it; keep the two in step.

## Call bindings (#128)

Knob, switch and text controls may declare `call` in the catalog. The generator visits
bound controls in their catalog order; the reader uses the same bindings after
resolving source/chained context and catalog aliases.

- `method`: a literal call name, or `{ control, names }` selecting a call from
  another switch (VCF's MODE maps to `lpf`/`hpf`/`bpf`, for example).
- `argument`: `{ kind: 'number' }`, `{ kind: 'string' }`,
  `{ kind: 'scale', root: 'root' }` for a quoted tonic/scale pair, or
  `{ kind: 'transform', expressions }` for JUX's catalog-owned expressions.
  Scale shares its call with ROOT; MODE selects methods rather than writing a call.
- Control `omitAt`: the exact number or string at which its call is omitted.
  Missing `omitAt` means always write. It is independent of the rack default.
- `read: 'companion'`: require a compatible adjacent owner with that control unread; otherwise retain exact CODE. New oscillator, filter, amplifier and effect companion settings must not create an owner with active defaults. SMPL can start a neutral boundary using its `readDefaults`.
- `read: 'merge'`: attach to the adjacent module of the same type when that
  control has not been read already; selected method variants must also agree.
  Otherwise a call starts a new module. Module `readDefaults` records source-only
  omission defaults (SMPL's empty bank and speed 1).
- `when`: a conjunction of switch conditions shared by the panel and writer. Inactive settings remain saved but are hidden and emit nothing. `group` keeps mixer channel controls together.
- `selects`: reading a call selects a panel mode (FREQ, DJ or delay TIME/SYNC); it does not invent a separate call.
- `enabledBy`: omit this companion setting when the named control is at its
  omission value (DELAY and REVERB bypass).
- `withEnvelope`: write only with an ENV at the named CV jack. `envelope` places
  the dedicated ADSR group `before` or `after` this call; filter envelopes use
  the method selector's value as their prefix.

CV jacks retain `cvTarget`, the bound numeric control ID. Generator and reader
use that data for LFO scaling, cable endpoints and saved CV ownership. ENV's
ordered ADSR groups, source/rate notation, mixer traversal, output tempo and CODE
preservation remain dedicated adapters; these bindings do not change v1 files.
See [translation details](translation-rules.md#catalog-call-bindings-128).

## Palette (#79)

The catalog owns `paletteCall`, a representative Strudel expression shown on each
chip, separate from `strudel` (reader ownership). For example OSC displays
`.s("…")` without claiming DRUMS’ source-form `s`; CODE displays its default
`.chunk()` fragment without claiming any reader functions. Calls are core product
UI under [the #57 decision](decisions.md#product).

The six groups are Pattern, Sound, Shape, Modulate, Effects and Utility. The
catalog’s optional `paletteCategory` places ITER/JUX in Pattern and CODE in
Utility, retaining their existing Alien/Cyber colors and family looks. Other
modules use their existing category. Family is a badge on each chip. Filtering
matches names, long names, displayed calls and reader function names without case
sensitivity; chip text wraps instead of truncating. Module widths are unchanged.

## Conventions

- **Width** is in HP. 1 HP = 12 px at 100% zoom. A module is the same width in every look.
- **Jacks:** `in` / `out`, with signal type `pattern`, `audio`, `mod`, or `any` (Alien and Cyber jacks pass through whatever enters).
- **CV inputs** modulate one named control (`cvTarget`). See [rule 3](translation-rules.md#3-a-cable-into-cv-modulates-a-control).
- **Defaults** are what a freshly added module shows. “Omitted at X” means the generator writes nothing for that control when it holds X.
- Control values use up to three decimals, without trailing zeros. DELAY SYNC fractions, derived modulation frequencies and reciprocal sync rates retain full precision.
- Function names below were checked against `@strudel/web` 1.3.0.

---

## Pattern sources

### SEQ — Sequencer

Hardware · Pattern · 10 HP

| Control | Kind                    | Range                                                                                | Default                      | Writes                   |
| ------- | ----------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | ------------------------ |
| STEPS   | step editor, 1–16 steps | note name (`c2`, `eb2`), scale degree (`0`, `3`), rest, or an alternation (`<7 10>`) | `c2 c2 eb2 g2 c3 bb2 g2 eb2` | the mini-notation string |
| LEN     | knob                    | 1–16, step 1                                                                         | 8                            | number of steps          |
| MODE    | switch                  | NOTE · DEGREE                                                                        | NOTE                         | `note(…)` or `n(…)`      |
| RATE    | knob, detented          | 0.25 · 0.5 · 1 · 2 · 3 · 4                                                           | 1                            | `.fast(x)`, omitted at 1 |

| Jack | Dir | Signal  |
| ---- | --- | ------- |
| NOTE | out | pattern |

```js
note("c2 c2 eb2 g2 c3 bb2 g2 eb2")
n("0 3 5 <7 10>")        // DEGREE mode, usually into QUANT
note("c2 eb2").fast(2)   // RATE 2
```

**Reads:** `note("…")` or `n("…")` whose mini-notation is a flat list of up to 16 tokens, rests and flat `<…>` alternations. The same grid is available for rack-built, imported and library patches, including after code edits (#66). Anything richer (`[ ]` sub-divisions, `*`, Euclidean rhythms) opens the SEQ in **text mode**: the string is shown and edited as text, and the module is still a SEQ. An adjacent `.fast(x)` sets RATE. Since #132, `.slow(x)` reads as a separate CLOCK module to retain its cable position.

### DRUMS — Trigger sequencer

Hardware · Pattern · 14 HP

| Control | Kind         | Range                                  | Default                                                                     | Writes                        |
| ------- | ------------ | -------------------------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| GRID    | rows × steps | one sample name per row; 8 or 16 steps | rows `bd`, `sd`, `hh`; 8 steps; bd `x.x.x.x.`, sd `..x...x.`, hh `.x.x.x.x` | the mini-notation string      |
| DROP    | knob         | 0–0.9, step 0.05                       | 0                                                                           | `.degradeBy(x)`, omitted at 0 |

| Jack | Dir | Signal  |
| ---- | --- | ------- |
| OUT  | out | pattern |

```js
s("[bd ~]*4, [~ ~ sd ~]*2, [~ hh]*4")
```

**Row rules:** an empty row is left out. An all-on row is written `hh*8`. A row that repeats with period _p_ is written `[tokens of first p]*(steps/p)`. Otherwise tokens are joined with spaces, rests as `~`. Rows are joined with `, `. If every row is empty the module writes `s("~")`.

**Reads:** `s("…")` with comma-separated layers. The grid shows flat rows of one sample plus rests, `sample*n`, and `[flat tokens]*n` repetitions, with equal row lengths of 8 or 16 (#66). Other notation stays editable in text mode with a one-line explanation. Euclidean row expansion into lit cells remains a v1 gap; `bd(3,8)` is currently retained as text. Viewing a grid never rewrites its notation.

For both SEQ and DRUMS, **Text mode** changes only the view. Enter or blur applies notation; Shift+Enter inserts a newline. Representable notation returns to the grid after applying. **Grid mode** returns from an unchanged text view. Source-owned grid edits replace only the owned notation literal and save full rack identity; surrounding source stays exact. See [verification](literal-edit-verification.md#source-independent-grid-views-66).

### QUANT — Quantizer

Hardware · Pattern · 8 HP · order-sensitive

| Control | Kind   | Range                                                             | Default | Writes              |
| ------- | ------ | ----------------------------------------------------------------- | ------- | ------------------- |
| ROOT    | switch | C · C# · D · Eb · E · F · F# · G · Ab · A · Bb · B                | C       | `.scale("C:…")`     |
| SCALE   | switch | major · minor · dorian · phrygian · lydian · mixolydian · locrian | minor   | `.scale("…:minor")` |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | any    |
| OUT  | out | any    |

```js
n("0 3 5 <7 10>").scale("C:minor")
```

Pairs with SEQ in DEGREE mode. QUANT preserves its incoming signal, so it can
also follow OSC without moving the order-sensitive scale call. The reader accepts
lowercase tonic letters for the listed roots (for example `g:minor` → G/minor
controls) while retaining the original source spelling. Multi-word scale names (pentatonics) are deliberately left out of v1 until their exact Strudel spelling is confirmed.

---

## Sound sources

### OSC — Oscillator

Hardware · Sound · 9 HP

| Control | Kind   | Range                                          | Default  | Writes                        |
| ------- | ------ | ---------------------------------------------- | -------- | ----------------------------- |
| WAVE    | switch | sawtooth · square · triangle · sine · supersaw | sawtooth | `.s("sawtooth")`              |
| TUNE    | knob   | −24 to +24 semitones, step 1                   | 0        | `.transpose(x)`, omitted at 0 |

| Jack | Dir | Signal  |
| ---- | --- | ------- |
| NOTE | in  | pattern |
| TUNE | in  | mod     |
| OUT  | out | audio   |

```js
note("c2 eb2 g2").s("sawtooth")
```

### SMPL — Sampler

Hardware · Sound · 8 HP

| Control | Kind   | Range                               | Default     | Writes                                      |
| ------- | ------ | ----------------------------------- | ----------- | ------------------------------------------- |
| BANK    | switch | default · RolandTR909 · RolandTR808 | RolandTR909 | `.bank("RolandTR909")`, omitted for default |
| SPEED   | knob   | 0.25–2, step 0.05                   | 1           | `.speed(x)`, omitted at 1                   |

| Jack | Dir | Signal  |
| ---- | --- | ------- |
| IN   | in  | pattern |
| OUT  | out | audio   |

```js
s("bd*4, hh*8").bank("RolandTR909")
```

The engine must load the sample banks at start-up (`@strudel/web` loads none by default). Which sample sources to load is an engine task — see [`build-plan.md`](build-plan.md).

---

## Shaping

### VCF — Filter

Hardware · Shape · 10 HP

| Control | Kind      | Range          | Default | Writes                                                                |
| ------- | --------- | -------------- | ------- | --------------------------------------------------------------------- |
| MODE    | switch    | LP · HP · BP   | LP      | chooses `lpf`/`hpf`/`bpf`, `lpq`/`hpq`/`bpq`, `lpenv`/`hpenv`/`bpenv` |
| CUTOFF  | knob, log | 20–20000 Hz    | 800     | `.lpf(x)`                                                             |
| RES     | knob      | 0–20, step 0.5 | 1       | `.lpq(x)`                                                             |
| ENV AMT | knob      | 0–8, step 0.5  | 4       | `.lpenv(x)`, only when an ENV is patched into CV                      |

| Jack | Dir | Signal | CV target |
| ---- | --- | ------ | --------- |
| IN   | in  | audio  |           |
| CV   | in  | mod    | CUTOFF    |
| OUT  | out | audio  |           |

```js
.lpf(800).lpq(1)
.lpf(sine.range(800, 2400).slow(4)).lpq(1)                    // LFO into CV
.lpf(800).lpq(1).lpenv(4)
  .lpattack(0.01).lpdecay(0.2).lpsustain(0.5).lprelease(0.1)  // ENV into CV
```

### VCA — Amplifier

Hardware · Shape · 8 HP

| Control | Kind | Range          | Default | Writes                     |
| ------- | ---- | -------------- | ------- | -------------------------- |
| LEVEL   | knob | 0–2, step 0.05 | 0.8     | `.gain(x)`, always written |

| Jack | Dir | Signal | CV target |
| ---- | --- | ------ | --------- |
| IN   | in  | audio  |           |
| CV   | in  | mod    | LEVEL     |
| OUT  | out | audio  |           |

```js
.gain(0.8)
.attack(0.01).decay(0.2).sustain(0.5).release(0.1).gain(0.8)  // ENV into CV
.gain(sine.range(0.8, 0.3).slow(2))                           // LFO into CV (tremolo)
```

---

## Modulation

### ENV — Envelope

Hardware · Modulate · 10 HP

| Control | Kind | Range            | Default |
| ------- | ---- | ---------------- | ------- |
| ATK     | knob | 0–2 s, step 0.01 | 0.01    |
| DEC     | knob | 0–2 s, step 0.01 | 0.2     |
| SUS     | knob | 0–1, step 0.05   | 0.5     |
| REL     | knob | 0–4 s, step 0.05 | 0.1     |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| OUT  | out | mod    |

What it writes depends on where it is patched:

| Patched into     | Writes                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| VCA CV           | `.attack(a).decay(d).sustain(s).release(r)`                                   |
| VCF CV (LP)      | `.lpattack(a).lpdecay(d).lpsustain(s).lprelease(r)`, plus VCF’s `.lpenv(amt)` |
| VCF CV (HP / BP) | the `hp…` / `bp…` equivalents                                                 |
| Nothing          | nothing                                                                       |

The reader also accepts the pinned engine aliases `att/dec/sus/rel` and
`lpa/lpd/lps/lpr`, `hpa/hpd/hps/hpr`, `bpa/bpd/bps/bpr`. Long and short names
may mix within a complete, ordered ADSR group. Existing VCA/VCF target rules
still apply; partial envelopes such as `.dec(.1)` stay CODE because filling
missing parameters would invent settings. Source spelling survives literal edits.

The envelope fires on every event, so there is no gate input. ENV may feed any CV jack, including OSC TUNE and catalog extensions. One ENV may fan out to multiple targets. Native VCA/filter calls above remain unchanged; other targets use the [generalized adapter](#generalized-cv-130). DEPTH is bipolar in the destination's units (fallback −1 to 1, default 0.5); native VCA uses LEVEL and native VCF uses ENV AMT instead.

### LFO — Low-frequency oscillator

Hardware · Modulate · 8 HP

| Control | Kind          | Range                                            | Default                       | Writes                                                            |
| ------- | ------------- | ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------- |
| MODE    | switch        | SMOOTH · STEP                                    | SMOOTH for new modules        | per-voice `.lfo()` or sampled signal                              |
| SKEW    | knob          | 0–1, step 0.01                                   | 0.5                           | `.lfo({ skew })`, saved but inactive in STEP/native pitch vibrato |
| SHAPE   | switch        | sine · tri · saw · isaw · square · perlin · rand | sine                          | the signal name                                                   |
| RATE    | knob          | 0.25–16 cycles, detented                         | 4                             | `.slow(x)`; omitted at 1; below 1 written `.fast(1/x)`            |
| DEPTH   | knob, bipolar | in the target’s units                            | depends on target (see below) | the top of `.range()`                                             |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| OUT  | out | mod    |

```js
sine.range(800, 2400).slow(4)   // into VCF CV: CUTOFF 800, DEPTH +1600
```

The target ranges/defaults below are owned by each target knob’s `modulation`
data in the catalog. A missing LFO depth value uses that target default.

In STEP mode the LFO writes nothing by itself; it replaces the number of the control it is patched into: `.range(knob, knob + depth)`. DEPTH is bipolar and takes the units of its target, so it is reset to the target’s default when re-patched:

| Target     | DEPTH range         | Default |
| ---------- | ------------------- | ------- |
| VCF CUTOFF | −10000 to +10000 Hz | +1600   |
| VCA LEVEL  | −1 to +1            | −0.5    |

### Generalized CV (#130)

Both LFO modes, ENV and CV SEQ route by the jack's `cvTarget` and the control's
shared `call` binding. DEPTH bounds/defaults live on the target's `modulation`
data; OSC TUNE adds `{ min: -24, max: 24, default: 2, pitch: true }` in semitones.
Repatching LFO/ENV resets explicit depth to the new target defaults. Shared
sources without explicit depth keep independent target defaults.

SMOOTH writes the base call followed by
`.lfo({ c: "lpf", sync: .25, depthabs: 1600, dc: 0, shape: "sine", skew: .5 })`.
The supported engine shapes are sine, tri, ramp, saw and square; catalog `saw`
maps to engine `ramp`, and `isaw` to engine `saw`. `perlin`/`rand` remain STEP.
For downward gain modulation, the pinned engine requires positive magnitude and
`dc: -1`, avoiding its inverted signed-depth clamp. OSC TUNE writes
`.vib(hz).vibmod(semitones)` for SMOOTH and `.transpose(signal)` for STEP.
Native vibrato is a sine; SHAPE and SKEW are inactive there. Its Hz rate derives
from OUT tempo divided by 240 and the LFO period.

Generic ENV on a target without a native envelope writes `.env({ c: "control", a, d, s, r, depthabs })` after the base
control call. OSC TUNE uses `.penv(depth).pattack(a).pdecay(d).psustain(s).prelease(r)`.
Native VCA/filter ADSR and aliases keep their original forms and amount units.

### S&H — Sample and hold

Hardware · Modulate · 8 HP. IN and OUT are mod jacks. STEPS is 1–64 per cycle,
step 1, default 8. Writes `.segment(n)`. It explicitly samples an LFO (including
SMOOTH) or numeric CV pattern; a following utility/CV destination uses that
pattern. A bare sampled normalized LFO yields values 0–1; use ATTENUVERTER to
map them to frequencies or another destination's units.

### ATTENUVERTER

Hardware · Modulate · 10 HP. IN and OUT are mod jacks. AMOUNT: −2 to 2, step
0.01, default 1. MIN/MAX: −20000 to 20000, step 0.01, defaults 0/1. SCALE:
LINEAR (default) or EXP. Writes `.mul(amount).range(min, max)` or `.rangex(min, max)`;
EXP requires positive endpoints. IN takes STEP LFO, S&H, CV SEQ or another utility.
Output values are absolute destination units, without a second automatic range.

### MOD MIX — Modulation mixer

Hardware · Modulate · 8 HP. A/B are mod inputs; OUT is mod. No knobs. Writes
`a.add(b)`; both inputs must be connected before it changes a CV argument.
Inputs accept numeric patterns as above. Named outputs and nested utilities retain
shared wiring on export/reopen. Utility cycles and audio/pattern signal mistakes
remain invalid; per-voice ENV cannot be a standalone pattern input.

### CV SEQ — Control value sequencer

Hardware · Modulate · 10 HP. STEPS uses the shared 1–16-cell step editor, with
default values 400, 800, 1200. OUT is mod. Array steps write a cycle alternation
such as `.lpf("<400 800 1200>")`; imported numeric mini-notation retains its exact
timing/spelling. Utility arguments wrap it in `mini('…')`. Values are absolute
in the destination's units, including semitones at OSC TUNE. Explicit parser arguments use single quotes so the REPL does not parse them twice. Rich notation uses
text mode; non-numeric tokens are refused. A pattern may produce several events
inside one note; this is distinct from audio-rate modulation.

---

## Effects

### DELAY — Echo

Hardware · Effects · 10 HP

| Control | Kind | Range                | Default | Writes              |
| ------- | ---- | -------------------- | ------- | ------------------- |
| MIX     | knob | 0–1, step 0.05       | 0.4     | `.delay(x)`         |
| TIME    | knob | 0.01–2 s, step 0.005 | 0.375   | `.delaytime(x)`     |
| FDBK    | knob | 0–0.95, step 0.05    | 0.5     | `.delayfeedback(x)` |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | audio  |
| OUT  | out | audio  |

```js
.delay(0.4).delaytime(0.375).delayfeedback(0.5)
```

All three are written when MIX > 0. At MIX 0 the module is bypassed and writes nothing.

### REVERB — Room

Hardware · Effects · 8 HP

| Control | Kind | Range          | Default | Writes         |
| ------- | ---- | -------------- | ------- | -------------- |
| ROOM    | knob | 0–1, step 0.05 | 0.5     | `.room(x)`     |
| SIZE    | knob | 0–10, step 0.5 | 4       | `.roomsize(x)` |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | audio  |
| OUT  | out | audio  |

```js
.room(0.5).roomsize(4)
```

At ROOM 0 the module is bypassed and writes nothing.

**Orbit decision (#13).** DELAY and REVERB are send effects on one shared bus
per orbit. Give each final audible voice its own `.orbit(n)`, even when dry or
when settings currently match another voice. Both effects on that voice share
its dedicated orbit. Place routing on the final mixer branch, outside any shared
named pattern. This is generator routing metadata, so the module catalog needs
no extra module/control. Preserve imported routing verbatim unless it is proven
generator-owned. Allocation, source-mapping and structural replacement rules are
in [translation rules](translation-rules.md#effect-orbits); the browser evidence
is in [engine findings](engine-spike.md).

---

## Utility

### MIX — Mixer

Hardware · Utility · 12 HP

| Control | Kind    | Range          | Default | Writes                                               |
| ------- | ------- | -------------- | ------- | ---------------------------------------------------- |
| CH 1–4  | knob ×4 | 0–1, step 0.05 | 0.8     | `.postgain(x)` on that channel’s voice, omitted at 1 |

| Jack       | Dir | Signal |
| ---------- | --- | ------ |
| 1, 2, 3, 4 | in  | audio  |
| OUT        | out | audio  |

Writes one `$:` line per connected input, in channel order ([rule 2](translation-rules.md#2-each-mixer-input-is-a--line)).

### OUT — Output

OUT is the pinned case output panel outside the rails (#133). Its catalog width
sizes the panel in every Hardware look; it consumes no rail interval. Its IN,
BPM and VOL retain their existing source/audio ownership. See
[the output-panel contract](design.md#output-panel-and-per-patch-rails-133).

Hardware · Utility · 8 HP · exactly one per rack

| Control | Kind | Range          | Default | Writes                                 |
| ------- | ---- | -------------- | ------- | -------------------------------------- |
| BPM     | knob | 40–240, step 1 | 120     | `setcpm(120/4)`                        |
| VOL     | knob | 0–1, step 0.05 | 0.8     | app master volume, not written to code |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | audio  |

Nothing plays unless the mixer (or a single voice) reaches OUT. **Reads** `setcpm(x)` and its pinned-engine alias `setCpm(x)` (BPM = x × 4, or the literal `bpm/4` form), and `setcps(x)` (BPM = x × 240). Imported spelling is preserved when editing BPM; new rack-owned code uses lowercase `setcpm`.

---

## Alien

### ITER

Alien · 10 HP · order-sensitive

| Control | Kind | Range        | Default | Writes     |
| ------- | ---- | ------------ | ------- | ---------- |
| STEPS   | knob | 1–16, step 1 | 4       | `.iter(x)` |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | any    |
| OUT  | out | any    |

Starts the pattern one step later each cycle.

### JUX

Alien · 10 HP · order-sensitive

| Control | Kind   | Range                          | Default | Writes                                                                     |
| ------- | ------ | ------------------------------ | ------- | -------------------------------------------------------------------------- |
| RIGHT   | switch | rev · fast ×2 · press · iter 4 | rev     | `.jux(rev)`, `.jux(x => x.fast(2))`, `.jux(press)`, `.jux(x => x.iter(4))` |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | any    |
| OUT  | out | any    |

Left ear plays the pattern; right ear plays it transformed. **Reads** `.jux(f)` when `f` is one of the four options; any other function makes the whole call a CODE block.

---

## Cyber

### CODE

Cyber · 14 HP · order-sensitive

| Control | Kind        | Default                      | Writes             |
| ------- | ----------- | ---------------------------- | ------------------ |
| TEXT    | code editor | `.chunk(4, x => x.hurry(2))` | the text, verbatim |

| Jack | Dir | Signal |
| ---- | --- | ------ |
| IN   | in  | any    |
| OUT  | out | any    |

Holds any Strudel the app cannot turn into controls. In a chain, its text must be a method call fragment starting with `.`. With nothing patched into IN, the text must be a complete expression and the block acts as a voice’s source. When a module for the code later exists, the app offers to swap it in.

## Pattern and time (#132)

These twelve modules use the existing family looks and fixed catalog widths.
Except CHORD, each has passthrough IN/OUT jacks (`any`), retaining the incoming
pattern, audio or modulation signal. Every module is order-sensitive, including
when placed after OSC/SMPL. CHORD has a pattern OUT and no input; connect it to
OSC's NOTE input, optionally through ARP or other pattern transforms.

The forms below are verified against the locked `@strudel/core` 1.2.6,
`@strudel/tonal` 1.2.6 and `@strudel/web` 1.3.0 packages. Numeric arguments accept
finite literals and literal division such as `1/3`; untouched source retains its
spelling and comments. Unsupported expressions/arity remain CODE. New pattern
arguments retain exact numeric precision, with compact rational expressions for
small fractions; existing sound-setting formatting is unchanged.

| Hardware module | HP  | Controls: range, step; new-rack default                                                                    | Writes / reads                                                                                                                                                                                                                                                                                              |
| --------------- | --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLOCK           | 12  | GROOVE off / on; on. DIV 0.25–16, 0.25; 2. SWING 0–1, 0.01; 1/3. GRID 1–16, 1; 4. OFFSET −1–1, 0.125; 1/8. | `.slow(2).swingBy(1/3, 4).late(0.125)`. DIV 1 and OFFSET 0 omit their respective calls; GROOVE off omits swing. An explicit SWING 0 remains active because it can change event structure. Missing source swing sets GROOVE off. GRID applies to swing only.                                                 |
| EUCLID          | 12  | MODE gate / legato; gate. PULSES 0–32, 1; 3. STEPS 1–32, 1; 8. ROTATE −32–32, 1; 2.                        | `.euclidRot(3, 8, 2)` / `.euclidLegatoRot(3, 8, 2)`. Reads `euclidrot` and two-argument `.euclidLegato(3, 8)` (rotation 0). Zero pulses are silent; PULSES must not exceed STEPS.                                                                                                                           |
| RATCHET         | 10  | REPEATS text; `<1 2 4>`.                                                                                   | `.ply("<1 2 4>")`. The literal is mini-notation, including alternating repeat counts.                                                                                                                                                                                                                       |
| CHANCE          | 10  | RANDOM unseeded / seeded; seeded. DROP 0–1, 0.05; 0.3. SEED 0–65535, 1; 1.                                 | `.degradeBy(0.3).seed(1)`. DROP 0 omits degradation; unseeded omits seed. Source degradation without seed stays unseeded. Seed 0 is an active seed, not an omission value: it can isolate upstream randomness from an outer seed. Adjacent seed attaches to the gate; repeated seeds remain separate nodes. |
| CHORD           | 12  | CHORDS text; `<Cm7 Fm7 G7>`.                                                                               | `chord("<Cm7 Fm7 G7>").voicing()`, an atomic source with its required voicing call. Chord names use the pinned tonal library. A bare chord control or other voicing arguments stay CODE.                                                                                                                    |
| ARP             | 10  | INDICES text; `0 1 2 1`.                                                                                   | `.arp("0 1 2 1")`, selecting indices from simultaneously stacked notes, including CHORD's voicing.                                                                                                                                                                                                          |

| Alien module     | HP  | Controls: range, step; new-rack default                                                                           | Writes / reads                                                                                                                                                                                                               |
| ---------------- | --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REV / PALINDROME | 14  | MODE rev / palindrome; rev.                                                                                       | `.rev()` / `.palindrome()`. One module with two modes.                                                                                                                                                                       |
| SHUFFLE          | 10  | MODE shuffle / scramble; shuffle. SLICES 1–32, 1; 8.                                                              | `.shuffle(8)` / `.scramble(8)`.                                                                                                                                                                                              |
| RIBBON           | 10  | OFFSET 0–65535, 0.25; 45. CYCLES 0.125–16, 0.125; 2.                                                              | `.rib(45, 2)`; also reads `.ribbon(45, 2)`.                                                                                                                                                                                  |
| TIME LENS        | 12  | MODE zoom / linger / compress; zoom. START 0–0.99, 0.01; 0.25. END 0.01–1, 0.01; 0.75. LENGTH 0.01–1, 0.01; 0.25. | `.zoom(0.25, 0.75)`, `.linger(0.25)`, `.compress(0.25, 0.75)`. START/END apply to zoom/compress and must strictly increase; LENGTH applies to linger. Inactive values remain saved. WINDOW belongs to #135's function loops. |
| WARP             | 10  | MODE brak / press / hurry; brak. RATE 0.25–8, 0.25; 2.                                                            | `.brak()`, `.press()`, `.hurry(2)`. RATE applies only to hurry. This is a panel name, not ownership of Strudel's unrelated wavetable `.warp()` control.                                                                      |
| ECHO             | 12  | TIMES 1–16, 1; 3. TIME 0.015625–1, 0.015625; 0.125. FEEDBACK 0–1, 0.05; 0.5.                                      | `.echo(3, 0.125, 0.5)`. These are repeated pattern events; the pinned engine writes decreasing gain for each repetition.                                                                                                     |

CLOCK now owns standalone `.slow()` calls, including immediately after SEQ;
SEQ's adjacent `.fast()` still sets RATE. LFO's dedicated rate handling remains
unchanged. DRUMS retains its existing unseeded adjacent `.degradeBy()` DROP
control; when immediately followed by `.seed()`, the pair reads as CHANCE.
Existing saved CODE owners remain CODE until explicitly converted.

Multi-argument and nullary transforms use a catalog `argument` of
`{ kind: 'tuple', controls: [...] }`. `byMethod` selects another argument list
for a method or import alias (including an empty list); `ascending` declares an
active start/end constraint enforced by the graph/mutation boundary. `atMost` declares an inclusive ordered pair, used for EUCLID pulses/steps. A binding's
`when: { control, value }` controls emission and activates that mode on import.
CHORD's catalog `source: { method, control, suffix }` describes its source literal
and required nullary suffixes. Text controls can carry string call bindings.
No module definitions are duplicated in panel components.

See the [acceptance record](pattern-time-verification.md) for distinct source,
saved rack, event, browser and PCM evidence.

## Panel extensions (#129)

The existing widths and saved values remain compatible. These additions were
checked against the installed `@strudel/core` 1.2.6, `@strudel/tonal` 1.2.6 and
`superdough` 1.3.0. Bounds below are the panel's supported ranges; they are not
claims that the engine rejects every value outside them. New optional settings
use the engine defaults and omit their calls at those values. Existing controls
retain their previous omission rules and saved-file semantics.

| Module / control   | Kind and range                  | Default / omit    | Call and condition                                                                                                                |
| ------------------ | ------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| OSC PITCH          | NOTE / FREQ                     | NOTE; switch only | FREQ overrides event pitch; an unpatched OSC becomes `freq(110).s(...)`, one event per cycle                                      |
| OSC PW             | knob 0–1, .01                   | .5 / .5           | `.pw(x)`, pulse only                                                                                                              |
| OSC VOICES         | knob 1–100, integer             | 5 / 5             | `.unison(x)`, supersaw only                                                                                                       |
| OSC DETUNE         | knob 0–24 st, .01               | .18 / .18         | `.detune(x)`, supersaw only                                                                                                       |
| OSC SPREAD         | knob 0–1, .01                   | .6 / .6           | `.spread(x)`, supersaw only                                                                                                       |
| OSC NOISE          | knob 0–1, .01                   | 0 / 0             | `.noise(x)`, sine/triangle/square/sawtooth only; pulse and supersaw do not mix noise in this engine                               |
| OSC OCT            | knob −2…2, integer              | 0 / 0             | `.octave(x)`; relative multiplier `2 ** x`, including Hz mode                                                                     |
| OSC FREQ           | log knob 20–20000 Hz, integer   | 110 / always      | `.freq(x)`, FREQ mode only                                                                                                        |
| VCF TYPE           | 12db / ladder / 24db            | 12db / 12db       | `.ftype(x)`, LP/HP/BP only                                                                                                        |
| VCF DRIVE          | knob 0–4, .01                   | .69 / .69         | `.drive(x)`, ladder and LP/HP/BP only; the engine exponentiates drive                                                             |
| VCF ANCHOR         | knob 0–1, .01                   | 0 / 0             | `.fanchor(x)`, LP/HP/BP only; affects an active filter envelope                                                                   |
| VCF DJ             | knob 0–1, .01                   | .5 / .5           | `.djf(x)`, DJ mode only; .5 is neutral; hides CUTOFF/RES/ENV AMT/TYPE/DRIVE/ANCHOR                                                |
| VCA VEL            | knob 0–1, .01                   | 1 / 1             | `.velocity(x)`; multiplies gain in the engine                                                                                     |
| SEQ / DRUMS ACCENT | text row, numeric mini-notation | `1` / `1`         | `.velocity("1 .6 .6 .6")` at the source, before downstream transforms                                                             |
| QUANT SCALE        | switch                          | minor / always    | Adds minor/major pentatonic, harmonic/melodic minor and major/minor blues; spaces become colons in `.scale("C:minor:pentatonic")` |
| QUANT SHIFT        | knob −14…14, integer            | 0 / 0             | `.scaleTranspose(x)`, after scale; diatonic degrees                                                                               |
| SMPL N             | knob 0–127, integer             | 0 / 0             | chained `.n(x)`; bare `n("...")` remains SEQ                                                                                      |
| SMPL BEGIN / END   | knobs 0–1, .01                  | 0 / 0; 1 / 1      | `.begin(x).end(x)`; fractions of the sample                                                                                       |
| SMPL LOOP          | knob 0/1                        | 0 / 0             | `.loop(1)`                                                                                                                        |
| SMPL CUT           | knob 0–32, integer              | 0 / 0             | `.cut(x)`; 0 means no cut group                                                                                                   |
| DELAY TIME/SYNC    | TIME / SYNC                     | TIME; switch only | TIME retains `.delaytime(seconds)`; SYNC writes `.delaysync(cycles)`                                                              |
| DELAY SYNC         | knob 1/64–4 cyc, 1/64           | 3/16 / 3/16       | No `.delaytime()` in SYNC; preserve exact fractions such as .015625; omit all companion settings at MIX 0                         |
| REVERB FADE        | knob 0–4 s, .01                 | .1 / .1           | `.roomfade(x)`; omitted when ROOM 0                                                                                               |
| REVERB LP          | log knob 20–20000 Hz, integer   | 15000 / 15000     | `.roomlp(x)`; omitted when ROOM 0                                                                                                 |
| REVERB DIM         | log knob 20–20000 Hz, integer   | 1000 / 1000       | `.roomdim(x)`; omitted when ROOM 0                                                                                                |
| MIX MUTE 1–4       | off / on                        | off / no prefix   | `_` label prefix; keeps the voice and its orbit slot                                                                              |
| MIX SOLO 1–4       | off / on                        | off / no prefix   | `S` label prefix; keeps all orbit slots                                                                                           |
| MIX NAME 1–4       | text                            | empty / `$`       | channel label; separate from named fan-out outputs                                                                                |
| MIX OUTPUT 1–4     | text positive integer pair      | `1:2` / `1:2`     | `.channels("3:4")`, before orbit; actual hardware outputs depend on the device                                                    |

OSC adds `pulse` to WAVE. All new controls retain their inactive values in rack
metadata. Newly imported calls with omitted delay time read as SYNC, matching
the engine's 3/16-cycle default; legacy explicit delaytime calls keep TIME.
Unrepresentable arguments remain exact CODE. Imported simultaneous ordinary
filter and DJ calls use separate VCFs so neither setting is lost.

MIX adds **CV 1–4**, mod inputs targeting `ch1`–`ch4`. Each level has bipolar
DEPTH −1…1, default −.5, in gain units. STEP LFO replaces that channel's
scalar gain with `signal.range(level, level + depth)`; CV SEQ supplies its numeric
pattern directly. Opposite LFO depths produce complementary levels. With #130
merged, SMOOTH LFO and ENV use its shared per-voice adapters targeting postgain
after folding the mixer levels. An outer constant level scales both the base
and absolute modulation depth. These use the pinned engine's additive AudioParam
semantics. Nested scalar/pattern levels multiply into one final `postgain`;
repeating `postgain` calls would overwrite earlier levels. See the
[label and nested-routing decisions](translation-rules.md#mixer-channel-labels-and-routing-129)
and [dated verification](module-panels-verification.md).

Pinned-engine evidence: `superdough/synth.mjs` supplies supersaw 5/.18/.6,
pulse .5 and standard-oscillator noise 0; `helpers.mjs` supplies octave 0,
filter drive .69 and current anchor 0; `superdough.mjs` supplies velocity 1,
channels [1,2] and delaysync 3/16; `sampler.mjs` supplies begin/end 0/1;
`reverb.mjs` supplies fade/LP/DIM .1/15000/1000. Core controls and tonal provide
the corresponding calls. Labels are implemented by core `repl.mjs` and the
transpiler, independently of event control values.

## Ordered effect stage bindings (#134)

`VOICE_EFFECT_ORDER` in the catalog is the pinned native stage order, keyed by
primary call spelling. The writer/reader derive module membership from active
catalog control bindings, without a second UI module list. New #131 effect
modules participate through those bindings. VCF LP/HP/BP stages and DELAY/REVERB
support native or inline FX execution; amp envelopes/gain and DJ orbit filtering
retain outer-voice semantics. A reordered/repeated chain uses one FX argument
per module, with its modulation and companion settings. Stage-local 24 dB
filters are unavailable in the pinned engine; ordered generation refuses that
mode. Native 24 dB and local FX ladder settings remain supported.

See [rule 4](translation-rules.md#4-effect-stages-follow-cable-order-134),
[send/orbit semantics](translation-rules.md#effect-orbits) and
[acceptance evidence](ordered-effects-verification.md).
