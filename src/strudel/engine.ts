import { FACTORY_PACKS, manifestUrl, packKey, type SamplePack } from '../samples/packs'
import { sampleInventory, type SampleSound } from '../samples/manifest'
import { read } from '../reader'
import { activityPlan, type GridStep } from './activity'
import { sourceLocations } from './sourceLocations'
import type { Span } from '../reader/types'

/** Opt-in source-location feedback, bound to the exact submitted source revision. */
export interface SourceFeedback {
  source: string
  spans: Span[]
}

/** Browser audio and Strudel evaluation stay behind this adapter. */
type StrudelWeb = typeof import('@strudel/web')

export type ResourceStatus = 'unknown' | 'loading' | 'registered' | 'failed'
export type EngineEvent =
  | { type: 'resources'; status: ResourceStatus }
  | { type: 'failure'; message: string }
  | { type: 'sample-packs' }
  | { type: 'activity'; modules: string[]; steps: GridStep[] }
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

/** Registered means manifest registration, never decoded/audio readiness. */
export interface SamplePackResource {
  key: string
  pack: SamplePack
  status: ResourceStatus
  sounds: readonly SampleSound[]
  base: string | null
  names: readonly string[]
  sampleCount: number | null
  error: string | null
}
let samplePacks: readonly SamplePackResource[] = []
let sampleWarnings: readonly string[] = []
let failedManifest = false
export const getSampleWarnings = () => sampleWarnings
export const getSamplePacks = () => samplePacks
export function subscribeSamplePacks(listener: () => void): () => void {
  return subscribe((event) => {
    if (event.type === 'sample-packs') listener()
  })
}
function publishPack(resource: SamplePackResource) {
  samplePacks = [...samplePacks.filter((pack) => pack.key !== resource.key), resource]
  listeners.forEach((listener) => listener({ type: 'sample-packs' }))
}

