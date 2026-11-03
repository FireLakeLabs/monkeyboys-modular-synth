import { describe, expect, it } from 'vitest'
import { read } from '../reader'
import { demoPatch } from '../patch/demo'
import {
  placeModule,
  removeCable,
  removeModule,
  renameOutput,
  setLook,
  setValue,
  starterPatch,
} from '../rack/model'
import { editDocument, fromPatch, saveLayout } from './document'
import { createDocumentHistory } from './history'

describe('accepted document undo/redo', () => {
  it('restores exact source and saved identity through rack edits, deletion, code and replacement', () => {
    const original = fromPatch(demoPatch())
    const history = createDocumentHistory(original)
    const moved = editDocument(original, placeModule(original.patch, 'vcf', 1, 7, 'vcf1'))
    const looked = editDocument(moved, setLook(moved.patch, 'vcf1', 'vintage'))
    const named = editDocument(looked, renameOutput(looked.patch, 'osc1:out', 'lead'))
    const disconnected = editDocument(named, removeCable(named.patch, 'c2'))
    const deleted = editDocument(disconnected, removeModule(disconnected.patch, 'osc1'))
    const code = saveLayout(read("// retain 🐒\r\n$: note('d3').s('sine').chunk(4,x=>x.rev())\r\n"))
    const replacement = fromPatch(starterPatch())
    const revisions = [original, moved, looked, named, disconnected, deleted, code, replacement]
    for (const document of revisions.slice(1)) history.accept(document)
    expect(history.canRedo).toBe(false)
    for (const expected of revisions.slice(0, -1).reverse()) {
      const restored = history.step('undo')
      expect(restored?.source).toBe(expected.source)
      expect(restored?.patch).toEqual(expected.patch)
      expect(read(restored?.source ?? '').patch).toEqual(expected.patch)
    }
    expect(history.canUndo).toBe(false)
    expect(history.step('undo')).toBeNull()
    for (const expected of revisions.slice(1)) {
      const restored = history.step('redo')
      expect(restored?.source).toBe(expected.source)
      expect(restored?.patch).toEqual(expected.patch)
    }
    expect(history.step('redo')).toBeNull()
  })

  it('groups live knob values into one step and drops a cancelled gesture', () => {
    const original = fromPatch(demoPatch())
    const history = createDocumentHistory(original)
    const group = {}
    const middle = editDocument(original, setValue(original.patch, 'vcf1', 'cutoff', 1000))
    const final = editDocument(middle, setValue(middle.patch, 'vcf1', 'cutoff', 2000))
    history.accept(middle, group)
    history.accept(final, group)
    expect(history.step('undo')?.source).toBe(original.source)
    expect(history.step('redo')?.source).toBe(final.source)
    const cancelled = {}
    history.accept(middle, cancelled)
    history.accept(final, cancelled)
    expect(history.step('undo')?.source).toBe(original.source)
  })

  it('keeps redo through a no-op accept and clears it on a new accepted edit', () => {
    const original = fromPatch(starterPatch())
    const history = createDocumentHistory(original)
    const changed = editDocument(original, setValue(original.patch, 'out1', 'bpm', 140))
    history.accept(changed)
    history.step('undo')
    history.accept(read(original.source))
    expect(history.canRedo).toBe(true)
    const branch = editDocument(original, setValue(original.patch, 'out1', 'bpm', 90))
    history.accept(branch)
    expect(history.canRedo).toBe(false)
    expect(history.step('undo')?.source).toBe(original.source)
    history.reset(changed)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
