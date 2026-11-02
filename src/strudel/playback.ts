import { generate } from '../codegen/generate'
import { sourceBody } from '../workspace/document'
import type { SourceDocument } from '../reader/types'
import { getModuleSpec } from '../modules/catalog'
import type { Patch } from '../patch/types'
import * as engine from './engine'

export interface PlaybackState {
  status: 'stopped' | 'starting' | 'playing' | 'applying' | 'stopping' | 'error'
  error: string | null
}

function prepare(input: Patch | SourceDocument) {
  const patch = 'kind' in input ? input.patch : input
  const code = generate(input) // Validate before accepting a patch or touching audio.
  const out = patch.modules.find((module) => module.type === 'out')
  const volume =
    out?.values.vol ??
    getModuleSpec('out').controls.find((control) => control.id === 'vol')?.default
  if (typeof volume !== 'number') throw new Error('Missing output volume')
  return {
    code,
    // Only the generator's trailing block is removed; CODE may contain marker text.
    source: sourceBody(code),
    volume,
    topology: JSON.stringify({
      modules: patch.modules.map((module) => [
        module.id,
        module.type,
        module.type === 'code' ? module.values : undefined,
      ]),
      cables: patch.cables.map(({ from, to }) => ({ from, to })),
    }),
  }
}

/** Framework-independent transport. Stopped edits never start audio. */
export function createPlayback(initial: Patch | SourceDocument) {
  let patch = prepare(initial)
  let accepted: ReturnType<typeof prepare> | undefined
  let state: PlaybackState = { status: 'stopped', error: null }
  let requested = false
  let revision = 0
  let pending = Promise.resolve()
  const listeners = new Set<() => void>()
  function publish(status: PlaybackState['status'], error: string | null = null) {
    state = { status, error }
    listeners.forEach((listener) => listener())
  }
  function enqueue(action: () => Promise<void>) {
    pending = pending.then(action)
    return pending
  }
  function message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
  function apply() {
    const current = ++revision
    const next = patch
    publish(accepted && requested ? 'applying' : 'starting')
    return enqueue(async () => {
      if (!requested || current !== revision) return
      try {
        if (accepted?.source === next.source && accepted.topology === next.topology) {
          await engine.setVolume(next.volume)
        } else {
          await engine.play(next.code, {
            volume: next.volume,
            resetEffects: accepted?.topology !== next.topology,
          })
        }
        accepted = next
        if (requested && current === revision) publish('playing')
      } catch (error) {
        // A surfaced failure can leave the old pattern running or partially change tempo.
        requested = false
        revision++
        try {
          await engine.stop()
          publish('error', `Could not apply patch. Scheduling stopped. ${message(error)}`)
        } catch (stopError) {
          publish(
            'error',
            `Audio state unknown — Stop failed. ${message(error)}; ${message(stopError)}`,
          )
        }
        accepted = undefined
      }
    })
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update(next: Patch | SourceDocument): Promise<void> {
      patch = prepare(next)
      if (requested) return apply()
      const volume = patch.volume
      return enqueue(async () => {
        try {
          await engine.setVolume(volume)
        } catch (error) {
          publish('error', `Could not set output volume. ${message(error)}`)
        }
      })
    },
    play(): Promise<void> {
      requested = true
      // A stopped scheduler needs evaluation even if its source is unchanged.
      accepted = undefined
      return apply()
    },
    stop(): Promise<void> {
      requested = false
      const current = ++revision
      publish('stopping')
      return enqueue(async () => {
        try {
          await engine.stop()
          if (current === revision) publish('stopped')
        } catch (error) {
          if (current === revision)
            publish('error', `Audio state unknown — Stop failed. ${message(error)}`)
        }
      })
    },
  }
}
