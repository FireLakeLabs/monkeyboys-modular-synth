import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { generate } from '../codegen/generate'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import type { JackRef, Patch } from '../patch/types'
import { ControlEditor } from './Controls'
import {
  HP,
  ROW_HEIGHT,
  ROW_HP,
  cableSignal,
  connect,
  freePosition,
  placeModule,
  removeCable,
  removeModule,
  setValue,
} from './model'

export type RackEdit = (action: (patch: Patch) => Patch) => boolean
interface Point {
  x: number
  y: number
}
interface Wiring {
  from: JackRef
  moving?: string
}
interface Placement {
  type: string
  moving?: string
}
const keyOf = (ref: JackRef) => `${ref.module}:${ref.jack}`
const curve = (a: Point, b: Point) =>
  `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + Math.min(120, 28 + Math.abs(a.x - b.x) / 5)} ${b.x} ${b.y}`

export function Rack({
  patch,
  edit,
  selected,
  select,
  newPatch,
}: {
  patch: Patch
  edit: RackEdit
  selected: string | null
  select: (id: string | null) => void
  newPatch: () => Promise<boolean>
}) {
  const surface = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Record<string, Point>>({})
  const [wire, setWire] = useState<Wiring | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [target, setTarget] = useState<JackRef | null>(null)
  const [replacement, setReplacement] = useState<JackRef | null>(null)
  const [selectedCable, setSelectedCable] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [ghost, setGhost] = useState<{ row: number; hp: number | null } | null>(null)
  const [message, setMessage] = useState(
    'Add a module, then drag or click from an output to an input.',
  )
  const [rowCount, setRowCount] = useState(2)
  const [confirmNew, setConfirmNew] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const rows = Math.max(rowCount, ...patch.modules.map((m) => m.row + 1))
  const height = rows * ROW_HEIGHT
  useLayoutEffect(() => {
    const element = surface.current
    if (!element) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      const next: Record<string, Point> = {}
      for (const jack of element.querySelectorAll<HTMLButtonElement>('[data-jack]')) {
        const rect = jack.getBoundingClientRect()
        const id = jack.dataset.jack
        if (id)
          next[id] = {
            x: rect.left + rect.width / 2 - bounds.left,
            y: rect.top + rect.height / 2 - bounds.top,
          }
      }
      setPoints(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const module of element.querySelectorAll('.module-panel')) observer.observe(module)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [patch, rows])

  function clearWire() {
    setWire(null)
    setPointer(null)
    setTarget(null)
    setReplacement(null)
  }
  function cancel() {
    clearWire()
    setPlacement(null)
    setGhost(null)
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
        setMessage('Cancelled')
      }
    }
    const outsideDrop = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-jack], .replace-prompt'))
        clearWire()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('pointerup', outsideDrop)
    window.addEventListener('pointercancel', clearWire)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('pointerup', outsideDrop)
      window.removeEventListener('pointercancel', clearWire)
    }
  }, [])
  function candidate(to: JackRef): { valid: boolean; uncertain?: boolean; message: string } {
    if (!wire) return { valid: false, message: '' }
    try {
      connect(patch, wire.from, to, true, wire.moving)
      const signal = cableSignal(patch, wire.from)
      const occupied = patch.cables.some((c) => keyOf(c.to) === keyOf(to) && c.id !== wire.moving)
      return {
        valid: true,
        uncertain: signal === 'any',
        message: occupied
          ? `Replace ${to.module} ${to.jack} connection?`
          : `${keyOf(wire.from)} → ${keyOf(to)} · ${signal === 'any' ? 'signal unresolved until its source is connected' : signal}`,
      }
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  function finish(to: JackRef) {
    if (!wire) return
    const result = candidate(to)
    setMessage(result.message)
    if (!result.valid) {
      cancel()
      return
    }
    if (patch.cables.some((c) => keyOf(c.to) === keyOf(to) && c.id !== wire.moving)) {
      setReplacement(to)
      return
    }
    edit((p) => connect(p, wire.from, to, false, wire.moving))
    cancel()
  }
  function place(row: number, hp: number) {
    if (!placement) return
    if (edit((p) => placeModule(p, placement.type, row, hp, placement.moving))) {
      setRowCount(Math.max(rows, row + 1))
      setMessage(`${getModuleSpec(placement.type).name} placed`)
    }
    setPlacement(null)
    setGhost(null)
  }
  const currentCable = patch.cables.find((c) => c.id === selectedCable)
  const module = patch.modules.find((m) => m.id === selected)
  const warnings = patch.cables.flatMap((c) => {
    const signal = cableSignal(patch, c.from)
    const split = patch.cables.filter((other) => keyOf(other.from) === keyOf(c.from)).length > 1
    const from = patch.modules.find((m) => m.id === c.from.module)
    const to = patch.modules.find((m) => m.id === c.to.module)
    return signal === 'audio' && split
      ? [`${c.from.module}: audio split plays each connected branch; levels add.`]
      : from?.type === 'reverb' && to?.type === 'delay'
        ? ['Strudel applies delay before reverb, regardless of cable order.']
        : []
  })
  return (
    <>
      <aside className="library" aria-label="Module library">
        <h2>MODULES</h2>
        {(['hardware', 'alien', 'cyber'] as const).map((family) => (
          <section key={family}>
            <h3>{family}</h3>
            <ul>
              {CATALOG.filter((m) => m.family === family).map((spec) => (
                <li key={spec.id}>
                  <button
                    type="button"
                    draggable
                    className={`chip cat-${spec.category}`}
                    disabled={!!spec.unique && patch.modules.some((m) => m.type === spec.id)}
                    aria-label={`Add ${spec.name}`}
                    title={`${spec.title} · ${spec.hp} HP · click to add or drag onto a rail`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', spec.id)
                      setPlacement({ type: spec.id })
                    }}
                    onDragEnd={() => {
                      setPlacement(null)
                      setGhost(null)
                    }}
                    onClick={() => {
                      for (let row = 0; row <= rows; row++)
                        if (freePosition(patch, spec.id, row, 0) !== null) {
                          edit((p) => placeModule(p, spec.id, row))
                          setRowCount(Math.max(rows, row + 1))
                          break
                        }
                    }}
                  >
                    <span className="chip-name">{spec.name}</span>
                    <span className="chip-title">{spec.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
      <div className="rack" aria-label="Rack">
        <div className="rack-toolbar">
          <h2>
            RACK <small>{patch.modules.length} modules</small>
          </h2>
          <button type="button" onClick={() => setConfirmNew(true)}>
            New patch
          </button>
        </div>
        <div className="rack-scroll">
          <div
            ref={surface}
            className="rack-surface"
            style={{ width: ROW_HP * HP, height }}
            onDragOver={(event) => {
              if (!placement) return
              event.preventDefault()
              const bounds = event.currentTarget.getBoundingClientRect()
              const row = Math.max(
                0,
                Math.min(rows - 1, Math.floor((event.clientY - bounds.top) / ROW_HEIGHT)),
              )
              const hp = freePosition(
                patch,
                placement.type,
                row,
                Math.round((event.clientX - bounds.left) / HP),
                placement.moving,
              )
              setGhost({ row, hp })
              if (hp === null) setMessage('No room here — drop on + Add row')
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (ghost?.hp !== null && ghost) place(ghost.row, ghost.hp)
            }}
            onPointerMove={(event) => {
              if (wire && surface.current) {
                const b = surface.current.getBoundingClientRect()
                setPointer({ x: event.clientX - b.left, y: event.clientY - b.top })
              }
            }}
            onPointerUp={(event) => {
              if (wire && event.target instanceof Element && !event.target.closest('[data-jack]'))
                cancel()
            }}
          >
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="rack-row" style={{ top: row * ROW_HEIGHT }}>
                <span className="row-label">
                  {row + 1} / {ROW_HP} HP
                </span>
                {!patch.modules.some((m) => m.row === row) && row === rows - 1 && rows > 1 && (
                  <button
                    type="button"
                    className="remove-row"
                    onClick={() => setRowCount(rows - 1)}
                  >
                    Remove row
                  </button>
                )}
              </div>
            ))}
            {patch.modules.map((m) => {
              const spec = getModuleSpec(m.type)
              return (
                <section
                  key={m.id}
                  aria-label={`${spec.name} ${m.id}`}
                  className={`module-panel cat-${spec.category} family-${spec.family} ${selected === m.id ? 'selected' : ''}`}
                  style={{ left: m.hp * HP, top: m.row * ROW_HEIGHT + 20, width: spec.hp * HP }}
                >
                  <button
                    type="button"
                    className="module-header"
                    aria-label={`Select ${m.id}`}
                    aria-pressed={selected === m.id}
                    draggable
                    onClick={() => select(m.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', m.id)
                      setPlacement({ type: m.type, moving: m.id })
                    }}
                    onDragEnd={() => {
                      setPlacement(null)
                      setGhost(null)
                    }}
                  >
                    <span className="module-dot" />
                    <strong>{spec.name}</strong>
                    <small>{spec.title}</small>
                  </button>
                  <div
                    className="module-controls"
                    onFocus={() => select(m.id)}
                    onPointerDown={() => select(m.id)}
                  >
                    {spec.controls.map((control) => (
                      <ControlEditor
                        key={control.id}
                        patch={patch}
                        module={m}
                        control={control}
                        commit={(value) => edit((p) => setValue(p, m.id, control.id, value))}
                      />
                    ))}
                  </div>
                  <div className="patch-box">
                    {spec.jacks.map((jack) => {
                      const ref = { module: m.id, jack: jack.id }
                      const state = wire && jack.direction === 'in' ? candidate(ref) : null
                      const connected = patch.cables.some(
                        (c) => keyOf(c.from) === keyOf(ref) || keyOf(c.to) === keyOf(ref),
                      )
                      return (
                        <div key={jack.id} className="jack-label">
                          <button
                            type="button"
                            data-jack={keyOf(ref)}
                            className={`jack signal-${jack.signal} ${connected ? 'connected' : ''} ${state ? (state.valid ? 'valid' : 'blocked') : ''}`}
                            aria-label={`${m.id} ${jack.label} ${jack.direction}`}
                            title={
                              state?.message ?? `${jack.label} · ${jack.signal} ${jack.direction}`
                            }
                            onPointerDown={(event) => {
                              if (jack.direction === 'out' && event.button === 0) {
                                setWire({ from: ref })
                                setPointer(points[keyOf(ref)] ?? null)
                                setReplacement(null)
                              }
                            }}
                            onPointerEnter={() => {
                              if (wire && jack.direction === 'in') {
                                setTarget(ref)
                                setMessage(candidate(ref).message)
                              }
                            }}
                            onPointerLeave={() => setTarget(null)}
                            onPointerUp={() => {
                              if (wire && jack.direction === 'in') finish(ref)
                            }}
                            onClick={(event) => {
                              if (event.detail === 0) {
                                if (jack.direction === 'out') setWire({ from: ref })
                                else finish(ref)
                              } else if (!wire && jack.direction === 'out') setWire({ from: ref })
                            }}
                          />
                          <span>
                            {jack.label}
                            {state ? (state.uncertain ? ' △' : state.valid ? ' ✓' : ' ×') : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <span className="module-id">{m.id}</span>
                </section>
              )
            })}
            {placement && ghost?.hp !== null && ghost && (
              <div
                className="placement-ghost"
                style={{
                  left: ghost.hp * HP,
                  top: ghost.row * ROW_HEIGHT + 20,
                  width: getModuleSpec(placement.type).hp * HP,
                }}
              >
                {getModuleSpec(placement.type).name}
              </div>
            )}
            <svg className="cables" width={ROW_HP * HP} height={height} aria-label="Patch cables">
              {patch.cables.map((c) => {
                const a = points[keyOf(c.from)],
                  b = points[keyOf(c.to)]
                return a && b ? (
                  <g
                    key={c.id}
                    className={`cable signal-${cableSignal(patch, c.from)} ${selectedCable === c.id ? 'selected-cable' : ''}`}
                  >
                    <path d={curve(a, b)} className="cable-shadow" />
                    <path
                      d={curve(a, b)}
                      onClick={() => {
                        setSelectedCable(c.id)
                        cancel()
                      }}
                    >
                      <title>
                        {keyOf(c.from)} → {keyOf(c.to)}
                      </title>
                    </path>
                  </g>
                ) : null
              })}
              {wire && points[keyOf(wire.from)] && (pointer || target) && (
                <path
                  className={`provisional signal-${cableSignal(patch, wire.from)}`}
                  d={curve(
                    points[keyOf(wire.from)] ?? { x: 0, y: 0 },
                    (target && points[keyOf(target)]) || pointer || { x: 0, y: 0 },
                  )}
                />
              )}
            </svg>
          </div>
        </div>
        <button
          type="button"
          className="add-row"
          onClick={() => setRowCount(rows + 1)}
          onDragOver={(event) => {
            if (placement) event.preventDefault()
          }}
          onDrop={(event) => {
            event.preventDefault()
            place(rows, 0)
          }}
        >
          + Add row
        </button>
        <div className="rack-status" aria-live="polite">
          {message}
          {wire && (
            <button type="button" onClick={cancel}>
              Cancel cable
            </button>
          )}
        </div>
        {confirmNew && (
          <fieldset className="replace-prompt">
            <legend>Replace this patch?</legend>
            <button type="button" onClick={() => setConfirmNew(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([generate(patch)], { type: 'text/plain' }))
                const link = document.createElement('a')
                link.href = url
                link.download = 'monkeyboy.strudel'
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}
            >
              Export current
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await newPatch()) {
                  select(null)
                  cancel()
                  setSelectedCable(null)
                  setRowCount(2)
                  setConfirmNew(false)
                  setMessage('New silent patch')
                }
              }}
            >
              Replace patch
            </button>
          </fieldset>
        )}
        {deleteId && (
          <fieldset className="replace-prompt">
            <legend>
              Delete {deleteId} and its{' '}
              {
                patch.cables.filter((c) => c.from.module === deleteId || c.to.module === deleteId)
                  .length
              }{' '}
              cables?
            </legend>
            <button type="button" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (edit((p) => removeModule(p, deleteId))) {
                  select(null)
                  cancel()
                  setDeleteId(null)
                }
              }}
            >
              Delete module
            </button>
          </fieldset>
        )}
        {replacement && wire && (
          <fieldset className="replace-prompt">
            <legend>Replace connection</legend>
            <p>
              Replace {replacement.module} {replacement.jack} connection?
            </p>
            <button
              type="button"
              ref={(element) => {
                element?.focus()
              }}
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                edit((p) => connect(p, wire.from, replacement, true, wire.moving))
                cancel()
              }}
            >
              Replace
            </button>
          </fieldset>
        )}
        {module && (
          <div className="selection-tools">
            <span>
              {module.id} · {getModuleSpec(module.type).hp} HP
            </span>
            <button type="button" onClick={() => setDeleteId(module.id)}>
              Delete {module.id} and attached cables
            </button>
          </div>
        )}
        <details className="connections">
          <summary>Connections ({patch.cables.length})</summary>
          {patch.cables.map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={selectedCable === c.id}
              onClick={() => setSelectedCable(c.id)}
            >
              {keyOf(c.from)} → {keyOf(c.to)}
            </button>
          ))}
        </details>
        {currentCable && (
          <div className="selection-tools">
            <span>
              {keyOf(currentCable.from)} → {keyOf(currentCable.to)}
            </span>
            <button
              type="button"
              onClick={() => {
                edit((p) => removeCable(p, currentCable.id))
                setSelectedCable(null)
              }}
            >
              Remove cable
            </button>
            <button
              type="button"
              onClick={() => {
                setWire({ from: currentCable.from, moving: currentCable.id })
                setMessage(
                  'Choose a new input. Original cable stays until accepted. Escape cancels.',
                )
              }}
            >
              Move destination
            </button>
          </div>
        )}
        {[...new Set(warnings)].map((warning) => (
          <p className="rack-warning" key={warning}>
            △ {warning}
          </p>
        ))}
      </div>
    </>
  )
}
