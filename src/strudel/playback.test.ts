import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generate } from '../codegen/generate'
import { demoPatch } from '../patch/demo'
import type { Patch } from '../patch/types'
import { createPlayback } from './playback'
import * as engine from './engine'

vi.mock('./engine', () => ({ play: vi.fn(), stop: vi.fn(), setVolume: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(engine.play).mockResolvedValue(undefined)
  vi.mocked(engine.stop).mockResolvedValue(undefined)
  vi.mocked(engine.setVolume).mockResolvedValue(undefined)
})

function changed(patch: Patch, type: string, control: string, value: number): Patch {
  return {
    ...patch,
    modules: patch.modules.map((module) =>
      module.type === type ? { ...module, values: { ...module.values, [control]: value } } : module,
    ),
  }
}

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('patch playback', () => {
  it('stays silent until Play and evaluates the latest generated patch', async () => {
    const patch = changed(demoPatch(), 'vcf', 'cutoff', 2000)
    const playback = createPlayback(demoPatch())
    await playback.update(patch)
    expect(engine.play).not.toHaveBeenCalled()
    expect(engine.setVolume).toHaveBeenLastCalledWith(0.8)
    await playback.play()
    expect(engine.play).toHaveBeenLastCalledWith(generate(patch), {
      volume: 0.8,
      resetEffects: true,
    })
    expect(playback.getSnapshot().status).toBe('playing')
  })

  it('applies a value edit without stopping or resetting the effect buses', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    await playback.play()
    const next = changed(patch, 'vcf', 'cutoff', 4000)
    await playback.update(next)
    expect(engine.play).toHaveBeenLastCalledWith(generate(next), {
      volume: 0.8,
      resetEffects: false,
    })
    expect(engine.stop).not.toHaveBeenCalled()
  })

  it('changes the output volume without evaluating again', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    await playback.play()
    await playback.update(changed(patch, 'out', 'vol', 0))
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(engine.setVolume).toHaveBeenLastCalledWith(0)
  })

  it('discards superseded queued edits and applies the newest value', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    const held = deferred()
    vi.mocked(engine.play).mockReturnValueOnce(held.promise)
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    const obsolete = playback.update(changed(patch, 'vcf', 'cutoff', 2000))
    const next = changed(patch, 'vcf', 'cutoff', 4000)
    const latest = playback.update(next)
    held.resolve()
    await Promise.all([starting, obsolete, latest])
    expect(engine.play).toHaveBeenCalledTimes(2)
    expect(engine.play).toHaveBeenLastCalledWith(generate(next), {
      volume: 0.8,
      resetEffects: false,
    })
    expect(playback.getSnapshot().status).toBe('playing')
  })

  it('Stop cancels queued edits, waits for active evaluation, and permits explicit replay', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    const held = deferred()
    vi.mocked(engine.play).mockReturnValueOnce(held.promise)
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    const editing = playback.update(changed(patch, 'vcf', 'cutoff', 2000))
    const stopping = playback.stop()
    const stoppedEdit = playback.update(changed(patch, 'vcf', 'cutoff', 4000))
    expect(playback.getSnapshot().status).toBe('stopping')
    expect(engine.stop).not.toHaveBeenCalled()
    held.resolve()
    await Promise.all([starting, editing, stopping, stoppedEdit])
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(playback.getSnapshot().status).toBe('stopped')
    await playback.play()
    expect(engine.play).toHaveBeenLastCalledWith(generate(changed(patch, 'vcf', 'cutoff', 4000)), {
      volume: 0.8,
      resetEffects: true,
    })
  })

  it('clears old effects when the cable graph changes, retaining the master level', async () => {
    const patch = changed(demoPatch(), 'out', 'vol', 0.25)
    const playback = createPlayback(patch)
    await playback.play()
    const next = { ...patch, cables: patch.cables.filter((cable) => cable.to.module !== 'out1') }
    await playback.update(next)
    expect(engine.play).toHaveBeenLastCalledWith(generate(next), {
      volume: 0.25,
      resetEffects: true,
    })
  })

  it('requests Stop after a surfaced evaluation failure and requires Play to recover', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    await playback.play()
    vi.mocked(engine.play).mockRejectedValueOnce(new Error('construction failed'))
    await playback.update(changed(patch, 'vcf', 'cutoff', 2000))
    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(playback.getSnapshot()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Scheduling stopped'),
    })
    await playback.update(patch)
    expect(engine.play).toHaveBeenCalledTimes(2)
    await playback.play()
    expect(playback.getSnapshot().status).toBe('playing')
  })

  it('reports unknown audio state if Stop fails', async () => {
    const playback = createPlayback(demoPatch())
    await playback.play()
    vi.mocked(engine.stop).mockRejectedValueOnce(new Error('hush failed'))
    await playback.stop()
    expect(playback.getSnapshot()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Audio state unknown'),
    })
  })

  it('rejects invalid patch edits before they reach the running engine', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    await playback.play()
    expect(() => playback.update(changed(patch, 'vcf', 'cutoff', -1))).toThrow()
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(playback.getSnapshot().status).toBe('playing')
  })
})
