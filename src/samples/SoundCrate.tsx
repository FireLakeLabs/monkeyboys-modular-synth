import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import type { SourceDocument } from '../reader/types'
import {
  auditionSample,
  getSamplePacks,
  loadSamplePacks,
  subscribeSamplePacks,
} from '../strudel/engine'
import { cartridges } from '../workspace/cartridges'
import { packKey, packLabel } from './packs'
import { seatedResources, SOUND_MIME, soundToken, variantCount } from './crate'
import type { SoundChoice, SoundAssignment } from './crate'
import type { SampleSound } from './manifest'
import './SoundCrate.css'

/** The dock is choosing for one sound slot; each new request carries a new serial. */
export interface SoundPick {
  module: string
  query: string
  serial: number
  done: () => void
}

function RowChooser({
  choice,
  rows,
  choose,
  cancel,
}: {
  choice: SoundChoice
  rows: readonly string[]
  choose: (row: number) => void
  cancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="sound-row-chooser"
      aria-label="Choose DRUMS row"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation()
      }}
      onCancel={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      <h2>Assign {soundToken(choice)}</h2>
      <p>Choose a DRUMS row</p>
      {rows.map((text, row) => (
        <button
          type="button"
          key={row}
          onClick={() => {
            try {
              choose(row)
            } catch (error) {
              setError(String(error))
            }
          }}
        >
          Row {row + 1}: <span>{text}</span>
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={cancel}>
        Cancel
      </button>
    </dialog>
  )
}

function Card({
  sound,
  report,
  assign,
  dragging,
  picking,
}: {
  sound: SampleSound
  report: (message: string) => void
  assign: (choice: SoundChoice, row?: number) => SoundAssignment
  dragging: (choice: SoundChoice | null) => void
  /** The module the dock is choosing for, if any. */
  picking: string | null
}) {
  const [n, setN] = useState(0)
  const [pending, setPending] = useState<{ choice: SoundChoice; rows: readonly string[] } | null>(
    null,
  )
  const count = variantCount(sound.bank)
  const index = n % Math.max(1, count)
  const choice = { name: sound.name, n: index }
  function requestAssignment() {
    try {
      const result = assign(choice)
      if (result.kind === 'choose-row') {
        setPending({ choice, rows: result.rows })
        report(`Choose a DRUMS row for ${soundToken(choice)}`)
      } else report(`Assigned ${soundToken(choice)}${picking ? ` to ${picking}` : ''}`)
    } catch (error) {
      report(String(error))
    }
  }
  return (
    <div className="sound-stack" data-sound={sound.name}>
      {pending && (
        <RowChooser
          choice={pending.choice}
          rows={pending.rows}
          cancel={() => {
            setPending(null)
            report('Sound assignment cancelled')
          }}
          choose={(row) => {
            const result = assign(pending.choice, row)
            if (result.kind !== 'assigned') throw new Error('Choose a DRUMS row')
            report(`Assigned ${soundToken(pending.choice)} to row ${row + 1}`)
            setPending(null)
          }}
        />
      )}

      <button
        type="button"
        className="button sound-card"
        draggable
        disabled={!count}
        aria-label={`Audition ${soundToken(choice)}`}
        onDragStart={(event) => {
          event.dataTransfer.setData(SOUND_MIME, JSON.stringify(choice))
          dragging(choice)
          const label = document.createElement('div')
          label.textContent = soundToken(choice)
          label.className = 'sound-drag-label'
          document.body.append(label)
          event.dataTransfer.setDragImage(label, 8, 8)
          setTimeout(() => label.remove(), 0)
        }}
        onDragEnd={() => dragging(null)}
        onDoubleClick={requestAssignment}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            requestAssignment()
          }
        }}
        onClick={() => {
          auditionSample(choice.name, choice.n)
            .then(() => report(`Auditioned ${soundToken(choice)}`))
            .catch((error) => report(String(error)))
        }}
      >
        <strong>{sound.name}</strong>
        <span>
          {index + 1} / {count} · n={index}
        </span>
      </button>
      {picking && (
        <button
          type="button"
          className="sound-use"
          disabled={!count}
          aria-label={`Use ${soundToken(choice)} for ${picking}`}
          onClick={requestAssignment}
        >
          Use
        </button>
      )}
      {count > 1 && (
        <div className="sound-flip">
          <button
            type="button"
            aria-label={`Previous ${sound.name} variant`}
            onClick={() => setN((index + count - 1) % count)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={`Next ${sound.name} variant`}
            onClick={() => setN((index + 1) % count)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
export function SoundCrate({
  document,
  locked,
  active,
  assign,
  dragging,
  pick,
}: {
  document: SourceDocument
  locked: boolean
  active: boolean
  assign: (choice: SoundChoice, row?: number) => SoundAssignment
  dragging: (choice: SoundChoice | null) => void
  pick: SoundPick | null
}) {
  const resources = useSyncExternalStore(subscribeSamplePacks, getSamplePacks)
  const [filter, setFilter] = useState('')
  // A new pick carries the panel's search into the dock.
  const [seenPick, setSeenPick] = useState(0)
  if (pick && pick.serial !== seenPick) {
    setSeenPick(pick.serial)
    setFilter(pick.query)
  }
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (pick?.serial) search.current?.focus()
  }, [pick?.serial])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const entries = cartridges(document)
  const seated = seatedResources(document, resources)
  function load() {
    setLoading(true)
    loadSamplePacks(entries.flatMap((entry) => (entry.pack ? [entry.pack] : [])))
      .catch((error) => setMessage(String(error)))
      .finally(() => setLoading(false))
  }
  const loadOnFirstVisit = useEffectEvent(load)
  // Sounds load when you first come to browse them, not on every page load.
  const loaded = useRef(false)
  useEffect(() => {
    if (!active || loaded.current) return
    loaded.current = true
    loadOnFirstVisit()
  }, [active])
  return (
    <section className="sound-crate" aria-label="Sound crate" inert={locked}>
      <div className="sound-search">
        {pick && (
          <div className="sound-pick">
            <span>
              Choosing for <code>{pick.module}</code>
            </span>
            <button type="button" onClick={pick.done}>
              Done
            </button>
            <small>Click a card to hear it. Use, double-click or Enter assigns. Esc stops.</small>
          </div>
        )}
        <label>
          <span className="sr-only">Search sounds</span>
          <input
            ref={search}
            type="search"
            value={filter}
            placeholder="Search sounds"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>
      <p>
        Click to hear · drag to a lit panel or DRUMS row · select a module, then double-click or
        Enter to assign
      </p>
      {entries.map((entry, index) => {
        const pack = entry.pack
        const resource = pack && seated.find((resource) => resource.key === packKey(pack))
        const drawers = new Map<string, SampleSound[]>()
        for (const sound of resource?.sounds ?? []) {
          if (!sound.name.toLowerCase().includes(filter.toLowerCase())) continue
          const at = sound.name.lastIndexOf('_')
          const bank = at > 0 && !sound.name.startsWith('wt_') ? sound.name.slice(0, at) : 'Sounds'
          drawers.set(bank, [...(drawers.get(bank) ?? []), sound])
        }
        return (
          <details className="sound-pack" open key={`${entry.start}-${index}`}>
            <summary>
              {entry.pack ? packLabel(entry.pack).name : 'samples()'}
              {resource?.status === 'registered' ? '' : ` · ${resource?.status ?? 'not loaded'}`}
            </summary>
            {resource?.error && <p role="alert">{resource.error}</p>}
            {[...drawers].map(([bank, sounds]) => (
              // Searching opens every match, so search stays the quick way in.
              <details className="sound-bank" key={bank} open={!!filter || bank === 'Sounds'}>
                <summary>
                  {bank} · {sounds.length} sounds
                </summary>
                {sounds.map((sound) => (
                  <Card
                    key={sound.name}
                    sound={sound}
                    report={setMessage}
                    assign={assign}
                    dragging={dragging}
                    picking={pick?.module ?? null}
                  />
                ))}
              </details>
            ))}
          </details>
        )
      })}
      <button type="button" disabled={loading || locked} onClick={load}>
        {loading ? 'Loading sounds…' : 'Refresh sounds'}
      </button>
      <output aria-live="polite">{message}</output>
    </section>
  )
}
