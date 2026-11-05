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
import type { SampleSound } from './manifest'
import './SoundCrate.css'

function Card({ sound, report }: { sound: SampleSound; report: (message: string) => void }) {
  const [n, setN] = useState(0)
  const count = variantCount(sound.bank)
  const index = n % Math.max(1, count)
  const choice = { name: sound.name, n: index }
  return (
    <div className="sound-stack" data-sound={sound.name}>
      <button
        type="button"
        className="button sound-card"
        draggable
        disabled={!count}
        aria-label={`Audition ${soundToken(choice)}`}
        onDragStart={(event) => event.dataTransfer.setData(SOUND_MIME, JSON.stringify(choice))}
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
}: {
  document: SourceDocument
  locked: boolean
  active: boolean
}) {
  const resources = useSyncExternalStore(subscribeSamplePacks, getSamplePacks)
  const [filter, setFilter] = useState('')
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
      <label className="sound-search">
        <span className="sr-only">Search sounds</span>
        <input
          type="search"
          value={filter}
          placeholder="Search sounds"
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <p>Click to hear · drag onto a sampler or DRUMS row</p>
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
                  <Card key={sound.name} sound={sound} report={setMessage} />
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
