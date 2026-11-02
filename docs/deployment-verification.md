# Deployment verification — issue #22

Observed on 2 November 2026. Pending checks below are not claims of success.

| Criterion                                                     | Evidence / status                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid HTTPS and HTTP redirect                                 | Normal-DNS HTTPS 200 with valid certificate; HTTP 301 to HTTPS                                                                                |
| Private S3, public CloudFront                                 | Anonymous S3 GET 403; both public-access blocks and distribution-scoped OAC policy inspected                                                  |
| Passing main deploys through OIDC; failed gate cannot publish | Run 41496120636 attempt 2 used the dedicated OIDC role and original passing artifact; failed checks are excluded by the deployment dependency |
| Target validation and exact artifact homepage                 | Negative target test passes; downloaded original CI artifact matches live homepage byte-for-byte                                              |
| First-click Play, Stop, lazy loading                          | Hosted first pointer click produced output RMS 0.0809; Stop output RMS/peak 0 after 1.5 seconds; no physical-listening claim                  |
| Preceding-tab engine and cache retention                      | Initial-release tab loaded its old engine HTTP 200 after redeployment; object remains in S3 with immutable cache headers                      |
| Restore previous release                                      | Run 41497749968 restored initial-demo-a and verified exact homepage bytes; next automatic main deployment rolled forward                      |
| Required checks and operational docs                          | Local full gate, PR CI, actionlint and strict CDK synthesis pass; see [operations](deployment.md); final evidence checks pending              |
| Independent of unfinished features                            | Hosting shipped without generator, reader, rack, or engine feature changes                                                                    |

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
address, without disabling TLS verification. Ordinary-DNS HTTPS and exact
homepage comparison subsequently passed after cache expiry at 18:03 UTC;
HTTP still redirected to HTTPS. A browser tab on the public hostname loaded
the module library and initial-demo-a entry while its engine remained unloaded.

HTML returns `no-cache,max-age=0,must-revalidate`; the lazy engine object returns
`public,max-age=31536000,immutable` and `text/javascript`. Browser playback,
old-tab loading and live rollback are pending. The engine track owns adapter
changes, including first-gesture initialization; no engine behavior was changed
by hosting. Once that track merges, verify its pinned Dirt-Samples and
tidal-drum-machines manifests/audio URLs from the public hostname, including CORS.

## Review

The first main application run (`41496120636`) and manual infrastructure run
(`41496296415`) passed their gates but failed OIDC before publishing/deployment.
CloudTrail and the repository OIDC settings API showed immutable owner/repository
IDs in the subject; the initial trust expected the old name-only subject. A
template regression with the independently captured token subject failed before
the repair and passed after it; the full gate also passed. The fix retains exact environment-scoped trust and the existing
immutable-subject setting. Application rerun attempt 2 authenticated through OIDC and published successfully; manual infrastructure rerun awaits the corrected source on main.

Sol approved in two rounds with `gpt-6.1-sol` on high effort. S1 (publish-only
reruns selecting a nonexistent new-attempt artifact) was fixed by passing the
check job's uploaded artifact ID to deployment. No declined findings; reviewer
usage was not exposed.

## Hosted browser and artifact proof

The public-hostname tab opened at 18:03:49 UTC with the `initial-demo-a` entry
and no engine request. Application run `41496120636` attempt 2 then restored the
original passing job's artifact by ID, authenticated as the dedicated
`AppDeployRole` using OIDC, and verified deployment release
`fb0f8b43fe331620b5f40d58b9e70ab05bed5684-41496120636-2` at 18:06:39 UTC.
The downloaded attempt-1 CI artifact matched the live homepage exactly.

At 18:07:25 UTC the earlier tab's first actual pointer click requested
`assets/initial-demo-a/dist-DZ528Br-.js` with HTTP 200. The engine context was
running; a passive analyser connected to its actual `destinationGain` measured
RMS `0.0809078`, peak `0.409323`, across 81,920 samples. Stop returned the UI to
Play; after a 1.5-second tail allowance, 40,960 samples had RMS and peak `0`.
This is observed WebAudio output, not a claim of physical listening. No context
resume or extra Play was performed by the measurement harness.

The old engine also remained readable in S3 with
`public,max-age=31536000,immutable`; new navigations referenced the new release
namespace. The retained tab was then closed and shared audio released.

## Rollback and engine follow-up

The documented manual Checks dispatch with `rollback_release=initial-demo-a`
ran as `41497749968`. Its OIDC-authenticated publisher restored that archive
and verified the live homepage at 18:10:00 UTC. The engine merge's next automatic
run `41498022795` then rolled forward to
`9cc4ef0f2393140002791daa9b78186435cd034c-41498022795-1`, verified at 18:11:45 UTC.
A later independent homepage comparison therefore saw the newer engine build,
not the deliberately temporary rollback.

A fresh incognito tab on the public hostname had neither engine nor sample
requests before Play. The first actual pointer click loaded the lazy engine and
both pinned manifests with HTTP 200, logged AudioWorklets ready, and produced
output RMS `0.078455` (81,920 samples). Hosted sample patterns then produced:

| Bank        | Output RMS | Tested audio                               |
| ----------- | ---------- | ------------------------------------------ |
| Default     | 0.036074   | Dirt-Samples bd/BT0A0A7.wav                |
| RolandTR808 | 0.012118   | RolandTR808/rolandtr808-bd/BD0000.WAV      |
| RolandTR909 | 0.045257   | RolandTR909/rolandtr909-bd/Bassdrum-01.wav |

All five pinned manifest/audio URLs were readable browser CORS responses with
HTTP 200 and `Cache-Control: max-age=300`; WAV responses had `audio/wav` content
type. Actual sample output establishes loading/decoding beyond manifest readiness.
Stop reached RMS/peak zero after the tail allowance. The tab was closed and audio
released. See [captured measurements](deployment-results.json) and
[engine source details](engine-spike.md#samples-and-deployment).

The automation harness reported user activation even before Play. These checks
prove the tested tool-activated first click in Chromium, not every untouched
browser/profile's autoplay policy. Physical audio was not heard.