/** Recover a single manifest failure without rejecting the whole pattern evaluation. */
async function registerPack(
  strudel: StrudelWeb,
  source: string | Record<string, unknown>,
  base?: string,
) {
  const operation = evaluating
  const pack: SamplePack = {
    source: typeof source === 'string' ? source : `inline:${JSON.stringify(source)}`,
    ...(base === undefined ? {} : { base }),
  }
  const key = packKey(pack)
  const resource = { key, pack, names: [], sounds: [], base: null, sampleCount: null, error: null }
  publishPack({ ...resource, status: 'loading' })
  try {
    const url = typeof source === 'string' ? manifestUrl(source) : undefined
    if (typeof source === 'string' && !url) {
      // Other installed sampler prefixes stay executable and source-owned; inventory is unknown.
      await strudel.samples(source, base)
      publishPack({ ...resource, status: 'registered' })
      return
    }
    let map: unknown = source
    if (url) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`)
      map = await response.json()
    }
    const inventory = sampleInventory(map)
    // Inventory validation establishes an object, but leaves sampler-owned bank semantics intact.
    if (!map || typeof map !== 'object' || Array.isArray(map))
      throw new Error('Invalid sample manifest')
    const manifest = Object.fromEntries(Object.entries(map))
    const resolvedBase =
      typeof manifest._base === 'string' ? manifest._base : url ? new URL('.', url).href : undefined
    await strudel.samples(manifest, base || resolvedBase)
    publishPack({
      ...resource,
      ...inventory,
      base: base || resolvedBase || null,
      status: 'registered',
    })
  } catch (failure) {
    const error = failure instanceof Error ? failure.message : String(failure)
    if (operation) operation.failedManifest = true
    publishPack({ ...resource, status: 'failed', error })
    resourceStatus('failed')
  }
}

function failedFactoryManifest(): boolean {
  return samplePacks.some(
    (resource) =>
      resource.status === 'failed' && FACTORY_PACKS.some((pack) => packKey(pack) === resource.key),
  )
}

let ready: Promise<StrudelWeb> | null = null
let initialized: StrudelWeb | null = null
let pending: Promise<void> = Promise.resolve()
let volume = 1
let epoch = 0
let allowed = false
let bouncing = false
let bounceFailure: string | undefined
let cancelActive: (() => void) | undefined
let evaluating:
  | {
      epoch: number
      failedManifest: boolean
      offline?: boolean
      activity: (hap: unknown) => string[]
      steps: (hap: unknown) => GridStep[]
      activityRevision: number
      feedback: ((hap: unknown) => () => void) | undefined
    }
  | undefined
let observing = false
const outputWork = new Set<Promise<void>>()

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
  steps: GridStep[],
  target: number,
  revision: number,
  strudel: StrudelWeb,
  feedback?: () => void,
) {
  if (
    (!modules.length && !feedback) ||
    !Number.isFinite(target) ||
    revision !== activityRevision ||
    !allowed
  )
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
      try {
        feedback?.()
      } catch {
        /* Editor feedback cannot break audio. */
      }
      if (modules.length)
        listeners.forEach((listener) => {
          try {
            listener({ type: 'activity', modules, steps })
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
      if (failedManifest && /sound .+ not found! Is it loaded\?/.test(message)) {
        // A failed manifest cannot name its unavailable sounds. Report the missing voice
        // without inventing pack attribution or stopping voices whose resources did load.
        if (!sampleWarnings.includes(message)) {
          sampleWarnings = [...sampleWarnings, message]
          listeners.forEach((listener) => listener({ type: 'sample-packs' }))
        }
        resourceStatus('failed')
        return
      }
      clearActivity()
      resourceStatus('failed')
      if (bouncing) {
        bounceFailure = message
        return
      }
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
          defaultOutput: async (...args) => {
            const work = strudel.webaudioOutput(...args)
            outputWork.add(work)
            try {
              await work
            } finally {
              outputWork.delete(work)
            }
          },
          prebake: () =>
            Promise.all(
              FACTORY_PACKS.map(({ source, base }) => registerPack(strudel, source, base)),
            ),
          onEvalError: (error) => {
            throw error
          },
          // The hook runs immediately before scheduler.setPattern in core 1.2.6.
          editPattern: (pattern) => {
            if (!evaluating || evaluating.epoch !== epoch) throw cancelled()
            if (!evaluating.offline && !allowed) throw cancelled()
            // The previous pattern keeps scheduling while setup awaits a manifest.
            // Adopt its replacement's resource policy only at scheduler installation.
            failedManifest = evaluating.failedManifest
            if (evaluating.offline) return pattern
            const operation = evaluating
            const current = operation.epoch
            // start() can yield after installing the pattern but before its first tick.
            // Guard queries too: onToggle fires only after that tick.
            const observed = pattern.onTrigger((hap, _now, _cps, target) => {
              scheduleActivity(
                operation.activity(hap),
                operation.steps(hap),
                target,
                operation.activityRevision,
                strudel,
                operation.feedback?.(hap),
              )
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
        await strudel.evalScope({ samples: (source, base) => registerPack(strudel, source, base) })
        initialized = strudel
        // Lazy import misses initStrudel's first-mousedown listener.
        await strudel.initAudio()
        resourceStatus(
          samplePacks.some((pack) => pack.status === 'failed') ? 'failed' : 'registered',
        )
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
  options: {
    volume?: number
    resetEffects?: boolean
    sourceFeedback?: (event: SourceFeedback) => void
  } = {},
): Promise<void> {
  if (bouncing) return Promise.reject(new Error('Wait for Bounce to finish before Play.'))
  const current = epoch
  clearActivity()
  const visualRevision = activityRevision
  let activity = {
    code,
    modules: (_hap: unknown): string[] => [],
    steps: (_hap: unknown): GridStep[] => [],
    sourceOffset: (offset: number): number | null => offset,
  }
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
        failedManifest: failedFactoryManifest(),
        activity: activity.modules,
        steps: activity.steps,
        activityRevision: visualRevision,
        feedback: options.sourceFeedback
          ? (hap: unknown) => {
              const event = {
                source: code,
                spans: sourceLocations(hap, code.length, activity.sourceOffset),
              }
              return () => options.sourceFeedback?.(event)
            }
          : undefined,
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

/** Render accepted source, never its activity-decorated variant. Leaves live scheduling stopped. */
export async function bounce(
  code: string,
  options: { cycles: number; name: string; volume: number },
): Promise<void> {
  if (!Number.isInteger(options.cycles) || options.cycles < 1 || options.cycles > 128)
    throw new RangeError('Bounce needs a whole cycle count from 1 to 128.')
  validateVolume(options.volume)
  if (bouncing) throw new Error('A Bounce is already in progress.')
  bouncing = true
  bounceFailure = undefined
  try {
    await stop()
    const current = epoch
    await enqueue(async () => {
      checkEpoch(current)
      if (evaluating)
        throw new Error(
          'A previous evaluation is still pending. Export and reload to recover, or wait for it to settle before Bounce.',
        )
      const strudel = await load()
      checkEpoch(current)
      const operation = {
        epoch: current,
        failedManifest: failedFactoryManifest(),
        offline: true,
        activity: () => [],
        steps: () => [],
        activityRevision,
        feedback: undefined,
      }
      evaluating = operation
      let pattern: import('@strudel/web').Pattern
      let cancel = () => {}
      const cancellation = new Promise<never>((_resolve, reject) => {
        cancel = () => reject(cancelled())
      })
      cancelActive = cancel
      // A pending arbitrary evaluation retains the same recovery boundary as Play.
      const evaluation = strudel.evaluate(code, false).finally(() => {
        if (evaluating === operation) evaluating = undefined
      })
      try {
        pattern = await Promise.race([evaluation, cancellation])
        checkEpoch(current)
      } finally {
        if (cancelActive === cancel) cancelActive = undefined
      }
      const cps = strudel.getCps()
      if (!Number.isFinite(cps) || cps <= 0 || options.cycles / cps > 600)
        throw new RangeError('Bounce needs a positive tempo and a duration of at most 10 minutes.')
      // Stop ends scheduling, but a dispatched sample trigger can still be decoding.
      // Let it finish against the live graph before superdough's global context changes.
      await Promise.allSettled(outputWork)
      checkEpoch(current)
      const liveContext = strudel.getAudioContext()
      const liveController = strudel.getSuperdoughAudioController()
      // webaudio 1.3.0 closes its current context; the REPL still owns this live clock.
      const disposable = new AudioContext()
      try {
        strudel.resetGlobalEffects()
        await liveContext.suspend()
        checkEpoch(current)
        strudel.setAudioContext(disposable)
        await strudel.renderPatternAudio(
          {
            queryArc: (begin, end, controls) => {
              // Called after the renderer installs its offline context/controller.
              strudel
                .getSuperdoughAudioController()
                .output.destinationGain.gain.setValueAtTime(options.volume, 0)
              return pattern.queryArc(begin, end, controls)
            },
          },
          cps,
          0,
          options.cycles,
          44100,
          128,
          false,
          options.name,
        )
        // The pinned renderer catches per-hap failures and may still download a partial WAV.
        if (bounceFailure) throw new Error(`Downloaded WAV may be incomplete. ${bounceFailure}`)
      } finally {
        strudel.setAudioContext(liveContext)
        strudel.setSuperdoughAudioController(liveController)
        if (disposable.state !== 'closed') await disposable.close()
        await liveContext.resume()
        applyVolume(strudel)
      }
    })
  } finally {
    bouncing = false
    bounceFailure = undefined
  }
}
