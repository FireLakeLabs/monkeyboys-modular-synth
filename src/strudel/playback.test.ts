import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routingFixture } from '../testing/routingCases'
import { connect, setValue } from '../rack/model'
import { generate } from '../codegen/generate'
import { demoPatch } from '../patch/demo'
import type { Patch } from '../patch/types'
import { createPlayback } from './playback'
import * as engine from './engine'

vi.mock('./engine', () => ({
  play: vi.fn(),
  bounce: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
  subscribe: vi.fn(),
  getResourceStatus: () => 'unknown',
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(engine.play).mockResolvedValue(undefined)
  vi.mocked(engine.bounce).mockResolvedValue(undefined)
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
  it('bounces an immutable accepted file with its safe name and returns stopped without autoplay', async () => {
    const patch = { ...demoPatch(), name: 'Café / take.strudel' }
    const playback = createPlayback(patch)
    const held = deferred()
    vi.mocked(engine.bounce).mockReturnValueOnce(held.promise)
    await playback.play()
    const rendering = playback.bounce(3)
    expect(playback.getSnapshot().status).toBe('bouncing')
    await playback.play()
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(engine.bounce).toHaveBeenCalledExactlyOnceWith(generate(patch), {
      cycles: 3,
      name: 'Café - take',
      volume: 0.8,
    })
    held.resolve()
    await rendering
    expect(playback.getSnapshot()).toMatchObject({ status: 'stopped', scheduling: 'stopped' })
    await playback.play()
    expect(engine.play).toHaveBeenCalledTimes(2)
  })

  it('retains bounce failures without source attribution and requires explicit Play to recover', async () => {
    const playback = createPlayback(demoPatch())
    vi.mocked(engine.bounce).mockRejectedValueOnce(new Error('decode failed'))
    await playback.bounce(2)
    expect(playback.getSnapshot()).toMatchObject({
      status: 'error',
      scheduling: 'stopped',
      errorSource: null,
    })
    expect(playback.getSnapshot().error).toContain('decode failed')
    expect(engine.play).not.toHaveBeenCalled()
    await playback.update(demoPatch())
    expect(playback.getSnapshot().status).toBe('error')
    await playback.play()
    expect(playback.getSnapshot().status).toBe('playing')
  })
  it('forwards source feedback without publishing React snapshots and cancels obsolete playback', async () => {
    const patch = demoPatch()
    const playback = createPlayback(patch)
    const changedState = vi.fn()
    const unsubscribeState = playback.subscribe(changedState)
    const feedback = vi.fn()
    const unsubscribeSource = playback.subscribeSourceFeedback(feedback)
    await playback.play()
    const [source, options] = vi.mocked(engine.play).mock.calls.at(-1) ?? []
    if (!source || !options?.sourceFeedback) throw new Error('Missing source feedback')
    changedState.mockClear()
    feedback.mockClear()
    const event = { source, spans: [{ start: 0, end: 1 }] }
    options.sourceFeedback(event)
    expect(feedback).toHaveBeenLastCalledWith(event)
    expect(changedState).not.toHaveBeenCalled()

    // A metadata-only volume edit keeps the live pattern and its source offsets.
    const quieter = changed(patch, 'out', 'vol', 0.3)
    await playback.update(quieter)
    expect(engine.play).toHaveBeenCalledTimes(1)
    options.sourceFeedback(event)
    expect(feedback).toHaveBeenLastCalledWith({ ...event, source: generate(quieter) })

    await playback.update(changed(quieter, 'vcf', 'cutoff', 2000))
    feedback.mockClear()
    options.sourceFeedback(event)
    expect(feedback).not.toHaveBeenCalled()
    const latest = vi.mocked(engine.play).mock.calls.at(-1)?.[1]?.sourceFeedback
    await playback.stop()
    expect(feedback).toHaveBeenLastCalledWith(null)
    feedback.mockClear()
    latest?.(event)
    expect(feedback).not.toHaveBeenCalled()
    unsubscribeSource()
    unsubscribeState()
  })

  it('keeps a newer Stop authoritative when an older evaluation rejects', async () => {
    let reject = (_error: Error) => {}
    vi.mocked(engine.play).mockReturnValueOnce(
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
    )
    const playback = createPlayback(demoPatch())
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    const stopping = playback.stop()
    reject(new Error('obsolete evaluation failure'))
    await Promise.all([starting, stopping])
    expect(playback.getSnapshot()).toMatchObject({
      status: 'stopped',
      error: null,
      scheduling: 'stopped',
    })
  })

  it('keeps explicit replay authoritative when a stopped evaluation rejects late', async () => {
    let reject = (_error: Error) => {}
    vi.mocked(engine.play).mockReturnValueOnce(
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
    )
    const playback = createPlayback(demoPatch())
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    await playback.stop()
    const replay = playback.play()
    reject(new Error('cancelled old evaluation'))
    await Promise.all([starting, replay])
    expect(playback.getSnapshot()).toMatchObject({ status: 'playing', error: null })
    expect(engine.play).toHaveBeenCalledTimes(2)
  })

  it('reports stopping with unknown scheduling while failure recovery is pending', async () => {
    const held = deferred()
    vi.mocked(engine.play).mockRejectedValueOnce(new Error('construction failed'))
    vi.mocked(engine.stop).mockReturnValueOnce(held.promise)
    const playback = createPlayback(demoPatch())
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1))
    expect(playback.getSnapshot()).toMatchObject({
      status: 'stopping',
      scheduling: 'unknown',
      error: expect.stringContaining('construction failed'),
    })
    held.resolve()
    await starting
    expect(playback.getSnapshot()).toMatchObject({ status: 'error', scheduling: 'stopped' })
  })

  it('retains the failing source revision when newer code was queued', async () => {
    let reject = (_error: Error) => {}
    vi.mocked(engine.play).mockReturnValueOnce(
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
    )
    const original = demoPatch()
    const playback = createPlayback(original)
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    const editing = playback.update(changed(original, 'vcf', 'cutoff', 4000))
    reject(new Error('older code failed'))
    await Promise.all([starting, editing])
    expect(playback.getSnapshot()).toMatchObject({
      status: 'error',
      scheduling: 'stopped',
      errorSource: generate(original),
    })
    expect(engine.play).toHaveBeenCalledTimes(1)
    await playback.play()
    expect(playback.getSnapshot().status).toBe('playing')
    expect(engine.play).toHaveBeenLastCalledWith(
      generate(changed(original, 'vcf', 'cutoff', 4000)),
      expect.anything(),
    )
  })

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
      sourceFeedback: expect.any(Function),
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
      sourceFeedback: expect.any(Function),
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
      sourceFeedback: expect.any(Function),
    })
    expect(playback.getSnapshot().status).toBe('playing')
  })

  it('Stop cancels queued edits, bypasses active evaluation, and permits explicit replay', async () => {
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
    expect(engine.stop).toHaveBeenCalledTimes(1)
    held.resolve()
    await Promise.all([starting, editing, stopping, stoppedEdit])
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(playback.getSnapshot().status).toBe('stopped')
    await playback.play()
    expect(engine.play).toHaveBeenLastCalledWith(generate(changed(patch, 'vcf', 'cutoff', 4000)), {
      volume: 0.8,
      resetEffects: true,
      sourceFeedback: expect.any(Function),
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
      sourceFeedback: expect.any(Function),
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

  it('confirms Stop and allows replacement while evaluation has not settled', async () => {
    const { prepareReplacement } = await import('../workspace/open')
    const held = deferred()
    vi.mocked(engine.play).mockReturnValueOnce(held.promise)
    const playback = createPlayback(demoPatch())
    const starting = playback.play()
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1))
    await expect(prepareReplacement(async () => 'replacement', playback)).resolves.toBe(
      'replacement',
    )
    expect(playback.getSnapshot().scheduling).toBe('stopped')
    held.resolve()
    await starting
    expect(playback.getSnapshot().status).toBe('stopped')
  })

  it('surfaces late engine failures without inventing source ownership and requires explicit Play', async () => {
    let report: ((event: engine.EngineEvent) => void) | undefined
    vi.mocked(engine.subscribe).mockImplementation((listener) => {
      report = listener
      return () => {}
    })
    const original = demoPatch()
    const playback = createPlayback(original)
    const unsubscribe = playback.subscribe(() => {})
    await playback.play()
    report?.({ type: 'failure', message: 'sound missing' })
    await vi.waitFor(() => expect(playback.getSnapshot().status).toBe('error'))
    expect(playback.getSnapshot()).toMatchObject({
      errorSource: null,
      scheduling: 'stopped',
      error: expect.stringContaining('sound missing'),
    })
    await playback.update(changed(original, 'vcf', 'cutoff', 4000))
    expect(engine.play).toHaveBeenCalledTimes(1)
    await playback.play()
    expect(playback.getSnapshot().status).toBe('playing')
    unsubscribe()
  })

  it('retains work edited while a replacement waits for Stop', async () => {
    const { prepareReplacement } = await import('../workspace/open')
    const held = deferred()
    vi.mocked(engine.stop).mockReturnValueOnce(held.promise)
    const playback = createPlayback(demoPatch())
    let unchanged = true
    const replacing = prepareReplacement(
      async () => 'file source',
      playback,
      () => unchanged,
    )
    const rejected = expect(replacing).rejects.toThrow(/current work retained/)
    await vi.waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1))
    unchanged = false
    held.resolve()
    await rejected
  })

  it('does not publish a stopped-volume error for superseded source', async () => {
    let reject = (_error: Error) => {}
    vi.mocked(engine.setVolume).mockReturnValueOnce(
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
    )
    const patch = demoPatch()
    const playback = createPlayback(patch)
    const obsolete = playback.update(changed(patch, 'out', 'vol', 0.2))
    await vi.waitFor(() => expect(engine.setVolume).toHaveBeenCalledTimes(1))
    const latest = playback.update(changed(patch, 'out', 'vol', 0.6))
    reject(new Error('obsolete volume failure'))
    await Promise.all([obsolete, latest])
    expect(playback.getSnapshot()).toMatchObject({ status: 'stopped', error: null })
    expect(engine.setVolume).toHaveBeenLastCalledWith(0.6)
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

it('plays retained source, skips look-only reevaluation, and keeps stopped source edits silent', async () => {
  const { read } = await import('../reader')
  const { editDocument, saveLayout } = await import('../workspace/document')
  const { setLook } = await import('../rack/model')
  const doc = saveLayout(read("// keep custom code\n$: note('c3').s('sine').lpf(800)\n"))
  const playback = createPlayback(doc)
  await playback.play()
  expect(engine.play).toHaveBeenLastCalledWith(doc.source, {
    volume: 0.8,
    resetEffects: true,
    sourceFeedback: expect.any(Function),
  })
  const filter = doc.patch.modules.find((m) => m.type === 'vcf')
  if (!filter) throw new Error('Missing filter')
  const looked = editDocument(doc, setLook(doc.patch, filter.id, 'vintage'))
  await playback.update(looked)
  expect(engine.play).toHaveBeenCalledTimes(1)
  await playback.stop()
  const edited = saveLayout(read(looked.source.replace('lpf(800)', 'lpf(1200)')))
  await playback.update(edited)
  expect(engine.play).toHaveBeenCalledTimes(1)
  expect(playback.getSnapshot().status).toBe('stopped')
  await playback.play()
  expect(engine.play).toHaveBeenLastCalledWith(edited.source, {
    volume: 0.8,
    resetEffects: true,
    sourceFeedback: expect.any(Function),
  })
})

it('applies edits to executable code after an invalid layout block', async () => {
  const { read } = await import('../reader')
  const original = generate(demoPatch())
  const doc = read(`${original}$: note('c4').s('sine')\n`)
  const playback = createPlayback(doc)
  await playback.play()
  const edited = read(`${original}$: note('c5').s('sine')\n`)
  await playback.update(edited)
  expect(engine.play).toHaveBeenCalledTimes(2)
  expect(engine.play).toHaveBeenLastCalledWith(edited.source, {
    volume: 0.8,
    resetEffects: false,
    sourceFeedback: expect.any(Function),
  })
})

it('opens a file only after Stop succeeds and leaves accepted source edits silent', async () => {
  const { openFile } = await import('../workspace/open')
  const { read } = await import('../reader')
  const source = "$: note('g4').s('sine')\n"
  const playback = createPlayback(demoPatch())
  await playback.play()
  const loaded = await openFile({ text: () => Promise.resolve(source) }, playback)
  expect(loaded).toBe(source)
  expect(playback.getSnapshot().status).toBe('stopped')
  await playback.update(read(loaded))
  expect(engine.play).toHaveBeenCalledTimes(1)
  await playback.play()
  expect(engine.play).toHaveBeenLastCalledWith(source, {
    volume: 0.8,
    resetEffects: true,
    sourceFeedback: expect.any(Function),
  })
})

it('does not accept a replacement file when Stop fails', async () => {
  const { openFile } = await import('../workspace/open')
  const playback = createPlayback(demoPatch())
  await playback.play()
  vi.mocked(engine.stop).mockRejectedValueOnce(new Error('hush failed'))
  await expect(openFile({ text: () => Promise.resolve('$: note(') }, playback)).rejects.toThrow(
    /has not stopped/,
  )
  expect(engine.play).toHaveBeenCalledTimes(1)
  expect(playback.getSnapshot().error).toContain('Stop failed')
})

it('replaces audio buses on allocation changes but retains them for knob edits', async () => {
  const patch = routingFixture('audio-mod')
  const playback = createPlayback(patch)
  await playback.play()
  expect(engine.play).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ resetEffects: true }),
  )
  const edited = setValue(patch, 'vcf1', 'cutoff', 900)
  await playback.update(edited)
  expect(engine.play).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ resetEffects: false }),
  )
  // Setup can reserve a bus without changing a module/cable. The actual allocation matters.
  const reserved = { ...edited, prelude: 'const external = s("sine").bus(1)' }
  await playback.update(reserved)
  expect(engine.play).toHaveBeenLastCalledWith(
    expect.stringContaining('.bus(2)'),
    expect.objectContaining({ resetEffects: true }),
  )
  await playback.update(
    connect(reserved, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in2' }),
  )
  expect(engine.play).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ resetEffects: true }),
  )
  await playback.stop()
})
