import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitStrudelOptions } from '@strudel/web'

const web = vi.hoisted(() => ({
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
  getAudioContext: () => ({ resume: web.resume, currentTime: 10 }),
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

beforeEach(() => {
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

  it('stops after a play whose evaluation is still pending', async () => {
    let finishEvaluation = () => {}
    const evaluating = new Promise<void>((resolve) => {
      finishEvaluation = resolve
    })
    let playing = false
    web.evaluate.mockImplementation(async () => {
      await evaluating
      playing = true
    })
    web.hush.mockImplementation(() => {
      playing = false
    })
    const { play, stop } = await import('./engine')
    const starting = play('s("sine")')
    await vi.waitFor(() => expect(web.evaluate).toHaveBeenCalled())
    const stopping = stop()
    await Promise.resolve()
    finishEvaluation()
    await Promise.all([starting, stopping])
    expect(playing).toBe(false)
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
