import type { LookId } from '../modules/looks'

/** Panel rules apply to catalog controls; widths always come from the catalog. */
export const LOOK_LAYOUT = {
  powder: { jacks: 'bottom' },
  instrument: { jacks: 'bottom' },
  vintage: { jacks: 'top' },
  learner: { jacks: 'bottom' },
  crystal: { jacks: 'bottom' },
  bio: { jacks: 'bottom' },
  monolith: { jacks: 'bottom' },
  terminal: { jacks: 'bottom' },
  neon: { jacks: 'bottom' },
  bare: { jacks: 'bottom' },
} as const satisfies Record<LookId, { jacks: 'top' | 'bottom' }>
