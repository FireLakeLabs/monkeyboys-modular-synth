import { useState } from 'react'
import { CATALOG } from './modules/catalog'
import type { Family } from './modules/types'
import { play, stop } from './strudel/engine'
import './App.css'

/** A fixed patch for checking the engine until the code generator exists (build step 2). */
const DEMO_CODE = `setcpm(120/4)

$: note("c2 c2 eb2 g2 c3 bb2 g2 eb2")
  .s("sawtooth")
  .lpf(sine.range(800, 2400).slow(4))
  .lpq(8)
  .attack(0.01).decay(0.2)
  .sustain(0.3).release(0.1)
  .gain(0.8)`

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
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function togglePlay() {
    setError(null)
    try {
      if (playing) {
        await stop()
        setPlaying(false)
      } else {
        await play(DEMO_CODE)
        setPlaying(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPlaying(false)
    }
  }

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
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          aria-label={playing ? 'Stop' : 'Play'}
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
          <p className="placeholder">The rack arrives in build step 4. See docs/build-plan.md.</p>
        </section>

        <section className="code" aria-label="Strudel code">
          <h2>STRUDEL</h2>
          <pre>{DEMO_CODE}</pre>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
