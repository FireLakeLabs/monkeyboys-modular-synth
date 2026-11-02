---
name: principle-boundary-discipline
description: Apply when parsing external data, preserving mutation invariants, handling failures, or isolating framework and side-effect adapters.
---

# Boundary discipline

Validate external inputs at entry and expose named domain concepts to callers.
Keep transformation logic pure and framework adapters thin. Reuse the validated
representation downstream instead of repeating checks in every helper.

Construction and mutation are also invariant boundaries: connecting a cable can
invalidate a previously valid graph. Put referential, uniqueness, ordering, and
other graph checks in the operation that owns the change. Trust downstream types
only for facts that the representation and those operations actually preserve.

Keep intentional adapters such as the Strudel engine even when they have one
caller. Handle asynchronous failures where the caller can recover or present an
error. Parsing recognizable code is not sandboxing executable JavaScript.

Validate saved versions explicitly. Treat user-owned saved files as an external
compatibility contract; migrating internal callers does not authorize dropping
their data. Preserve unsupported content according to the project specification.
