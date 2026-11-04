import { controlValue } from '../modules/values'
import { useRef, useState } from 'react'
import { patternNumber } from '../modules/bindings'
import type { Control, KnobControl } from '../modules/types'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { isGrid, isSteps } from '../codegen/graph'
import { drumText, drumView, stepView } from '../patch/notation'
import { depthControl, draggedValue, keyboardValue, normalized, sequenceText, snap } from './model'

const focusEditor = (element: HTMLInputElement | null) => element?.focus()

type Commit = (value: ControlValue, historyGroup?: object) => boolean

export function Numeric({
  control,
  value,
  commit,
}: {
  control: KnobControl
  value: number
  commit: Commit
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const drag = useRef<{ start: number; y: number; position: number; historyGroup: object } | null>(
    null,
  )
  function apply() {
    if (draft === null) return
    const n = Number(draft)
    if (
      !draft.trim() ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft.trim()) ||
      !Number.isFinite(n) ||
      n < control.min ||
      n > control.max
    ) {
      setError(`Enter ${control.min}–${control.max}`)
      return
    }
    const nearest = snap(control, n)
    if (Math.abs(nearest - n) > 0.000001) {
      setDraft(String(nearest))
      setError(`Nearest allowed: ${nearest}. Press Enter to confirm.`)
      return
    }
    if (commit(n)) {
      setDraft(null)
      setError('')
    }
  }
  function cancelDrag() {
    const current = drag.current
    drag.current = null
    if (current) commit(current.start, current.historyGroup)
  }
  return (
    <div className="numeric-control">
      <button
        type="button"
        className="knob"
        // A rotary control uses custom pointer capture and logarithmic keyboard movement.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="slider"
        aria-label={control.label}
        aria-valuemin={control.min}
        aria-valuemax={control.max}
        aria-valuenow={value}
        aria-valuetext={`${control.label} ${value}${control.unit ? ` ${control.unit}` : ''}`}
        aria-orientation="vertical"
        title="Drag or use arrows · Shift for fine control · Home/End for limits · Backspace or double-click to reset"
        style={{ transform: `rotate(${-135 + normalized(control, value) * 270}deg)` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            start: value,
            y: event.clientY,
            position: normalized(control, value),
            historyGroup: {},
          }
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current) return
          current.position = Math.max(
            0,
            Math.min(
              1,
              current.position + (current.y - event.clientY) / (event.shiftKey ? 2000 : 200),
            ),
          )
          current.y = event.clientY
          const next = draggedValue(control, current.position)
          if (next !== value) commit(next, current.historyGroup)
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancelDrag()
          const next = keyboardValue(control, value, event.key, event.shiftKey)
          if (next !== null) {
            event.preventDefault()
            drag.current = null
            commit(next)
          }
        }}
        onDoubleClick={() => {
          drag.current = null
          commit(control.default)
        }}
      >
        <span />
      </button>
      <label>
        <span>{control.label}</span>
        {draft === null ? (
          <button
            type="button"
            className="readout"
            aria-label={`Set ${control.label}`}
            onClick={() => {
              setDraft(String(value))
              setError('')
            }}
          >
            {patternNumber(value)}
            {control.unit && <> {control.unit}</>}
          </button>
        ) : (
          <input
            ref={focusEditor}
            aria-label={control.label}
            aria-invalid={!!error}
            inputMode="decimal"
            value={draft}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              setDraft(event.target.value)
              setError('')
            }}
            onBlur={apply}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                apply()
              }
              if (event.key === 'Escape') {
                setDraft(null)
                setError('')
              }
            }}
          />
        )}
      </label>
      {error && (
        <small className="control-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

export function ControlEditor({
  patch,
  module,
  control,
  commit,
  editSource,
}: {
  patch: Patch
  module: PlacedModule
  control: Control
  commit: Commit
  editSource?: () => void
}) {
  const [error, setError] = useState('')
  const [textMode, setTextMode] = useState(false)
  const value = controlValue(module, control)
  switch (control.kind) {
    case 'knob': {
      const knob = depthControl(patch, module, control)
      if ('perTarget' in knob && knob.perTarget && module.values[control.id] === undefined) {
        return (
          <div className="text-control">
            DEPTH: per-target defaults
            <button type="button" onClick={() => commit(snap(knob, knob.default))}>
              Set shared depth
            </button>
          </div>
        )
      }
      const n = module.values[control.id] ?? knob.default
      return typeof n === 'number' ? <Numeric control={knob} value={n} commit={commit} /> : null
    }
    case 'switch':
      return (
        <label className="switch-control">
          {control.label}
          <select
            aria-label={control.label}
            value={typeof value === 'string' ? value : control.default}
            onChange={(event) => commit(event.target.value)}
          >
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'text':
      if (editSource)
        return (
          <div className="text-control">
            <pre>{typeof value === 'string' ? value : control.default}</pre>
            <button type="button" onClick={editSource}>
              Edit in source
            </button>
          </div>
        )
      return (
        <TextEditor
          label={module.type === 'code' ? 'CODE source' : control.label}
          value={typeof value === 'string' ? value : control.default}
          commit={commit}
        />
      )
    case 'steps': {
      if (!isSteps(value)) return null
      const text = typeof value === 'string' ? value : sequenceText(module, value)
      const view = stepView(text, control)
      if (textMode || view.kind === 'text')
        return (
          <TextEditor
            key={text}
            label="Step notation"
            notation
            value={text}
            reason={view.kind === 'text' ? view.reason : undefined}
            backToGrid={view.kind === 'grid' ? () => setTextMode(false) : undefined}
            commit={(next) => {
              const applied = commit(next)
              if (applied) setTextMode(false)
              return applied
            }}
          />
        )
      const steps = typeof value === 'string' ? view.value : value
      return (
        <fieldset className="step-editor">
          <legend>{control.label}</legend>
          <div className="steps">
            {Array.from({ length: control.maxSteps }, (_, index) => (
              <input
                key={`${index}:${steps[index] ?? '~'}`}
                aria-label={`Step ${index + 1}`}
                data-step={index}
                defaultValue={steps[index] ?? '~'}
                onBlur={(event) => {
                  const token = event.target.value.trim()
                  const parsed = stepView(token, control)
                  if (parsed.kind !== 'grid' || parsed.value.length !== 1) {
                    setError('Enter a note, degree, ~, or <a b>')
                    return
                  }
                  if (token === (steps[index] ?? '~')) {
                    setError('')
                    return
                  }
                  const next = Array.from({ length: Math.max(steps.length, index + 1) }, (_, i) =>
                    i === index ? token : (steps[i] ?? '~'),
                  )
                  if (commit(typeof value === 'string' ? next.join(' ') : next)) setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
            ))}
          </div>
          <button type="button" onClick={() => setTextMode(true)}>
            Text mode
          </button>
          {error && <small role="alert">{error}</small>}
        </fieldset>
      )
    }
    case 'grid': {
      if (!isGrid(value)) return null
      const text = typeof value === 'string' ? value : drumText(value)
      const view = drumView(text, control)
      if (textMode || (typeof value === 'string' && view.kind === 'text'))
        return (
          <TextEditor
            key={text}
            label="Drum notation"
            notation
            value={text}
            reason={view.kind === 'text' ? view.reason : undefined}
            backToGrid={view.kind === 'grid' ? () => setTextMode(false) : undefined}
            commit={(next) => {
              const applied = commit(next)
              if (applied) setTextMode(false)
              return applied
            }}
          />
        )
      const rows = typeof value === 'string' ? (view.kind === 'grid' ? view.value : []) : value
      const count = rows[0]?.steps.length ?? control.default[0]?.steps.length ?? 8
      return (
        <fieldset className="grid-editor">
          <legend>{control.label}</legend>
          <select
            aria-label="Drum step count"
            value={count}
            onChange={(event) =>
              commit(
                rows.map((row) => ({
                  ...row,
                  steps: Array.from(
                    { length: Number(event.target.value) },
                    (_, i) => row.steps[i] ?? 0,
                  ),
                })),
              )
            }
          >
            {control.stepCounts.map((n) => (
              <option key={n} value={n}>
                {n} steps
              </option>
            ))}
          </select>
          {rows.map((row, index) => (
            <div key={index} className="drum-row">
              <input
                key={row.sample}
                aria-label={`Sample ${index + 1}`}
                defaultValue={row.sample}
                onBlur={(event) => {
                  const sample = event.target.value.trim() || '~'
                  if (sample === row.sample) return
                  commit(rows.map((r, i) => (i === index ? { ...r, sample } : r)))
                }}
              />
              <div className="drum-cells" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
                {row.steps.map((step, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-label={`${row.sample} step ${i + 1}`}
                    data-step={i}
                    aria-pressed={step === 1}
                    onClick={() =>
                      commit(
                        rows.map((r, j) =>
                          j === index
                            ? { ...r, steps: r.steps.map((s, k) => (k === i ? (s ? 0 : 1) : s)) }
                            : r,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              commit([
                ...rows,
                { sample: 'cp', steps: Array.from({ length: count }, () => 0 as const) },
              ])
            }
          >
            + Voice
          </button>
          <button type="button" onClick={() => setTextMode(true)}>
            Text mode
          </button>
        </fieldset>
      )
    }
  }
}

function TextEditor({
  label,
  value,
  commit,
  reason,
  backToGrid,
  notation = false,
}: {
  label: string
  value: string
  commit: Commit
  reason?: string | undefined
  backToGrid?: (() => void) | undefined
  notation?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [failed, setFailed] = useState(false)
  const submitted = useRef(value)
  function apply() {
    if (draft === submitted.current) {
      backToGrid?.()
      return
    }
    const applied = commit(draft)
    setFailed(!applied)
    if (applied) submitted.current = draft
  }
  return (
    <label className="text-control">
      {label}
      <textarea
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={notation ? apply : undefined}
        onKeyDown={(event) => {
          if (
            notation &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            apply()
          }
        }}
        spellCheck={false}
      />
      {!notation && (
        <button type="button" onClick={apply}>
          Apply
        </button>
      )}
      {reason && <small>{reason}</small>}
      {backToGrid && (
        <button type="button" onClick={backToGrid}>
          Grid mode
        </button>
      )}
      {failed && <small role="alert">Cannot apply. Fix the source and try again.</small>}
    </label>
  )
}
