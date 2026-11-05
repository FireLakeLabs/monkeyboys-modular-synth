import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import { placeModule, starterPatch } from '../rack/model'
import { sourceBody } from '../workspace/document'
import { createMyPatches, MY_PATCHES_KEY, type SavedPatch } from './myPatches'

function memory(initial?: string) {
  const items = new Map<string, string>()
  if (initial !== undefined) items.set(MY_PATCHES_KEY, initial)
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
  }
}

const patch = () => generate(placeModule(starterPatch(), 'osc', 0))

function saved(store: ReturnType<typeof createMyPatches>): SavedPatch[] {
  const result = store.load()
  if (!result.ok) throw new Error(result.failure)
  return result.value
}

describe('my patches', () => {
  it('saves plain Strudel with rack metadata, so reopening is the existing round trip', () => {
    const source = patch()
    const backing = memory()
    const kept = createMyPatches(() => backing)
    expect(kept.load()).toEqual({ ok: true, value: [] })
    kept.save({ name: 'Bass', source })
    const [entry] = saved(kept)
    // Formatting: exact bytes. Saved rack state: read back separately. Sound: same code.
    expect(entry?.source).toBe(source)
    expect(read(entry?.source ?? '').patch).toEqual(read(source).patch)
    expect(sourceBody(entry?.source ?? '')).toBe(sourceBody(source))
  })

  it('replaces an entry by id and adds without one', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const first = store.save({ name: 'One', source: patch() })
    if (!first.ok) throw new Error(first.failure)
    store.save({ id: first.value.id, name: 'One', source: '$: s("bd")' })
    store.save({ name: 'Two', source: patch() })
    expect(saved(store).map((entry) => entry.name)).toEqual(['One', 'Two'])
    expect(saved(store)[0]?.source).toBe('$: s("bd")')
  })

  it('renames the entry and the saved patch name together', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const result = store.save({ name: 'Old', source: patch() })
    if (!result.ok) throw new Error(result.failure)
    store.rename(result.value.id, 'New name')
    const [entry] = saved(store)
    expect(entry?.name).toBe('New name')
    expect(read(entry?.source ?? '').patch.name).toBe('New name')
  })

  it('keeps an unreadable draft exactly, changing only its entry name', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const result = store.save({ name: 'Draft', source: '$: note(' })
    if (!result.ok) throw new Error(result.failure)
    store.rename(result.value.id, 'Renamed')
    expect(saved(store)[0]).toMatchObject({ name: 'Renamed', source: '$: note(' })
  })

  it('deletes, and restore puts the entry back in its place', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    for (const name of ['A', 'B', 'C']) store.save({ name, source: patch() })
    const entry = saved(store)[1]
    if (!entry) throw new Error('Missing entry')
    store.remove(entry.id)
    expect(saved(store).map((item) => item.name)).toEqual(['A', 'C'])
    store.restore(entry, 1)
    expect(saved(store).map((item) => item.name)).toEqual(['A', 'B', 'C'])
  })

  it('reports a full store and keeps what was there', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    store.save({ name: 'Kept', source: patch() })
    const before = backing.items.get(MY_PATCHES_KEY)
    backing.setItem = () => {
      throw new DOMException('Too big', 'QuotaExceededError')
    }
    expect(store.save({ name: 'Lost?', source: patch() })).toEqual({ ok: false, failure: 'full' })
    expect(backing.items.get(MY_PATCHES_KEY)).toBe(before)
  })

  it('reports blocked storage on reading and writing', () => {
    const store = createMyPatches(() => {
      throw new Error('Blocked')
    })
    expect(store.load()).toEqual({ ok: false, failure: 'unavailable' })
    expect(store.save({ name: 'A', source: 'x' })).toEqual({ ok: false, failure: 'unavailable' })
    expect(store.usage()).toBe(0)
  })

  it.each([
    ['broken JSON', '{'],
    ['an unknown version', '{"version":2,"patches":[]}'],
    ['a malformed entry', '{"version":1,"patches":[{"id":1}]}'],
  ])('never overwrites %s', (_name, text) => {
    const backing = memory(text)
    const store = createMyPatches(() => backing)
    expect(store.load()).toEqual({ ok: false, failure: 'unreadable' })
    expect(store.save({ name: 'A', source: 'x' })).toEqual({ ok: false, failure: 'unreadable' })
    expect(backing.items.get(MY_PATCHES_KEY)).toBe(text)
  })

  it('writes from what storage holds now, so another tab’s save survives', () => {
    const backing = memory()
    const one = createMyPatches(() => backing)
    const two = createMyPatches(() => backing)
    one.save({ name: 'From one', source: patch() })
    two.save({ name: 'From two', source: patch() })
    expect(saved(one).map((entry) => entry.name)).toEqual(['From one', 'From two'])
  })

  it('refuses to overwrite a newer revision from another tab, and keeps that revision', () => {
    const backing = memory()
    const one = createMyPatches(() => backing)
    const two = createMyPatches(() => backing)
    const first = one.save({ name: 'Shared', source: 'one' })
    if (!first.ok) throw new Error(first.failure)
    const { id, revision } = first.value
    const newer = two.save({ id, revision, name: 'Shared', source: 'two' })
    if (!newer.ok) throw new Error(newer.failure)
    expect(one.save({ id, revision, name: 'Shared', source: 'stale' })).toEqual({
      ok: false,
      failure: 'conflict',
    })
    expect(saved(one)[0]?.source).toBe('two')
  })

  it('treats a rename as a revision, so a stale save cannot undo it', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const first = store.save({ name: 'Old', source: patch() })
    if (!first.ok) throw new Error(first.failure)
    const { id, revision } = first.value
    const renamed = store.rename(id, 'New')
    expect(renamed.ok).toBe(true)
    expect(store.save({ id, revision, name: 'Old', source: 'stale' })).toEqual({
      ok: false,
      failure: 'conflict',
    })
    if (!renamed.ok) throw new Error(renamed.failure)
    expect(renamed.value.previous).toBe(revision)
    const { revision: next } = renamed.value
    expect(store.save({ id, revision: next, name: 'New', source: 'x' }).ok).toBe(true)
  })

  it('brings back an entry deleted elsewhere rather than dropping the save', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const first = store.save({ name: 'Gone', source: 'one' })
    if (!first.ok) throw new Error(first.failure)
    store.remove(first.value.id)
    const again = store.save({
      id: first.value.id,
      revision: first.value.revision,
      name: 'Gone',
      source: 'two',
    })
    expect(again.ok).toBe(true)
    expect(saved(store).map((entry) => entry.source)).toEqual(['two'])
  })

  it('keeps both versions when an undone delete meets a newer save', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    const first = store.save({ name: 'Both', source: 'old' })
    if (!first.ok) throw new Error(first.failure)
    store.remove(first.value.id)
    store.save({ id: first.value.id, name: 'Both', source: 'new' })
    store.restore(first.value, 0)
    const entries = saved(store)
    expect(entries.map((entry) => entry.source).sort()).toEqual(['new', 'old'])
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2)
  })

  it('reports how much it uses', () => {
    const backing = memory()
    const store = createMyPatches(() => backing)
    expect(store.usage()).toBe(0)
    store.save({ name: 'A', source: patch() })
    expect(store.usage()).toBeGreaterThan(0)
  })
})
