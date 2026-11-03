# Public demo deployment

This repository owns the independent **MonkeyboysModularSynth** CDK stack in
account `410633461462`, region `us-east-1`, serving <https://mms.firelakelabs.com>.
The initial release is the existing module library and fixed Play/Stop demo;
feature issues #1–#14 do not gate it. The existing `FireLakeLabs-dev` stack and
its sites/API are untouched. [Configuration](../infra/config.mts) references the
existing issued wildcard ACM certificate, Route 53 zone and GitHub OIDC provider.

## Infrastructure and setup

The pinned CDK tooling currently has an upstream-blocked minimatch advisory.
See the [dated reachability assessment and tracked disposition](cdk-advisory.md)
before changing tooling or glob inputs.

The stack owns a private website bucket, separate private release archive,
CloudFront distribution with OAC, A/AAAA aliases, and two GitHub roles. Buckets
block public access, require TLS, use S3 encryption and bucket-owner ownership,
and survive stack deletion. Termination protection is enabled. CloudFront can
read only the website bucket. Missing chunks remain errors, not HTML fallbacks.

The other repository's workflow role is unused. The application role can inspect
this stack/distribution, invalidate its cache and list/read/write its two buckets;
it cannot delete objects or deploy infrastructure. The infrastructure role can
assume only the existing CDK deploy, file-publishing and lookup roles, plus read
this stack and CDKToolkit. `scripts/check-cdk-access.mts` attempts each actual
role assumption and discards credentials before deployment.

The shared bootstrap deploy role can pass the existing CloudFormation execution
role. This is privileged infrastructure access, isolated behind the manual
workflow and the main-only `infrastructure` environment. Repository admins and
workflow changes on main are trusted. Do not grant this role to application jobs.

For first provisioning, use the owner's short-lived deployment profile:

```bash
export AWS_PROFILE=mms-deploy
npm ci
npm run check
node scripts/check-cdk-access.mts
npx cdk synth --strict --quiet
npx cdk diff --no-change-set
npx cdk deploy --require-approval never
aws cloudformation describe-stacks --stack-name MonkeyboysModularSynth --region us-east-1
```

Review the diff before provisioning. Verify the certificate in `us-east-1`
covers `mms.firelakelabs.com` and zone `Z06678771L6FN5R60H05L` belongs to
`firelakelabs.com`. Do not rebootstrap or modify other sites to fix access.

In GitHub **Settings → Environments**, create `production` and `infrastructure`.
For both, set deployment branches to **Selected branches and tags → Branch →
main**, allowing no tags or other branches. Set environment variable
`AWS_ROLE_ARN` to the matching stack output: `AppDeployRoleArn` for production,
`InfraDeployRoleArn` for infrastructure. ARNs are configuration, not secrets.
No long-lived AWS credentials are needed. Trust requires the exact repository/
environment subject and `sts.amazonaws.com` audience. Environment restrictions
are essential: an environment OIDC subject does not itself include the branch.

This repository uses GitHub's immutable subject prefix
`repo:FireLakeLabs@267435624/monkeyboys-modular-synth@1442162225`, followed by
`:environment:production` or `:environment:infrastructure`. Names alone do not
match its tokens. Confirm the exact prefix before provisioning or after a
repository rename/transfer:

```bash
gh api repos/FireLakeLabs/monkeyboys-modular-synth/actions/oidc/customization/sub
```

Compare `sub_claim_prefix` with `hosting.oidcSubjectPrefix` and retain immutable
subjects; do not opt out or broaden trust to suppress authentication errors.
See GitHub's [immutable subject reference](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).

## Publishing

[Checks](../.github/workflows/check.yml) uses `.node-version`, `npm ci`, and
`npm run check`. It saves the exact resulting `dist` artifact for 90 days. Only
a successful main gate can enter the OIDC production job; PRs cannot publish.
The deployment consumes the artifact ID output by its check job, so rerunning
only a failed publish reuses the original checked artifact.
Manual dispatch on main supports new checked builds or an archived release ID
in `rollback_release`. Infrastructure changes deploy only through the manual
[Infrastructure workflow](../.github/workflows/infrastructure.yml), after its gate.

