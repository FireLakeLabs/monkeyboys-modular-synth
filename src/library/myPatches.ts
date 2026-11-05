import { read } from '../reader'
import { renameDocument } from '../workspace/naming'

export const MY_PATCHES_KEY = 'monkeyboy.patches.v1'

/** Browsers usually give a site about this much, shared with local recovery. */
export const STORAGE_BUDGET = 5 * 1024 * 1024

/** `source` is the exact exported file: plain Strudel with its rack metadata. */
export interface SavedPatch {
  id: string
  name: string
  source: string
  savedAt: string
  /** Changes on every save, so a tab can tell it has fallen behind. */
  revision: string
}

export type StoreFailure = 'full' | 'unavailable' | 'unreadable' | 'conflict'
export type StoreResult<T> = { ok: true; value: T } | { ok: false; failure: StoreFailure }

export const STORE_FAILURES: Record<StoreFailure, string> = {
  full: 'Browser storage is full. Export this patch to keep it.',
  unavailable: 'Browser storage isn’t available here. Export this patch to keep it.',
  unreadable:
    'Your saved patches can’t be read, so nothing was changed. Export this patch to keep it.',
  conflict:
    'It changed in another tab, so it wasn’t overwritten. Save again to keep this under a new name.',
}

export const failureMessage = (result: StoreResult<unknown>) =>
  result.ok ? null : STORE_FAILURES[result.failure]

function isSavedPatch(value: unknown): value is SavedPatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'source' in value &&
    typeof value.source === 'string' &&
    'savedAt' in value &&
    typeof value.savedAt === 'string' &&
    'revision' in value &&
    typeof value.revision === 'string'
  )
}

function parse(text: string): SavedPatch[] | null {
  try {
    const saved: unknown = JSON.parse(text)
    if (
      typeof saved !== 'object' ||
      saved === null ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('patches' in saved) ||
      !Array.isArray(saved.patches) ||
      !saved.patches.every(isSavedPatch)
    )
      return null
    return saved.patches
  } catch {
    return null
  }
}

/** Keep the file valid when it can be read; an unreadable draft keeps only its entry name. */
function renamedSource(source: string, name: string) {
  try {
    return renameDocument(read(source), name).source
  } catch {
    return source
  }
}

/**
 * Patches kept in this browser. Every write starts from what storage holds now, so
 * another tab's saves survive, and a store it cannot read is never overwritten.
 */
export function createMyPatches(
  storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage,
) {
  function load(): StoreResult<SavedPatch[]> {
    try {
      const text = storage().getItem(MY_PATCHES_KEY)
      if (text === null) return { ok: true, value: [] }
      const patches = parse(text)
      return patches ? { ok: true, value: patches } : { ok: false, failure: 'unreadable' }
    } catch {
      return { ok: false, failure: 'unavailable' }
    }
  }
  function write(patches: SavedPatch[]): StoreFailure | null {
    try {
      storage().setItem(MY_PATCHES_KEY, JSON.stringify({ version: 1, patches }))
      return null
    } catch (failure) {
      return failure instanceof DOMException && failure.name === 'QuotaExceededError'
        ? 'full'
        : 'unavailable'
    }
  }
  function update<T>(
    change: (patches: SavedPatch[]) => { patches: SavedPatch[]; value: T },
  ): StoreResult<T> {
    const current = load()
    if (!current.ok) return current
    const { patches, value } = change(current.value)
    const failure = write(patches)
    return failure ? { ok: false, failure } : { ok: true, value }
  }
  return {
    load,
    /**
     * Replaces the entry with this `id`, or adds a new one. `revision` is the one this tab
     * last saw, so a newer save from another tab is never overwritten.
     */
    save(entry: {
      id?: string | undefined
      revision?: string | undefined
      name: string
      source: string
    }): StoreResult<SavedPatch> {
      const existing = load()
      if (!existing.ok) return existing
      const current = existing.value.find((patch) => patch.id === entry.id)
      if (current && entry.revision !== undefined && current.revision !== entry.revision)
        return { ok: false, failure: 'conflict' }
      return update((patches) => {
        const saved: SavedPatch = {
          id: entry.id ?? crypto.randomUUID(),
          name: entry.name,
          source: entry.source,
          savedAt: new Date().toISOString(),
          revision: crypto.randomUUID(),
        }
        const index = patches.findIndex((patch) => patch.id === saved.id)
        return {
          patches:
            index < 0 ? [...patches, saved] : patches.map((p, i) => (i === index ? saved : p)),
          value: saved,
        }
      })
    },
    /**
     * Returns the revision storage held and the new one. A tab should expect the new one
     * only if it was up to date with the old one, or it would hide a conflict.
     */
    rename(id: string, name: string) {
      const revision = crypto.randomUUID()
      return update((patches) => ({
        patches: patches.map((patch) =>
          patch.id === id
            ? { ...patch, name, source: renamedSource(patch.source, name), revision }
            : patch,
        ),
        value: { revision, previous: patches.find((patch) => patch.id === id)?.revision },
      }))
    },
    remove(id: string) {
      return update((patches) => ({
        patches: patches.filter((patch) => patch.id !== id),
        value: null,
      }))
    },
    /** Puts a deleted entry back where it was, beside any newer save of the same patch. */
    restore(entry: SavedPatch, index: number) {
      return update((patches) => {
        const kept = patches.some((patch) => patch.id === entry.id)
          ? { ...entry, id: crypto.randomUUID() }
          : entry
        return {
          patches: [...patches.slice(0, index), kept, ...patches.slice(index)],
          value: null,
        }
      })
    },
    /** Text size of the store, for reporting against `STORAGE_BUDGET`. */
    usage() {
      try {
        return (storage().getItem(MY_PATCHES_KEY)?.length ?? 0) * 2
      } catch {
        return 0
      }
    },
  }
}
