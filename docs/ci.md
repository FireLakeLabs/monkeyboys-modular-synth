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
main**, including each merge, and supports manual dispatch. Changes to `src/`, its
workflow, runner, scripts or dependencies also trigger it on pull requests, so app
and CI changes are verified before merging. Runs have no concurrency cancellation or pending-run
replacement; each main commit gets its own checkout and report.

The workflow installs the locked dependencies and Playwright Chromium with its
Linux system dependencies, then runs `npm run test:browser`. It has read-only
repository access, no deployment credentials, and pinned actions. It is separate
from `npm run check` and deployment: network/sample failures fail the browser job
without changing the deterministic gate or production publishing policy.

**Full browser suites** is not a required check, because network and sample
failures must not block unrelated merges. Still wait for its result whenever it runs
on a pull request, and treat a failure as a merge blocker until it is explained.
A passing local run on the same commit does not replace it, because the job also
proves behavior on GitHub's slower runners.

### Browser verification policy

For application changes, run the local browser checks covering the affected
behavior, including neighboring callers of shared controls or styles. Inspect
real screenshots for UI changes and exercise native pointer or keyboard behavior
where it matters. Record the commands, revision and observed results.

Run the complete local suite when changes span multiple interacting subsystems,
such as rack editing, source preservation and playback, when affected coverage is
unclear, or when diagnosing a failure that requires the full-run conditions.
A focused check is the default for a change with clear, bounded browser
coverage. Use
`npm run test:browser:report` for focused and full runs and read its `RESULT` line.

After a review fix, rerun the affected checks and reassess whether the criteria
above require a complete local run. Documentation, comments and formatting alone
use their relevant static checks unless they change executable examples or test
inputs. The final PR head must complete the hosted **Full browser suites** check
whenever it runs before merge, with any failure explained as above. Local coverage
and model review do not replace that gate.

