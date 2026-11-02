# CI and merge enforcement

[Checks](../.github/workflows/check.yml) installs the locked dependencies using
the Node version in `.node-version`, then runs `npm run check`. It runs for pull
requests, pushes to main, and manual dispatch. It has read-only repository access,
does not persist checkout credentials, and pins third-party action revisions.

The gate checks runtime, formatting, skill integrity, lint, catalog tests,
guardrail tests, TypeScript, and the production build. It does not play audio or
prove the future reader/generator contracts. Guardrail fixtures are temporary and
do not modify application files.

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
and use available branch-protection settings. Until activation is verified,
[standards](standards.md) must continue to mark the merge gate as planned.

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
