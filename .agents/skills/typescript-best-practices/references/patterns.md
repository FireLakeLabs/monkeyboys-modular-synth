# TypeScript patterns

These examples require strict checking, checked indexed access, and exact optional
properties. They introduce no runtime package dependency.

## Nonempty arrays

A readonly tuple guarantees the first element, not an arbitrary numeric index.
Keep an ordinary array when the return type can represent absence.

```ts
export type NonEmpty<T> = readonly [T, ...T[]]

export function first<T>(items: NonEmpty<T>): T {
  return items[0]
}

export function atIndex<T>(items: readonly T[], index: number): T | undefined {
  return items[index]
}

export function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0
}
```

## Validated units

Start plus duration avoids storing redundant endpoints, but a plain number can
still be negative, infinite, or NaN. Validate that invariant at construction.
Use a brand when the distinction matters across callers. Dates and timestamp
overflow need their own validation when constructing an actual time range.

```ts
export type DurationMs = number & { readonly __brand: 'DurationMs' }

export function isDurationMs(value: unknown): value is DurationMs {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function parseDurationMs(value: unknown): DurationMs {
  if (!isDurationMs(value)) throw new Error('Expected a finite nonnegative duration')
  return value
}
```

A validated identifier establishes its format, not its existence in a patch.
Graph construction and mutation must preserve referential integrity separately.

## Variants and exhaustiveness

Choose a discriminant consistently within a union. Existing `type` discriminants
are as valid as `kind`. An added variant makes this default arm fail compilation
until its behavior is implemented.

```ts
export type LoadState =
  | { kind: 'idle' }
  | { kind: 'ready'; source: string }
  | { kind: 'error'; message: string }

export function describeLoad(state: LoadState): string {
  switch (state.kind) {
    case 'idle':
      return 'Ready to load'
    case 'ready':
      return state.source
    case 'error':
      return state.message
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}
```

## Literal inference

`satisfies` checks compatibility; it is not a universal promise against widening.
A const assertion can preserve literals and readonly structure without claiming
that unvalidated input has a domain type.

```ts
export const settings = {
  mode: 'preview',
  voices: 4,
} as const satisfies { mode: 'preview' | 'live'; voices: number }
```

## Boundaries and schemas

Parse external JSON as `unknown`. Reuse an established runtime schema and infer
its type rather than maintaining a parallel interface and validator. This repo
has no schema-library requirement yet. A small verified guard is appropriate for
a small boundary; saved-patch validation should choose one authoritative model.

Persisted versions, unknown fields, and unsupported code need explicit
compatibility policies. Preserve user content according to the patch and
translation specifications; silently dropping unknown fields is not a default.
