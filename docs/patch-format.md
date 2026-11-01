# Patch format

A patch has two equivalent forms:

1. **In memory:** the `Patch` object in [`src/patch/types.ts`](../src/patch/types.ts).
2. **On disk / on the clipboard:** plain Strudel code, followed by a comment block that records what the code cannot (rack layout, looks, output names).

The code is the canonical saved form. Paste it into the Strudel REPL and it plays; paste it back into MonkeyBoy and the rack is restored.

## In memory

```ts
interface Patch {
  version: 1
  modules: PlacedModule[]   // what is in the rack, where, in which look, with which values
  cables: Cable[]           // output jack → input jack
  names: Record<string, string>  // "moduleId:jackId" → name, for outputs with 2+ cables
}
```

- Module ids are the module type plus a counter: `seq1`, `vcf1`, `vcf2`.
- Positions are a row index and an offset in HP from the left of that row.
- `values` holds one entry per control id from the catalog; missing entries mean “catalog default”.
- A cable always runs from an `out` jack to an `in` jack. An `out` jack may have many cables; an `in` jack has at most one.

## The layout comment block

Proposed format, to be confirmed during the code-reader spike:

```js
// ── @monkeyboy rack v1 ──
// lead.0 seq   row=0 hp=0  look=instrument
// lead.1 osc   row=0 hp=11 look=powder
// lead.2 vcf   row=0 hp=21 look=instrument
// ...
// name vca1:out lead
```

- The block starts at the `// ── @monkeyboy rack v1 ──` marker and runs to the end of the file.
- One line per module, keyed by a **derived address**: the voice’s label (a named pattern or `$N` for the Nth `$:` line) plus the module’s position in that voice’s chain. The reader derives the same address from the code, so the block never has to repeat the code’s content.
- Modules that do not sit in a chain (LFO, ENV, OUT) are keyed by type and the address of what they feed: `lfo@lead.2:cv`.
- `name` lines record output names.

## Matching rules

- Code without a layout block (plain Strudel pasted in) is auto-laid out: one row per voice, modules left to right in chain order, default looks.
- If the code was edited so that some addresses no longer match, matched modules keep their position and look, and unmatched ones are auto-placed at the end of their voice’s row.
- The block is regenerated on every save; hand edits to it are honoured if they parse and ignored if they don’t.

## Open questions

- Whether derived addresses survive common edits well enough (inserting a call mid-chain shifts every later address). Alternative: give each chain call a short stable id in the block, matched by function name and order.
- Whether to store knob values that the code does not express (for example OUT’s VOL, or a bypassed DELAY’s TIME) in the block too. Probably yes, as `key=value` pairs on the module’s line.
