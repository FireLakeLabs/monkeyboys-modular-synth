import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitStrudelOptions } from '@strudel/web'

const web = vi.hoisted(() => ({
  initStrudel: vi.fn<(options?: InitStrudelOptions) => Promise<unknown>>(),
  evaluate: vi.fn<(code: string) => Promise<unknown>>(),
  hush: vi.fn(),
  samples: vi.fn<() => Promise<unknown>>(),
  initAudio: vi.fn<() => Promise<void>>(),
  resume: vi.fn<() => Promise<void>>(),
}))
vi.mock('@strudel/web', () => ({
  ...web,
  getAudioContext: () => ({ resume: web.resume }),
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
})
