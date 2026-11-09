import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getModuleSpec } from '../modules/catalog'
import { groupByModule, type ModuleConnection } from '../workspace/discovery'

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
  const modules = groupByModule(matches)
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
        } else if (
          (event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
          event.target !== search.current
        ) {
          // Search keeps Left/Right for its caret; jack buttons read left to right.
          event.preventDefault()
          focusOption(event.key === 'ArrowRight' ? 1 : -1)
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
        {modules.map(({ type, families }) => {
          const spec = getModuleSpec(type)
          const options = families.flatMap((family) => family.options)
          const fits = options.some((option) => option.choice.position)
          return (
            <section
              key={type}
              data-chooser-module={type}
              aria-label={`${spec.name} ${spec.title}`}
              className={`chip connected-module-card cat-${spec.category} chip-${spec.family}`}
            >
              <header>
                <span className="chip-name">{spec.name}</span>
                <code className="chip-call">{spec.paletteCall}</code>
                <small>{spec.hp} HP</small>
              </header>
              <span className="connected-module-title">{spec.title}</span>
              {families.map((family) => (
                <div key={family.label ?? ''} className="jack-family">
                  {family.label !== null && (
                    <span className="jack-family-label" aria-hidden="true">
                      {family.label}
                    </span>
                  )}
                  {family.options.map(({ text, name, choice }) => (
                    <button
                      type="button"
                      data-choice
                      key={choice.jack}
                      className={`jack-choice signal-${choice.assessment.signal} ${choice.assessment.kind}`}
                      disabled={!choice.position}
                      aria-label={name}
                      aria-current={choice === activeChoice ? 'true' : undefined}
                      title={choice.assessment.message}
                      onFocus={() => preview(choice)}
                      onPointerEnter={(event) => {
                        if (!choice.position) return
                        // Align an existing keyboard selection without taking focus from search.
                        if (
                          event.currentTarget
                            .closest('.connected-module-options')
                            ?.contains(document.activeElement)
                        )
                          event.currentTarget.focus({ preventScroll: true })
                        preview(choice)
                      }}
                      onClick={() => choose(choice)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              ))}
              {!fits && <small>No room on this rail</small>}
              {options
                .filter(({ choice }) => choice.assessment.kind !== 'valid')
                .map(({ name, choice }) => (
                  <small key={choice.jack}>
                    {name}: {choice.assessment.message}
                  </small>
                ))}
              {options.map(({ name, choice }) =>
                choice.assessment.replaces ? (
                  <small key={`${choice.jack}:replaces`}>
                    {name} replaces the cable into {choice.assessment.replaces.module}{' '}
                    {choice.assessment.replaces.jack}
                  </small>
                ) : null,
              )}
            </section>
          )
        })}
        {!matches.length && <p>No compatible modules match.</p>}
      </div>
    </dialog>
  )
}
