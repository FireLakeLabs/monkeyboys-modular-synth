# Callback #243 bounded review

Implementation: inherited and current GPT-6.1 Sol in T3 Code's Codex harness.
Policy selects Opus for this known Sol implementation. Advertised availability
was resolved once before delegation: Claude Opus 5.5 (`claudeAgent`,
`claude-opus-5-5`); target effort is `high`. No implementation agents are used.
One read-only reviewer per round, default three-round budget. Usage is recorded
only if exposed.

Base: `885289ead03cacbef557f70eba437135e163ea6b`. Review command throughout:
`git diff 885289ead03cacbef557f70eba437135e163ea6b`, plus `git status --short`.

Round 1 is pending on the clean committed revision named in its delegation.
Focused source/save/events/mutation/browser/PCM proof and the repository gate are
available in [the contract](../callback-branches.md). Full local browser coverage
runs after bounded review; two earlier intentionally interrupted runs are not
claimed as passing. Required hosted checks and Full browser suites remain separate
merge gates. No push has occurred.
