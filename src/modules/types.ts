/**
 * Types for the module catalog. See docs/module-spec.md.
 */

export type Family = 'hardware' | 'alien' | 'cyber'

/** Drives the module's colour on the panel and in the code. */
export type Category = 'pattern' | 'sound' | 'shape' | 'mod' | 'fx' | 'util' | 'alien' | 'cyber'

/** What a cable carries. */
export type Signal = 'pattern' | 'audio' | 'mod'

/** Alien and Cyber jacks accept and pass through any signal. */
export type JackSignal = Signal | 'any'

export interface KnobControl {
  kind: 'knob'
  id: string
  label: string
  min: number
  max: number
  step: number
  default: number
  unit?: string
  /** Defaults to linear. Use log for frequencies. */
  taper?: 'linear' | 'log'
  /** Values the knob snaps to, when it is detented. */
  detents?: readonly number[]
  /** The generator writes nothing when the knob holds this value. */
  omitAt?: number
  /** LFO depth in this target control's units. */
  modulation?: { min: number; max: number; default: number }
}

export interface SwitchOption {
  value: string
  label: string
}

export interface SwitchControl {
  kind: 'switch'
  id: string
  label: string
  options: readonly SwitchOption[]
  default: string
}

/** SEQ's step editor. Each step is a token: a note, a degree, '~' for a rest, or '<a b>'. */
export interface StepsControl {
  kind: 'steps'
  id: string
  label: string
  maxSteps: number
  default: readonly string[]
}

export interface GridRow {
  sample: string
  steps: readonly (0 | 1)[]
}

/** DRUMS' trigger grid. */
export interface GridControl {
  kind: 'grid'
  id: string
  label: string
  stepCounts: readonly number[]
  default: readonly GridRow[]
}

/** CODE's editor. */
export interface TextControl {
  kind: 'text'
  id: string
  label: string
  default: string
}

export type Control = KnobControl | SwitchControl | StepsControl | GridControl | TextControl

export interface Jack {
  id: string
  label: string
  direction: 'in' | 'out'
  signal: JackSignal
  /** For CV inputs: the id of the knob this jack modulates. */
  cvTarget?: string
}

export interface ModuleSpec {
  /** Stable id used in patches, e.g. 'vcf'. */
  id: string
  /** Panel name, e.g. 'VCF'. */
  name: string
  /** Long name, e.g. 'Filter'. */
  title: string
  family: Family
  category: Category
  /** Width in HP (1 HP = 12 px at 100% zoom). The same in every look. */
  hp: number
  controls: readonly Control[]
  jacks: readonly Jack[]
  /**
   * Strudel functions this module writes. The reader uses this to map calls back to modules,
   * so each function belongs to exactly one module.
   */
  strudel: readonly string[]
  /** True when the module changes the pattern itself, so its position in the chain matters. */
  orderSensitive: boolean
  /** True when a rack may contain at most one. */
  unique?: boolean
}
