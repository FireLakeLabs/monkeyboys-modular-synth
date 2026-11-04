import { useRef, useState } from 'react'
import { allowSound, receiveSound } from './drag'
import { getModuleSpec } from '../modules/catalog'
import { controlValue } from '../modules/values'
import type { ControlValue, PlacedModule } from '../patch/types'
import { type SamplePackResource } from '../strudel/engine'
import { variantCount, type SoundChoice } from './crate'

export function SampleSlot({
  module,
  resources,
  drop,
  clear,
}: {
  module: PlacedModule
  resources: readonly SamplePackResource[]
  clear: () => void
  drop: (choice: SoundChoice) => void
}) {
  const [error, setError] = useState('')
  const spec = getModuleSpec(module.type)
  const target = spec.sampleTarget
  if (!target) return null
  const control = spec.controls.find((control) => control.id === target.control)
  const value = control && controlValue(module, control)
  const selected =
    typeof value === 'string' && value
      ? /^[\w-]+$/.test(value)
        ? `${value}:${module.type === 'smpl' && typeof module.values['n'] === 'number' ? module.values['n'] : 0}`
        : value
      : ''
  const sounds = [
    ...new Map(
      resources.flatMap((resource) => resource.sounds).map((sound) => [sound.name, sound]),
    ).values(),
  ].filter((sound) => !target.prefix || sound.name.startsWith(target.prefix))
  return (
    <div className="sample-slot">
      {module.type === 'reverb' ? 'IR' : module.type === 'wavetable' ? 'TABLE' : 'SAMPLE'} · drop
      sound
      <select
        onDragOver={allowSound}
        onDrop={(event) => {
          try {
            receiveSound(event, drop)
            setError('')
          } catch (error) {
            setError(String(error))
          }
        }}
        aria-label={target.prefix ? 'Seated wavetable' : `Sound for ${module.id}`}
        value={selected}
        onChange={(event) => {
          const [name, n] = event.target.value.split(':')
          if (name) drop({ name, n: Number(n ?? 0) })
          else clear()
        }}
      >
        <option value="">{target.prefix ? 'Choose wt_ sound' : 'Choose sound'}</option>
        {selected &&
          !sounds.some((sound) =>
            Array.from(
              { length: variantCount(sound.bank) },
              (_, n) => `${sound.name}:${n}`,
            ).includes(selected),
          ) && (
            <option value={selected} disabled>
              {selected} · unavailable
            </option>
          )}
        {sounds.flatMap((sound) =>
          Array.from({ length: variantCount(sound.bank) }, (_, n) => (
            <option key={`${sound.name}:${n}`} value={`${sound.name}:${n}`}>
              {sound.name}:{n}
            </option>
          )),
        )}
      </select>
      {error && <output role="alert">{error}</output>}
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
              style={{ left: `calc(12px + (100% - 24px) * ${position})`, top: index * 19 }}
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
