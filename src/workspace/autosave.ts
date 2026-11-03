import { read } from '../reader'
import type { SourceDocument } from '../reader/types'
import { validateRack } from '../rack/model'

export const AUTOSAVE_KEY = 'monkeyboy.workspace.v1'

export interface RecoveredWorkspace {
  document: SourceDocument
  draft: string
}

/** Local storage is optional; even obtaining it can throw in a restricted browser. */
export function createAutosave(
  storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => window.localStorage,
) {
  return {
    load(): RecoveredWorkspace | null {
      try {
        const text = storage().getItem(AUTOSAVE_KEY)
        if (text === null) return null
        const saved: unknown = JSON.parse(text)
        if (
          typeof saved !== 'object' ||
          saved === null ||
          !('version' in saved) ||
          saved.version !== 1 ||
          !('source' in saved) ||
          typeof saved.source !== 'string' ||
          !('draft' in saved) ||
          typeof saved.draft !== 'string'
        )
          return null
        const document = read(saved.source)
        validateRack(document.patch)
        return { document, draft: saved.draft }
      } catch {
        return null
      }
    },
    save(document: SourceDocument, draft = document.source): boolean {
      try {
        storage().setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ version: 1, source: document.source, draft }),
        )
        return true
      } catch {
        return false
      }
    },
    discard(): boolean {
      try {
        storage().removeItem(AUTOSAVE_KEY)
        return true
      } catch {
        return false
      }
    },
  }
}
