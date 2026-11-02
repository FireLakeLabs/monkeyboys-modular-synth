# Translation rules

How a patch becomes Strudel, and how Strudel becomes a patch. These rules apply in both directions.

## The three kinds of cable

| Cable       | Colour           | Carries                                                                                                                                               | In Strudel                                                        |
| ----------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Pattern** | yellow `#E6D35F` | Events in time: which note, and when. Hardware usually splits this into pitch and gate cables; a Strudel event carries both, so here it is one cable. | Mini-notation strings: `note("c e g")`, `s("bd hh")`              |
| **Audio**   | orange `#F4A462` | The sound itself, from a source through filter, amp and effects to the mixer.                                                                         | One chain of methods on a pattern: `.s() .lpf() .gain() .delay()` |
| **Mod**     | blue `#7DB9F6`   | A value that moves on its own. Into a CV jack, it turns that knob for you.                                                                            | Signals scaled with `.range()`: `sine`, `saw`, `perlin`, `rand`   |

Alien and Cyber jacks accept any cable type; the cable keeps the colour of whatever enters.

## The six rules

### 1. One voice, one expression

Everything between a pattern source and the mixer chains into a single expression of method calls, in the order the cables run.

```js
note("c2 eb2 g2")
  .s("sawtooth")
  .lpf(800)
  .delay(.4)
```

### 2. Each mixer input is a `$:` line

Every cable into MIX becomes its own `$:` line, playing alongside the others. `stack()` means the same thing; the reader accepts either, the generator writes `$:`.

```js
$: bass
$: drums
// same as stack(bass, drums)
```

### 3. A cable into CV turns a number into a pattern

An unpatched knob writes a plain number. Patch an LFO into it and the number is replaced by a signal sweeping from the knob’s value up by the LFO’s depth.

```js
// knob alone
.lpf(800)
// LFO patched into CUTOFF
.lpf(sine.range(800, 2400).slow(4))
```

### 4. Sound settings ignore order; pattern changes don’t

Strudel runs filters and effects in its own fixed chain, so their order in the code does not change the sound. If the cables say otherwise, the rack flags that cable and shows the order you will actually hear. Modules that rewrite the pattern — QUANT, every Alien module, every Cyber block, SEQ’s rate — act in cable order, and the generator must preserve it.

```js
// these two sound the same
.lpf(800).delay(.4)
.delay(.4).lpf(800)
// these two don't
.ply(2).degradeBy(.5)  // drops single hits
.degradeBy(.5).ply(2)  // drops whole pairs
```

### 5. No module? It stays code

Anything the reader cannot map goes into a Cyber CODE block that carries it through unchanged, so importing never changes how a pattern sounds.

```js
  .jux(rev)                   // JUX, alien
  .chunk(4, x => x.hurry(2))  // CODE, cyber
```

### 6. Split an output and it gets a name

Drag more than one cable from an output and that output gets a name. The code defines everything upstream of it once, as a named pattern, and reuses it in each voice the cables lead to.

```js
const lead = note("c2 eb2 g2").s("sawtooth")
$: lead.delay(.4)
$: lead.jux(rev)
```

Splitting an _audio_ output means the voice plays twice in Strudel, so levels add up — the same as sending one signal into two mixer channels.

## Generated code conventions

- `setcpm(bpm/4)` first, written as `setcpm(120/4)` so the BPM stays readable. v1 assumes four beats per cycle.
- Named patterns (`const`) next, in rack order.
- Then one `$:` line per mixer input, in channel order.
- Two-space indentation for chained calls; one method per line unless two belong together (`.attack(…).decay(…)`, `.delay(…).delaytime(…)`).
- Knobs at their default value are omitted when Strudel’s own default matches (for example `.speed(1)`, `.postgain(1)`). Where the module’s default differs from Strudel’s, it is always written.
- Numbers are written with up to three decimal places and no trailing zeros.
- The layout comment block comes last. See [`patch-format.md`](patch-format.md).

## Reading code

- Parse with a JavaScript parser (Strudel itself uses `acorn`) and walk method chains.
- `$:` labels and `stack(…)` arguments become mixer channels. `const` declarations used more than once become named outputs.
- Each recognised call maps to a module and control values via the module catalog (`src/modules/catalog.ts`).
- Unrecognised calls in a chain become a CODE block holding that call’s exact source text, in place.
- A voice that cannot be read at all becomes a single CODE block acting as its source.
- Retain the original document and source ranges alongside the rack graph. An
  untouched document round-trips exactly, including formatting, comments,
  statement order and layout text. Supported rack value edits splice only the
  affected literal and reparse; refuse unsafe or stale edits rather than silently
  regenerate imported code. See the proven approach and limits in the
  [source-preservation spike](source-preservation-spike.md).
- Preserve non-voice statements and opaque regions as source-owned content. A
  syntax-valid unsupported voice becomes CODE; a syntax failure returns a
  diagnostic and no new graph. Never partially apply the failed draft to the rack.
- Persistent module identity uses stable IDs and conservative source matching,
  not chain positions. See [matching rules](patch-format.md#matching-rules).
  Multi-call modules and CV expressions need catalog-owned semantic bindings.
- Parsing is not execution or sandboxing. Source equality, sound equivalence and
  saved rack identity are separate checks for the production reader/generator.
