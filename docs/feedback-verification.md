# Activity and source feedback (#37)

Verified 2 November 2026 with Node 24.22.2 and Chromium 156 on Linux.
The archived [workspace](design/workspace-v1.png), [Alien](design/looks-alien.png)
and [Cyber](design/looks-cyber.png) boards were available as visual references.

## Contract

The native textarea remains the editor. An inert, hidden-from-assistive-technology
text layer shows the exact draft with category colors, teal Alien glow, dashed
gold Cyber underlines and orange named pattern declarations/references. Current
reader bindings own the treatments; each owned call is highlighted independently.
Nested LFO expressions use modulation color inside the target's call. Selecting
a shared module highlights every current owned span. A disconnected or bypassed
module with no emitted code reports no current sounding range. Editing/invalid
drafts remove treatments and selection highlights until the reader accepts a new
revision; they explicitly report that highlighting is paused. Composition defers
parsing, and native selection direction and both scroll axes survive acceptance.

The decorative Cyber cursor is solid at rest. It blinks on a one-second cycle
only while its source span or local CODE textarea has editing focus. Reduced
motion keeps it solid and suppresses event pulses. The editor's native caret
also requests manual animation under reduced motion. Cables have no animation.

## Engine attribution

All event/source attribution stays behind `src/strudel/engine.ts`. The adapter
reads the submitted source revision, plans context-only decoration on supported
final voice expressions, then evaluates that transient copy. Editor, clipboard,
Export and saved rack metadata retain the original source. Context decoration
changes no musical values, timing, orbit routing or trigger dominance. A final
`pattern.onTrigger(callback, false)` observes the transformed ITER/JUX event
stream while preserving default Web Audio output.

The installed REPL's voice ID is query state, **not a field on final haps**.
Attribution therefore uses numeric keys in event context, mapped to the exact
revision's reader-owned module IDs. Numeric keys cannot be converted into
Strudel mini-notation. Shared declarations, CV and independent `stack()` branches
retain their contributing owners. Receiving mixers/OUT are established by the
validated graph. Bypassed modules with no emitted code receive no activity.
A voice containing opaque CODE, an unresolved dependency or unmapped context is
unattributed. Arbitrary top-level statements/declarations disable attribution
conservatively. They remain executable unchanged.

Visual delivery compares the scheduled target against the live AudioContext
clock, including rechecking after a suspended clock. A new evaluation, Stop or
reported failure invalidates old callbacks and cancels pending timers/active
fades. Instrument lights and Alien overlays fade for 400 ms without changing
panel geometry. Switching looks is still metadata-only; source is not
reevaluated for a look change.

## Reproduce and observed proof

Run `npm ci`, `npm run check`, and `npm run dev`, then:

```sh
node scripts/feedback-check.mjs http://127.0.0.1:5173 /tmp/monkeyboy-feedback
```

The browser check requires installed Playwright Chromium and access to the
pinned sample manifests. It runs separately from the deterministic CI gate,
like the [audio recovery harness](audio-recovery.md). It writes a JSON report.
The browser suite observed:

- Category/family/named-output styles; both selected VCF calls; retained source.
- Matching 12 px editor/ink typography, measured character origins and advance
  widths, horizontal-limit scrolling and backward selection. Real Chromium
  IME composition stayed in the editing phase past the parse debounce, then
  committed Japanese text without losing the source or composition.
- Semicolon-free bare voices following tempo or const declarations played with
  attributable ITER activity and unchanged saved source.
- Cyber blinking only with editing focus; no blinking under reduced motion.
- Real-engine ITER/JUX and Instrument activity with 400 ms fades, no activity on
  the opaque voice, and nonzero PCM output at the engine bus.
- No further activity after Stop; no obsolete Alien feedback after replacement;
  surfaced evaluation errors cleared active fades.
- Reduced motion suppressed decorative activity, including preference changes
  during playback. Module widths and measured cable paths stayed identical.

Focused unit checks cover shared/fan-out ownership, stack branches, opaque and
unmapped events, exact source segments, shared CV selection, target-audio-time
delivery, suspended-clock delay, cancellation and semicolon-free statement
boundaries. The statement regressions first failed when context decoration merged
two statements into one; appending context as a chain call preserves both. The numeric-context guard was
observed failing with a quoted key (empty module attribution), then passing with
the numeric key restored. A real-browser check also caught the original attempt
to map absent hap voice IDs; final tests require actual Alien/Instrument pulses.

PCM evidence establishes that the observer leaves output enabled for the tested
patch. Physical speakers were **not heard**; subjective clicks, other browsers,
very large programs and arbitrary user-code side effects remain unverified.
