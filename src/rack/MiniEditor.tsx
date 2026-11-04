import { allowSound, receiveSound } from '../samples/drag'
import type { SoundChoice } from '../samples/crate'
import { euclidean } from '../patch/euclidean'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { miniView, textCell, walkCells, type Cell, type Layer, type Span } from '../patch/mini'
import {
  applyMiniEdit,
  gestureKeys,
  gestureLabels,
  miniGesture,
  replaceCell,
  type Gesture,
  type MiniSplice,
} from '../patch/miniEdits'
import { layoutMini, type MiniPiece } from '../patch/miniLayout'
import { subscribe } from '../strudel/engine'
import './MiniEditor.css'

type Token = 'note' | 'number' | 'sample' | 'chord' | 'gate'
const cellKey = (c: Cell) => `${c.span.start}:${c.span.end}`
const focusInput = (element: HTMLInputElement | null) => {
  element?.focus()
  element?.select()
}

export function MiniEditor({
  text,
  label,
  token = 'note',
  moduleId,
  controlId,
  width = 104,
  commit,
  escaped = false,
  dropSample,
}: {
  dropSample?: ((choice: SoundChoice, row: number) => void) | undefined
  escaped?: boolean
  text: string
  label: string
  token?: Token
  moduleId: string
  controlId: string
  width?: number
  commit: (text: string, historyGroup?: object) => boolean
}) {
  const view = useMemo(
    () =>
      escaped
        ? { kind: 'text' as const, reason: 'Escaped literals stay in Text mode.' }
        : miniView(text),
    [text, escaped],
  )
  const [alternativePages, setAlternativePages] = useState<{
    text: string
    pages: Record<number, number>
  }>({ text, pages: {} })
  const [textMode, setTextMode] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [focusStart, setFocusStart] = useState<number[]>([])
  const [tray, setTray] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState('')
  const [cycle, setCycle] = useState(0)
  const surface = useRef<HTMLFieldSetElement>(null)
  const floating = useRef<HTMLDialogElement>(null)
  const lastClicked = useRef<string | null>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanup.current?.(), [])
  const editing = useRef<Span | null>(null)
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'activity-clear') {
          setCycle(0)
          setAlternativePages({ text, pages: {} })
        }
        if (event.type === 'activity') {
          const hit = event.steps.find((s) => s.module === moduleId && s.control === controlId)
          if (hit) {
            setCycle(hit.cycle)
            if (view.kind === 'tree')
              setAlternativePages((previous) => {
                const pages = previous.text === text ? { ...previous.pages } : {}
                let changed = previous.text !== text
                walkCells(view.tree, (cell) => {
                  const active = editing.current
                  if (
                    cell.shape !== 'alt' ||
                    (active && cell.span.start < active.end && cell.span.end > active.start)
                  )
                    return
                  const option = cell.layers
                    ?.flatMap((l) => l.cells)
                    .find((c) => c.span.start <= hit.start && c.span.end >= hit.end)
                  if (option && pages[cell.span.start] !== option.span.start) {
                    pages[cell.span.start] = option.span.start
                    changed = true
                  }
                })
                return changed ? { text, pages } : previous
              })
          }
        }
      }),
    [moduleId, controlId, text, view],
  )
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target) &&
        !floating.current?.contains(event.target)
      ) {
        setTray(null)
        setDraft(null)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  const drum = token === 'sample'
  let focus: Cell | undefined
  if (view.kind === 'tree') {
    let layers = view.tree.root
    for (const start of focusStart) {
      focus = findCell(layers, start)
      if (!focus?.layers) break
      layers = focus.layers
    }
  }
  const layout =
    view.kind === 'tree'
      ? layoutMini(view.tree, {
          width,
          drum,
          cycle,
          focus,
          pages: alternativePages.text === text ? alternativePages.pages : {},
        })
      : null
  const pieces = layout?.pieces ?? []
  const unique = pieces.filter(
    (p, i, all) => all.findIndex((other) => cellKey(other.cell) === cellKey(p.cell)) === i,
  )
  const active = unique.find((p) => p.cell.span.start === selected) ?? unique[0]
  const activeCell = active?.cell
  useEffect(() => {
    editing.current = tray ? (activeCell?.span ?? null) : null
  }, [tray, activeCell])
  const maxLevel = Math.max(1, ...unique.map((p) => Number(p.cell.text) || 0))
  const fallback =
    token === 'gate'
      ? 'x'
      : token === 'number'
        ? '0'
        : token === 'sample'
          ? layout?.rows[active?.lane ?? 0] === 'mix'
            ? 'bd'
            : (layout?.rows[active?.lane ?? 0] ?? 'bd')
          : token === 'chord'
            ? 'Cm7'
            : 'c3'

  function freezeCell(selectedCell: Cell) {
    editing.current = selectedCell.span
    if (view.kind !== 'tree') return
    setAlternativePages((previous) => {
      const pages = previous.text === text ? { ...previous.pages } : {}
      walkCells(view.tree, (cell) => {
        if (
          cell.shape !== 'alt' ||
          cell.span.start >= selectedCell.span.end ||
          cell.span.end <= selectedCell.span.start
        )
          return
        const shown = pieces.find((p) => p.parent === cell)
        if (shown) pages[cell.span.start] = shown.cell.span.start
      })
      return { text, pages }
    })
  }
  function showTray(element: HTMLElement) {
    const rect =
      element.closest('.module-panel')?.getBoundingClientRect() ?? element.getBoundingClientRect()
    setTray({
      x: Math.max(8, Math.min(window.innerWidth - 248, rect.right + 8)),
      y: Math.max(8, Math.min(window.innerHeight - 428, rect.top)),
    })
  }
  function select(piece: MiniPiece, element: HTMLElement) {
    freezeCell(piece.cell)
    setSelected(piece.cell.span.start)
    setDraft(null)
    showTray(element)
  }
  function refocus(start = selected) {
    requestAnimationFrame(() => {
      const cell =
        surface.current?.querySelector<HTMLElement>(`[data-mini-start="${start}"]`) ??
        surface.current?.querySelector<HTMLElement>('.mini-cell')
      if (cell) {
        setSelected(Number(cell.dataset.miniStart))
        cell.focus()
      }
    })
  }
  function apply(edit: MiniSplice, group?: object, original = text) {
    try {
      const next = applyMiniEdit(original, edit)
      if ((!group && next === text) || commit(next, group)) {
        setError('')
        setDraft(null)
        return true
      }
      setError('Cannot apply this edit; check the source.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return false
  }
  function act(key: Gesture) {
    if (!activeCell || !active) return
    const edit = miniGesture(text, activeCell, key, fallback)
    let start = activeCell.span.start
    if (key === 'Backspace' && !activeCell.mods.length) {
      const peers = unique.filter((p) => p.parent === active.parent && p.lane === active.lane)
      const index = peers.indexOf(active),
        neighbor = peers[index - 1] ?? peers[index + 1]
      if (neighbor)
        start =
          neighbor.cell.span.start +
          (neighbor.cell.span.start >= edit.end ? edit.text.length - (edit.end - edit.start) : 0)
    }
    if (apply(edit)) {
      setSelected(start)
      refocus(start)
    }
  }
  function openOrEdit() {
    if (!activeCell) return
    if (activeCell.layers && !textCell(activeCell)) {
      setFocusStart([...focusStart, activeCell.span.start])
      setSelected(activeCell.layers[0]?.cells[0]?.span.start ?? 0)
      setTray(null)
      refocus(activeCell.layers[0]?.cells[0]?.span.start)
    } else {
      if (surface.current) showTray(surface.current)
      setDraft(
        text.slice(
          textCell(activeCell) ? activeCell.span.start : activeCell.body.start,
          textCell(activeCell) ? activeCell.span.end : activeCell.body.end,
        ),
      )
    }
  }
  function back() {
    if (draft !== null) setDraft(null)
    else if (focusStart.length) {
      const start = focusStart.at(-1) ?? 0
      setFocusStart(focusStart.slice(0, -1))
      setSelected(start)
      refocus(start)
    } else setTray(null)
  }
  function keyboard(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      return
    const key = event.key
    if (
      key === 'Enter' &&
      event.target instanceof HTMLButtonElement &&
      !event.target.classList.contains('mini-cell')
    )
      return
    if (gestureKeys.some((k) => k === key)) {
      event.preventDefault()
      event.stopPropagation()
      try {
        act(gestureKeys.find((k) => k === key) ?? '[')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } else if (key === 'Enter' || key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (key === 'Enter') openOrEdit()
      else back()
    } else if (key.startsWith('Arrow') && active) {
      event.preventDefault()
      event.stopPropagation()
      const peers = unique.filter(
        (p) =>
          p.depth === active.depth &&
          (key === 'ArrowLeft' || key === 'ArrowRight'
            ? p.parent === active.parent && p.lane === active.lane
            : true),
      )
      const index = peers.indexOf(active)
      let next: MiniPiece | undefined
      if (key === 'ArrowLeft' || key === 'ArrowRight')
        next = peers[(index + (key === 'ArrowRight' ? 1 : peers.length - 1)) % peers.length]
      else {
        const direction = key === 'ArrowDown' ? 1 : -1
        next = peers
          .filter((p) => (p.y - active.y) * direction > 1)
          .sort(
            (a, b) =>
              Math.abs(a.y - active.y) - Math.abs(b.y - active.y) ||
              Math.abs(a.x - active.x) - Math.abs(b.x - active.x),
          )[0]
        next ??= peers[(index + (direction > 0 ? 1 : peers.length - 1)) % peers.length]
      }
      if (next) {
        setSelected(next.cell.span.start)
        setDraft(null)
        refocus(next.cell.span.start)
      }
    }
  }
  if (textMode || view.kind === 'text')
    return (
      <NotationText
        key={text}
        text={text}
        label={drum ? 'Drum notation' : 'Step notation'}
        reason={view.kind === 'text' ? view.reason : undefined}
        commit={commit}
        back={() => setTextMode(false)}
        canDraw={view.kind === 'tree'}
      />
    )
  return (
    // Notation keys bubble from this fieldset's roving-focus buttons.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <fieldset
      ref={surface}
      className={`mini-editor ${drum ? 'grid-editor' : 'step-editor'}`}
      data-mini-control={controlId}
      onKeyDown={keyboard}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (
          !(next instanceof Node) ||
          (!surface.current?.contains(next) &&
            !(
              next instanceof Element &&
              next.closest('.mini-tray')?.getAttribute('data-mini-owner') ===
                `${moduleId}:${controlId}`
            ))
        ) {
          setTray(null)
          setDraft(null)
        }
      }}
    >
      <legend>
        {focus ? (
          <button type="button" onClick={back} tabIndex={-1}>
            ‹ {label} / {focusStart.length}
          </button>
        ) : (
          <>
            {label}
            {view.tree.join === 'choose' && <span aria-hidden="true"> ◇</span>}
          </>
        )}
      </legend>
      <div
        className={`mini-surface ${drum ? 'mini-drums' : ''}`}
        style={{ height: layout?.height }}
      >
        {drum &&
          layout?.rows.map((name, lane) => (
            <span
              className="mini-row-name sample-row-drop"
              key={lane}
              style={{ top: lane * 18 }}
              title={`Drop sound on row ${lane + 1}: ${name}`}
              onDragOver={allowSound}
              onDrop={(event) => {
                try {
                  receiveSound(event, (choice) => dropSample?.(choice, lane))
                } catch (error) {
                  setError(String(error))
                }
              }}
            >
              {name}
            </span>
          ))}
        {pieces.map((piece, i) => {
          const c = piece.cell,
            raw = text.slice(c.span.start, c.span.end)
          const isText = textCell(c),
            rest = c.shape === 'rest' || !piece.hit
          const types = c.mods.map((m) => `mini-${m.kind}`).join(' ')
          const leafText = isText
            ? raw
            : piece.collapsed
              ? collapsedLabel(c)
              : c.layers
                ? c.shape === 'alt'
                  ? '⋮'
                  : ''
                : rest
                  ? '·'
                  : drum
                    ? layout?.rows[piece.lane] === 'mix'
                      ? c.text?.[0]
                      : ''
                    : c.text
          const name = `${isText ? 'Text cell' : c.layers ? (c.shape === 'alt' ? 'Alternation' : c.join === 'stack' ? 'Chord' : c.join === 'choose' ? 'Random choice' : 'Group') : rest ? 'Rest' : 'Step'} ${raw}`
          return (
            <button
              type="button"
              key={`${cellKey(c)}:${piece.copy}:${i}`}
              className={`mini-cell ${types} ${piece.ghost ? 'mini-ghost' : ''} ${rest ? 'mini-rest' : ''} ${c.layers ? 'mini-group' : ''} ${isText ? 'mini-text-cell' : ''} ${piece.collapsed ? 'mini-collapsed' : ''} ${piece.continuedLeft ? 'mini-cont-left' : ''} ${piece.continuedRight ? 'mini-cont-right' : ''}`}
              aria-label={name}
              aria-pressed={activeCell === c}
              title={`${raw} · Enter to ${c.layers ? 'open' : 'edit'}`}
              tabIndex={activeCell === c && pieces.find((p) => p.cell === c) === piece ? 0 : -1}
              data-mini-start={c.span.start}
              data-mini-end={c.span.end}
              data-mini-body-start={c.body.start}
              data-mini-body-end={c.body.end}
              data-mini-copy={piece.copy}
              data-mini-time-start={piece.start}
              data-mini-time-end={piece.end}
              style={
                {
                  left: `${(piece.x / width) * 100}%`,
                  top: piece.y,
                  width: `${(piece.width / width) * 100}%`,
                  height: piece.height,
                  zIndex: piece.depth + 1,
                  '--mini-level': `${Math.max(0, Math.min(100, token === 'gate' ? (rest ? 0 : 100) : ((Number(c.text) || 0) / maxLevel) * 100))}%`,
                } as CSSProperties
              }
              onFocus={(event) => {
                freezeCell(c)
                if (activeCell !== c) setSelected(c.span.start)
                showTray(event.currentTarget)
              }}
              onClick={(event) => {
                if (drum && lastClicked.current === cellKey(c) && !c.layers && !isText) {
                  apply({ ...c.body, text: rest ? fallback : '~' })
                  refocus(c.span.start)
                } else select(piece, event.currentTarget)
                lastClicked.current = cellKey(c)
              }}
              onDoubleClick={openOrEdit}
            >
              {(token === 'number' || token === 'gate') && !c.layers && (
                <span className="mini-level" aria-hidden="true" />
              )}
              <span className="mini-label">
                {piece.primary ? leafText : null}
                {piece.primary &&
                  !c.layers &&
                  c.mods
                    .filter((m) => m.kind === 'index')
                    .map((m) => <small key={m.span.start}>:{m.arg}</small>)}
              </span>
              {c.shape === 'alt' && (
                <span className="mini-pager" aria-hidden="true">
                  {c.layers
                    ?.flatMap((l) => l.cells)
                    .slice(0, 8)
                    .map((option, index) => (
                      <i
                        key={option.span.start}
                        className={
                          pieces.some((p) => p.parent === c && p.cell === option) ? 'now' : ''
                        }
                        data-page={index}
                      />
                    ))}
                </span>
              )}
              {c.join === 'choose' && (
                <span className="mini-choice" aria-hidden="true">
                  ◇
                </span>
              )}
              {c.mods
                .filter((m) => m.kind === 'fast')
                .map((m) => (
                  <span className="mini-ticks" key={m.span.start} aria-hidden="true">
                    {'│'.repeat(Math.min(16, Math.max(1, Number(m.arg) || 1)))}
                  </span>
                ))}
              {c.mods
                .filter((m) => m.kind === 'euclid' && !isText)
                .map((m) => (
                  <span className="mini-euclid-dots" key={m.span.start} aria-hidden="true">
                    {euclidDots(m.arg ?? '')}
                  </span>
                ))}
              {!!c.mods.find((m) => m.kind === 'weight') && !piece.continuedRight && (
                <span
                  className="mini-grip"
                  aria-hidden="true"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    dragCleanup.current?.()
                    const original = text,
                      startX = event.clientX
                    const weight = Number(c.mods.find((m) => m.kind === 'weight')?.arg ?? 2)
                    const mod = c.mods.find((m) => m.kind === 'weight')
                    const group = {}
                    const move = (pointer: PointerEvent) => {
                      if (mod)
                        apply(
                          {
                            ...mod.span,
                            text: `@${Math.max(1, Math.round(weight + (pointer.clientX - startX) / 16))}`,
                          },
                          group,
                          original,
                        )
                    }
                    const cleanup = () => {
                      window.removeEventListener('pointermove', move)
                      window.removeEventListener('pointerup', cleanup)
                      window.removeEventListener('pointercancel', cancel)
                      dragCleanup.current = null
                    }
                    const cancel = () => {
                      cleanup()
                      commit(original, group)
                    }
                    window.addEventListener('pointermove', move)
                    window.addEventListener('pointerup', cleanup, { once: true })
                    window.addEventListener('pointercancel', cancel, { once: true })
                    dragCleanup.current = cleanup
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="mini-text-toggle"
        onClick={() => {
          setTray(null)
          setDraft(null)
          setTextMode(true)
        }}
      >
        Text mode
      </button>
      {drum && (
        <button
          type="button"
          onClick={() => apply({ start: text.length, end: text.length, text: ', ~' })}
        >
          + Voice
        </button>
      )}
      {error && <small role="alert">{error}</small>}
      {tray &&
        activeCell &&
        createPortal(
          <dialog
            open
            ref={floating}
            className="mini-tray"
            data-mini-owner={`${moduleId}:${controlId}`}
            aria-label="Cell actions"
            style={{ left: tray.x, top: tray.y }}
            onKeyDown={keyboard}
          >
            <strong>{text.slice(activeCell.span.start, activeCell.span.end)}</strong>
            {draft !== null ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  try {
                    if (apply(replaceCell(activeCell, draft))) refocus()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
              >
                <input
                  ref={focusInput}
                  aria-label="Cell value"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setDraft(null)
                      refocus()
                    }
                  }}
                />
                <button type="submit">Set cell</button>
              </form>
            ) : (
              <button type="button" onClick={openOrEdit}>
                {activeCell.layers && !textCell(activeCell) ? 'Open group' : 'Edit value'} ↵
              </button>
            )}
            <div className="mini-actions">
              {gestureKeys.map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-label={`${gestureLabels[key]} (${key})`}
                  onClick={() => {
                    try {
                      act(key)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err))
                    }
                  }}
                >
                  <kbd>{key === 'Backspace' ? '⌫' : key}</kbd> {gestureLabels[key]}
                </button>
              ))}
            </div>
            <button type="button" onClick={back}>
              Back / close (Esc)
            </button>
            {error && <small role="alert">{error}</small>}
          </dialog>,
          document.body,
        )}
    </fieldset>
  )
}

