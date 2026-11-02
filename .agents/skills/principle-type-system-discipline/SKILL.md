---
name: principle-type-system-discipline
description: Apply when designing domain types, function signatures, or authoritative schemas that should prevent invalid states.
---

# Type system discipline

Make the compiler reject contradictory variants and meaningful primitive mixups.
Use brands where the semantic distinction prevents an actual error; avoid
branding every number or string by reflex. Validate values at construction.

External data becomes trusted domain data only after parsing; apply
[boundary discipline](../principle-boundary-discipline/SKILL.md). Types alone do
not establish arbitrary graph properties, numeric bounds, or validity after
mutation. Preserve those invariants through the owning constructor or operation.

Derive representations from their authoritative schema or catalog when they
describe the same concept. Apply [encode lessons in structure](../principle-encode-lessons-in-structure/SKILL.md)
to eliminate duplicated definitions and repeated corrections.

For syntax and examples, consult [TypeScript best practices](../typescript-best-practices/SKILL.md).
