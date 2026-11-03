import { useEffect, useRef } from 'react'

export function ReplacementPrompt({
  title,
  action,
  stopWarning,
  replacing,
  cancel,
  exportCurrent,
  confirm,
}: {
  title: string
  action: string
  stopWarning: string
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
      <p>Export your current work if you want to keep it. {stopWarning}</p>
      <button type="button" ref={cancelButton} onClick={cancel}>
        Cancel
      </button>
      <button type="button" onClick={exportCurrent}>
        Export current
      </button>
      <button type="button" className="confirm-replacement" disabled={replacing} onClick={confirm}>
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
