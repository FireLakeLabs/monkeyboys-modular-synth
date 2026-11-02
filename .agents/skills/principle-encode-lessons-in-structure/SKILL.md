---
name: principle-encode-lessons-in-structure
description: "Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text."
---

# Encode Lessons in Structure

If the lesson needs judgment and cannot be encoded, make the instruction more prominent and add an example of the failure mode.

Prefer one enforceable source of truth. Once a structural fix exists, replace
duplicated instructions with a pointer to the check and its purpose. Keep the
rationale that maintainers need to understand the constraint.

Prove a new guardrail rejects a representative violation. Record the rule and
its actual enforcement status in [standards](../../../docs/standards.md); a
written rule alone is review guidance, not a deterministic guarantee.
