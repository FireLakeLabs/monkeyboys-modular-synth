import { useState } from 'react'
import { STORAGE_BUDGET, type SavedPatch, type StoreResult } from './myPatches'

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function MyPatchesList({
  saved,
  selected,
  choose,
  load,
}: {
  saved: StoreResult<SavedPatch[]>
  selected: string | undefined
  choose: (entry: SavedPatch) => void
  load: (entry: SavedPatch) => void
}) {
  return (
    <details open>
      <summary>My patches</summary>
      {!saved.ok && (
        <p className="error" role="alert">
          {saved.failure === 'unreadable'
            ? 'Your saved patches can’t be read. They have been left as they are.'
            : 'Browser storage isn’t available here.'}
        </p>
      )}
      {saved.ok && saved.value.length === 0 && (
        <p className="my-patches-empty">Nothing yet. Ctrl/Cmd+S saves your patch here.</p>
      )}
      {saved.ok && saved.value.length > 0 && (
        <ul>
          {saved.value.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={entry.id === selected}
                onClick={() => choose(entry)}
                onDoubleClick={() => load(entry)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  if (!event.repeat) load(entry)
                }}
              >
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function MyPatchDetail({
  entry,
  usage,
  load,
  rename,
  exportFile,
  remove,
}: {
  entry: SavedPatch
  usage: number
  load: () => void
  rename: (name: string) => string | null
  exportFile: () => void
  remove: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const nearlyFull = usage > STORAGE_BUDGET * 0.8
  return (
    <>
      <p className="patch-path">My patches</p>
      <label className="my-patch-name">
        Name
        <input
          key={entry.id}
          defaultValue={entry.name}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()
            if (!name) event.currentTarget.value = entry.name
            else if (name !== entry.name) setFailure(rename(name))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </label>
      <p>Saved {new Date(entry.savedAt).toLocaleString()}</p>
      <p className="my-patches-storage" data-warning={nearlyFull}>
        Stored in this browser · {size(usage)} of about {size(STORAGE_BUDGET)} used
        {nearlyFull ? '. Export patches you want to keep, then delete them here.' : ''}
      </p>
      <details className="patch-source">
        <summary>Strudel source</summary>
        <pre>{entry.source}</pre>
      </details>
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      <div className="patch-load my-patch-actions">
        <button type="button" className="button button-primary load-patch" onClick={load}>
          Load patch
        </button>
        <button type="button" onClick={exportFile}>
          Export
        </button>
        <button type="button" className="button destructive" onClick={remove}>
          Delete
        </button>
      </div>
    </>
  )
}
