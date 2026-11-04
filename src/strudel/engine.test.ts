import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitStrudelOptions } from '@strudel/web'

const web = vi.hoisted(() => ({
  observe:
    vi.fn<
      (
        callback: (hap: unknown, now: number, cps: number, target: number) => void,
        dominant: false,
      ) => void
    >(),
  time: 10,
  initStrudel: vi.fn<(options?: InitStrudelOptions) => Promise<unknown>>(),
  evaluate: vi.fn<(code: string) => Promise<unknown>>(),
  hush: vi.fn(),
  resetGlobalEffects: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
  samples: vi.fn<() => Promise<unknown>>(),
  initAudio: vi.fn<() => Promise<void>>(),
  resume: vi.fn<() => Promise<void>>(),
}))
vi.mock('@strudel/web', () => ({
  ...web,
  Pattern: class {
    onTrigger(
      callback: (hap: unknown, now: number, cps: number, target: number) => void,
      dominant: false,
    ) {
      web.observe(callback, dominant)
      return this
    }
    query: (state: unknown) => unknown[]
    _steps: unknown
    constructor(query: (state: unknown) => unknown[], steps?: unknown) {
      this.query = query
      this._steps = steps
    }
  },
  getAudioContext: () => ({ resume: web.resume, currentTime: web.time }),
  getSuperdoughAudioController: () => ({
    output: {
      destinationGain: {
        gain: {
          cancelScheduledValues: web.cancelScheduledValues,
          setTargetAtTime: web.setTargetAtTime,
        },
      },
    },
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  web.time = 10
  vi.resetModules()
  vi.resetAllMocks()
  web.initStrudel.mockResolvedValue(undefined)
  web.evaluate.mockResolvedValue({})
  web.samples.mockResolvedValue(undefined)
  web.initAudio.mockResolvedValue(undefined)
  web.resume.mockResolvedValue(undefined)
})

describe('engine boundary', () => {
  it('rejects evaluation errors that Strudel reports through its callback', async () => {
    let reportError: ((error: unknown) => void) | undefined
    web.initStrudel.mockImplementation(async (options) => {
      reportError = options?.onEvalError
    })
    const failure = new TypeError('invalid pattern method')
    web.evaluate.mockImplementation(async () => reportError?.(failure))
    const { play } = await import('./engine')
    await expect(play('note("c3").missingMethod()')).rejects.toBe(failure)
    web.evaluate.mockResolvedValue({})
    await expect(play('note("c3").s("sine")')).resolves.toBeUndefined()
  })

  it('loads samples before evaluation and initializes audio on the first play', async () => {
    web.initStrudel.mockImplementation(async (options) => {
      await options?.prebake?.()
    })
    web.evaluate.mockImplementation(async () => {
      expect(web.samples).toHaveBeenCalled()
      expect(web.initAudio).toHaveBeenCalled()
      expect(web.resume).toHaveBeenCalled()
    })
    const { play } = await import('./engine')
    await play('s("bd").bank("RolandTR909")')
  })

  it('allows another initialization attempt after a sample manifest fails', async () => {
    const failure = new Error('manifest unavailable')
    web.initStrudel.mockImplementation(async (options) => {
      await options?.prebake?.()
    })
    web.samples.mockRejectedValueOnce(failure)
    const { play } = await import('./engine')
    await expect(play('s("bd")')).rejects.toBe(failure)
    expect(web.evaluate).not.toHaveBeenCalled()
    await expect(play('s("bd")')).resolves.toBeUndefined()
  })

  it('does not evaluate when audio resume rejects and permits explicit retry', async () => {
    web.resume.mockRejectedValueOnce(new Error('audio activation blocked'))
    const { play } = await import('./engine')
    await expect(play('s("bd")')).rejects.toThrow(/activation blocked/)
    expect(web.evaluate).not.toHaveBeenCalled()
    await expect(play('s("bd")')).resolves.toBeUndefined()
    expect(web.evaluate).toHaveBeenCalledTimes(1)
  })

  it('confirms Stop without waiting for evaluation and rejects its later pattern install', async () => {
    let options: InitStrudelOptions | undefined
    web.initStrudel.mockImplementation(async (next) => {
      options = next
    })
    let finish = () => {}
    const held = new Promise<void>((resolve) => {
      finish = resolve
    })
    let scheduled = false
    web.evaluate.mockImplementation(async () => {
      await held
      options?.editPattern?.(new (await import('@strudel/web')).Pattern(() => []))
      scheduled = true
    })
    web.hush.mockImplementation(() => {
      scheduled = false
    })
    const { play, stop } = await import('./engine')
    const starting = play('pending code')
    const cancelled = expect(starting).rejects.toThrow(/cancelled/i)
    await vi.waitFor(() => expect(web.evaluate).toHaveBeenCalled())
    await stop()
    await cancelled
    expect(scheduled).toBe(false)
    await expect(play('new code')).rejects.toThrow(/previous evaluation/i)
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scheduled).toBe(false)
    web.evaluate.mockResolvedValue({})
    await expect(play('new code')).resolves.toBeUndefined()
  })

  it('invalidates queued plays as soon as Stop is requested', async () => {
    const { play, stop } = await import('./engine')
    const first = play('first')
    const second = play('second')
    const rejected = Promise.all([
      expect(first).rejects.toThrow(/cancelled/i),
      expect(second).rejects.toThrow(/cancelled/i),
    ])
    await stop()
    await rejected
    expect(web.evaluate).not.toHaveBeenCalled()
  })

  it('prevents a cancelled pattern from producing events even in the scheduler start gap', async () => {
    let options: InitStrudelOptions | undefined
    let query: ((state: unknown) => unknown[]) | undefined
    web.initStrudel.mockImplementation(async (next) => {
      options = next
    })
    web.evaluate.mockImplementation(async () => {
      const pattern = options?.editPattern?.(
        new (await import('@strudel/web')).Pattern(() => ['event']),
      )
      query = pattern ? (state) => pattern.query(state) : undefined
    })
    const { play, stop } = await import('./engine')
    await play('sine')
    expect(query?.({})).toEqual(['event'])
    await stop()
    expect(query?.({})).toEqual([])
  })

  it('reports observable resource/output logs without treating fetched bytes as decoded readiness', async () => {
    const target = new EventTarget()
    vi.stubGlobal('document', target)
    const { play, subscribe, getResourceStatus } = await import('./engine')
    const events: unknown[] = []
    const unsubscribe = subscribe((event) => events.push(event))
    expect(getResourceStatus()).toBe('unknown')
    await play('sine')
    expect(getResourceStatus()).toBe('registered')
    for (const detail of [
      null,
      { message: 42 },
      { message: '[eval] error: bad', type: 'error' },
      { message: '[sampler] loaded', type: 'loaded-sample' },
    ]) {
      target.dispatchEvent(new CustomEvent('strudel.log', { detail }))
    }
    expect(
      events.filter(
        (event) =>
          typeof event === 'object' && event && 'type' in event && event.type === 'failure',
      ),
    ).toEqual([])
    target.dispatchEvent(
      new CustomEvent('strudel.log', { detail: { message: '[getTrigger] error: decode failed' } }),
    )
    expect(events).toContainEqual({ type: 'failure', message: '[getTrigger] error: decode failed' })
    expect(getResourceStatus()).toBe('failed')
    unsubscribe()
  })

  it('allows Stop during initialization without later evaluating cancelled code', async () => {
    let finish = () => {}
    web.initStrudel.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const { play, stop } = await import('./engine')
    const starting = play('old code')
    const rejected = expect(starting).rejects.toThrow(/cancelled/i)
    await vi.waitFor(() => expect(web.initStrudel).toHaveBeenCalled())
    await stop()
    await rejected
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(web.evaluate).not.toHaveBeenCalled()
    await play('new code')
    expect(web.evaluate).toHaveBeenCalledExactlyOnceWith('new code')
  })

  it('reports hush failures and permits another Stop attempt', async () => {
    const { play, stop } = await import('./engine')
    await play('sine')
    web.hush.mockImplementationOnce(() => {
      throw new Error('hush failed')
    })
    await expect(stop()).rejects.toThrow(/hush failed/)
    await expect(stop()).resolves.toBeUndefined()
  })

  it('sets master volume on the output bus without evaluating or initializing while stopped', async () => {
    const { play, setVolume } = await import('./engine')
    await setVolume(0.25)
    expect(web.initStrudel).not.toHaveBeenCalled()
    await play('s("sine")')
    expect(web.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 10, 0.01)
    await setVolume(0)
    expect(web.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.01)
    expect(web.evaluate).toHaveBeenCalledTimes(1)
  })

  it('restores master gain on the new output after a structural reset', async () => {
    web.resetGlobalEffects.mockImplementation(() => web.setTargetAtTime.mockClear())
    const { play } = await import('./engine')
    await play('s("sine").orbit(1)', { volume: 0.4, resetEffects: true })
    expect(web.resetGlobalEffects).toHaveBeenCalledTimes(1)
    expect(web.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 10, 0.01)
    await play('s("sine").lpf(2000).orbit(1)')
    expect(web.resetGlobalEffects).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid master levels without touching audio and still accepts a valid level', async () => {
    const { play, setVolume } = await import('./engine')
    await expect(play('s("sine")', { volume: 2 })).rejects.toBeInstanceOf(RangeError)
    await expect(setVolume(NaN)).rejects.toBeInstanceOf(RangeError)
    expect(web.initStrudel).not.toHaveBeenCalled()
    await expect(setVolume(0.5)).resolves.toBeUndefined()
  })
})

it('delivers attributable visuals at audio time, retains default output, and clears obsolete work', async () => {
  vi.useFakeTimers()
  let options: InitStrudelOptions | undefined
  web.initStrudel.mockImplementation(async (next) => {
    options = next
  })
  web.evaluate.mockImplementation(async () => {
    options?.editPattern?.(new (await import('@strudel/web')).Pattern(() => []))
  })
  const { play, stop, subscribe } = await import('./engine')
  const events: import('./engine').EngineEvent[] = []
  subscribe((event) => events.push(event))
  await play(`$: note('c3').s('sine').iter(4)`)
  const callback = web.observe.mock.calls.at(-1)?.[0]
  expect(web.observe.mock.calls.at(-1)?.[1]).toBe(false)
  callback?.({ context: { __monkeyboyActivity: 1, __monkeyboyStep: [0, 0] } }, 10, 0.5, 10.2)
  expect(events.filter((event) => event.type === 'activity')).toEqual([])
  // Wall time alone must not fire a visual while the audio clock is suspended.
  await vi.advanceTimersByTimeAsync(200)
  expect(events.filter((event) => event.type === 'activity')).toEqual([])
  web.time = 10.2
  await vi.advanceTimersByTimeAsync(200)
  expect(events).toContainEqual({
    type: 'activity',
    modules: expect.arrayContaining(['seq1', 'osc1', 'iter1']),
    steps: [{ module: 'seq1', index: 0 }],
  })
  callback?.({ context: { __monkeyboyActivity: 1 } }, 10.2, 0.5, 11)
  events.length = 0
  await play(`$: note('e3').s('sine')`)
  callback?.({ context: { __monkeyboyActivity: 1 } }, 10.2, 0.5, 10.2)
  web.time = 11
  await vi.advanceTimersByTimeAsync(1000)
  expect(events.filter((event) => event.type === 'activity')).toEqual([])
  const replacement = web.observe.mock.calls.at(-1)?.[0]
  replacement?.({ context: { __monkeyboyActivity: 1 } }, 11, 0.5, 12)
  await stop()
  web.time = 12
  await vi.advanceTimersByTimeAsync(1000)
  expect(events.filter((event) => event.type === 'activity')).toEqual([])
  expect(events).toContainEqual({ type: 'activity-clear' })
})

it('clears pending visuals after an evaluation failure and leaves opaque code unattributed', async () => {
  vi.useFakeTimers()
  let options: InitStrudelOptions | undefined
  web.initStrudel.mockImplementation(async (next) => {
    options = next
  })
  web.evaluate.mockImplementation(async () => {
    options?.editPattern?.(new (await import('@strudel/web')).Pattern(() => []))
  })
  const { play, subscribe } = await import('./engine')
  const events: import('./engine').EngineEvent[] = []
  subscribe((event) => events.push(event))
  await play(`$: note('c3').s('sine').chunk(4, x => x.rev())`)
  web.observe.mock.calls.at(-1)?.[0]({ context: { __monkeyboyActivity: 1 } }, 10, 0.5, 10)
  expect(events.filter((event) => event.type === 'activity')).toEqual([])
  await play(`$: note('c3').s('sine')`)
  web.observe.mock.calls.at(-1)?.[0]({ context: { __monkeyboyActivity: 1 } }, 10, 0.5, 11)
  web.evaluate.mockRejectedValueOnce(new Error('construction fixture'))
  await expect(play(`$: note('c3').missing()`)).rejects.toThrow('construction fixture')
  events.length = 0
  web.time = 11
  await vi.advanceTimersByTimeAsync(1000)
  expect(events).toEqual([])
})

it('delivers revision-bound source spans at audio time and cancels them on Stop', async () => {
  vi.useFakeTimers()
  let options: InitStrudelOptions | undefined
  web.initStrudel.mockImplementation(async (next) => {
    options = next
  })
  web.evaluate.mockImplementation(async () => {
    options?.editPattern?.(new (await import('@strudel/web')).Pattern(() => []))
  })
  const { play, stop } = await import('./engine')
  const source = '$: note("c3").s("sine")\n$: note("e3").s("sine")'
  const feedback = vi.fn()
  await play(source, { sourceFeedback: feedback })
  const evaluated = web.evaluate.mock.calls.at(-1)?.[0]
  if (typeof evaluated !== 'string') throw new Error('Missing evaluated source')
  const start = evaluated.indexOf('e3')
  const hap = { context: { locations: [{ start, end: start + 2 }] } }
  const trigger = web.observe.mock.calls.at(-1)?.[0]
  trigger?.(hap, 10, 0.5, 10.2)
  await vi.advanceTimersByTimeAsync(200)
  expect(feedback).not.toHaveBeenCalled()
  web.time = 10.2
  await vi.advanceTimersByTimeAsync(200)
  expect(feedback).toHaveBeenCalledExactlyOnceWith({
    source,
    spans: [{ start: source.indexOf('e3'), end: source.indexOf('e3') + 2 }],
  })
  trigger?.(hap, 10.2, 0.5, 11)
  await stop()
  web.time = 11
  await vi.advanceTimersByTimeAsync(1000)
  expect(feedback).toHaveBeenCalledTimes(1)
})
