import { useRef, useState } from 'react'
import type { Control, KnobControl } from '../modules/types'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { isGrid, isSteps } from '../codegen/graph'
import { depthControl, draggedValue, normalized, sequenceText, snap } from './model'

const focusEditor = (element: HTMLInputElement | null) => element?.focus()

type Commit = (value: ControlValue) => boolean

function Numeric({
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
  const drag = useRef<{ start: number; y: number; position: number } | null>(null)
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
    if (current) commit(current.start)
  }
  return (
    <div className="numeric-control">
      <button
        type="button"
        className="knob"
        aria-label={`Drag ${control.label}`}
        title="Drag vertically · Shift for fine control · double-click to reset"
        style={{ transform: `rotate(${-135 + normalized(control, value) * 270}deg)` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { start: value, y: event.clientY, position: normalized(control, value) }
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
          if (next !== value) commit(next)
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancelDrag()
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
            onClick={() => {
              setDraft(String(value))
              setError('')
            }}
          >
            {value}
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
        {control.unit && <small>{control.unit}</small>}
      </label>
      <button
        type="button"
        className="reset"
        aria-label={`Reset ${control.label}`}
        onClick={() => {
          commit(control.default)
          setDraft(null)
          setError('')
        }}
      >
        Reset
      </button>
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
}: {
  patch: Patch
  module: PlacedModule
  control: Control
  commit: Commit
}) {
  const [error, setError] = useState('')
  const value = module.values[control.id] ?? control.default
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
      return (
        <TextEditor
          label="CODE source"
          value={typeof value === 'string' ? value : control.default}
          commit={commit}
        />
      )
    case 'steps': {
      if (!isSteps(value)) return null
      if (typeof value === 'string')
        return <TextEditor label="Step notation" value={value} commit={commit} />
      return (
        <fieldset className="step-editor">
          <legend>{control.label}</legend>
          <div className="steps">
            {Array.from({ length: control.maxSteps }, (_, index) => (
              <input
                key={index}
                aria-label={`Step ${index + 1}`}
                defaultValue={value[index] ?? '~'}
                onBlur={(event) => {
                  const token = event.target.value.trim()
                  if (!/^(?:[^\s<>]+|<[^<>]+>)$/.test(token)) {
                    setError('Enter a note, degree, ~, or <a b>')
                    return
                  }
                  const steps = Array.from({ length: Math.max(value.length, index + 1) }, (_, i) =>
                    i === index ? token : (value[i] ?? '~'),
                  )
                  if (commit(steps)) setError('')
                }}
              />
            ))}
          </div>
          <button type="button" onClick={() => commit(sequenceText(module, value))}>
            Text mode
          </button>
          {error && <small role="alert">{error}</small>}
        </fieldset>
      )
    }
    case 'grid': {
      if (!isGrid(value)) return null
      if (typeof value === 'string')
        return <TextEditor label="Drum notation" value={value} commit={commit} />
      const count = value[0]?.steps.length ?? 8
      return (
        <fieldset className="grid-editor">
          <legend>{control.label}</legend>
          <select
            aria-label="Drum step count"
            value={count}
            onChange={(event) =>
              commit(
                value.map((row) => ({
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
          {value.map((row, index) => (
            <div key={index} className="drum-row">
              <input
                aria-label={`Sample ${index + 1}`}
                defaultValue={row.sample}
                onBlur={(event) =>
                  commit(
                    value.map((r, i) =>
                      i === index ? { ...r, sample: event.target.value.trim() || '~' } : r,
                    ),
                  )
                }
              />
              <div className="drum-cells" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
                {row.steps.map((step, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-label={`${row.sample} step ${i + 1}`}
                    aria-pressed={step === 1}
                    onClick={() =>
                      commit(
                        value.map((r, j) =>
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
                ...value,
                { sample: 'cp', steps: Array.from({ length: count }, () => 0 as const) },
              ])
            }
          >
            + Voice
          </button>
          <button
            type="button"
            onClick={() =>
              commit(
                value.map((r) => r.steps.map((s) => (s ? r.sample : '~')).join(' ')).join(', '),
              )
            }
          >
            Text mode
          </button>
        </fieldset>
      )
    }
  }
}

function TextEditor({ label, value, commit }: { label: string; value: string; commit: Commit }) {
  const [draft, setDraft] = useState(value)
  const [failed, setFailed] = useState(false)
  return (
    <label className="text-control">
      {label}
      <textarea
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
      />
      <button type="button" onClick={() => setFailed(!commit(draft))}>
        Apply
      </button>
      {failed && <small role="alert">Cannot apply. Fix the source and try again.</small>}
    </label>
  )
}
