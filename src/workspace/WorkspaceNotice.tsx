import { useEffect, useState } from 'react'

export type NoticeAction = 'undo' | 'start-new' | 'cancel-load'

/** A short message about something that already happened, often with a way back. */
export interface Notice {
  message: string
  action?: NoticeAction
  tone?: 'error'
  /** Stays until something ends it, because it describes work in progress. */
  sticky?: boolean
  /** A knob gesture keeps its notice across the live values of that gesture. */
  group?: object | undefined
  /** Where keyboard focus goes after Undo, once the restored rack has rendered. */
  undoFocus?: string | undefined
}

/** Long enough to read and reach; hover and focus hold it open. */
export const NOTICE_MS = 12_000

const ACTION_LABELS: Record<NoticeAction, string> = {
  undo: 'Undo',
  'start-new': 'Start new',
  'cancel-load': 'Cancel',
}

export function WorkspaceNotice({
  notice,
  act,
  dismiss,
}: {
  notice: Notice | null
  act: (action: NoticeAction) => void
  dismiss: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const held = hovered || focused
  useEffect(() => {
    if (!notice || notice.sticky || held) return undefined
    const timer = setTimeout(dismiss, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice, held, dismiss])
  // The live region stays mounted, so a new message is announced rather than inserted silently.
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className="workspace-notice-region" role="status" aria-live="polite">
      {notice && (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className="workspace-notice"
          data-tone={notice.tone}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') dismiss()
          }}
        >
          <span>{notice.message}</span>
          {notice.action && (
            <button
              type="button"
              // The name says what it undoes; the header's own Undo stays plain "Undo".
              aria-label={`${ACTION_LABELS[notice.action]}: ${notice.message}`}
              title={notice.action === 'undo' ? 'Ctrl/Cmd+Z' : undefined}
              onClick={() => {
                setHovered(false)
                setFocused(false)
                if (notice.action) act(notice.action)
              }}
            >
              {ACTION_LABELS[notice.action]}
            </button>
          )}
          <button
            type="button"
            className="workspace-notice-dismiss"
            aria-label="Dismiss message"
            onClick={() => {
              setHovered(false)
              setFocused(false)
              dismiss()
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