Both deployment jobs share `mms-production` concurrency with cancellation
disabled. Workflow cancellation is also disabled, so pushes cannot interrupt an
active publish. GitHub may replace pending jobs; every publish is a full build.
Local recovery must be coordinated with Actions and other browser/audio work.

Release IDs are `COMMIT-RUN_ID-ATTEMPT`. `MMS_RELEASE_ID` namespaces hashed
bundles under `assets/RELEASE_ID/`; ordinary local builds use `assets/`. On a
publish-only retry the asset namespace remains the producing build attempt,
while the archived deployment release ID uses the new deployment attempt.
[The publisher](../scripts/hosting.mts) validates the account, stack identity,
outputs, distribution hostname/enabled state, exact S3 origin, OAC and HTTPS
redirect before uploading. It archives files with SHA-256 hashes and writes the
manifest last as a completion marker. It uploads assets before `index.html`,
invalidates CloudFront, waits, and compares the HTTPS homepage byte-for-byte
with the selected artifact. An interrupted archive is not a usable rollback;
retry a new deployment with a new release ID or restore a completed archive.

Hashed assets use `public,max-age=31536000,immutable` with CloudFront's optimized
asset policy. HTML/root files use `no-cache,max-age=0,must-revalidate` and the
default CloudFront behavior disables caching. This preserves lazy loading in
older tabs while refreshing new navigations.

## Retention and cleanup

Website assets and S3 archives are retained **indefinitely** initially. Publishing
never deletes objects; there is no automatic lifecycle expiration. GitHub
artifacts expire after 90 days, while S3 remains the rollback source.

Cleanup is a separate owner-reviewed operation. Keep at least 90 days of complete
archives and every asset referenced by retained releases; retain retired assets
at least 30 days after their last serving release. Inventory manifests and the
active homepage before proposing exact deletions. Never apply an age-only rule
to website assets: a quiet site could lose its current engine. Tabs older than
an eventual retention window must reload.

## Rollback

Read stack outputs for `ReleasesBucketName`, then list completed releases:

```bash
aws cloudformation describe-stacks --stack-name MonkeyboysModularSynth --region us-east-1
aws s3 ls s3://RELEASES_BUCKET/
```

A prefix is complete only when `release.json` exists. Preferred rollback:
**Checks → Run workflow → main**, set `rollback_release` to that exact release
ID. The current gate must pass, but the old artifact is restored without rebuild.
It uses the same serialized OIDC job. If Actions is unavailable, coordinate a
local recovery with all other publishers:

```bash
AWS_PROFILE=mms-deploy node scripts/hosting.mts rollback RELEASE_ID
```

Rollback validates manifest paths and all checksums before any website write,
restores assets before HTML, invalidates, and checks the live homepage. Newer
chunks remain available. Re-run normal deployment to roll forward.

## Hosted verification

Record observed results in [verification evidence](deployment-verification.md):

1. Verify valid HTTPS, HTTP redirect, and exact homepage/artifact bytes.
2. Anonymous S3 GET must fail while CloudFront succeeds. Inspect both buckets'
   public-access blocks and the website policy's distribution-scoped OAC grant.
3. In a fresh browser tab, verify lazy engine loading after the first Play click,
   audio on that click, and silence after Stop. Report heard audio separately
   from UI/network observations and measured audio samples.
4. Leave an earlier-release tab open without playing. Publish a different asset
   namespace, then click Play in the old tab and verify its old engine loads.
   Confirm old objects remain in S3 and immutable cache headers, plus HTML headers.
5. Restore the earlier release using the documented procedure, compare the
   homepage/assets, then roll forward.
6. Observe a passing main Actions run using the dedicated OIDC role and exact
   checked build. Local administrator deployment does not prove CI credentials.
   Inspect dependency/branch conditions separately to establish failed-gate exclusion.

The current oscillator demo needs no sample banks. Sample-source CORS, loading
failures, and live editing verification belong to the engine/feature issues.
