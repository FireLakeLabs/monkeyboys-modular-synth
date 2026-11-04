import { useState, useSyncExternalStore } from 'react'
import type { SourceDocument } from '../reader/types'
import { getSamplePacks, getSampleWarnings, subscribeSamplePacks } from '../strudel/engine'
import { cartridges, ejectPack, packUsers, seatPack } from '../workspace/cartridges'
import { packKey, packLabel, userPack, type SamplePack } from './packs'
import './CartridgeBay.css'

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
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    document: SourceDocument
    pack: SamplePack
    users: string[]
  } | null>(null)
  const entries = cartridges(document)
  const failedPack = entries.some(
    ({ pack }) =>
      pack && resources.find((resource) => resource.key === packKey(pack))?.status === 'failed',
  )
  const hasWarning = Boolean(warnings.length || error || failedPack)
  function eject(pack: SamplePack) {
    try {
      install(ejectPack(document, pack))
      setPending(null)
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  return (
    <details className="cartridge-bay" aria-label="Sample cartridge bay" data-warning={hasWarning}>
      <summary className="cartridge-heading">
        <h2>CARTRIDGES</h2>
        <span>
          {hasWarning
            ? 'Pack warning · expand for details'
            : 'Sample packs · manifests, not decoded audio'}
        </span>
      </summary>
      <ul className="cartridges">
        {entries.map((entry, index) => {
          const { pack } = entry
          const resource = pack && resources.find((r) => r.key === packKey(pack))
          const label = pack ? packLabel(pack) : { name: 'samples()', branch: 'computed source' }
          const status = resource?.status ?? 'unknown'
          return (
            <li className="cartridge" key={`${pack ? packKey(pack) : entry.start}-${index}`}>
              <div className="cartridge-title">
                <span className="cartridge-led" data-status={status} aria-hidden="true" />
                <strong>{label.name}</strong>
                <span>{status === 'unknown' ? 'not loaded' : status}</span>
              </div>
              <code title={pack?.source ?? entry.text}>{pack?.source ?? entry.text}</code>
              <div className="cartridge-caption">
                <span>
                  {label.branch} · {resource?.sampleCount ?? '?'} samples
                </span>
                <span>
                  {entry.ownership === 'factory'
                    ? 'factory'
                    : entry.ownership === 'source'
                      ? 'source-owned'
                      : 'bay-owned'}
                </span>
              </div>
              {resource?.error && (
                <output className="cartridge-error">
                  Pack failed: {resource.error}. Other voices can continue.
                </output>
              )}
              {entry.ownership === 'bay' && pack && (
                <button
                  type="button"
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
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (locked) return
          try {
            install(seatPack(document, userPack(input)))
            setInput('')
            setError(null)
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure))
          }
        }}
      >
        <label>
          Seat a sample pack
          <input
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            disabled={locked}
            placeholder="github:owner/repo[/branch] or strudel.json URL"
          />
        </label>
        <button type="submit" disabled={locked || !input.trim()}>
          Seat cartridge
        </button>
      </form>
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
    </details>
  )
}
