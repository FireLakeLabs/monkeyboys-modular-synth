import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8

/** Rarely used controls, floating beside the panel like the nested editor's tray. */
export function MoreFlyout({
  label,
  locked,
  children,
}: {
  label: string
  locked: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const tray = useRef<HTMLDialogElement>(null)
  const showing = open && !locked
  function place() {
    const element = tray.current
    const panel = toggle.current?.closest('.module-panel')?.getBoundingClientRect()
    if (!element || !panel) return
    const { width, height } = element.getBoundingClientRect()
    const right = panel.right + GAP
    const left = right + width + GAP <= window.innerWidth ? right : panel.left - width - GAP
    element.style.left = `${Math.max(GAP, left)}px`
    element.style.top = `${Math.max(GAP, Math.min(window.innerHeight - height - GAP, panel.top))}px`
  }
  useLayoutEffect(() => {
    if (!showing) return
    place()
    tray.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
  }, [showing])
  useEffect(() => {
    if (!showing) return
    const outside = (event: Event) => {
      if (event.target instanceof Node && !tray.current?.contains(event.target)) {
        if (!toggle.current?.contains(event.target)) setOpen(false)
      }
    }
    // Committing a value drops focus to the page, so Escape cannot rely on the tray having it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    // Selecting a panel can scroll the rack, so the tray follows it instead of closing.
    document.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', place, true)
    }
  }, [showing])
  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="button more-toggle"
        aria-label={`More ${label}`}
        aria-expanded={showing}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        More ▸
      </button>
      {showing &&
        createPortal(
          <dialog open ref={tray} className="module-flyout" aria-label={label}>
            <strong>{label}</strong>
            <div className="module-flyout-controls">{children}</div>
          </dialog>,
          document.body,
        )}
    </>
  )
}
