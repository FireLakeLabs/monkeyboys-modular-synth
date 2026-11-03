import { read } from '../reader'
import { activityPlan } from './activity'

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

export type ResourceStatus = 'unknown' | 'loading' | 'registered' | 'failed'
export type EngineEvent =
  | { type: 'resources'; status: ResourceStatus }
  | { type: 'failure'; message: string }
  | { type: 'activity'; modules: string[] }
  | { type: 'activity-clear' }

let resources: ResourceStatus = 'unknown'
const listeners = new Set<(event: EngineEvent) => void>()
export const getResourceStatus = () => resources
export function subscribe(listener: (event: EngineEvent) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function resourceStatus(status: ResourceStatus) {
  resources = status
  listeners.forEach((listener) => listener({ type: 'resources', status }))
}

let ready: Promise<StrudelWeb> | null = null
let initialized: StrudelWeb | null = null
let pending: Promise<void> = Promise.resolve()
let volume = 1
let epoch = 0
let allowed = false
let cancelActive: (() => void) | undefined
let evaluating:
  { epoch: number; activity: (hap: unknown) => string[]; activityRevision: number } | undefined
let observing = false

let activityRevision = 0
const activityTimers = new Set<ReturnType<typeof setTimeout>>()
function clearActivity() {
  activityRevision++
  activityTimers.forEach(clearTimeout)
  activityTimers.clear()
  listeners.forEach((listener) => listener({ type: 'activity-clear' }))
}
function scheduleActivity(
  modules: string[],
  target: number,
  revision: number,
  strudel: StrudelWeb,
) {
  if (!modules.length || !Number.isFinite(target) || revision !== activityRevision || !allowed)
    return
  const deliver = () => {
    if (revision !== activityRevision || !allowed) return
    const remaining = (target - strudel.getAudioContext().currentTime) * 1000
    if (remaining > 5) {
      const timer = setTimeout(() => {
        activityTimers.delete(timer)
        deliver()
      }, remaining)
      activityTimers.add(timer)
    } else {
      listeners.forEach((listener) => {
        try {
          listener({ type: 'activity', modules })
        } catch {
          /* Visual observers cannot break audio. */
        }
      })
    }
  }
  deliver()
}

function cancelled(): Error {
  return new Error('Audio operation cancelled by Stop')
}
function checkEpoch(current: number) {
  if (current !== epoch) throw cancelled()
}

function observeLogs() {
  if (observing || typeof document === 'undefined') return
  observing = true
  // Installed core logger dispatches this event; webaudio forwards superdough logs to it.
  document.addEventListener('strudel.log', (event) => {
    if (!(event instanceof CustomEvent)) return
    const detail: unknown = event.detail
    if (
      !detail ||
      typeof detail !== 'object' ||
      !('message' in detail) ||
      typeof detail.message !== 'string'
    )
      return
    const message = detail.message
    // Evaluation errors belong to the submitted revision and reject play() instead.
    if (message.startsWith('[eval]')) return
    if (('type' in detail && detail.type === 'error') || /^\[[^\]]+\] error:/.test(message)) {
      clearActivity()
      resourceStatus('failed')
      listeners.forEach((listener) => listener({ type: 'failure', message }))
    }
  })
}

function load(): Promise<StrudelWeb> {
  if (!ready) {
    observeLogs()
    resourceStatus('loading')
    ready = import('@strudel/web')
      .then(async (strudel) => {
        await strudel.initStrudel({
          prebake: () =>
            Promise.all(SAMPLE_SOURCES.map(({ map, base }) => strudel.samples(map, base))),
          onEvalError: (error) => {
            throw error
          },
          // The hook runs immediately before scheduler.setPattern in core 1.2.6.
          editPattern: (pattern) => {
            if (!evaluating || evaluating.epoch !== epoch || !allowed) throw cancelled()
            const operation = evaluating
            const current = operation.epoch
            // start() can yield after installing the pattern but before its first tick.
            // Guard queries too: onToggle fires only after that tick.
            const observed = pattern.onTrigger((hap, _now, _cps, target) => {
              scheduleActivity(operation.activity(hap), target, operation.activityRevision, strudel)
            }, false)
            return new strudel.Pattern(
              (state) => (current === epoch && allowed ? observed.query(state) : []),
              pattern._steps,
            )
          },
          // start() awaits before starting its clock. Stop can run in that gap.
          onToggle: (started) => {
            if (started && !allowed) strudel.hush()
          },
        })
        initialized = strudel
        // Lazy import misses initStrudel's first-mousedown listener.
        await strudel.initAudio()
        resourceStatus('registered')
        return strudel
      })
      .catch((error: unknown) => {
        ready = null
        resourceStatus('failed')
        throw error
      })
  }
  return ready
}

function enqueue(action: () => Promise<void>): Promise<void> {
  const result = pending.then(action)
  // A failed edit must not prevent a later edit from running.
  pending = result.catch(() => {})
  return result
}

function applyVolume(strudel: StrudelWeb): void {
  const context = strudel.getAudioContext()
  const gain = strudel.getSuperdoughAudioController().output.destinationGain.gain
  gain.cancelScheduledValues(context.currentTime)
  gain.setTargetAtTime(volume, context.currentTime, 0.01)
}

function validateVolume(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError('Volume must be between 0 and 1')
}

/** Changes the app output, including effect tails, without evaluating code or starting audio. */
export function setVolume(value: number): Promise<void> {
  return enqueue(async () => {
    validateVolume(value)
    volume = value
    if (initialized) applyVolume(initialized)
  })
}

/** Replaces the scheduled pattern. First use must follow a user gesture. */
export function play(
  code: string,
  options: { volume?: number; resetEffects?: boolean } = {},
): Promise<void> {
  const current = epoch
  clearActivity()
  const visualRevision = activityRevision
  let activity = { code, modules: (_hap: unknown): string[] => [] }
  try {
    activity = activityPlan(read(code))
  } catch {
    /* Unreadable code stays playable, without invented attribution. */
  }
  return enqueue(async () => {
    checkEpoch(current)
    if (evaluating)
      throw new Error(
        'A previous evaluation is still pending. Export and reload to recover, or wait for it to settle before Play.',
      )
    let cancel = () => {}
    const cancellation = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(cancelled())
    })
    cancelActive = cancel
    const work = (async () => {
      if (options.volume !== undefined) validateVolume(options.volume)
      const strudel = await load()
      checkEpoch(current)
      await strudel.getAudioContext().resume()
      checkEpoch(current)
      if (options.resetEffects) strudel.resetGlobalEffects()
      if (options.volume !== undefined) volume = options.volume
      applyVolume(strudel)
      allowed = true
      const operation = {
        epoch: current,
        activity: activity.modules,
        activityRevision: visualRevision,
      }
      evaluating = operation
      try {
        await strudel.evaluate(activity.code)
        checkEpoch(current)
      } finally {
        if (evaluating === operation) evaluating = undefined
      }
    })()
    try {
      await Promise.race([work, cancellation])
    } catch (error) {
      if (visualRevision === activityRevision) clearActivity()
      throw error
    } finally {
      if (cancelActive === cancel) cancelActive = undefined
    }
  })
}

/** Invalidates queued work immediately; never waits for arbitrary user evaluation. */
export async function stop(): Promise<void> {
  epoch++
  clearActivity()
  allowed = false
  cancelActive?.()
  initialized?.hush()
}
