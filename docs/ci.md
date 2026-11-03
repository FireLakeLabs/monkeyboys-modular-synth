# CI and merge enforcement

[Checks](../.github/workflows/check.yml) installs the locked dependencies using
the Node version in `.node-version`, then runs `npm run check`. It runs for pull
requests, pushes to main, and manual dispatch. Its check job has read-only repository access,
does not persist checkout credentials, and pins third-party action revisions.

The gate checks runtime, formatting, skill integrity, lint, catalog/generator/engine tests,
guardrail tests, TypeScript, and the production build. It does not play audio or
prove production import and audible equivalence. Guardrail fixtures are temporary and
do not modify application files.

Passing main builds also publish the exact checked artifact through a dedicated
OIDC production job. Manual application rollback and infrastructure deployment
are documented in [deployment operations](deployment.md). Pull-request checks
do not receive AWS credentials. Hosting/rollback behavior tests run alongside
the guardrail tests.

## Full browser acceptance

[Browser acceptance](../.github/workflows/browser.yml) runs on **every push to
main**, including each merge, and supports manual dispatch. Changes to its workflow,
runner, scripts or dependencies also trigger it on pull requests, so CI changes
can be verified before merging. Runs have no concurrency cancellation or pending-run
replacement; each main commit gets its own checkout and report.

The workflow installs the locked dependencies and Playwright Chromium with its
Linux system dependencies, then runs `npm run test:browser`. It has read-only
repository access, no deployment credentials, and pinned actions. It is separate
from `npm run check` and deployment: network/sample failures fail the browser job
without changing the deterministic gate or production publishing policy.

To reproduce locally with the pinned Node version:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser
```

Playwright starts and stops its own Vite dev server on `127.0.0.1:5173`; that port
must be free. One worker runs the suites sequentially, with fresh browser contexts
and no automatic retries. The [runner](../tests/browser/suites.spec.mjs) executes
the existing workspace-error/recovery, editor-feedback and autosave scripts, plus
cable targets, grids, library UI/replacement/rack editing, library PCM/Cancel/Stop
recovery, and trance playback/events/export/reopen probes. The original script
assertions remain authoritative. The historical two-build editor-load benchmark
and manual engine-spike page are experiments, not acceptance suites, and are not
run by this command.

The real-engine groups require network sample manifests and audio resources.
Nonzero WebAudio PCM and scheduler events establish output for the tested patches;
they do not establish physical listening, sound quality or other-browser coverage.
HTML reports, JSON results, child-script logs and available screenshots/traces
are retained under `playwright-report/` and `test-results/`, including partial
failure evidence, and uploaded for 14 days. Open `playwright-report/index.html`
or use `npx playwright show-report` to inspect the report.

### Observed browser baseline

On 3 November 2026, the runner exercised the application at `ce70a85` using
Chromium `156.0.8078.4`, Node `24.22.2` and locked dependencies. Nine groups passed
in the initial full run. The trance probe timed out waiting for a replacement
prompt that #61 intentionally removed for clean library loads. After correcting
that stale probe expectation, its focused rerun passed playback, events, PCM and
exact source/rack export/reopen checks. All ten groups therefore passed against
the same application revision; no application source changed. The repository
gate also passed (731 tests, 17 expected failures and 40 guardrail tests).
Physical listening was not performed. Hosted workflow activation awaits merging
the workflow to main; local results alone do not prove hosted execution.

## Observed GitHub status

Verified on 2 November 2026: the [repository](https://github.com/FireLakeLabs/monkeyboys-modular-synth)
is public, and [hosted Checks passed on main](https://github.com/FireLakeLabs/monkeyboys-modular-synth/actions/runs/41470335192).
The active [Default branch checks ruleset](https://github.com/FireLakeLabs/monkeyboys-modular-synth/rules/26377051)
applies to `main`. It requires `Repository checks` from GitHub Actions and an
up-to-date branch, blocks deletion and force-push, and has no bypass actors.
This was verified through the ruleset and effective branch-rules APIs; a
controlled failing-PR merge attempt has not been performed in this audit.
Classic branch protection is not configured; protection comes from the ruleset.

This is a dated observation, not a continuously checked guarantee. Recheck the
live ruleset and effective branch rules before relying on it. The checked-in
JSON is a setup template; it is not proof of live enforcement.

## Activating the required check

The workflow and [ruleset definition](../.github/rulesets/main.json) are versioned
in this repo. The ruleset is not applied automatically. Publishing commits and
running Actions does not itself enable merge protection.

After the workflow has been published and its `Repository checks` job has run:

1. Inspect existing repository rules and available GitHub plan/admin capabilities. Reconcile this definition with existing rules rather than creating a duplicate.
2. Import the JSON through GitHub's repository ruleset UI, or create/update it through the [repository rulesets API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset) using authorized admin credentials. Bind the required check to GitHub Actions as its expected source when configuring it.
3. Confirm the default branch requires `Repository checks` and an up-to-date head, and disallows deletion and force-push. The definition grants no bypass actors.
4. Verify that a failing check blocks a test PR's merge and a passing, current head satisfies the gate. Preserve any stronger existing protections.

If repository rules are unavailable for the account/plan, record that limitation
and use available branch-protection settings. Until the live configuration is verified through the ruleset and effective
branch-rules APIs, [standards](standards.md) must mark activation as planned.
Record the failing-PR experiment separately; an active configuration does not
imply that experiment has been performed.

## Native stacked pull requests

Matching base/head branches create a dependency chain but do not register a
native GitHub stack. For a requested stack, use `gh stack link` with existing PR
numbers in bottom-to-top order, or the
[create-stack REST endpoint](https://docs.github.com/en/rest/pulls/stacks#create-a-pull-request-stack)
with an ordered `pull_requests` array. Reuse the existing PRs.

Before reporting completion, read each PR through the API and require a non-null
`stack` object. Check that all layers share one stack number, report the expected
size and ordered positions, and target the intended trunk. Also read the stack
endpoint to verify the ordered member list. `stack: null` is a failed check even
when the branch chain and description links look correct.

This is a workflow verification step, not a local CI guarantee: stack membership
lives on GitHub. Record the observed stack number and member order in the result.
Use GitHub's [native stack merge/rebase behavior](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs)
rather than applying instructions intended for manually chained PRs. Creating a
stack does not authorize merging it.

## Updating tools

Update `.node-version` and the minimum Node engine together, then reinstall with
`npm ci` and run the gate. CI reads the version file directly. Update pinned
formatter/type-aware-linter packages and action SHAs deliberately; review the
lockfile and rerun the negative probes. Formatting changes belong in a separate
commit from application behavior changes.

Dependency advisory checks such as `npm audit` use changing external data. Run
them during dependency review; they are separate from the deterministic local
gate. Review the configured action revisions against their official repositories.
See [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use),
[Oxlint type-aware setup](https://oxc.rs/docs/guide/usage/linter/type-aware.html),
and [Prettier configuration](https://prettier.io/docs/configuration).
