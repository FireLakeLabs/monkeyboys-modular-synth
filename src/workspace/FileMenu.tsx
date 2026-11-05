import { useEffect, useRef, useState } from 'react'

/** A disclosure of plain buttons, so Tab, Enter and Space work as they do everywhere else. */
export function FileMenu({
  newPatch,
  openFile,
  openLibrary,
  exportFile,
  bounce,
  bounceCycles,
  setBounceCycles,
  bouncing,
  bounceDisabled,
  openInStrudel,
}: {
  newPatch: () => void
  openFile: () => void
  openLibrary: () => void
  exportFile: () => void
  bounce: () => void
  bounceCycles: string
  setBounceCycles: (value: string) => void
  bouncing: boolean
  bounceDisabled: boolean
  openInStrudel: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape)
    }
  }, [open])
  // Focus returns first, so a dialog opened by the action returns here when it closes.
  const run = (action: () => void) => () => {
    setOpen(false)
    toggle.current?.focus()
    action()
  }
  return (
    <div ref={root} className="file-menu">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="file-menu-items"
        onClick={() => setOpen((shown) => !shown)}
      >
        File
      </button>
      <div id="file-menu-items" className="file-menu-items" hidden={!open}>
        <button type="button" onClick={run(newPatch)}>
          New patch
        </button>
        <button type="button" onClick={run(openFile)}>
          Open file
        </button>
        <button type="button" onClick={run(openLibrary)}>
          Patch library
        </button>
        <button type="button" onClick={run(exportFile)}>
          Export
        </button>
        <div className="file-menu-bounce">
          <button
            type="button"
            disabled={bounceDisabled}
            title="Download the applied patch as a WAV; stops playback. 1–128 cycles, up to 10 minutes."
            onClick={run(bounce)}
          >
            {bouncing ? 'Bouncing…' : 'Bounce WAV'}
          </button>
          <label className="bounce-cycles">
            Cycles
            <input
              aria-label="Bounce cycles"
              type="number"
              min="1"
              max="128"
              step="1"
              value={bounceCycles}
              disabled={bouncing}
              onChange={(event) => setBounceCycles(event.currentTarget.value)}
            />
          </label>
        </div>
        <button
          type="button"
          title="Opens the last applied code, not an unapplied draft"
          onClick={run(openInStrudel)}
        >
          Open in Strudel
        </button>
      </div>
    </div>
  )
}
