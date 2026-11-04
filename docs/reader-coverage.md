# Reader coverage corpus (#145)

Run `npm run coverage:reader` after `npm ci` with `.node-version`. It uses the
production `read` function, prints totals and a ranked unmapped-call list, writes
a UTC-dated JSON report in `reports/reader/`, and checks the committed baseline.
`npm run check` includes this command. No browser, audio engine or network is
needed for the committed tier. Imported JavaScript is parsed, never evaluated.

Use `npm run coverage:reader:wild` for the separate public corpus. The
[workflow](../.github/workflows/reader-wild.yml) runs weekly or on manual dispatch,
with read-only credentials and a report artifact. It has no PR/push trigger, is
not a required check and has `continue-on-error: true`. Network failures are
recorded per entry and counted separately; they do not masquerade as parse
failures or zero-CODE patches. Percentages describe only successfully fetched
files. A reader defect still makes the command fail, while the job remains
report-only. Downloaded sources stay in memory; artifacts contain counts,
provenance, errors and SHA-256 hashes, never the downloaded code.

## What the metrics mean

- **Mapped calls / calls:** one occurrence per outer call in a production-reader
  voice chain or projected declaration. A call counts as mapped only when its
  production source bindings belong to non-CODE modules. Multi-call modules
  (ENV, for example) count each call; multiple owners of a CV call count it once.
  Whole-voice CODE still contributes its outer chain calls as unmapped. Calls
  inside callback bodies or arguments are not counted independently: an
  unsupported argument makes its containing call unmapped.
- **Fully readable voices / voices:** `$:` expressions, the reader's final bare
  call expression, and each expanded `stack()` argument. A voice must have no
  CODE ownership or unmapped calls, including through shared declaration roots.
  A root-only opaque voice can be unreadable even when it has zero chain calls.
  Shared declaration calls count once in the call denominator, while their CODE
  affects every dependent voice.
- **Patches without CODE / patches:** successfully parsed patches whose actual
  returned rack has zero CODE modules, including saved disconnected CODE. A
  syntax failure contributes to the patch denominator but never to successes.
- **Parse failures:** JavaScript syntax failures, with a per-file diagnostic.
  Unexpected errors from the reader are command failures, not relabeled syntax
  failures. Failed parses contribute no invented calls or voices.
- **Unmapped ranking:** descending occurrence count with alphabetical ties, using
  original call spellings. A supported call with unsupported arguments can rank
  here; a name in the list does not imply its adapter is entirely absent. Use
  per-patch `unmapped` counts and provenance to inspect the source before making
  an adapter issue. Shared declarations do not multiply occurrence counts.

Tempo, proven generator-owned routing, unused declarations, setup statements and
helper function bodies are outside the call denominator. Only a restored,
validated rack envelope permits excluding generator routing; an imported
`.orbit()` without that provenance stays CODE/unmapped. Saved CODE stays CODE
according to the production reader's preservation rules, even if a new adapter
could read its text. These metrics measure the current rack projection, not all
JavaScript constructs or all executable statements. Files with no recognized
voices have a zero voice denominator; inspect per-file results before drawing
conclusions about unfamiliar voice syntax. Empty denominators print `n/a` and
serialize as `null`; the gate treats empty call/voice shares as 1 and separately
checks parse failures and CODE counts.

Exact ratios, counts, ordering and source hashes are deterministic for identical
reader/corpus bytes. UTC `generatedAt` and the default report filename vary.
`--output path/to/report.json` selects a fixed output path; exclude `generatedAt`
when comparing reports. This measures representation coverage, not timing,
source round-trip correctness, saved layout identity or sound equivalence.
The existing reader tests continue to own those separate claims.

## Add patches and accept intentional changes

The [committed manifest](../corpus/reader/committed.json) references every built-in
`.strudel` file, without copying it. Every entry must have a unique ID, path,
license/permission and provenance. All repository-owned originals are MIT under
[LICENSE](../LICENSE). The existing Switch Angel/cosimo fixture instead records
the owner's explicit request to bundle the exact user-supplied variant in
[#46](https://github.com/FireLakeLabs/monkeyboys-modular-synth/issues/46); this does
not assert an upstream MIT license or a general redistribution grant. Preserve
its existing attribution. Do not treat public availability as permission.

For a new committed original or an externally licensed/author-permitted patch,
add it under `corpus/reader/patches/<name>.strudel` (or the library when it belongs
there), and add a manifest entry with the license and a concrete permission or
license reference. Keep the evidence reviewable. Library/corpus additions without
manifest entries, duplicate paths and missing license/provenance fail the check.

For public material without permission to vendor, add a URL to the
[wild manifest](../corpus/reader/wild.json). Raw GitHub and gist URLs must include
a full 40-character commit/content revision; branches and tags are rejected.
Record attribution and known licensing, or explicitly say no license is
asserted. Do not save downloaded source in the repository. The initial wild
selection includes cosimo's public trance transcription and four brucelane
patches; it is a small convenience sample, not a representative census.

The gate compares both totals and each patch against
[baseline.json](../corpus/reader/baseline.json). Lower mapped-call, readable-voice
or CODE-free-patch shares fail. Higher parse failures, CODE blocks, unmapped
calls or occurrences of any unmapped name also fail. This prevents improvements
in one patch from masking degradation in another. Corpus membership changes
require explicit baseline acceptance; report hashes track source changes but do
not freeze file contents. A lower total call count alone is not a regression.

For an intentional change, run:

```sh
npm run coverage:reader -- --update-baseline
npm run check
```

Review and commit the baseline diff with the reader/corpus change and explain
why reduced coverage is acceptable, if applicable. Do not update merely to clear
a failure. Wild measurements never read or update the committed baseline.

## First baseline and observed proof

Recorded 4 November 2026 UTC (3 November in America/Chicago), Node 24.22.2:
14 committed library patches, 105/120 mapped calls (87.50%), 15/19 fully readable
voices (78.95%), 12/14 patches without CODE (85.71%), zero parse failures and 15
CODE blocks. The leading unmapped calls are `o` (3), then `n`, `rlpf` and
`trancegate` (2 each). `n` here has computed arguments; it is not a missing name.
The trance fixture contributes 14 CODE blocks and the custom-helper exercise 1.

The initial pinned wild run fetched all five sources: 19/69 mapped calls,
0/17 fully readable voices, 0/5 patches without CODE, zero parse/fetch failures
and 46 CODE blocks. This is report-only evidence from a small sample.

Focused tests cover grouped ENV/CV calls, opaque receivers and suffixes, nested
callbacks, shared declarations, stack voices, saved CODE/routing, syntax
failures, empty denominators and baseline comparisons. An isolated command test
runs the real command twice and compares all JSON content except the timestamp;
it then changes a readable fixture to an unmapped call, observes exit 1 with the
baseline-update instruction, explicitly updates the baseline, and observes exit 0. It also rejects unlicensed entries, unrecorded library additions, floating
wild URLs and wild baseline updates. No playback or UI behavior changes here;
no browser/audio proof is claimed.
