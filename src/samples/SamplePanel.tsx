import { useRef, useState } from 'react'
import { getModuleSpec } from '../modules/catalog'
import { controlValue } from '../modules/values'
import type { ControlValue, PlacedModule } from '../patch/types'
import { type SamplePackResource } from '../strudel/engine'
import { slotValue, type SoundChoice } from './crate'
import { findSound, parseToken, soundParts } from './soundIndex'
import { SoundPicker } from './SoundPicker'

/** A sound slot's readout. Its list exists only while the picker is open. */
export function SampleSlot({
  module,
  resources,
  patchSounds,
  locked,
  picking,
  drop,
  clear,
  browseAll,
  openPacks,
  loadSounds,
}: {
  module: PlacedModule
  resources: readonly SamplePackResource[]
  /** Tokens the patch's sound slots hold, for the picker's first view. */
  patchSounds: readonly string[]
  locked: boolean
  /** The Sounds dock is choosing for this slot. */
  picking: boolean
  /** Returns false when the rack refused the edit and reported why. */
  drop: (choice: SoundChoice) => boolean
  clear: () => void
  browseAll: (query: string) => void
  openPacks: () => void
  loadSounds: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const readout = useRef<HTMLButtonElement>(null)
  const target = getModuleSpec(module.type).sampleTarget
  if (!target) return null
  const value = slotValue(module)
  const choice = parseToken(value)
  const sound = choice ? findSound(resources, choice.name) : undefined
  const loaded = !!choice && !!sound && choice.n < sound.count
  const parts = choice ? (sound ?? soundParts(choice.name, '')) : { bank: '', short: value }
  const caption = module.type === 'reverb' ? 'IR' : module.type === 'wavetable' ? 'TABLE' : 'SAMPLE'
  return (
    <div
      className="sample-slot"
      data-value={value}
      data-state={value && !loaded ? 'missing' : undefined}
    >
      <span className="sample-slot-caption">{caption}</span>
      <button
        ref={readout}
        type="button"
        className="sample-readout"
        aria-label={`Sound for ${module.id}: ${value || 'none'}${value && !loaded ? ', not loaded' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open && !locked}
        title={value || undefined}
        disabled={locked}
        onClick={() => setOpen(!open)}
      >
        {picking ? (
          <>
            <span className="sample-readout-bank">◂ choosing…</span>
            {value && <span className="sample-readout-token">was {value}</span>}
          </>
        ) : value ? (
          <>
            {parts.bank && <span className="sample-readout-bank">{parts.bank}</span>}
            <span className="sample-readout-token">
              {choice ? `${parts.short}:${choice.n}` : value}
            </span>
            {!loaded && <span className="sample-readout-missing">not loaded</span>}
          </>
        ) : (
          <span className="sample-readout-empty">
            {target.prefix ? `Choose ${target.prefix} sound` : 'Choose sound'}
          </span>
        )}
      </button>
      {open && !locked && (
        <SoundPicker
          moduleId={module.id}
          prefix={target.prefix}
          value={value}
          resources={resources}
          patchSounds={patchSounds.filter((token) => token !== value)}
          anchor={readout}
          choose={drop}
          clear={clear}
          browseAll={(query) => {
            setOpen(false)
            browseAll(query)
          }}
          openPacks={() => {
            setOpen(false)
            openPacks()
          }}
          loadSounds={loadSounds}
          close={(refocus) => {
            setOpen(false)
            if (refocus) readout.current?.focus()
          }}
        />
      )}
    </div>
  )
}
export function Tape({
  module,
  commit,
}: {
  module: PlacedModule
  commit: (id: string, value: ControlValue, group?: object) => boolean
}) {
  const spec = getModuleSpec(module.type)
  const gesture = useRef<{
    id: string
    start: number
    left: number
    width: number
    group: object
  } | null>(null)
  const points = ['begin', 'end', 'loopBegin', 'loopEnd'] as const
  return (
    <fieldset className="tape-view">
      <legend>TAPE</legend>
      <div className="tape-strip">
        {points.map((id, index) => {
          const control = spec.controls.find((control) => control.id === id)
          const value = control && controlValue(module, control)
          const position = typeof value === 'number' ? value : 0
          const commitPointer = (x: number) => {
            const current = gesture.current
            if (current)
              commit(
                id,
                Math.round(Math.max(0, Math.min(1, (x - current.left) / current.width)) * 100) /
                  100,
                current.group,
              )
          }
          return (
            <button
              key={id}
              type="button"
              className="tape-mark"
              data-mark={id}
              // A horizontal marker supports pointer capture and keyboard editing on the tape.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="slider"
              aria-label={`Tape ${control?.label}`}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={position}
              aria-orientation="horizontal"
              title={`${control?.label} ${position}`}
              style={{ left: `calc(12px + (100% - 24px) * ${position})`, top: index * 17 }}
              onPointerDown={(event) => {
                const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
                if (!bounds || event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                gesture.current = {
                  id,
                  start: position,
                  left:
                    bounds.left +
                    (12 * bounds.width) /
                      (event.currentTarget.parentElement?.offsetWidth ?? bounds.width),
                  width:
                    bounds.width *
                    (1 - 24 / (event.currentTarget.parentElement?.offsetWidth ?? bounds.width)),
                  group: {},
                }
              }}
              onPointerMove={(event) => {
                if (gesture.current?.id === id) commitPointer(event.clientX)
              }}
              onPointerUp={() => {
                gesture.current = null
              }}
              onPointerCancel={() => {
                const current = gesture.current
                gesture.current = null
                if (current) commit(id, current.start, current.group)
              }}
              onLostPointerCapture={() => {
                gesture.current = null
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 1
                      : event.key === 'ArrowLeft'
                        ? Math.max(0, position - 0.01)
                        : event.key === 'ArrowRight'
                          ? Math.min(1, position + 0.01)
                          : null
                if (next !== null) {
                  event.preventDefault()
                  commit(id, Math.round(next * 100) / 100)
                }
              }}
            >
              {['B', 'E', 'LB', 'LE'][index]}
            </button>
          )
        })}
      </div>
      <label>
        LOOP
        <input
          type="checkbox"
          checked={module.values['loop'] === 1}
          onChange={(event) => commit('loop', Number(event.target.checked))}
        />
      </label>
    </fieldset>
  )
}
export function RazorMarks({ module }: { module: PlacedModule }) {
  const control = getModuleSpec(module.type).controls.find((control) => control.id === 'count')
  const value = control && controlValue(module, control)
  const count = typeof value === 'number' ? value : 4
  return (
    <div className="razor-marks" aria-label={`${count} razor slices`}>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={{ left: `${(i / count) * 100}%` }} />
      ))}
    </div>
  )
}
