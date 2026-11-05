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
      <p>
        Undo can’t bring back code that hasn’t been applied, so export it first if you want to keep
        it. {stopWarning}
      </p>
      <button type="button" ref={cancelButton} onClick={cancel}>
        Cancel
      </button>
      <button type="button" onClick={exportCurrent}>
        Export code
      </button>
      <button
        type="button"
        className="button button-primary confirm-replacement"
        disabled={replacing}
        onClick={confirm}
      >
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
