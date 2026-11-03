import { generate } from '../codegen/generate'
import { sourceBody } from '../workspace/document'
import type { SourceDocument } from '../reader/types'
import { getModuleSpec } from '../modules/catalog'
import type { Patch } from '../patch/types'
import * as engine from './engine'

export interface PlaybackState {
  status: 'stopped' | 'starting' | 'playing' | 'applying' | 'stopping' | 'error'
  scheduling: 'stopped' | 'scheduled' | 'unknown'
  resources: engine.ResourceStatus
  error: string | null
  /** Diagnostic ownership only; runtime stack locations are not mapped to this source. */
  errorSource: string | null
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
  let state: PlaybackState = {
    status: 'stopped',
    scheduling: 'stopped',
    error: null,
    errorSource: null,
    resources: engine.getResourceStatus(),
  }
  let requested = false
  let revision = 0
  let intent = 0
  let sourceRevision = 0
  let pending = Promise.resolve()
  const listeners = new Set<() => void>()
  let unsubscribeEngine: (() => void) | undefined
  function publish(
    status: PlaybackState['status'],
    error: string | null = null,
    errorSource: string | null = null,
    scheduling: PlaybackState['scheduling'] = status === 'playing'
      ? 'scheduled'
      : status === 'stopped'
        ? 'stopped'
        : 'unknown',
  ) {
    state = { ...state, status, scheduling, error, errorSource }
    listeners.forEach((listener) => listener())
  }
  function enqueue(action: () => Promise<void>) {
    pending = pending.then(action)
    return pending
  }
  function message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
  async function fail(detail: string, source: string | null) {
    accepted = undefined
    intent++
    requested = false
    const recovery = ++revision
    publish('stopping', detail, source)
    try {
      await engine.stop()
      if (recovery === revision)
        publish('error', `Scheduling stopped. ${detail}`, source, 'stopped')
    } catch (stopError) {
      if (recovery === revision)
        publish(
          'error',
          `Audio state unknown — Stop failed. ${detail}; ${message(stopError)}`,
          source,
        )
    }
  }
  function onEngineEvent(event: engine.EngineEvent) {
    if (event.type === 'resources') {
      state = { ...state, resources: event.status }
      listeners.forEach((listener) => listener())
    } else {
      // Upstream late logs carry neither a revision nor a source range.
      fail(`Audio resource/output failure. ${event.message}`, null).catch(() => {})
    }
  }
  function apply() {
    const current = ++revision
    const operationIntent = intent
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
        if (!requested || operationIntent !== intent) return
        accepted = next
        if (requested && current === revision) publish('playing')
      } catch (error) {
        // Stop/replay owns a new intent, even if the abandoned work rejects later.
        if (!requested || operationIntent !== intent) return
        await fail(`Could not start or apply audio. ${message(error)}`, next.code)
      }
    })
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      if (!listeners.size) {
        unsubscribeEngine = engine.subscribe(onEngineEvent)
        state = { ...state, resources: engine.getResourceStatus() }
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          unsubscribeEngine?.()
          unsubscribeEngine = undefined
        }
      }
    },
    update(next: Patch | SourceDocument): Promise<void> {
      patch = prepare(next)
      const sourceCurrent = ++sourceRevision
      if (requested) return apply()
      const volume = patch.volume
      const source = patch.code
      const current = revision
      return enqueue(async () => {
        try {
          await engine.setVolume(volume)
        } catch (error) {
          if (current === revision && sourceCurrent === sourceRevision)
            publish(
              'error',
              `Could not set output volume. ${message(error)}`,
              source,
              state.scheduling,
            )
        }
      })
    },
    play(): Promise<void> {
      intent++
      requested = true
      // A stopped scheduler needs evaluation even if its source is unchanged.
      accepted = undefined
      return apply()
    },
    stop(): Promise<void> {
      intent++
      requested = false
      const current = ++revision
      const { error, errorSource } = state
      publish('stopping', error, errorSource)
      return (async () => {
        try {
          await engine.stop()
          if (current === revision) publish('stopped', error, errorSource)
        } catch (stopError) {
          if (current === revision)
            publish(
              'error',
              `${error ? `${error} ` : ''}Audio state unknown — Stop failed. ${message(stopError)}`,
              errorSource,
            )
        }
      })()
    },
  }
}
