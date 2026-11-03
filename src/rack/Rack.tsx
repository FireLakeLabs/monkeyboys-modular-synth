import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LOOK_LABELS, looksFor } from '../modules/looks'
import { LOOK_LAYOUT } from '../looks/layout'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import type { JackRef, Patch } from '../patch/types'
import { ControlEditor } from './Controls'
import {
  HP,
  ROW_HEIGHT,
  ROW_HP,
  cableSignal,
  assessConnection,
  cableWarnings,
  removeRow,
  addRow,
  rackRows,
  routedModules,
  connect,
  freePosition,
  placeModule,
  removeCable,
  removeModule,
  setValue,
  setLook,
  duplicateModule,
  renameOutput,
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
  cancelReplacement,
  draft,
  locked,
  showCode,
  sourceModules,
}: {
  patch: Patch
  draft: string
  locked: boolean
  showCode: (id: string) => void
  sourceModules: readonly string[]
  edit: RackEdit
  selected: string | null
  select: (id: string | null) => void
  newPatch: () => Promise<boolean>
  cancelReplacement: () => void
}) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [allLooks, setAllLooks] = useState(false)
  const menuModule = patch.modules.find((m) => m.id === menu?.id)
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
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null)
  const wireGesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const routed = routedModules(patch)
  const rows = rackRows(patch)
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
    const contextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const panel = event.target.closest<HTMLElement>('[data-module]')
      const id = panel?.dataset.module
      if (!id || locked) return
      event.preventDefault()
      select(id)
      setMenu({
        id,
        x: Math.min(event.clientX, window.innerWidth - 280),
        y: Math.min(event.clientY, window.innerHeight - 380),
      })
    }
    element.addEventListener('contextmenu', contextMenu)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const module of element.querySelectorAll('.module-panel')) observer.observe(module)
    window.addEventListener('resize', measure)
    return () => {
      element.removeEventListener('contextmenu', contextMenu)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [patch, rows, locked, select])

  function clearWire() {
    setWire(null)
    setPointer(null)
    setTarget(null)
    setReplacement(null)
    wireGesture.current = null
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
        setMenu(null)
        setConfirmNew(false)
        cancelReplacement()
        setDeleteId(null)
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
  }, [cancelReplacement])
  function candidate(to: JackRef) {
    return wire ? assessConnection(patch, wire.from, to, wire.moving) : null
  }
  function finish(to: JackRef) {
    if (!wire) return
    const result = candidate(to)
    setMessage(result?.message ?? '')
    if (!result || result.kind === 'blocked') {
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
      setMessage(`${getModuleSpec(placement.type).name} placed`)
    }
    setPlacement(null)
    setGhost(null)
  }
  const currentCable = patch.cables.find((c) => c.id === selectedCable)
  const module = patch.modules.find((m) => m.id === selected)
  const warnings = patch.cables.flatMap((c) => cableWarnings(patch, c))
  return (
    <>
      <aside
        className={`library ${locked ? 'library-locked' : ''}`}
        inert={locked}
        aria-label="Module library"
      >
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
                    aria-label={`Add ${spec.name}`}
                    title={`${spec.title} · ${spec.hp} HP · click to add or drag onto a rail`}
                    onDragStart={(event) => {
                      const existing = spec.unique && patch.modules.find((m) => m.type === spec.id)
                      if (existing) {
                        event.preventDefault()
                        select(existing.id)
                        return
                      }
                      event.dataTransfer.setData('text/plain', spec.id)
                      setPlacement({ type: spec.id })
                    }}
                    onDragEnd={() => {
                      setPlacement(null)
                      setGhost(null)
                    }}
                    onClick={() => {
                      const existing = spec.unique && patch.modules.find((m) => m.type === spec.id)
                      if (existing) {
                        select(existing.id)
                        return
                      }
                      for (let row = 0; row <= rows; row++)
                        if (freePosition(patch, spec.id, row, 0) !== null) {
                          edit((p) => placeModule(p, spec.id, row))
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
      <div className={`rack ${locked ? 'rack-locked' : ''}`} aria-label="Rack">
        <div className="rack-toolbar">
          <h2>
            RACK <small>{patch.modules.length} modules</small>
          </h2>
          <button
            type="button"
            onClick={() => {
              cancelReplacement()
              setConfirmNew(true)
            }}
          >
            New patch
          </button>
        </div>
        <div className="rack-scroll">
          <div
            ref={surface}
            inert={locked}
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
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              )
                setGhost(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (ghost?.hp !== null && ghost) place(ghost.row, ghost.hp)
            }}
            onPointerMove={(event) => {
              if (wire && surface.current) {
                const gesture = wireGesture.current
                if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4)
                  gesture.dragged = true
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
                {!patch.modules.some((m) => m.row === row) && rows > 1 && (
                  <button
                    type="button"
                    className="remove-row"
                    aria-label={`Remove row ${row + 1}`}
                    onClick={() => {
                      edit((p) => removeRow(p, row))
                    }}
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
                  data-jacks={LOOK_LAYOUT[m.look].jacks}
                  data-module={m.id}
                  className={`module-panel cat-${spec.category} family-${spec.family} look-${m.look} ${selected === m.id ? 'selected' : ''} ${!routed.has(m.id) ? 'inactive' : ''}`}
                  style={{ left: m.hp * HP, top: m.row * ROW_HEIGHT + 20, width: spec.hp * HP }}
                >
                  <button
                    type="button"
                    className="module-header"
                    aria-label={`Select ${m.id}`}
                    aria-pressed={selected === m.id}
                    draggable
                    onClick={() => select(m.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Delete' && !spec.unique) {
                        event.preventDefault()
                        select(m.id)
                        setDeleteId(m.id)
                      }
                    }}
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
                        {...(m.type === 'code' && sourceModules.includes(m.id)
                          ? { editSource: () => showCode(m.id) }
                          : {})}
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
                        <div key={jack.id} className={`jack-label jack-${jack.direction}`}>
                          <button
                            type="button"
                            data-jack={keyOf(ref)}
                            className={`jack signal-${state && state.kind !== 'blocked' ? state.signal : jack.signal} ${connected ? 'connected' : ''} ${state ? (state.kind === 'blocked' ? 'blocked' : `valid ${state.kind}`) : ''}`}
                            aria-label={`${m.id} ${jack.label} ${jack.direction}`}
                            title={
                              state?.message ??
                              (wire && jack.direction === 'out'
                                ? 'Choose an input. Output-to-output is blocked.'
                                : `${jack.label} · ${jack.signal} ${jack.direction}`)
                            }
                            onPointerDown={(event) => {
                              if (jack.direction === 'out' && event.button === 0) {
                                if (wire) return
                                wireGesture.current = {
                                  x: event.clientX,
                                  y: event.clientY,
                                  dragged: false,
                                }
                                setSelectedOutput(keyOf(ref))
                                setWire({ from: ref })
                                setMessage('Choose an input. Escape cancels.')
                                setPointer(points[keyOf(ref)] ?? null)
                                setReplacement(null)
                              }
                            }}
                            onPointerEnter={() => {
                              if (wire && jack.direction === 'in') {
                                setTarget(ref)
                                setMessage(candidate(ref)?.message ?? '')
                              }
                            }}
                            onPointerLeave={() => {
                              setTarget(null)
                              if (wire) setMessage('Choose an input. Escape cancels.')
                            }}
                            onPointerUp={() => {
                              if (wire && jack.direction === 'in') finish(ref)
                              else if (
                                wire &&
                                jack.direction === 'out' &&
                                (keyOf(ref) !== keyOf(wire.from) || wireGesture.current?.dragged)
                              ) {
                                cancel()
                                setMessage('Choose an input. Output-to-output is blocked.')
                              }
                            }}
                            onClick={(event) => {
                              if (event.detail === 0) {
                                if (jack.direction === 'out') setWire({ from: ref })
                                else finish(ref)
                              }
                            }}
                          />
                          <span>
                            {jack.label}
                            {state
                              ? state.kind === 'blocked'
                                ? ' ×'
                                : state.kind === 'valid'
                                  ? ' ✓'
                                  : ' △'
                              : wire && jack.direction === 'out'
                                ? ' ×'
                                : ''}
                          </span>
                          {jack.direction === 'out' &&
                            (patch.cables.filter((c) => keyOf(c.from) === keyOf(ref)).length > 1 ||
                              patch.names[keyOf(ref)]) && (
                              <input
                                key={`${m.id}:${jack.id}:${patch.names[keyOf(ref)]}`}
                                className="output-name"
                                aria-label={`Name ${m.id} ${jack.label}`}
                                defaultValue={patch.names[keyOf(ref)] ?? ''}
                                onPointerDown={(event) => event.stopPropagation()}
                                onBlur={(event) => {
                                  if (event.target.value !== patch.names[keyOf(ref)])
                                    edit((p) => renameOutput(p, keyOf(ref), event.target.value))
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') event.currentTarget.blur()
                                  if (event.key === 'Escape') {
                                    event.currentTarget.value = patch.names[keyOf(ref)] ?? ''
                                    event.currentTarget.blur()
                                  }
                                }}
                              />
                            )}
                        </div>
                      )
                    })}
                  </div>
                  <span className="module-id">
                    {m.id}
                    {!routed.has(m.id) ? ' · inactive' : ''}
                  </span>
                </section>
              )
            })}
            {placement && ghost?.hp !== null && ghost && ghost.row < rows && (
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
                const start = points[keyOf(c.from)],
                  b = points[keyOf(c.to)]
                const siblings = patch.cables.filter((other) => keyOf(other.from) === keyOf(c.from))
                const offset =
                  (siblings.findIndex((other) => other.id === c.id) - (siblings.length - 1) / 2) * 5
                const a = start && { x: start.x + offset, y: start.y }
                const warning = cableWarnings(patch, c).join(' ')
                return a && b ? (
                  <g
                    key={c.id}
                    className={`cable signal-${cableSignal(patch, c.from)} ${selectedCable === c.id ? 'selected-cable' : ''} ${warning ? 'warning-cable' : ''}`}
                  >
                    <path d={curve(a, b)} className="cable-shadow" />
                    <circle cx={a.x} cy={a.y + 8} r="5" className="plug-collar" />
                    <path
                      d={curve(a, b)}
                      onClick={() => {
                        setSelectedCable(c.id)
                        cancel()
                      }}
                    >
                      <title>
                        {keyOf(c.from)} → {keyOf(c.to)}
                        {warning ? ` · △ ${warning}` : ''}
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
          disabled={locked}
          onClick={() => edit(addRow)}
          onDragOver={(event) => {
            if (placement) {
              event.preventDefault()
              setGhost({ row: rows, hp: 0 })
              setMessage(`${getModuleSpec(placement.type).name} · new row, HP 0`)
            }
          }}
          onDragLeave={() => setGhost(null)}
          onDrop={(event) => {
            event.preventDefault()
            place(rows, 0)
          }}
        >
          + Add row
          {placement && ghost?.row === rows
            ? ` · ${getModuleSpec(placement.type).name} · ${getModuleSpec(placement.type).hp} HP at 0`
            : ''}
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
            <button
              type="button"
              ref={(element) => element?.focus()}
              onClick={() => {
                cancelReplacement()
                setConfirmNew(false)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([draft], { type: 'text/plain' }))
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
                  setSelectedOutput(null)
                  setConfirmNew(false)
                  setMessage('New silent patch')
                }
              }}
            >
              Replace patch
            </button>
          </fieldset>
        )}
        {deleteId && !locked && (
          <fieldset className="replace-prompt">
            <legend>
              Delete {deleteId} and its{' '}
              {
                patch.cables.filter((c) => c.from.module === deleteId || c.to.module === deleteId)
                  .length
              }{' '}
              cables?
            </legend>
            <button
              type="button"
              ref={(element) => element?.focus()}
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (edit((p) => removeModule(p, deleteId))) {
                  const index = patch.modules.findIndex((m) => m.id === deleteId)
                  select(patch.modules[index + 1]?.id ?? patch.modules[index - 1]?.id ?? null)
                  cancel()
                  setDeleteId(null)
                }
              }}
            >
              Delete module
            </button>
          </fieldset>
        )}
        {replacement && wire && !locked && (
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
        {menu && menuModule && !locked && (
          <dialog
            open
            className="module-menu"
            aria-label={`${menuModule.id} menu`}
            style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          >
            <strong>{menuModule.id}</strong>
            <details open>
              <summary>Look</summary>
              {looksFor(getModuleSpec(menuModule.type).family).map((look) => (
                <button
                  type="button"
                  key={look}
                  aria-label={`Look ${LOOK_LABELS[look]}`}
                  aria-pressed={menuModule.look === look}
                  onClick={() => {
                    edit((p) => setLook(p, menuModule.id, look, allLooks))
                    setMenu(null)
                  }}
                >
                  {menuModule.look === look ? '✓ ' : ''}
                  {LOOK_LABELS[look]}
                </button>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={allLooks}
                  onChange={(event) => setAllLooks(event.target.checked)}
                />{' '}
                Use for all modules in this family
              </label>
            </details>
            <button
              type="button"
              disabled={!!getModuleSpec(menuModule.type).unique}
              onClick={() => {
                edit((p) => duplicateModule(p, menuModule.id))
                setMenu(null)
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                showCode(menuModule.id)
                setMenu(null)
              }}
            >
              Show in code
            </button>
            <button
              type="button"
              disabled={!!getModuleSpec(menuModule.type).unique}
              onClick={() => {
                setDeleteId(menuModule.id)
                setMenu(null)
              }}
            >
              Delete
            </button>
            <button type="button" onClick={() => setMenu(null)}>
              Close menu
            </button>
          </dialog>
        )}
        {module && !locked && (
          <div className="selection-tools">
            <span>
              {module.id} · {getModuleSpec(module.type).hp} HP
            </span>
            <button type="button" onClick={() => setMenu({ id: module.id, x: 220, y: 150 })}>
              Module menu
            </button>
            <button
              type="button"
              disabled={!!getModuleSpec(module.type).unique}
              onClick={() => setDeleteId(module.id)}
            >
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
        {selectedOutput && !locked && (
          <div
            className="connections output-connections"
            aria-label={`${selectedOutput} destinations`}
          >
            <strong>{selectedOutput} destinations</strong>
            {patch.cables
              .filter((c) => keyOf(c.from) === selectedOutput)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setSelectedCable(c.id)
                    cancel()
                  }}
                >
                  Select cable to {keyOf(c.to)}
                </button>
              ))}
          </div>
        )}
        {currentCable && !locked && (
          <div className="selection-tools">
            <span>
              {keyOf(currentCable.from)} → {keyOf(currentCable.to)}
            </span>
            <button
              type="button"
              onClick={() => {
                edit((p) => removeCable(p, currentCable.id))
                setSelectedCable(null)
                setMessage('Cable removed')
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
