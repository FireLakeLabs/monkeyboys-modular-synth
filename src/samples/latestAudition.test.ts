import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SoundChoice } from './crate'
import { latestAudition } from './latestAudition'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function harness() {
  const played: string[] = []
  const finish: (() => void)[] = []
  const errors: unknown[] = []
  const audition = latestAudition(
    ({ name, n }: SoundChoice) => {
      played.push(`${name}:${n}`)
      return new Promise<void>((resolve) => finish.push(resolve))
    },
    (error) => errors.push(error),
  )
  return { audition, played, finish, errors }
}

it('plays only the last of several quick flips', async () => {
  const { audition, played } = harness()
  for (const n of [1, 2, 3]) {
    audition.request({ name: 'bd', n })
    await vi.advanceTimersByTimeAsync(40)
  }
  await vi.advanceTimersByTimeAsync(200)
  expect(played).toEqual(['bd:3'])
})

it('skips flips made while a sound is still playing, except the newest', async () => {
  const { audition, played, finish } = harness()
  audition.request({ name: 'bd', n: 0 }, true)
  await vi.advanceTimersByTimeAsync(0)
  for (const n of [1, 2, 3]) audition.request({ name: 'bd', n })
  finish.shift()?.()
  await vi.advanceTimersByTimeAsync(0)
  expect(played).toEqual(['bd:0', 'bd:3'])
})

it('plays an explicit request at once and drops a cancelled one', async () => {
  const { audition, played } = harness()
  audition.request({ name: 'sn', n: 4 }, true)
  await vi.advanceTimersByTimeAsync(0)
  expect(played).toEqual(['sn:4'])
  const second = harness()
  second.audition.request({ name: 'sn', n: 5 })
  second.audition.cancel()
  await vi.advanceTimersByTimeAsync(500)
  expect(second.played).toEqual([])
})

it('reports a failed audition and keeps playing later requests', async () => {
  const errors: unknown[] = []
  const played: string[] = []
  const audition = latestAudition(
    async ({ name }) => {
      played.push(name)
      if (name === 'bad') throw new Error('Invalid sound variant')
    },
    (error) => errors.push(error),
  )
  audition.request({ name: 'bad', n: 0 }, true)
  await vi.advanceTimersByTimeAsync(0)
  audition.request({ name: 'good', n: 0 }, true)
  await vi.advanceTimersByTimeAsync(0)
  expect(played).toEqual(['bad', 'good'])
  expect(errors).toEqual([new Error('Invalid sound variant')])
})
