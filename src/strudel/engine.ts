/** Browser audio and Strudel evaluation stay behind this adapter. */
type StrudelWeb = typeof import('@strudel/web')

// Pin manifests and audio bases separately: upstream manifests can contain moving _base URLs.
const SAMPLE_SOURCES = [
  {
    map: 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/strudel.json',
    base: 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/',
  },
  {
    map: 'https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/tidal-drum-machines.json',
    base: 'https://raw.githubusercontent.com/ritchse/tidal-drum-machines/6577395a4d05031728ced2ec3e5637fa89d8be48/machines/',
  },
] as const

let ready: Promise<StrudelWeb> | null = null
let pending: Promise<void> = Promise.resolve()

function load(): Promise<StrudelWeb> {
  if (!ready) {
    ready = import('@strudel/web')
      .then(async (strudel) => {
        await strudel.initStrudel({
          prebake: () =>
            Promise.all(SAMPLE_SOURCES.map(({ map, base }) => strudel.samples(map, base))),
          // @strudel/web 1.3.0 otherwise catches evaluation errors and resolves undefined.
          onEvalError: (error) => {
            throw error
          },
        })
        // Lazy import misses initStrudel's first-mousedown listener.
        await strudel.initAudio()
        return strudel
      })
      .catch((error: unknown) => {
        ready = null
        throw error
      })
  }
  return ready
}

function enqueue(action: () => Promise<void>): Promise<void> {
  const result = pending.then(action)
  // A failed edit must not prevent a later edit or Stop from running.
  pending = result.catch(() => {})
  return result
}

/** Replaces the scheduled pattern. First use must follow a user gesture. */
export function play(code: string): Promise<void> {
  return enqueue(async () => {
    const strudel = await load()
    await strudel.getAudioContext().resume()
    await strudel.evaluate(code)
  })
}

/** Stops scheduling after earlier edits finish; already sounding notes/tails may ring out. */
export function stop(): Promise<void> {
  return enqueue(async () => {
    if (!ready) return
    const strudel = await ready
    strudel.hush()
  })
}
