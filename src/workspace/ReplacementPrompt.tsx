import { useEffect, useRef } from 'react'

export function ReplacementPrompt({
  title,
  action,
  replacing,
  cancel,
  exportCurrent,
  confirm,
}: {
  title: string
  action: string
  replacing: boolean
  cancel: () => void
  exportCurrent: () => void
  confirm: () => Promise<void>
}) {
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelButton.current?.focus(), [])
  return (
    <fieldset className="replace-prompt">
      <legend>{title}</legend>
      <p>Export your current work if you want to keep it. Loading stops playback.</p>
      <button type="button" ref={cancelButton} onClick={cancel}>
        Cancel
      </button>
      <button type="button" onClick={exportCurrent}>
        Export current
      </button>
      <button type="button" disabled={replacing} onClick={confirm}>
        {action}
      </button>
      {replacing && (
        <output className="pending-note" aria-live="polite">
          Waiting for confirmed Stop. Current work is retained until loading succeeds.
        </output>
      )}
    </fieldset>
  )
}
