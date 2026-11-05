import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getModuleSpec } from '../modules/catalog'
import { PATCH_LIBRARY, type LibraryNode, type LibraryPatch } from './catalog'
import { MyPatchDetail, MyPatchesList } from './MyPatches'
import type { SavedPatch, StoreResult } from './myPatches'
import './PatchLibrary.css'

function CollectionItems({
  nodes,
  path,
  selected,
  choose,
  load,
}: {
  nodes: readonly LibraryNode[]
  path: readonly string[]
  selected: string | undefined
  choose: (entry: LibraryPatch, path: readonly string[]) => void
  load: (entry: LibraryPatch, path: readonly string[]) => void
}) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          {node.kind === 'collection' ? (
            <details open>
              <summary>{node.title}</summary>
              <CollectionItems
                nodes={node.children}
                path={[...path, node.title]}
                selected={selected}
                choose={choose}
                load={load}
              />
            </details>
          ) : (
            <button
              type="button"
              aria-pressed={node.id === selected}
              onClick={() => choose(node, path)}
              onDoubleClick={() => load(node, path)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                // Enter loads; Space keeps a button's usual click, which selects.
                event.preventDefault()
                if (!event.repeat) load(node, path)
              }}
            >
              {node.title}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function PatchLibrary({
  close,
  requestLoad,
  cancelReplacement,
  confirmation,
  error,
  saved,
  usage,
  loadSaved,
  renameSaved,
  exportSaved,
  deleteSaved,
  restoreSaved,
}: {
  close: () => void
  requestLoad: (entry: LibraryPatch) => void
  saved: StoreResult<SavedPatch[]>
  usage: number
  loadSaved: (entry: SavedPatch) => void
  renameSaved: (entry: SavedPatch, name: string) => string | null
  exportSaved: (entry: SavedPatch) => void
  deleteSaved: (entry: SavedPatch) => string | null
  restoreSaved: (entry: SavedPatch, index: number) => string | null
  cancelReplacement: () => void
  confirmation: ReactNode
  error: string | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selection, setSelection] = useState<{
    entry: LibraryPatch
    path: readonly string[]
  } | null>(null)
  const [mine, setMine] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<{ entry: SavedPatch; index: number } | null>(null)
  const [storeError, setStoreError] = useState<string | null>(null)
  const savedEntry = saved.ok ? saved.value.find((item) => item.id === mine) : undefined
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  const entry = selection?.entry
  return (
    <dialog
      ref={dialog}
      className="patch-library"
      aria-labelledby="patch-library-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <header>
        <div>
          <h2 id="patch-library-title">Patch library</h2>
          <p>Your patches and the built-in collections</p>
        </div>
        <button type="button" onClick={close}>
          Close library
        </button>
      </header>
      <div className="patch-browser">
        <nav className="patch-collections" aria-label="Patch collections">
          <MyPatchesList
            saved={saved}
            selected={savedEntry?.id}
            choose={(item) => {
              cancelReplacement()
              setSelection(null)
              setMine(item.id)
            }}
            load={(item) => {
              setSelection(null)
              setMine(item.id)
              loadSaved(item)
            }}
          />
          <CollectionItems
            nodes={PATCH_LIBRARY}
            path={[]}
            selected={entry?.id}
            choose={(entry, path) => {
              cancelReplacement()
              setMine(null)
              setSelection({ entry, path })
            }}
            load={(entry, path) => {
              setMine(null)
              setSelection({ entry, path })
              requestLoad(entry)
            }}
          />
        </nav>
        <section className="patch-detail" aria-label="Selected patch" aria-live="polite">
          {deleted && (
            <p className="my-patch-deleted">
              Deleted {deleted.entry.name}{' '}
              <button
                type="button"
                onClick={() => {
                  const failure = restoreSaved(deleted.entry, deleted.index)
                  setStoreError(failure)
                  // The only copy stays here until it is safely back.
                  if (failure) return
                  setMine(deleted.entry.id)
                  setDeleted(null)
                }}
              >
                Undo
              </button>
            </p>
          )}
          {storeError && (
            <p className="error" role="alert">
              {storeError}
            </p>
          )}
          {savedEntry ? (
            <>
              <MyPatchDetail
                entry={savedEntry}
                usage={usage}
                load={() => loadSaved(savedEntry)}
                rename={(name) => renameSaved(savedEntry, name)}
                exportFile={() => exportSaved(savedEntry)}
                remove={() => {
                  const index = saved.ok ? saved.value.indexOf(savedEntry) : 0
                  const failure = deleteSaved(savedEntry)
                  setStoreError(failure)
                  if (!failure) {
                    setDeleted({ entry: savedEntry, index })
                    setMine(null)
                  }
                }}
              />
              {confirmation}
            </>
          ) : entry && selection ? (
            <>
              <p className="patch-path">{selection.path.join(' / ')}</p>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
              {entry.tryThis && <p className="patch-try-this">Try this: {entry.tryThis}</p>}
              <p className="patch-attribution">
                {entry.attribution.url ? (
                  <a href={entry.attribution.url} target="_blank" rel="noreferrer">
                    {entry.attribution.author}
                  </a>
                ) : (
                  entry.attribution.author
                )}
              </p>
              <p className="patch-exercises">
                Exercises: {entry.exercises.map((id) => getModuleSpec(id).name).join(' · ')}
              </p>
              <details className="patch-source">
                <summary>Strudel source</summary>
                <pre>{entry.source}</pre>
              </details>
              {confirmation || (
                <div className="patch-load">
                  <p>
                    Loading replaces the current patch, and Undo brings it back. Press Play to start
                    audio.
                  </p>
                  <button
                    type="button"
                    className="button button-primary load-patch"
                    onClick={() => requestLoad(entry)}
                  >
                    Load patch
                  </button>
                </div>
              )}
            </>
          ) : (
            <p>
              Select a patch to see its description, source and module exercises. Double-click a
              patch or press Enter on it to load it.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </dialog>
  )
}