function euclidDots(raw: string): string {
  const [k = 0, n = 0, r = 0] = raw.split(',').map(Number)
  return euclidean(k, n, r)
    .slice(0, 32)
    .map((hit) => (hit ? '●' : '○'))
    .join('')
}
function NotationText({
  text,
  label,
  commit,
  back,
  reason,
  canDraw,
}: {
  text: string
  label: string
  commit: (text: string) => boolean
  back: () => void
  reason?: string | undefined
  canDraw: boolean
}) {
  const [draft, setDraft] = useState(text)
  const [error, setError] = useState(false)
  const apply = () => {
    if (draft === text || commit(draft)) {
      setError(false)
      back()
    } else setError(true)
  }
  return (
    <label className="text-control">
      {label}
      <textarea
        aria-label={label}
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            apply()
          }
        }}
      />
      {reason && <small>{reason}</small>}
      {canDraw && (
        <button type="button" onClick={back}>
          Grid mode
        </button>
      )}
      {error && <small role="alert">Cannot apply this notation.</small>}
    </label>
  )
}

function findCell(layers: Layer[], start: number): Cell | undefined {
  for (const layer of layers)
    for (const cell of layer.cells) {
      if (cell.span.start === start) return cell
      const nested = cell.layers && findCell(cell.layers, start)
      if (nested) return nested
    }
  return undefined
}

function collapsedLabel(cell: Cell): string {
  const leaves: Cell[] = []
  const visit = (c: Cell) => {
    if (c.layers) c.layers.forEach((l) => l.cells.forEach(visit))
    else leaves.push(c)
  }
  visit(cell)
  return cell.join === 'stack' || cell.join === 'choose'
    ? `${leaves[0]?.text ?? '…'}+${Math.max(0, leaves.length - 1)}`
    : `[${leaves.length}]`
}
