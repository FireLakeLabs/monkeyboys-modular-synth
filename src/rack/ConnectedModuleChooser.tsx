import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getModuleSpec } from '../modules/catalog'
import type { ModuleConnection } from '../workspace/discovery'

export function ConnectedModuleChooser({
  choices,
  activeChoice,
  point,
  preview,
  choose,
  cancel,
}: {
  choices: readonly ModuleConnection[]
  activeChoice: ModuleConnection | null
  point: { x: number; y: number }
  preview: (choice: ModuleConnection | null) => void
  choose: (choice: ModuleConnection) => void
  cancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  function matchesFilter(choice: ModuleConnection, value: string) {
    const spec = getModuleSpec(choice.type)
    const jack = spec.jacks.find((jack) => jack.id === choice.jack)
    return `${spec.name} ${spec.title} ${spec.paletteCall} ${jack?.label}`
      .toLowerCase()
      .includes(value.trim().toLowerCase())
  }
  const matches = choices.filter((choice) => matchesFilter(choice, filter))
  useLayoutEffect(() => search.current?.focus(), [])
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) cancel()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [cancel])
  function focusOption(direction: number) {
    const options = Array.from(
      dialog.current?.querySelectorAll<HTMLButtonElement>('[data-choice]:enabled') ?? [],
    )
    const index = options.findIndex((option) => option === document.activeElement)
    options[
      index === -1
        ? direction === 1
          ? 0
          : options.length - 1
        : (index + direction + options.length) % options.length
    ]?.focus()
  }
  return (
    <dialog
      open
      ref={dialog}
      data-module-chooser
      className="connected-module-chooser"
      aria-label="Add a connected module"
      style={{
        left: Math.max(8, Math.min(point.x, window.innerWidth - 348)),
        top: Math.max(8, Math.min(point.y, window.innerHeight - 408)),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          cancel()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          focusOption(event.key === 'ArrowDown' ? 1 : -1)
        } else if (event.key === 'Enter' && event.target === search.current) {
          event.preventDefault()
          if (activeChoice?.position && matches.includes(activeChoice)) choose(activeChoice)
        }
      }}
    >
      <div className="connected-module-heading">
        <strong>Add a connected module</strong>
        <button type="button" aria-label="Cancel adding module" onClick={cancel}>
          ×
        </button>
      </div>
      <input
        ref={search}
        type="search"
        aria-label="Find compatible modules"
        placeholder="Find a compatible module…"
        value={filter}
        onChange={(event) => {
          const value = event.target.value
          setFilter(value)
          const filtered = choices.filter((choice) => matchesFilter(choice, value))
          preview(filtered.find((choice) => choice.position) ?? filtered[0] ?? null)
        }}
      />
      <p>Select to place and connect · Esc cancels</p>
      <div className="connected-module-options">
        {matches.map((choice) => {
          const spec = getModuleSpec(choice.type)
          const jack = spec.jacks.find((jack) => jack.id === choice.jack)
          return (
            <button
              type="button"
              data-choice
              key={`${choice.type}:${choice.jack}`}
              disabled={!choice.position}
              aria-current={choice === activeChoice ? 'true' : undefined}
              title={choice.assessment.message}
              onFocus={() => preview(choice)}
              onPointerEnter={(event) => {
                if (!choice.position) return
                // Align an existing keyboard selection without taking focus from search.
                if (event.currentTarget.parentElement?.contains(document.activeElement))
                  event.currentTarget.focus({ preventScroll: true })
                preview(choice)
              }}
              onClick={() => choose(choice)}
            >
              <span>
                <strong>{spec.name}</strong> · {jack?.label} <small>{spec.hp} HP</small>
              </span>
              <span>{spec.title}</span>
              <small>
                {!choice.position
                  ? 'No room on this rail'
                  : choice.assessment.kind === 'valid'
                    ? choice.assessment.signal
                    : choice.assessment.message}
              </small>
              {choice.assessment.kind === 'valid' && choice.assessment.replaces && (
                <small>
                  Replaces the cable into {choice.assessment.replaces.module}{' '}
                  {choice.assessment.replaces.jack}
                </small>
              )}
            </button>
          )
        })}
        {!matches.length && <p>No compatible modules match.</p>}
      </div>
    </dialog>
  )
}
