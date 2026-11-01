import type { Family } from './types'

/** Looks a module can wear, by family. See docs/decisions.md#looks. */
export const LOOKS = {
  hardware: ['powder', 'instrument', 'vintage', 'learner'],
  alien: ['crystal', 'bio', 'monolith'],
  cyber: ['terminal', 'neon', 'bare'],
} as const satisfies Record<Family, readonly string[]>

export type HardwareLook = (typeof LOOKS.hardware)[number]
export type AlienLook = (typeof LOOKS.alien)[number]
export type CyberLook = (typeof LOOKS.cyber)[number]
export type LookId = HardwareLook | AlienLook | CyberLook

export const LOOK_LABELS: Record<LookId, string> = {
  powder: 'Powder coat',
  instrument: 'Instrument',
  vintage: 'Vintage lab',
  learner: 'Learner',
  crystal: 'Crystal',
  bio: 'Bioluminescent',
  monolith: 'Monolith',
  terminal: 'Terminal',
  neon: 'Neon wireframe',
  bare: 'Bare board',
}

/** The look a newly added module gets. */
export const DEFAULT_LOOK: Record<Family, LookId> = {
  hardware: 'instrument',
  alien: 'crystal',
  cyber: 'bare',
}

export function looksFor(family: Family): readonly LookId[] {
  return LOOKS[family]
}
