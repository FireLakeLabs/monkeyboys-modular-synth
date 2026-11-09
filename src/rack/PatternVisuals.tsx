import type { PlacedModule } from '../patch/types'
import { getModuleSpec } from '../modules/catalog'
import { controlValue } from '../modules/values'
import { useEffect, useRef, useState } from 'react'
import { useCycleClock, useReducedMotion } from './useCycleClock'
import * as engine from '../strudel/engine'
import type { SourceDocument } from '../reader/types'
import { patchCredits } from '../workspace/credits'

export function CycleClock() {
  const { clock, reduced } = useCycleClock()
  return (
    <div className="cycle-clock" aria-label="Cycle clock">
      <output>
        Cycle {Math.floor(clock.cycle)} · {Math.floor((clock.cycle % 1) * 100)}%
      </output>
      <small>setcpm(BPM / 4) · 4 beats/cycle{reduced ? ' · motion paused' : ''}</small>
      <progress aria-label="Position within cycle" max="1" value={clock.cycle % 1} />
    </div>
  )
}

function scopeSettings(module: PlacedModule): { id: number; mode: 'waveform' | 'spectrum' } {
  const spec = getModuleSpec(module.type)
  const settings = Object.fromEntries(
    spec.controls.map((control) => [control.id, controlValue(module, control)]),
  )
  const id = settings['id'],
    mode = settings['mode']
  if (typeof id !== 'number' || (mode !== 'waveform' && mode !== 'spectrum'))
    throw new Error('Invalid SCOPE controls')
  return { id, mode }
}

export function ScopeDisplay({ module }: { module: PlacedModule }) {
  const { id, mode } = scopeSettings(module)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return undefined
    function draw() {
      if (!element || !context) return
      const data = reduced ? undefined : engine.scopeData(id, mode)
      context.clearRect(0, 0, element.width, element.height)
      context.strokeStyle = '#8cf5da'
      context.beginPath()
      const length = data?.length ?? 2
      for (let index = 0; index < length; index++) {
        const value = data?.[index] ?? (mode === 'waveform' ? 0 : -100)
        const amplitude =
          mode === 'waveform' ? (1 - value) / 2 : 1 - Math.max(0, Math.min(1, (value + 100) / 100))
        const x = (index / (length - 1)) * element.width,
          y = amplitude * element.height
        if (index) context.lineTo(x, y)
        else context.moveTo(x, y)
      }
      context.stroke()
    }
    draw()
    const timer = reduced ? undefined : setInterval(draw, 50)
    return () => clearInterval(timer)
  }, [id, mode, reduced])
  return (
    <div className="scope-display">
      {/* A live canvas is an image, not a replaceable img resource. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <canvas ref={canvas} width="240" height="100" aria-label={`Tap ${id} ${mode}`} role="img" />
      <small>{reduced ? 'Motion paused' : 'Live tap · Play to view'}</small>
    </div>
  )
}

export function CableProbe({
  document,
  cable,
  close,
}: {
  document: SourceDocument
  cable: string
  close: () => void
}) {
  const [result, setResult] = useState<engine.ProbeResult | null>(null)
  const [failure, setFailure] = useState('')
  useEffect(() => {
    let active = true
    engine.probe(document, cable, Math.floor(engine.getClock().cycle)).then(
      (next) => {
        if (active) setResult(next)
      },
      (error: unknown) => {
        if (active) setFailure(String(error))
      },
    )
    return () => {
      active = false
    }
  }, [document, cable])
  const values =
    result?.kind === 'events'
      ? [...new Set(result.events.map((event) => JSON.stringify(event.value)))].slice(0, 32)
      : []
  return (
    <section className="cable-probe" aria-label="Cable probe">
      <strong>Pattern probe · {cable}</strong>
      <button type="button" onClick={close} aria-label="Close probe">
        ×
      </button>
      {!result && !failure && <p>Querying readable prefix…</p>}
      {(result?.kind === 'unavailable' || failure) && (
        <p>Not probed · {failure || (result?.kind === 'unavailable' ? result.reason : '')}</p>
      )}
      {result?.kind === 'events' && (
        <>
          <p>
            Cycles {result.begin}–{result.end} · {result.events.length} onsets · no audio
          </p>
          <svg
            viewBox={`0 0 400 ${Math.max(24, values.length * 20)}`}
            aria-label="Next four cycles of prefix events"
          >
            {[0, 1, 2, 3, 4].map((cycle) => (
              <line
                key={cycle}
                x1={cycle * 100}
                x2={cycle * 100}
                y1="0"
                y2={Math.max(24, values.length * 20)}
                stroke="#555"
              />
            ))}
            {result.events.map((event, index) => {
              const row = values.indexOf(JSON.stringify(event.value))
              return row < 0 ? null : (
                <rect
                  key={index}
                  x={(event.begin - result.begin) * 100}
                  y={row * 20 + 3}
                  width={Math.max(
                    2,
                    Math.min(event.end, result.end) * 100 -
                      Math.max(event.begin, result.begin) * 100,
                  )}
                  height="12"
                  fill="#e6d35f"
                >
                  <title>
                    {JSON.stringify(event.value)} · {event.begin}–{event.end}
                  </title>
                </rect>
              )
            })}
          </svg>
          <ul>
            {values.map((value) => (
              <li key={value}>
                <code>{value}</code>
              </li>
            ))}
          </ul>
          {values.length === 32 && <small>Showing the first 32 event values.</small>}
        </>
      )}
    </section>
  )
}

export function PatchCredits({ source }: { source: string }) {
  const credits = patchCredits(source)
  if (!credits.length) return null
  return (
    <details className="patch-credits">
      <summary>Patch credits</summary>
      <dl>
        {credits.map((credit, index) => (
          <div key={index}>
            <dt>@{credit.tag}</dt>
            <dd>{credit.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
