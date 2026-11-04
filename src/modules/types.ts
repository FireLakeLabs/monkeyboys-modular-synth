/**
 * Types for the module catalog. See docs/module-spec.md.
 */

export type Family = 'hardware' | 'alien' | 'cyber'

/** Drives the module's colour on the panel and in the code. */
export type Category = 'pattern' | 'sound' | 'shape' | 'mod' | 'fx' | 'util' | 'alien' | 'cyber'

/** Palette groups stay independent of Alien/Cyber visual accents. */
export type PaletteCategory = Exclude<Category, 'alien' | 'cyber'>

/** What a cable carries. */
export type Signal = 'pattern' | 'audio' | 'mod'

/** Passthrough transforms retain their incoming signal. */
export type JackSignal = Signal | 'any'

/** A single chained call, interpreted by both generator and reader. */
export interface CallBinding {
  method: string | { control: string; names: Readonly<Record<string, string>> }
  argument:
    | { kind: 'number' }
    | { kind: 'string' }
    | { kind: 'scale'; root: string }
    | { kind: 'transform'; expressions: Readonly<Record<string, string>> }
  /** Continue the adjacent module when this control has not already been read. */
  read?: 'merge'
  /** Suppress companion effect settings when the effect is bypassed. */
  enabledBy?: string
  /** Only write this call with a directly connected ENV. */
  withEnvelope?: string
  /** Emit the connected ENV's ADSR calls around this control's call. */
  envelope?: 'before' | 'after'
}

interface CallControl {
  call?: CallBinding
}

export interface KnobControl extends CallControl {
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

export interface SwitchControl extends CallControl {
  kind: 'switch'
  id: string
  label: string
  options: readonly SwitchOption[]
  default: string
  omitAt?: string
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
  /** Representative Strudel syntax shown and searched in the palette. */
  paletteCall: string
  /** Override the visual category for grouping Alien/Cyber modules. */
  paletteCategory?: PaletteCategory
  /** Source-only defaults for omitted calls, distinct from new rack defaults. */
  readDefaults?: Readonly<Record<string, number | string>>
  controls: readonly Control[]
  jacks: readonly Jack[]
  /**
   * Strudel functions this module writes. The reader uses this to map calls back to modules,
   * so each function belongs to exactly one module.
   */
  strudel: readonly string[]
  /** Pinned-engine aliases; source spelling is retained by the reader. */
  strudelAliases?: Readonly<Record<string, string>>
  /** True when the module changes the pattern itself, so its position in the chain matters. */
  orderSensitive: boolean
  /** True when a rack may contain at most one. */
  unique?: boolean
}