To reproduce locally with the pinned Node version:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser:report
```

### Reading a local run

`npm run test:browser:report` runs the suite, keeps the real exit status, writes a
log and ends with `RESULT passed=N failed=N exit=N`. Read that line rather than the
exit status of a wrapper: a background command or a pipe into `tail` can report
success after tests failed. Extra arguments pass through to Playwright, as in
`npm run test:browser:report -- -g 'output-panel'`.

- **Run the suite as a background job.** It outlasts the 10-minute limit on foreground
  commands, and that limit cut one Wave 3 run off at test 66 of 101. A cut-off run proves
  nothing, however well it was going: run it again in full.
- **One suite per machine.** Each run needs port 5173 with `--strictPort`, so a second
  run fails at once, and two suites competing for CPU cause false timeouts and skew
  latency numbers. Concurrent work should prove changes on GitHub instead.
- **Keep the machine quiet during suites and latency runs.** Avoid running reviews or
  other heavy work beside them. Reviews running alongside may have added noise in Wave 3,
  but that is unproven: of two runs with a silent sample voice, only one overlapped a
  review ([#207](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/207)).
- **Do not edit `src/` during a run.** Vite serves it live, so an edit, rebase or branch
  switch changes the app under the running tests, and the result no longer describes one
  commit. Wait for the `RESULT` line first.
- **Stop servers by port or process ID.** `pkill -f <text>` also matches the shell
  running that command, which kills it with exit 144. Find the process with
  `ss -ltnp | grep :5173` and pass its ID to `kill`. A killed run can leave its
  server holding the port.
- **Suites under `scripts/` drive their own browser.** The Playwright failure
  screenshot for one shows an idle page. To see the failing moment, add a temporary
  screenshot to the script itself and remove it afterward.
- **Playwright hides scrollbars by default.** Launch with
  `ignoreDefaultArgs: ['--hide-scrollbars']` when checking scrolling or layout.
- **Look at real screenshots for UI work.** They have caught hidden prompts,
  unreadable text and covered controls that passing tests missed.
- **Read controls through `scripts/panel-controls.mjs`.** It finds a catalog switch
  whichever way the panel draws it, and opens the More flyout, so checks do not
  break when a control changes form.

Playwright starts and stops its own Vite dev server on `127.0.0.1:5173`; that port
must be free. Two workers run independent groups in parallel, with fresh browser
contexts, separate evidence directories and no automatic retries. Multi-step
scripts retain their internal order. To diagnose a concurrency-sensitive failure,
run `npm run test:browser -- --workers=1`. The [runner](../tests/browser/suites.spec.mjs) executes
the existing workspace-error/recovery, editor-feedback, autosave, metadata,
code-application, history, sounding-token, module-behavior, rack-visual and
output-panel scripts. It also runs cable targets, grids, library UI/on-ramp/rack
editing, literal identity, error positions, editor status, CODE conversion, patch
names, all module looks and mid-width workspace probes, plus library
PCM/Cancel/Stop recovery, trance playback/events/export/reopen, and generalized
modulation controls/within-note PCM. Code application
and history include their real-engine modes. The original script assertions
remain authoritative. The historical two-build editor-load benchmark
and manual engine-spike page are experiments, not acceptance suites, and are not
run by this command.

The full module-exercise group has ten minutes to retain coverage as the catalog
grows. Library rack editing partitions the complete catalog into three independent
batches, each with ten minutes and one recorded result per selected patch. Other
groups retain their existing bounds. The complete run has 35 minutes, within the workflow's 40-minute job
budget. The former limits stopped the module matrix after 41 of 55 cases and
cancelled nine remaining groups at the 20-minute global deadline on 4 November
2026; those cancellations were not successful acceptance checks.

The real-engine groups require network sample manifests and audio resources.
Nonzero WebAudio PCM and scheduler events establish output for the tested patches;
they do not establish physical listening, sound quality or other-browser coverage.
HTML reports, JSON results, child-script logs and available screenshots/traces
are retained under `playwright-report/` and `test-results/`, including partial
failure evidence, and uploaded for 14 days. Open `playwright-report/index.html`
or use `npx playwright show-report` to inspect the report.

### Expected size and duration

At `b4ed8b3` on 5 November 2026 the suite had **163 tests in 9 files**, and
`npx playwright test --list` prints the current count. The eight GitHub runs for Wave 3's
pull requests and merges took 15 to 19 minutes in the test step, or 15 to 20 for the whole
job. The two runs at 163 tests took 16 and 19 minutes in the test step. A full local run
takes more than 10 minutes.

These are dated observations, not limits; the suite grows with each feature. Compare a
finished run's `passed` count with the current list, because a shorter run did not cover
everything. A run well outside this range is worth a look even if it passes:
[#193](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/193) tracks browser
test time and reliability.

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

### Modernized browser baseline

On 4 November 2026 (UTC), after rebasing onto `f68df45`, all 27 groups passed in
one full run with no retries, using the same Node and Chromium versions above.
The runner includes the acceptance probes added since the original baseline.
Existing probes now follow the current Playing status, pinned OUT, invalid
metadata preservation and opener-diagnostic contracts. Geometry comparisons
restore the same rack scroll position before comparing cable paths.

`npm run check` also passed: 929 unit cases, 42 guardrails, the committed reader
corpus gate, formatting/skill integrity, lint, TypeScript and production build.
Application code is unchanged. Real-engine events and nonzero PCM were observed;
physical listening was not performed. Hosted checks for this rebased revision
remain separate evidence from these local results.

### Bounded parallel execution

On 4 November 2026 (UTC), five alternating full runs per configuration compared
the original serial worker with `fullyParallel: true` and two workers. Median
wall time for the complete test command fell from **380.3 s** (range
379.8–381.1 s) to **195.2 s** (range 194.9–195.7 s), a **48.7% reduction**.
All 270 group executions passed on their first attempt, with no skips. The
[timings and environment](evidence/browser-parallel-timings.json) retain each run,
the shared 27-group manifest, actual worker overlap and an excluded profiling run.
At the benchmarked revision `e20d8ac`, no assertions, sample waits or timing
thresholds changed. These timings predate the PCM-probe correction below and
are not a new benchmark of that correction.

The comparison used Node 24.22.2, Chromium 156.0.8078.4, locked dependencies,
`CI=1` and the same Vite application on a Linux AMD Ryzen 7 PRO 6850U machine
with 16 logical CPUs. Dependency/Vite caches were warm after the excluded
profiling run; browser contexts were fresh and real sample resources still used
the network. Timing includes Vite/browser startup, all assertions and reporting,
but excludes dependency and Chromium installation.

The separate profile sampled machine CPU every two seconds: median busy time
was 14.1%, peak 23.1%, and maximum I/O wait 0.1%. Independent groups can overlap
the existing scheduling, sample/PCM and accepted-edit waits without saturating
this machine. Two worker slots and the longer ordered library groups still
limit scaling. Two workers bound runner load; a higher worker count was not
evaluated. These local measurements do not establish a hosted CI speedup or
guarantee absence of future flakes. Real-engine event and PCM checks passed;
physical listening remains unverified.

### Hosted PCM-probe correction

The first [two-worker hosted run](https://github.com/FireLakeLabs/monkeyboys-modular-synth/actions/runs/41778255641)
passed 26 groups but failed the workspace recovery probe: the invalid-draft PCM
window measured RMS 0.0009934 against its unchanged 0.001 threshold. The probe
averaged one analyser per output connection, so silent or expired branches could
dilute the reported signal. Its decaying fixture also made short windows depend
on note phase. The local timing runs did not establish hosted reliability.

The recovery probe now sums output branches into one analyser per audio context
and uses a sustained, short-release fixture. A calibration regression adds 64
silent branches and requires PCM to remain within 20% of the original signal;
it failed with the old probe and passed with the corrected probe. Invalid drafts
must retain at least two future scheduled note onsets as well as nonzero PCM.
Stop must end those onsets and reach the same existing silence threshold after
release. Thresholds and the zero-retry policy remain unchanged. Application code
is unchanged; this correction is browser-test instrumentation and coverage.
The [calibration evidence](evidence/workspace-pcm-calibration.json) records the
controlled failure and corrected PCM/onset observations. All 27 groups passed
with two workers constrained to four logical CPUs
(`taskset -c 0-3 npm run test:browser`), and the final focused recovery suite
passed again. This local check is separate from hosted revalidation.

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
