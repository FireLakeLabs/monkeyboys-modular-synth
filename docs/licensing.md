# License notices and corresponding source

The repository's original code remains [MIT](../LICENSE). The combined software
application includes Strudel, Superdough and Kabelsalat under AGPL-3.0-or-later
and is distributed under those terms, with no warranty. This follows
[Strudel's integration guidance](https://strudel.cc/technical-manual/project-start/).
It does not relicense third-party compositions, transcriptions, recordings,
fonts or trademarks. Their terms and unresolved permissions remain separate.

## In the app

About, Source on GitHub and Strudel share a header group. The two icon links use
matching targets, with the unchanged full-color upstream Strudel logo. About is a
native modal dialog: Enter opens it, Escape or Close dismisses it and returns
focus. It includes the source revision, source download, complete license texts,
engine changes and asset permission status. Local builds explicitly identify a
development checkout; they do not claim that the base commit contains local edits.

## Build and source materials

[Vite's license plugin](../scripts/licenses.mts) collects rendered production
modules, including lazy chunks and workers. It emits full package LICENSE/NOTICE
files, full AGPL text, original MIT terms, engine modification notices, icon and
font notices. Inventories of dependencies already embedded in the published
Strudel/Superdough/Kabelsalat bundles include audio worklets and their credits.
These inventories were adapted from
[Order Doesn't Matter PR #50](https://github.com/FireLakeLabs/order-doesnt-matter/pull/50).
They are tied to exact artifact hashes and versions, including our pinned patches.
Missing notices, an unaudited embedded bundle or an AGPL package version without
pinned preferred source makes the build fail. Tests include negative probes.

Production requires a clean checkout whose HEAD equals GITHUB_SHA. Each About
link targets that commit and this build's retained `assets/RELEASE_ID/` notices
and corresponding-source archive. `/licenses.txt` is a current-release alias;
About uses the versioned URL so an old tab keeps its own notices after deployment.
The existing publisher uploads and retains these assets and includes them in
rollback manifests without an infrastructure change.

The source archive contains the application/build/configuration sources,
installed runtime packages (including our actual patched artifacts), original
artwork, notices and build instructions. It also includes complete upstream
source archives for the pinned Strudel and Kabelsalat revisions, with their
original source, build files and lockfiles. Preferred source is included rather
than substituting minified npm bundles for it.

[The upstream inventory](../scripts/licenses/upstream.json) records immutable
revision URLs, SHA-256 hashes and covered package versions. The first build
fetches about 59 MB from Codeberg over HTTPS and caches verified archives in
`node_modules/.cache/mms-sources/`. Later builds reverify cached bytes. A corrupt
archive fails the build; remove it to fetch again. Builds need network access
for uncached archives. Runtime does not download these materials until requested.
No credentials or npm cache are copied to the source archive.

The postinstall patches now retain a dated AGPL modification notice in each
modified artifact. Their executable changes and original/patched payload hash
checks are unchanged. The source download explains pool/context ownership,
routing/cleanup changes and BYTEBEAT DSP error forwarding, and includes both
patch scripts. See [audio recovery](audio-recovery.md).

## Asset review and remaining permissions

[Asset notices](../scripts/licenses/assets.txt) record provenance, pins and
permission status. [Font notices](../scripts/licenses/fonts.txt) preserve the
actual upstream copyright/license texts at a recorded Google Fonts revision:
Syncopate is Apache-2.0; the other loaded font families use SIL OFL 1.1.

The GitHub mark is unmodified Primer Octicons `mark-github-16` v19.15.3 (MIT).
The Strudel logo is copied byte-for-byte from
[upstream revision 0cb6341](https://codeberg.org/uzu/strudel/raw/commit/0cb6341299229f739b5090be93528bb4f170d855/website/public/logo.svg),
in its AGPL repository; no separate logo terms were found. This records file
provenance and license context, not a separate trademark permission grant.

Existing library credits remain visible. The supplied Switch Angel/cosimo trance
transcription has no documented redistribution license. The War Pigs studies
credit Black Sabbath's composition and Jake Brown's transcription; those
underlying works are not claimed MIT or AGPL. Redistribution permissions remain
unverified. These notices do not resolve or certify those rights.

Factory Dirt-Samples and tidal-drum-machines audio loads from pinned external
sources. The inspected pinned root/README material does not establish a blanket
license for every recording. Per-recording permission remains unverified; custom
packs retain their owners' terms. This work records those limits and does not
change, remove or claim to relicense the existing music or samples.

## Verification (13 November 2026)

- `npm run check`: passed, including 2,771 unit tests and 65 guardrail tests,
  formatting, skill integrity, lint, TypeScript and production build.
- `npm run test:browser:report -- tests/browser/about.spec.mjs tests/browser/workspace-chrome.spec.mjs tests/browser/workspace-shell.spec.mjs`:
  `RESULT passed=35 failed=0 exit=0`. This covers About, neighboring header/File
  actions and workspace layout. Screenshots at 1600, 640 and 390 px were inspected:
  matching icon targets, readable dialog, no horizontal overflow and reachable
  Close through the dialog's vertical scroll. Enter, Escape and focus return passed.
- The source archive was checked against the current application/patch files and
  all three pinned upstream archive hashes. A fresh extraction, outside Git,
  completed `npm ci` and `npm run build`, reusing the included upstream archives.
- Engine changes here are modification comments only; executable patch bodies
  and their hash checks are unchanged. Existing pool and BYTEBEAT guardrails passed.
  No physical listening or new playback behavior is claimed.

These checks verify the notice/source mechanism. They do not resolve the music,
sample or trademark permission limits recorded above.
