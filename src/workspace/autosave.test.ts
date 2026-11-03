import { describe, expect, it } from 'vitest'
import { demoPatch } from '../patch/demo'
import { read } from '../reader'
import { fromPatch, saveLayout, sourceBody } from './document'
import { AUTOSAVE_KEY, createAutosave } from './autosave'

function memoryStorage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
  }
}

describe('local workspace recovery', () => {
  it('recovers exact source and saved rack identity through a new storage adapter', () => {
    const storage = memoryStorage()
    const patch = demoPatch()
    patch.rows = 3
    patch.names = { 'osc1:out': 'lead' }
    patch.modules = patch.modules.map((module) => ({ ...module, row: 1, look: 'instrument' }))
    const document = fromPatch(patch)
    expect(createAutosave(() => storage).load()).toBeNull()
    expect(createAutosave(() => storage).save(document)).toBe(true)
    const recovered = createAutosave(() => storage).load()
    expect(recovered?.document.source).toBe(document.source)
    expect(recovered?.draft).toBe(document.source)
    expect(recovered?.document.layout).toBe('restored')
    expect(recovered?.document.patch).toEqual(patch)
  })

  it('retains imported comments, formatting and opaque code separately from the rack', () => {
    const storage = memoryStorage()
    const source =
      "// keep these bytes\r\n$: note('c3 e3').s('sine').chunk(4, p => p.rev()) // tail\r\n"
    const document = saveLayout(read(source))
    const autosave = createAutosave(() => storage)
    autosave.save(document)
    const recovered = autosave.load()
    expect(recovered?.document.source).toBe(document.source)
    expect(sourceBody(recovered?.document.source ?? '')).toBe(source)
    expect(recovered?.document.patch).toEqual(document.patch)
  })

  it('saves each unfinished draft without replacing the readable rack, then accepts a correction', () => {
    const storage = memoryStorage()
    const saved = createAutosave(() => storage)
    const document = fromPatch(demoPatch())
    saved.save(document)
    const draft = `${document.source}\n// unfinished café\n$: note(`
    expect(saved.save(document, draft)).toBe(true)
    const recovered = createAutosave(() => storage).load()
    expect(recovered?.draft).toBe(draft)
    expect(recovered?.document.source).toBe(document.source)
    expect(recovered?.document.patch).toEqual(document.patch)
    const corrected = saveLayout(read("$: note('d3').s('triangle')\n"))
    saved.save(corrected)
    expect(saved.load()?.draft).toBe(corrected.source)
    expect(saved.load()?.document.patch).toEqual(corrected.patch)
  })

  it('discards only the recovery copy and does not offer it on the next load', () => {
    const storage = memoryStorage()
    storage.setItem('another-setting', 'keep')
    const autosave = createAutosave(() => storage)
    autosave.save(fromPatch(demoPatch()))
    expect(autosave.discard()).toBe(true)
    expect(autosave.load()).toBeNull()
    expect(storage.getItem('another-setting')).toBe('keep')
  })

  it.each([
    'not JSON',
    'null',
    JSON.stringify({ version: 2, source: '$: s("bd")', draft: '' }),
    JSON.stringify({ version: 1, source: '$: s("bd")', draft: null }),
    JSON.stringify({ version: 1, source: '$: note(', draft: 'keep me' }),
  ])('ignores unreadable or unsupported recovery envelopes without deleting them: %s', (text) => {
    const storage = memoryStorage()
    storage.setItem(AUTOSAVE_KEY, text)
    expect(createAutosave(() => storage).load()).toBeNull()
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(text)
  })

  it('quietly handles blocked storage access and reads', () => {
    const blocked = createAutosave(() => {
      throw new Error('Storage denied')
    })
    expect(blocked.load()).toBeNull()
    expect(blocked.save(fromPatch(demoPatch()))).toBe(false)
    expect(blocked.discard()).toBe(false)
    const storage = memoryStorage()
    const unreadable = createAutosave(() => ({
      ...storage,
      getItem: () => {
        throw new Error('Storage read denied')
      },
    }))
    expect(unreadable.load()).toBeNull()
  })

  it('retains the previous recovery copy when a later write exceeds quota', () => {
    const storage = memoryStorage()
    const document = fromPatch(demoPatch())
    createAutosave(() => storage).save(document)
    const full = createAutosave(() => ({
      ...storage,
      setItem: () => {
        throw new Error('Quota exceeded')
      },
    }))
    expect(full.save(document, '$: note(')).toBe(false)
    expect(full.load()?.draft).toBe(document.source)
  })
})
