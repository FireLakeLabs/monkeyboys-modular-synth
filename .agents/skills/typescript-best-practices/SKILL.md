---
name: typescript-best-practices
description: Apply when designing, editing, or reviewing TypeScript and TSX types, validation, and control flow.
---

# TypeScript best practices

Read [type-system discipline](../principle-type-system-discipline/SKILL.md) first.
For validation and adapters, also apply [boundary discipline](../principle-boundary-discipline/SKILL.md).

- Model variants with discriminated unions. Preserve established discriminant names within each union; both `kind` and `type` are valid.
- Use semantic brands when mixing otherwise identical primitives would cause a real error. A verifying guard or constructor establishes the brand. An ID's format does not prove that its target exists.
- Prefer the simplest total type: keep ordinary arrays when empty input has a defined result; use readonly nonempty tuples when an operation requires a first element. Arbitrary indexes can still be absent.
- External data starts as `unknown`. Reuse the repository's schema system when one exists and derive types from its schemas. Introduce a schema dependency only when its validation workload justifies it.
- Prefer discriminants, `in`, `typeof`, and verified guards over assertions. Keep legitimate `as const`; confine necessary interoperability assertions to the boundary that establishes their claim. Avoid non-null assertions.
- Use `satisfies` to check compatibility without replacing the expression's inferred type. Literal inference still depends on contextual typing; use const assertions when literal preservation is required.
- Exhaust discriminated unions. A `never` check must be used (returned, thrown, or passed to an exhaustive helper) so unused-variable checks remain useful.
- Derive types from authoritative catalog/schema definitions when they describe the same concept. Give distinct domain concepts their own types rather than coupling them through incidental implementation details.
- Use object arguments when positional values are easy to confuse. Keep simple signatures and measured hot paths allocation-conscious.
- Await promises or attach a rejection handler. `void` alone does not handle a rejection. Event handlers may return promises only when they handle their own failures.
- Prefer real behavior tests; see [test behavior](../principle-test-behavior-not-implementation/SKILL.md). Keep pure patch logic separate from React and browser audio.
- Preserve comments explaining external constraints, contracts, and rationale. Encode enforceable invariants in types, constructors, lint, or tests; remove narration that only repeats code.

Consult [patterns](references/patterns.md) for nonempty arrays, validated units,
discriminated unions, and exhaustive handling. Project-specific enforcement and
remaining gaps live in [standards](../../../docs/standards.md).
