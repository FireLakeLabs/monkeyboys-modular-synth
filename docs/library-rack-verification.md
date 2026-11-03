# Library rack editing acceptance (#75)

Observed 3 November 2026 using Node 24.22.2, the pinned npm lockfile and the
T3 Code Chromium preview against local Vite. The private design canvas was not
available; checked-in design exports remain the visual reference.

## Deterministic proof

The new exercise regression failed on all nine original hand-formatted sources
before authoring generator-style fixtures. Restoring the original Enveloped synth
source reproduced the exact refusal, “CV routing needs a code edit”; restoring
the authored file passed the same test. The exercise suite then passed for every exercise:
VCF/VCA CV where present, effect insertion, mixer levels and an extra mixer input.
Each mutation was independently reopened and compared against the complete rack.
Exact stored source on library load and unchanged showcase SHA-256 remain separate
assertions. Conversion checks retain helpers, four showcase registrations and CODE;
they also reject malformed, voice-containing and non-string saved preludes.

The workspace test queries the installed Strudel core for event values and times
before/after conversion and after the intended CV edit. The fixture explicitly
states its filter settings. It excludes the deliberately assigned orbit field;
this does not claim universal equivalence for arbitrary imported setup/routing.

`npm run check` passed: runtime, formatting, skill integrity, lint, 245 unit tests,
40 guardrail checks, TypeScript and production build. Browser checks remain outside
the shared CI gate because they require Chromium, WebAudio and sample resources.

## Observed browser behavior

`verifyLibraryUI()` passed exact loading without autoplay, attribution, collection
browsing, malformed source retention, replacement Cancel/Export, helper edits and
export/reopen. `verifyLibraryRackEditing()` drove all nine exercise racks through
actual UI controls: VCF/VCA CV where present, effect insertion and another mixer
channel, followed by export/reopen identity checks. No conversion step was needed.

The supplied Switch Angel showcase loaded byte-for-byte. Its refused edit opened
Make rack-editable beside the target jack, with a code-rewrite disclosure. The [refusal screenshot](evidence/library-rack-refusal.png)
was visually inspected: the prompt sits beside the jack and stays in the viewport.
Refusal and Cancel preserved the accepted rack/source. Starting a newer source
draft cancelled the pending conversion; no stale cable was committed. Retrying
and consenting retained all four registrations and CODE, completed the attempted
cable, then accepted a filter insertion and LFO-to-VCF CV. The converted rack
reopened with its state intact and stopped audio remained stopped.

The real-engine signal group queries Strudel onset events and WebAudio PCM
separately from source and saved-state checks. Measured results are recorded in
[library rack results](library-rack-results.json). Physical speakers/headphones
were not heard. PCM and event checks establish output and pattern construction;
they do not establish subjective continuity, arbitrary-code safety, every browser,
or universal audible equivalence. Global conversion undo remains owned by #63.

## Sol review

One round with GPT-6.1 Sol on high effort returned APPROVE, with no blocker or
should findings. S1 (nit) identified a setup-name collision: a generated output
named `register` could shadow the retained showcase registration function. The
focused regression failed before moving setup-name reservation ahead of output
name validation and passed afterward; an ordinary `kick` name remains valid.
No findings were declined. Review usage was not exposed. The behavior fix was
made locally without a second reviewer, following the T3 small-finding rule.
The diff changed from 3,651 insertions / 79 deletions to the final recorded PR diff;
most lines are authored rack metadata for the nine exercise files.
