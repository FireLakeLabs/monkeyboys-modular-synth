# Deployment verification — issue #22

Observed on 2 November 2026. Pending checks below are not claims of success.

| Criterion                                                     | Evidence / status                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Valid HTTPS and HTTP redirect                                 | CloudFront HTTPS 200 with valid certificate; HTTP 301 to HTTPS                                                       |
| Private S3, public CloudFront                                 | Anonymous website S3 GET 403; both buckets block all public access; distribution-scoped OAC policy inspected         |
| Passing main deploys through OIDC; failed gate cannot publish | Workflow dependency gate; live OIDC pending                                                                          |
| Target validation and exact artifact homepage                 | Negative target test passes; `initial-demo-a` live HTML exactly matches checked `dist/index.html`                    |
| First-click Play, Stop, lazy loading                          | Pending hosted browser/audio verification                                                                            |
| Preceding-tab engine and cache retention                      | Distinct-release behavior test passes; hosted check pending                                                          |
| Restore previous release                                      | Archive/restore test passes; live rollback pending                                                                   |
| Required checks and operational docs                          | Local full gate, actionlint 1.7.12 and strict CDK synthesis pass; see [operations](deployment.md); hosted CI pending |
| Independent of unfinished features                            | No generator, reader, rack, or engine feature changes                                                                |

## AWS preflight, 2 November 2026

Authenticated `mms-deploy` in account `410633461462`. Existing certificate is
ISSUED and includes `*.firelakelabs.com`; existing zone has no `mms` record.
The other repository's role trusts only that repository and is unused.
Actual STS assumptions of the existing CDK deploy, file-publishing and lookup
roles succeeded. The diff adds only the independent synth stack.

## Initial rollout

Stack `MonkeyboysModularSynth` reached CREATE_COMPLETE with termination
protection. Distribution `EQ8N6CU0L7PRR` (`d1pfo5c0ehx6je.cloudfront.net`) serves
the website bucket. `production` and `infrastructure` GitHub environments have
only the `main` branch allowed and their own `AWS_ROLE_ARN` variables.

`initial-demo-a` was built by the full gate using `MMS_RELEASE_ID=initial-demo-a`,
archived with a completion manifest, and uploaded assets-first. The local router
cached the initial NXDOMAIN, so the publisher's final ordinary-DNS fetch failed
after a successful upload/invalidation. Authoritative Route 53 and public
Cloudflare DNS resolved correctly. HTTPS/certificate and byte comparison were
independently verified with curl's per-request `--resolve` using that public
address, without disabling TLS verification. Ordinary DNS verification remains
to be repeated after cache expiry.

HTML returns `no-cache,max-age=0,must-revalidate`; the lazy engine object returns
`public,max-age=31536000,immutable` and `text/javascript`. Browser playback,
old-tab loading and live rollback are pending. The engine track owns adapter
changes, including first-gesture initialization; no engine behavior was changed
by hosting. Once that track merges, verify its pinned Dirt-Samples and
tidal-drum-machines manifests/audio URLs from the public hostname, including CORS.

## Review

Sol approved in two rounds with `gpt-6.1-sol` on high effort. S1 (publish-only
reruns selecting a nonexistent new-attempt artifact) was fixed by passing the
check job's uploaded artifact ID to deployment. No declined findings; reviewer
usage was not exposed.
