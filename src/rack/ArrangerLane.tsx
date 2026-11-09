import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { arrangementCells, arrangementLength, MAX_ARRANGEMENT_CYCLES } from '../patch/arrangement'
import type { Patch } from '../patch/types'
import { arrangerRows, paintRow, resizeSong, songCycles, type ArrangerRow } from './arranger'
import type { RackEdit } from './Rack'
import { useCycleClock } from './useCycleClock'

interface Paint {
  key: string
  from: number
  to: number
  on: boolean
}

const keyOf = (row: ArrangerRow) => `${row.mixer}:${row.control}`

/**
 * The arranger lane along the rack's bottom edge (#141): one row per connected MIX channel,
 * one cell per cycle. Each row is that channel's `.mask("<…>")`; painting a range
 * is one rack edit and one undo step.
 */
export function ArrangerLane({
  patch,
  edit,
  locked,
  playing,
}: {
  patch: Patch
  edit: RackEdit
  locked: boolean
  playing: boolean
}) {
  const rows = arrangerRows(patch)
  const length = songCycles(rows)
  const { clock } = useCycleClock()
  const currentCycle = playing ? Math.floor(clock.cycle) % length : null
  const [paint, setPaint] = useState<Paint | null>(null)
  const [focus, setFocus] = useState<Record<string, number>>({})
  const grids = useRef(new Map<string, HTMLFieldSetElement>())
  const repeats = [...new Set(rows.map((row) => arrangementLength(row.lane)).filter(Boolean))]

  function commit(row: ArrangerRow, from: number, to: number, on: boolean) {
    edit((current) => paintRow(current, row, { length, from, to, on }))
  }

  function cellAt(row: ArrangerRow, clientX: number): number {
    const grid = grids.current.get(keyOf(row))
    if (!grid) return 0
    const bounds = grid.getBoundingClientRect()
    const index = Math.floor(((clientX - bounds.left) / bounds.width) * length)
    return Math.max(0, Math.min(length - 1, index))
  }

  function resize(next: number) {
    const bounded = Math.max(1, Math.min(MAX_ARRANGEMENT_CYCLES, next))
    edit((current) => resizeSong(current, bounded))
  }

  function onKey(event: KeyboardEvent, row: ArrangerRow, index: number) {
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: length - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(length - 1, target))
    setFocus((current) => ({ ...current, [keyOf(row)]: next }))
    grids.current
      .get(keyOf(row))
      ?.querySelector<HTMLButtonElement>(`[data-cycle="${next}"]`)
      ?.focus()
  }

  const arranged = rows.filter((row) => row.lane).length
  // A footer popover, like Connections, so opening it never resizes the rack frame.
  return (
    <details name="rack-popover" className="arranger-popover rack-popover">
      <summary>Arrange{arranged ? ` (${arranged})` : ''}</summary>
      <section className="arranger" aria-label="Arranger" inert={locked}>
        <header className="arranger-header">
          <h3>ARRANGE</h3>
          <fieldset className="arranger-length" aria-label="Song length">
            <button
              type="button"
              aria-label="Shorter song"
              disabled={!arranged || length <= 1}
              onClick={() => resize(length - 1)}
            >
              −
            </button>
            <output aria-live="polite">{length} cycles</output>
            <button
              type="button"
              aria-label="Longer song"
              disabled={!arranged || length >= MAX_ARRANGEMENT_CYCLES}
              onClick={() => resize(length + 1)}
            >
              +
            </button>
          </fieldset>
          <span className="arranger-hint">
            {rows.length
              ? repeats.length > 1
                ? `△ Lanes repeat every ${repeats.join(', ')} cycles, so they drift apart`
                : 'Drag across cycles to play or rest a channel'
              : 'Patch voices into MIX to arrange them'}
          </span>
        </header>
        {rows.length > 0 && (
          <div className="arranger-rows" style={{ '--cycles': length } as CSSProperties}>
            <div className="arranger-ruler" aria-hidden="true">
              <span />
              <div className="arranger-grid">
                {Array.from({ length }, (_, i) => (
                  <span key={i} data-current={i === currentCycle}>
                    {i % 4 === 0 ? i + 1 : ''}
                  </span>
                ))}
              </div>
              <span />
            </div>
            {rows.map((row) => {
              const key = keyOf(row)
              const cells = arrangementCells(row.lane, length)
              const active = paint?.key === key ? paint : null
              const painted = (i: number) =>
                active &&
                i >= Math.min(active.from, active.to) &&
                i <= Math.max(active.from, active.to)
                  ? active.on
                  : cells[i]
              const focused = Math.min(focus[key] ?? 0, length - 1)
              return (
                <div className="arranger-row" key={key} data-routed={row.routed}>
                  <span className="arranger-label" title={`${row.mixer} channel ${row.channel}`}>
                    {row.label}
                  </span>
                  <fieldset
                    className="arranger-grid"
                    aria-label={`${row.label} lane`}
                    ref={(element) => {
                      if (element) grids.current.set(key, element)
                      else grids.current.delete(key)
                    }}
                    onPointerMove={(event: PointerEvent) => {
                      if (active) setPaint({ ...active, to: cellAt(row, event.clientX) })
                    }}
                    onPointerUp={() => {
                      if (!active) return
                      setPaint(null)
                      commit(row, active.from, active.to, active.on)
                    }}
                    onPointerCancel={() => setPaint(null)}
                  >
                    {cells.map((_, i) => (
                      <button
                        type="button"
                        key={i}
                        data-cycle={i}
                        aria-current={i === currentCycle ? 'step' : undefined}
                        className="arranger-cell"
                        aria-pressed={painted(i)}
                        aria-label={`${row.label} cycle ${i + 1}`}
                        tabIndex={i === focused ? 0 : -1}
                        onFocus={() => setFocus((current) => ({ ...current, [key]: i }))}
                        onKeyDown={(event) => onKey(event, row, i)}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.preventDefault()
                          event.currentTarget.parentElement?.setPointerCapture(event.pointerId)
                          setPaint({ key, from: i, to: i, on: !cells[i] })
                        }}
                        onClick={(event) => {
                          // Pointer gestures commit on release; this is Enter or Space.
                          if (event.detail === 0) commit(row, i, i, !cells[i])
                        }}
                      />
                    ))}
                  </fieldset>
                  <code className="arranger-code" title="Written to this channel’s voice">
                    {row.lane ? `.mask("${row.lane}")` : 'every cycle'}
                  </code>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </details>
  )
}
