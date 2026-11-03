# CDK minimatch advisory — issue #39

Assessed 2 November 2026 with Node `24.22.2`, npm `11.19.1`, and the committed
lockfile at `8f95560`. **Upstream-blocked; temporarily retain the current pinned
tooling dependencies and keep [#39](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/39)
open for remediation.** This is a bounded risk disposition, not a clean audit.

## Reproduction and upstream blocker

`npm ci` succeeded. `npm ls minimatch aws-cdk aws-cdk-lib --all` reported:

```text
monkeyboys-modular-synth@0.0.0
├─┬ aws-cdk-lib@2.275.0
│ └── minimatch@10.2.6
└── aws-cdk@2.1147.0
```

`npm audit --json` exited 1 with two moderate affected-package entries:
`minimatch` and its direct parent `aws-cdk-lib`. Both describe the single
[GHSA-g3hv-75wg-m249 advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249),
affecting minimatch `<11.0.1`. Both have `fixAvailable: false`. The
[captured audit](evidence/cdk-audit-2026-11-02.json) is identical before and after
this assessment; there are no other reported findings.

Registry queries `npm view aws-cdk-lib version dependencies bundleDependencies --json`
and `npm view aws-cdk version --json` showed that the installed versions are
already the latest published stable releases. CDK library `2.275.0` declares
`minimatch: ^10.2.6` and includes it in `bundleDependencies`; its tarball ships
the installed nested copy at `node_modules/aws-cdk-lib/node_modules/minimatch`.
The patched `11.0.1` is outside that supported range (minimatch's current latest
is `11.0.4`). There is no supported CDK update available to apply today.

No override or forced audit fix was applied: substituting major version 11
would require separate compatibility proof, including the bundled dependency
behavior. The manifest, lockfile, npm audit configuration and workflows remain
unchanged, so the finding remains visible.

## Reachability assessment

The advisory describes glob preprocessing amplification with attacker-controlled
patterns and `optimizationLevel >= 2`. Inspection of the installed CDK core
JavaScript found three consumers of minimatch:

- `core/lib/fs/ignore.js`: asset exclusion patterns, with `matchBase` and
  `flipNegate` options.
- `core/lib/stack.js`: bundling stack selection from CDK context, default `**`.
- `core/lib/mixins/selectors.js`: construct ID/path selector patterns.

These callers do not enable optimization level 2; the installed minimatch
implementation defaults to level 1. The [hosting stack](../infra/stack.mts)
defines resources directly and uses no asset staging, exclusion patterns or
mixin selectors. [CDK context](../cdk.json) contains fixed feature flags.
Infrastructure deployment is manual and main-only in the
[workflow](../.github/workflows/infrastructure.yml). No browser patch, imported
Strudel source, request parameter or other application input is passed to these
tooling patterns. Repository/infra code and local CDK context are trusted inputs;
this assessment does not claim safety for arbitrary CDK applications or future
changes to those inputs/options.

The package is absent from the browser build dependency graph:
`npm ls minimatch aws-cdk-lib --omit=dev --all` is empty and
`npm audit --omit=dev --json` reports zero vulnerabilities. A production Vite
build with source maps contains 30 source entries across its two JavaScript
chunks, with no CDK, minimatch or infra paths. Neither emitted JavaScript chunk
contains `minimatch`, `aws-cdk-lib`, `firstPhasePreProcess` or
`secondPhasePreProcess`. Combined with the source import boundary, this supports
no browser exposure in this build; the full development-tree finding remains.

## Verification and follow-up

`npm run check` passed, including all four `scripts/hosting.test.mts` tests and
the production build. Separate `node --test scripts/hosting.test.mts` and
`npx cdk synth --strict --quiet` passed. The before/after synth output directories
were byte-identical; the hosting template SHA-256 was
`f6eddb242b04df41e7b26f9c284e2b359fb86b4471ebbfbc691555a3345cebe7`.
The CLI reported 82 unconfigured feature flags; none were changed. No AWS
deployment, live stack comparison or infrastructure mutation was performed.

The repository maintainers should recheck npm/CDK releases and the advisory by
**9 November 2026**, or sooner when a CDK fix ships. Track that work in open
[#39](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/39); this
document does not schedule an automated check. Upgrade the exact CDK pin and
lockfile when upstream bundles a patched minimatch, then run `npm ci`, the full
gate, hosting tests, strict synthesis/template comparison and audit again.
Close #39 only after recording remediation evidence. If no supported fix is
available at the recheck, explicitly reassess and date the disposition there.
Reassess immediately before adding untrusted glob inputs, asset exclusions,
selector patterns or optimization-level changes.
