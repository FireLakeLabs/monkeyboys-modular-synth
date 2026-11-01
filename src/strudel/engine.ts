/**
 * Thin wrapper around Strudel's engine.
 *
 * `@strudel/web` is loaded on first use, from a user gesture, because browsers only allow
 * audio to start after a click. Sample loading and per-module activity hooks are still to do
 * (see docs/build-plan.md, step 3).
 */

type StrudelWeb = typeof import('@strudel/web')

let ready: Promise<StrudelWeb> | null = null

function load(): Promise<StrudelWeb> {
  if (!ready) {
    ready = import('@strudel/web').then(async (strudel) => {
      await strudel.initStrudel()
      return strudel
    })
  }
  return ready
}

/** Plays (or replaces what is playing with) the given Strudel code. Call from a click handler. */
export async function play(code: string): Promise<void> {
  const strudel = await load()
  await strudel.evaluate(code)
}

/** Stops all sound. Safe to call before anything has played. */
export async function stop(): Promise<void> {
  if (!ready) return
  const strudel = await ready
  strudel.hush()
}
