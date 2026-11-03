import { useEffect, useRef } from 'react'

export function RestorePrompt({
  hasDraft,
  restore,
  discard,
}: {
  hasDraft: boolean
  restore: () => void
  discard: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="restore-prompt"
      aria-labelledby="restore-title"
      aria-describedby="restore-description"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="restore-title">Restore last patch?</h2>
      <p id="restore-description">
        A local copy of your last patch is available in this browser. Restoring keeps audio stopped
        until you press Play.
        {hasDraft && ' Your unfinished draft will return beside the last readable rack.'}
      </p>
      <button type="button" onClick={restore}>
        Restore last patch
      </button>
      <button type="button" onClick={discard}>
        Discard saved patch
      </button>
    </dialog>
  )
}
