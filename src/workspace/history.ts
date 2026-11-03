import type { SourceDocument } from '../reader/types'

/** Accepted source and its saved rack are a single revision, never reconstructed on undo. */
export function createDocumentHistory(initial: SourceDocument) {
  let entries = [initial]
  let position = 0
  let activeGroup: object | undefined
  return {
    get canUndo() {
      return position > 0
    },
    get canRedo() {
      return position < entries.length - 1
    },
    accept(next: SourceDocument, group?: object) {
      if (entries[position]?.source === next.source) return
      if (group && group === activeGroup && position === entries.length - 1) {
        entries[position] = next
        if (entries[position - 1]?.source === next.source) {
          entries.pop()
          position--
          activeGroup = undefined
        }
      } else {
        entries = entries.slice(0, position + 1)
        entries.push(next)
        position++
        activeGroup = group
      }
    },
    step(direction: 'undo' | 'redo'): SourceDocument | null {
      activeGroup = undefined
      const target = position + (direction === 'undo' ? -1 : 1)
      const document = entries[target]
      if (!document) return null
      position = target
      return document
    },
    reset(document: SourceDocument) {
      entries = [document]
      position = 0
      activeGroup = undefined
    },
  }
}
