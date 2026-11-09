import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { SourceDocument } from '../reader/types'
import {
  getSamplePacks,
  getSampleWarnings,
  subscribeSamplePacks,
  type SamplePackResource,
} from '../strudel/engine'
import { usePackWarning } from './packWarning'
import { cartridges, ejectPack, packUsers, seatPack } from '../workspace/cartridges'
import { FACTORY_PACKS, packKey, packLabel, userPack, type SamplePack } from './packs'
import './CartridgeBay.css'

const STATUS_TEXT = {
  unknown: 'not loaded',
  loading: 'loading',
  registered: 'ready',
  failed: 'failed',
} as const
const OWNERSHIP_TEXT = { factory: 'built in', source: 'from your code', bay: 'added here' } as const
const FACTORY_ACCENTS = ['#c9622a', '#3b78b8']
const USER_ACCENTS = ['#6b4bb0', '#2f8f6b', '#b0446b', '#8a7a2a']

function accent(pack: SamplePack | undefined): string {
  if (!pack) return '#6f747b'
  const factory = FACTORY_PACKS.findIndex((p) => packKey(p) === packKey(pack))
  if (factory >= 0) return FACTORY_ACCENTS[factory] ?? '#6f747b'
  let hash = 0
  for (const char of packKey(pack)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return USER_ACCENTS[hash % USER_ACCENTS.length] ?? '#6f747b'
}

function soundCount(resource: SamplePackResource | undefined): string {
  if (resource?.status !== 'registered') return '? sounds'
  const count = resource.sounds.length
  return `${count} ${count === 1 ? 'sound' : 'sounds'}`
}

/** Hostnames and repo names have no spaces; let them wrap after their separators. */
function breakable(name: string) {
  return name
    .split(/(?<=[./_-])/)
    .flatMap((part, index) => (index ? [<wbr key={index} />, part] : [part]))
}

export function CartridgeBay({
  document,
  locked,
  install,
}: {
  document: SourceDocument
  locked: boolean
  install: (next: SourceDocument) => void
}) {
  const resources = useSyncExternalStore(subscribeSamplePacks, getSamplePacks)
  const warnings = useSyncExternalStore(subscribeSamplePacks, getSampleWarnings)
  const id = useId()
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    document: SourceDocument
    pack: SamplePack
    users: string[]
  } | null>(null)
  const entries = cartridges(document).map((entry, index) => {
    const { pack } = entry
    const resource = pack && resources.find((r) => r.key === packKey(pack))
    return {
      ...entry,
      // Imported source may repeat a call, so the position keeps keys unique.
      key: `${pack ? packKey(pack) : entry.start}-${index}`,
      resource,
      label: pack ? packLabel(pack) : { name: 'samples()', branch: 'computed source' },
      status: resource?.status ?? 'unknown',
      source: pack?.source ?? entry.text,
    }
  })
  const [pinned, setPinned] = useState<string | null>(null)
  const inspected = hovered ?? focused ?? pinned
  const shown = entries.find((entry) => entry.key === inspected)
  const slot = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (adding) field.current?.focus()
    else if (returnFocus.current) slot.current?.focus()
    returnFocus.current = false
  }, [adding])
  const hasWarning = usePackWarning(document) || !!error
  function eject(pack: SamplePack) {
    try {
      install(ejectPack(document, pack))
      setPending(null)
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  function closeForm() {
    returnFocus.current = true
    setAdding(false)
    setInput('')
    setError(null)
  }
  return (
    <section className="cartridge-bay" aria-label="Sample packs" data-warning={hasWarning}>
      {hasWarning && <p className="pack-warning">Pack warning · see below</p>}
      <ul className="cartridges">
        {entries.map((entry, index) => {
          const { pack, label, status, resource } = entry
          return (
            <li
              className="cartridge"
              key={entry.key}
              style={{ '--cartridge-accent': accent(pack) } as CSSProperties}
            >
              {/* Hover and focus preview the readout; a press pins it for touch. */}
              <button
                type="button"
                className="cartridge-label"
                aria-pressed={pinned === entry.key}
                aria-describedby={`${id}-source-${index}`}
                onClick={() => setPinned(pinned === entry.key ? null : entry.key)}
                onMouseEnter={() => setHovered(entry.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => {
                  // The latest interaction wins: a stale hover must not hide the focused source.
                  setHovered(null)
                  setFocused(entry.key)
                }}
                onBlur={() => setFocused(null)}
              >
                <strong>{breakable(label.name)}</strong>
                <span>{label.branch}</span>
                <span>{soundCount(resource)}</span>
                <span className="cartridge-status">
                  <span className="cartridge-led" data-status={status} aria-hidden="true" />
                  {STATUS_TEXT[status]}
                </span>
                <span className="sr-only" id={`${id}-source-${index}`}>
                  {OWNERSHIP_TEXT[entry.ownership]}. Source: {entry.source}
                </span>
              </button>
              {entry.ownership === 'bay' && pack && (
                <button
                  type="button"
                  className="cartridge-eject-button"
                  disabled={locked}
                  aria-label={`Eject ${label.name}`}
                  onClick={() => {
                    const users = packUsers(document, resource?.names ?? [])
                    if (users.length) setPending({ document, pack, users })
                    else eject(pack)
                  }}
                >
                  Eject
                </button>
              )}
            </li>
          )
        })}
        {!adding && (
          <li className="cartridge-slot">
            <button ref={slot} type="button" disabled={locked} onClick={() => setAdding(true)}>
              + Add sample pack
            </button>
          </li>
        )}
      </ul>
      {adding && (
        <form
          className="cartridge-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (locked) return
            try {
              install(seatPack(document, userPack(input)))
              closeForm()
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : String(failure))
            }
          }}
        >
          <label>
            Pack address
            <input
              ref={field}
              value={input}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeForm()
              }}
              onChange={(event) => setInput(event.currentTarget.value)}
              disabled={locked}
              placeholder="github:owner/repo[/branch] or strudel.json URL"
            />
          </label>
          <button type="submit" disabled={locked || !input.trim()}>
            Add pack
          </button>
          <button type="button" onClick={closeForm}>
            Cancel
          </button>
        </form>
      )}
      <div className="cartridge-readout" aria-hidden="true">
        {shown ? (
          <>
            <b>
              {shown.label.name} · {shown.label.branch} · {OWNERSHIP_TEXT[shown.ownership]}
              {shown.resource?.sampleCount != null && ` · ${shown.resource.sampleCount} files`}
            </b>
            <code>{shown.source}</code>
          </>
        ) : (
          <span>Point at or focus a pack to see its source.</span>
        )}
      </div>
      {entries.map(
        (entry) =>
          entry.resource?.error && (
            <output className="cartridge-error" key={entry.key}>
              {entry.label.name} failed: {entry.resource.error}. Other voices can continue.
            </output>
          ),
      )}
      {warnings.map((warning) => (
        <output className="cartridge-error" key={warning}>
          Unavailable sample voice skipped after a pack failure: {warning}. Other voices continue.
        </output>
      ))}
      {error && <p role="alert">{error}</p>}
      {pending?.document === document && (
        <fieldset className="cartridge-eject">
          <legend>Eject {packLabel(pending.pack).name}?</legend>
          <p>
            {pending.users.join(', ')} may still use this pack. Its sounds will be unavailable when
            this patch is reopened without it.
          </p>
          <button type="button" disabled={locked} onClick={() => eject(pending.pack)}>
            Eject anyway
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </fieldset>
      )}
    </section>
  )
}
