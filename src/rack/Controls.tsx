import type { SoundChoice } from '../samples/crate'
import { controlValue } from '../modules/values'
import { controlEnabled } from '../modules/bindings'
import { getModuleSpec } from '../modules/catalog'
import { useRef, useState, type CSSProperties } from 'react'
import { patternNumber } from '../modules/bindings'
import type { Control, KnobControl, SwitchControl } from '../modules/types'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { isGrid, isSteps } from '../codegen/graph'
import { drumText } from '../patch/notation'
import { MiniEditor } from './MiniEditor'
import {
  depthControl,
  draggedValue,
  keyboardValue,
  normalized,
  sequenceText,
  snap,
  switchStyle,
} from './model'

const focusEditor = (element: HTMLInputElement | null) => element?.focus()

type Commit = (value: ControlValue, historyGroup?: object) => boolean

export function Numeric({
  control,
  value,
  commit,
  fader = false,
}: {
  control: KnobControl
  value: number
  commit: Commit
  fader?: boolean
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
        className={fader ? 'fader' : 'knob'}
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
        style={
          fader
            ? ({ '--level': normalized(control, value) } as CSSProperties)
            : { transform: `rotate(${-135 + normalized(control, value) * 270}deg)` }
        }
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
          // A fader follows the pointer along its own track.
          const travel = fader ? event.currentTarget.getBoundingClientRect().height : 200
          current.position = Math.max(
            0,
            Math.min(
              1,
              current.position + (current.y - event.clientY) / (travel * (event.shiftKey ? 10 : 1)),
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
  notationEscaped = false,
  dropSample,
}: {
  patch: Patch
  module: PlacedModule
  control: Control
  commit: Commit
  dropSample?: ((choice: SoundChoice, row: number) => void) | undefined
  notationEscaped?: boolean
  editSource?: () => void
}) {
  const drawbarGesture = useRef<object | undefined>(undefined)
  const value = controlValue(module, control)
  if (!controlEnabled(getModuleSpec(module.type), module.values, control)) return null
  switch (control.kind) {
    case 'drawbars': {
      const bars =
        Array.isArray(value) && value.every((v: unknown) => typeof v === 'number')
          ? value
          : control.default
      return (
        <fieldset className="drawbar-control">
          <legend>{control.label}</legend>
          <select
            aria-label="Harmonic count"
            value={bars.length}
            onChange={(event) =>
              commit(Array.from({ length: Number(event.target.value) }, (_, i) => bars[i] ?? 0))
            }
          >
            {Array.from({ length: control.maxBars }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1} partials
              </option>
            ))}
          </select>
          <div className="drawbars">
            {bars.map((bar, i) => (
              <label key={i}>
                {i + 1}
                <input
                  type="range"
                  aria-label={`Partial ${i + 1}`}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={bar}
                  onPointerDown={() => {
                    drawbarGesture.current = {}
                  }}
                  onPointerUp={() => {
                    drawbarGesture.current = undefined
                  }}
                  onPointerCancel={() => {
                    drawbarGesture.current = undefined
                  }}
                  onLostPointerCapture={() => {
                    drawbarGesture.current = undefined
                  }}
                  onChange={(event) =>
                    commit(
                      bars.map((v, j) => (i === j ? Number(event.target.value) : v)),
                      drawbarGesture.current,
                    )
                  }
                />
                <output>{bar}</output>
              </label>
            ))}
          </div>
        </fieldset>
      )
    }
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
      return typeof n === 'number' ? (
        <Numeric control={knob} value={n} commit={commit} fader={control.group !== undefined} />
      ) : null
    }
    case 'switch':
      return (
        <SwitchEditor
          control={control}
          group={`${module.id}:${control.id}`}
          hp={getModuleSpec(module.type).hp}
          value={typeof value === 'string' ? value : control.default}
          commit={commit}
        />
      )
    case 'text':
      if (control.notation && typeof value === 'string')
        return (
          <MiniEditor
            escaped={notationEscaped}
            text={value}
            label={control.label}
            token={control.notation}
            moduleId={module.id}
            controlId={control.id}
            width={getModuleSpec(module.type).hp * 12 - 16}
            commit={commit}
          />
        )
      if (editSource)
        return (
          <div className="text-control">
            <pre>{typeof value === 'string' ? value : control.default}</pre>
            <button type="button" onClick={editSource}>
              Edit in source
            </button>
          </div>
        )
      if (module.type === 'mix' || getModuleSpec(module.type).sections)
        return (
          <StringEditor
            key={
              getModuleSpec(module.type).sections && typeof value === 'string' ? value : undefined
            }
            label={control.label}
            value={typeof value === 'string' ? value : control.default}
            commit={commit}
          />
        )
      return (
        <TextEditor
          key={typeof value === 'string' ? value : control.default}
          label={module.type === 'code' ? 'CODE source' : control.label}
          value={typeof value === 'string' ? value : control.default}
          commit={commit}
          notation={control.id === 'accent'}
        />
      )
    case 'steps': {
      if (!isSteps(value)) return null
      const text = typeof value === 'string' ? value : sequenceText(module, value)
      return (
        <MiniEditor
          escaped={notationEscaped}
          text={text}
          label={control.label}
          token={control.token ?? 'note'}
          moduleId={module.id}
          controlId={control.id}
          commit={commit}
        />
      )
    }
    case 'grid': {
      if (!isGrid(value)) return null
      const text = typeof value === 'string' ? value : drumText(value)
      return (
        <MiniEditor
          dropSample={dropSample}
          escaped={notationEscaped}
          text={text}
          label={control.label}
          token="sample"
          moduleId={module.id}
          controlId={control.id}
          width={109}
          commit={commit}
        />
      )
    }
  }
}

function SwitchEditor({
  control,
  group,
  hp,
  value,
  commit,
}: {
  control: SwitchControl
  group: string
  hp: number
  value: string
  commit: Commit
}) {
  const style = switchStyle(control, hp)
  if (style === 'toggle')
    return (
      <button
        type="button"
        className="toggle-control"
        aria-label={control.label}
        aria-pressed={value === 'on'}
        data-short={control.short}
        title={control.short ? control.label : undefined}
        onClick={() => commit(value === 'on' ? 'off' : 'on')}
      >
        {control.short ?? control.label}
      </button>
    )
  if (style === 'segments')
    return (
      // Native radios supply the arrow-key behavior; the group only needs its name.
      <div className="switch-control" role="radiogroup" aria-label={control.label}>
        <span aria-hidden="true">{control.label}</span>
        <div className="segments">
          {control.options.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={group}
                value={option.value}
                checked={option.value === value}
                onChange={() => commit(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    )
  return (
    <label className="switch-control">
      {control.label}
      <select
        aria-label={control.label}
        value={value}
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
    <label className={notation ? 'text-control notation-control' : 'text-control'}>
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

function StringEditor({ label, value, commit }: { label: string; value: string; commit: Commit }) {
  const [draft, setDraft] = useState(value)
  return (
    <label className="switch-control">
      {label}
      <input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value && !commit(draft)) setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value)
          }
        }}
      />
    </label>
  )
}
