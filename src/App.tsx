import { useState, useSyncExternalStore } from 'react'
import { CATALOG, getModuleSpec } from './modules/catalog'
import { generate } from './codegen/generate'
import { demoPatch } from './patch/demo'
import type { Family } from './modules/types'
import { createPlayback } from './strudel/playback'
import './App.css'

const FAMILY_LABELS: Record<Family, string> = {
  hardware: 'Hardware',
  alien: 'Alien',
  cyber: 'Cyber',
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#F4A462" />
      <ellipse cx="36" cy="40" rx="6" ry="9" fill="#1a1b20" />
      <ellipse cx="64" cy="40" rx="6" ry="9" fill="#1a1b20" />
      <path
        d="M27 58 Q50 84 73 58"
        fill="none"
        stroke="#1a1b20"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function App() {
  const [patch, setPatch] = useState(demoPatch)
  const [playback] = useState(() => createPlayback(patch))
  const audio = useSyncExternalStore(playback.subscribe, playback.getSnapshot)
  const [error, setError] = useState<string | null>(null)
  const playing = ['starting', 'playing', 'applying'].includes(audio.status)
  const code = generate(patch)

  async function togglePlay() {
    if (playing) await playback.stop()
    else await playback.play()
  }

  async function changeValue(moduleId: string, controlId: string, value: number) {
    try {
      const next = {
        ...patch,
        modules: patch.modules.map((module) =>
          module.id === moduleId
            ? { ...module, values: { ...module.values, [controlId]: value } }
            : module,
        ),
      }
      const applying = playback.update(next)
      setPatch(next)
      setError(null)
      await applying
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const status = {
    stopped: 'Stopped',
    starting: 'Starting…',
    playing: 'Playing',
    applying: 'Applying…',
    stopping: 'Stopping…',
    error: 'Playback error',
  }[audio.status]

  const families: Family[] = ['hardware', 'alien', 'cyber']

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <h1>
            <span className="wordmark">MONKEYBOY’S</span>
            <span className="tagline">MODULAR SYNTH</span>
          </h1>
        </div>
        <output className="transport-status">{status}</output>
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          aria-label={playing ? 'Stop' : 'Play'}
          disabled={audio.status === 'stopping'}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13.5 8 L4 13.5 Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </header>

      <main className="workspace">
        <aside className="library" aria-label="Module library">
          {families.map((family) => (
            <section key={family}>
              <h2>{FAMILY_LABELS[family]}</h2>
              <ul>
                {CATALOG.filter((m) => m.family === family).map((m) => (
                  <li key={m.id} className={`chip chip-${m.family} cat-${m.category}`}>
                    <span className="chip-name">{m.name}</span>
                    <span className="chip-title">{m.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <section className="rack" aria-label="Rack">
          <div className="playback-patch">
            <h2>Playback patch</h2>
            <p>SEQ → OSC → VCF → VCA → OUT</p>
            <p className="placeholder">
              Adjust values while playing. The rack editor arrives in build step 4.
            </p>
            {patch.modules
              .filter((module) => ['vcf', 'out'].includes(module.type))
              .map((module) => {
                const spec = getModuleSpec(module.type)
                return spec.controls
                  .filter(
                    (control) =>
                      control.kind === 'knob' && ['cutoff', 'bpm', 'vol'].includes(control.id),
                  )
                  .map((control) => {
                    if (control.kind !== 'knob') return null
                    const value = module.values[control.id] ?? control.default
                    if (typeof value !== 'number') return null
                    return (
                      <label className="playback-control" key={`${module.id}-${control.id}`}>
                        <span>
                          {spec.name} {control.label}
                        </span>
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={value}
                          onChange={(event) =>
                            changeValue(module.id, control.id, Number(event.target.value))
                          }
                        />
                        <output>
                          {value}
                          {control.unit ? ` ${control.unit}` : ''}
                        </output>
                      </label>
                    )
                  })
              })}
            <p className="placeholder">
              Stop ends scheduling; notes and effect tails may ring out.
            </p>
          </div>
        </section>

        <section className="code" aria-label="Strudel code">
          <h2>STRUDEL</h2>
          <pre>{code}</pre>
          {(error || audio.error) && (
            <p className="error" role="alert">
              {error || audio.error}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
