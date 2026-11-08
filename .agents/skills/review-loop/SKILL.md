---
name: review-loop
description: Run a bounded model review when the user asks for "review loop" or an invoked workflow requires it.
---

# Review loop

Use one model to review the implementation in bounded rounds. The implementation
agent evaluates findings and makes the smallest justified fixes; the reviewer
stays read-only. Keep scope limited and push back with evidence.

Discussing or editing this workflow does not start a review.

## Budget

- Default: 3 rounds total. Round 1 is full. Later rounds check only
  changed code and open findings.
- Extend to 5 only for security, permissions, auth, data loss, or
  state/concurrency, while a blocker or should stays open with evidence. Or when
  the user asks.
- Stop early if a round returns only nits. Declined nits and comment,
  doc, or format-only fixes need no new round.
- One reviewer only. The reviewer must not start subagents or reviewers.
- Keep a ledger: id, severity, outcome, usage if returned. Never guess it.

## 1. Scope

Run `git status --short`. Do not stash, discard, or include unrelated
changes. Limit review to the change paths if they separate cleanly.
Otherwise stop and ask.

Find the base after `git fetch origin`:

- PR: `gh pr view <n> --json baseRefName,headRefOid`. Check out the branch
  only if clean. Confirm `HEAD` is the PR head, or ahead only by this
  change. Base: `git merge-base HEAD origin/<baseRefName>`.
- Local: `git merge-base HEAD origin/<default-branch>`. No remote: a base
  the user names, or `HEAD` for uncommitted changes only.

The change is base to working tree in those paths, with untracked files.
Use one diff command all rounds. State intent and out-of-scope in 1-2
sentences. Run covering checks. Do not send code this change breaks. Note
missing or pre-failing checks in the brief.

## 2. Select and start the reviewer

Use the user's explicit reviewer choice first, then the invoking entry point's
reviewer, then the project's review policy in `AGENTS.md`. An explicit version
wins over a family default. If none specifies a reviewer, ask the user.
Keep the selected reviewer fixed across rounds. Record the implementation model
from known task provenance, or report mixed/unknown; the reviewing agent does
not become the implementation agent.

Follow the active harness's delegation rules. In T3, call
`orchestrator_capabilities` once before the first delegation, and resolve the
latest model in the selected family unless the user named a version. Do not
hardcode an ID. Record the actual provider, model, and effort if exposed.
Set requested options through `target.options` using that provider's advertised
option names and values; do not copy incompatible options across providers.
Use a fresh `delegate_task` every round (`role: "review"`, `mode: "async"`).
Save `taskId` and use a new `clientRequestId` per round. `childThreadId` is
storage, not the next target. Review uses child tasks, not top-level threads
or `t3_thread_send`.

If T3 tools are not listed, try one direct capability call. Outside T3, use a
native subagent only when it supports the selected model and settings. A custom
subagent must actually be configured for that model. If no permitted route runs
the selected reviewer, report the blocker without substituting a model.

Do not edit scoped files while review runs. Follow the delegate's `next`
instruction; in T3 this can require ending the turn until completion wakes the
thread. Do not poll or start a second reviewer. Timeout, error, or no reply is
not approval. On failure, cancel and verify the task stopped before restarting
with the ledger, within the same round budget.

Round 1 brief (T3 children get no history):

```
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Repo: <abs path> Base: <sha> Intent: <intent> Out of scope: <scope> Checks: <results>
Implementation: <known model(s) or unknown>. Reviewer: <selected model>.
See: git diff <base> [-- <paths>]; git status --short (read untracked).
Read surrounding code. Find bugs, broken callers, mismatch with intent.
Skip style unless it hides a bug. Hold to the smallest change. Flag code,
tests, or guards the intent does not need. Other paths, rare cases, small
perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
Reply:
VERDICT: APPROVE or CHANGES
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion> (stable ids)
```

## 3. Answer findings

Check each finding and severity yourself. Another path, rare case, or
small cost is a nit, whatever label it came with.

- Agree: smallest fix. Prefer delete or narrow over new lock, cache,
  helper, or option. Fix the case that happened. Add one focused test
  that fails without the fix, if intent needs it.
- Disagree: say why, with evidence (file:line, test, output).
- Out of scope or nit: decline in one line. List as follow-up.

Update the ledger. Re-run checks and `git diff --shortstat <base>`. If
review grew the diff, cut first. Do not agree just to end the loop.

## 4. Next round

Start one only if budget remains and a blocker or should is open, behavior code
changed, or approval does not cover the current behavior diff. Use a fresh
`delegate_task` in T3, or follow up the saved native ID. Send the round 1 brief,
the ledger (`fixed:` / `disagree:` / `declined:` + evidence), the same base
diff, and the change since last round. Tell the reviewer: open ids and changed
code only. Mark each old id `resolved` or `still open: <reason>`.

## 5. Stop and ship

Agreed: APPROVE on the current behavior diff, no blocker or should open,
no concern of your own. Stuck: an item stays disputed after two replies,
or budget ends. Show both sides in 2-3 lines each. The user decides.
Budget end is not approval.

Do not push during the loop. Push after agreement only if the user asked
to push, ship, or update the PR. If you push to a PR, add above the model
blurb:

`Reviewed with <entry point>: <N> rounds with <reviewer model>. Verdict: approved on <head SHA> <working-tree state>.`

Use `review-loop`, `sol-loop`, or `opus-loop` as the entry point. Describe any
uncommitted reviewed changes in the working-tree state; do not imply a commit
alone identifies them. Keep review attribution separate from the implementation
model and harness blurb.

Add `on <effort>` only if verified.

Report: rounds, implementation model(s) if known, actual reviewer, reviewed
revision and working-tree state, fixes prompted by review, diff size before/after,
fixed and declined findings with reasons, usage if exposed (else say not),
pushed or not.
