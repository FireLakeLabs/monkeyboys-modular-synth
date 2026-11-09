import type { SoundChoice } from './crate'

/**
 * Auditions queue in the engine, so flipping through variants would otherwise play a backlog.
 * Requests that arrive while one plays, or within `settle` ms of each other, collapse to the
 * newest; `now` skips the wait for an explicit play.
 */
export function latestAudition(
  play: (choice: SoundChoice) => Promise<void>,
  report: (error: unknown) => void,
  settle = 150,
) {
  let wanted: SoundChoice | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let playing = false
  async function drain() {
    playing = true
    try {
      while (wanted) {
        const next = wanted
        wanted = null
        try {
          await play(next)
        } catch (error) {
          report(error)
        }
      }
    } finally {
      playing = false
    }
  }
  return {
    request(choice: SoundChoice, now = false) {
      wanted = choice
      clearTimeout(timer)
      if (playing) return
      timer = setTimeout(() => drain().catch(report), now ? 0 : settle)
    },
    cancel() {
      wanted = null
      clearTimeout(timer)
    },
  }
}
