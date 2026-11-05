export type LockReason = 'draft' | 'unreadable' | 'composing' | 'metadata'

const REASONS: Record<LockReason, string> = {
  draft: 'Your code has changes that aren’t applied yet',
  unreadable: 'Fix the code or revert to unlock',
  composing: 'Finish composing to unlock',
  metadata: 'This patch’s saved rack can’t be read',
}

/** The live region stays mounted, so the lock is announced when it appears. */
export function RackLock({
  reason,
  pulsing,
  apply,
  revert,
  replaceMetadata,
}: {
  reason: LockReason | null
  pulsing: boolean
  apply: () => void
  revert: () => void
  replaceMetadata: () => void
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className="rack-lock-region" role="status" aria-live="polite">
      {reason && (
        <div className="rack-lock" data-pulse={pulsing}>
          <svg viewBox="0 0 12 14" width="12" height="14" aria-hidden="true">
            <path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="1" y="6" width="10" height="7" rx="1.5" fill="currentColor" />
          </svg>
          <strong>Rack locked</strong>
          <span>{REASONS[reason]}</span>
          {reason === 'draft' && (
            <button type="button" onClick={apply}>
              Apply
            </button>
          )}
          {(reason === 'draft' || reason === 'unreadable') && (
            <button type="button" onClick={revert}>
              Revert
            </button>
          )}
          {reason === 'metadata' && (
            <button type="button" onClick={replaceMetadata}>
              Replace metadata
            </button>
          )}
        </div>
      )}
    </div>
  )
}
