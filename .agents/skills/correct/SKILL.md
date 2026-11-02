---
name: correct
description: Turn a user correction or recurring repository mistake into a scoped structural fix and a proven guardrail.
---

# Correct

Use the correction and relevant history to identify the failure class and its
observable consequence. Repeated failures strengthen the case for automation;
an obvious preventable error need not happen twice before fixing it.

Choose the highest useful enforcement level:

1. Eliminate competing representations or ownership paths with a focused design change.
2. Encode invalid states and incompatible values in types or validated constructors.
3. Add a lint/configuration check with an actionable failure message.
4. Test the behavior through the interface that owns the contract.
5. Use review guidance with an example when judgment remains necessary.

Keep the fix within the requested work. Record larger redesigns as follow-ups.
Preserve purposeful adapters and saved-file compatibility. Apply
[encode lessons in structure](../principle-encode-lessons-in-structure/SKILL.md)
and [test behavior](../principle-test-behavior-not-implementation/SKILL.md).

Prove the guardrail rejects the original or representative failure, then passes
the corrected case. Use the same check locally and in CI. Keep justified
exceptions narrow, explain their reason and removal condition, and report them
for review. A correction does not independently authorize commits or publishing.

Update [standards](../../../docs/standards.md) with the mechanism and remaining
gap. Report the failure evidence, chosen enforcement, and fail-before/pass-after
result. Distinguish a reproducible test from inference or manual observation.
