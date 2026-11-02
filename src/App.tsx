import { useRef, useState, useSyncExternalStore } from 'react'
import { generateDocument } from './codegen/generate'
import { RACK_MARKER } from './codegen/layout'
import { Rack, type RackEdit } from './rack/Rack'
import { starterPatch } from './rack/model'
import { createPlayback } from './strudel/playback'
import './App.css'
import './rack/Rack.css'

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
  const [patch, setPatch] = useState(starterPatch)
  const [playback] = useState(() => createPlayback(patch))
  const audio = useSyncExternalStore(playback.subscribe, playback.getSnapshot)
  const [error, setError] = useState<string | null>(null)
  const playing = ['starting', 'playing', 'applying'].includes(audio.status)
  const [selected, setSelected] = useState<string | null>(null)
  const currentPatch = useRef(patch)
  const document = generateDocument(patch)
  const marker = document.code.lastIndexOf(RACK_MARKER)
  const source = document.code.slice(0, marker)
  const selectedRanges = selected ? (document.ranges[selected] ?? []) : []
  const codeLines = source
    .trimEnd()
    .split('\n')
    .map((text, index) => {
      const start = source
        .split('\n')
        .slice(0, index)
        .reduce((n, line) => n + line.length + 1, 0)
      const lineOffset = start + text.length + 1
      return {
        text,
        selected: selectedRanges.some((range) => range.start < lineOffset && range.end > start),
      }
    })

  async function togglePlay() {
    if (playing) await playback.stop()
    else await playback.play()
  }

  const edit: RackEdit = (action) => {
    try {
      const next = action(currentPatch.current)
      const applying = playback.update(next)
      currentPatch.current = next
      setPatch(next)
      setError(null)
      applying.catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure)),
      )
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    }
  }

  async function newPatch(): Promise<boolean> {
    await playback.stop()
    if (playback.getSnapshot().status !== 'stopped') return false
    return edit(starterPatch)
  }

  const status = {
    stopped: 'Stopped',
    starting: 'Starting…',
    playing: 'Playing',
    applying: 'Applying…',
    stopping: 'Stopping…',
    error: 'Playback error',
  }[audio.status]

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
        <Rack
          patch={patch}
          edit={edit}
          selected={selected}
          select={setSelected}
          newPatch={newPatch}
        />

        <section className="code" aria-label="Strudel code">
          <h2>
            STRUDEL <small>Generated live from the rack</small>
          </h2>
          <pre className="source-lines">
            {codeLines.map((line, index) => (
              <span key={index} className={line.selected ? 'code-line highlighted' : 'code-line'}>
                <span className="line-number">{index + 1}</span>
                {line.text || ' '}
                {'\n'}
              </span>
            ))}
          </pre>
          {selected && selectedRanges.length === 0 && (
            <p className="placeholder">{selected} has no sounding code in this patch.</p>
          )}
          <details className="saved-layout">
            <summary>Saved rack state</summary>
            <pre>{document.code.slice(marker)}</pre>
          </details>
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
