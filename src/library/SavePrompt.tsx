import { useEffect, useRef, useState } from 'react'

/** The first save of a patch asks what to call it. */
export function SavePrompt({
  name,
  save,
  cancel,
}: {
  name: string
  save: (name: string) => void
  cancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState(name)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    element?.querySelector('input')?.select()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="save-prompt"
      aria-labelledby="save-prompt-title"
      onCancel={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (value.trim()) save(value.trim())
        }}
      >
        <h2 id="save-prompt-title">Save to My patches</h2>
        <label>
          Name
          <input value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        </label>
        <p>Saved in this browser only. Export a patch to keep a copy elsewhere.</p>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={!value.trim()}>
          Save
        </button>
      </form>
    </dialog>
  )
}
