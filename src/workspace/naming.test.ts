import { describe, expect, it } from 'vitest'
import { generate } from '../codegen/generate'
import { demoPatch } from '../patch/demo'
import { read } from '../reader'
import { setLook, setValue } from '../rack/model'
import { libraryPatches } from '../library/catalog'
import { readLibraryPatch } from '../library/load'
import { createAutosave } from './autosave'
import { editDocument, fromPatch, makeRackEditable, sourceBody } from './document'
import { createDocumentHistory } from './history'
import { patchFilename, patchName, renameDocument } from './naming'

describe('patch names', () => {
  it('keeps the unnamed file and history unchanged when the displayed fallback is submitted', () => {
    const original = fromPatch(demoPatch())
    const history = createDocumentHistory(original)
    const cancelled = renameDocument(original, patchName(original.patch))
    history.accept(cancelled)
    expect(cancelled.source).toBe(original.source)
    expect(cancelled.patch.name).toBeUndefined()
    expect(history.canUndo).toBe(false)
  })

  it('saves a name without changing executable source or any rack state, then reopens exactly', () => {
    const original = fromPatch({ ...demoPatch(), rows: 4 })
    const named = renameDocument(original, '  Café / lead ☀  ')
    expect(sourceBody(named.source)).toBe(sourceBody(original.source))
    expect(named.patch).toEqual({ ...original.patch, name: 'Café / lead ☀' })
    const reopened = read(named.source)
    expect(reopened.layout).toBe('restored')
    expect(reopened.source).toBe(named.source)
    expect(reopened.patch).toEqual(named.patch)
    expect(patchFilename(reopened.patch)).toBe('Café - lead ☀.strudel')
    expect(patchFilename(reopened.patch, 'wav')).toBe('Café - lead ☀.wav')
  })

  it('retains names through rack edits, code reconciliation, conversion, undo and recovery', () => {
    const original = fromPatch(demoPatch())
    const named = renameDocument(original, 'Evening sketch')
    const history = createDocumentHistory(original)
    history.accept(named)
    expect(history.step('undo')?.patch.name).toBeUndefined()
    expect(history.step('redo')?.source).toBe(named.source)

    const edited = editDocument(named, setValue(named.patch, 'vcf1', 'cutoff', 1200))
    const looked = editDocument(edited, setLook(edited.patch, 'osc1', 'vintage'))
    const external = read(looked.source.replace('.lpf(1200)', '.lpf(1600)'))
    expect(external.layout).toBe('reconciled')
    expect(external.patch.name).toBe('Evening sketch')
    const converted = makeRackEditable(external)
    expect(read(converted.source).patch.name).toBe('Evening sketch')

    let stored = ''
    const autosave = createAutosave(() => ({
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value
      },
      removeItem: () => {
        stored = ''
      },
    }))
    expect(autosave.save(converted, '$: note(')).toBe(true)
    expect(autosave.load()).toMatchObject({
      document: { patch: { name: 'Evening sketch' }, source: converted.source },
      draft: '$: note(',
    })
  })

  it('names every library workspace from its title while retaining executable bytes and rack identity', () => {
    for (const entry of libraryPatches()) {
      const original = readLibraryPatch(entry)
      const loaded = renameDocument(original, entry.title)
      expect(loaded.patch).toEqual({ ...original.patch, name: entry.title })
      expect(sourceBody(loaded.source), entry.id).toBe(sourceBody(entry.source))
      expect(read(loaded.source).patch).toEqual(loaded.patch)
      expect(readLibraryPatch(entry).source).toBe(entry.source)
    }
  })

  it('opens older unnamed files unchanged and defaults blank names', () => {
    const old = generate(demoPatch())
    const document = read(old)
    expect(document.source).toBe(old)
    expect(document.layout).toBe('restored')
    expect(document.patch.name).toBeUndefined()
    expect(patchName(document.patch)).toBe('Untitled patch')
    expect(patchFilename(document.patch)).toBe('Untitled patch.strudel')
    expect(renameDocument(document, '   ').source).toBe(old)
    expect(patchName(read("$: s('bd')\n").patch)).toBe('Untitled patch')
  })

  it('retains malformed or unknown metadata instead of renaming over it', () => {
    const named = renameDocument(fromPatch(demoPatch()), 'Saved name')
    for (const source of [
      named.source.replace('"name": "Saved name"', '"name": 42'),
      named.source.replace('"version": 1', '"version": 999'),
    ]) {
      const document = read(source)
      expect(document.layout).toBe('invalid')
      expect(document.source).toBe(source)
      expect(() => renameDocument(document, 'Replacement')).toThrow(/metadata/)
    }
  })

  it.each([
    ['Bass: take/2\\live?*<>|"', 'Bass- take-2-live------.strudel'],
    ['Sketch.strudel', 'Sketch.strudel'],
    ['... ', 'Untitled patch.strudel'],
    ['Line\nTwo\t', 'Line-Two.strudel'],
  ])('exports %j with a safe filename', (name, filename) => {
    expect(patchFilename({ name })).toBe(filename)
    expect(patchFilename({ name }, 'wav')).toBe(filename.replace(/\.strudel$/, '.wav'))
  })
})
