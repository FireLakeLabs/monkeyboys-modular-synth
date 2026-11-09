/**
 * Types for the module catalog. See docs/module-spec.md.
 */

export type Family = 'hardware' | 'alien' | 'cyber'

/** Drives the module's colour on the panel and in the code. */
export type Category = 'pattern' | 'sound' | 'shape' | 'mod' | 'fx' | 'util' | 'alien' | 'cyber'

/** Palette groups stay independent of Alien/Cyber visual accents. */
export type PaletteCategory = Exclude<Category, 'alien' | 'cyber'>

/** What a cable carries. */
export type Signal = 'pattern' | 'audio' | 'mod' | 'function'

/** Passthrough transforms retain their incoming signal. */
export type JackSignal = Signal | 'any'

/** A single chained call, interpreted by both generator and reader. */
export interface CallBinding {
  method: string | { control: string; names: Readonly<Record<string, string>> }
  argument:
    | { kind: 'number'; precision?: number; optional?: string }
    | { kind: 'array' }
    | { kind: 'string' }
    | { kind: 'scale'; root: string }
    | { kind: 'transform'; expressions: Readonly<Record<string, string>> }
    | {
        kind: 'tuple'
        controls: readonly string[]
        /** Mode-specific arity, including nullary transforms. */
        byMethod?: Readonly<Record<string, readonly string[]>>
        /** An active time span must have a strictly increasing start and end. */
        ascending?: readonly [string, string]
        /** An active pair of controls must satisfy first <= second. */
        atMost?: readonly [string, string]
      }
  /** Merge continues an adjacent owner; companion requires one or remains exact CODE. */
  read?: 'merge' | 'companion'
  /** Emit only in this mode; reading the call activates that mode. */
  when?: { control: string; value: string }
  /** A recognized call selects a panel mode independently of method variants. */
  selects?: Readonly<Record<string, string>>
  /** Suppress companion effect settings when the effect is bypassed. */
  enabledBy?: string
  /** Only write this call with a directly connected ENV. */
  withEnvelope?: string
  /** Emit the connected ENV's ADSR calls around this control's call. */
  envelope?: 'before' | 'after'
}

interface CallControl {
  /** Saved panel state that never changes executable source. */
  presentationOnly?: true
  call?: CallBinding
  /** Mode-specific controls retain saved values but neither display nor emit while inactive. */
  when?: readonly { control: string; values: readonly string[] }[]
  group?: string
  /** Rarely used: shown in the panel's More flyout, with the same value and call. */
  more?: true
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
  modulation?: { min: number; max: number; default: number; pitch?: boolean; audioScale?: number }
}

export interface SwitchOption {
  value: string
  label: string
}

export interface SwitchControl extends CallControl {
  kind: 'switch'
  id: string
  label: string
  /** Printed on a narrow toggle; `label` remains its accessible name. */
  short?: string
  options: readonly SwitchOption[]
  /** Equivalent imported literals; saved panel values use the canonical option. */
  aliases?: Readonly<Record<string, string>>
  default: string
  omitAt?: string
}

/** Shared lossless mini-notation editor; arrays retain the legacy rack format. */
export interface StepsControl {
  kind: 'steps'
  id: string
  label: string
  maxSteps: number
  token?: 'note' | 'number' | 'gate'
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
export interface TextControl extends CallControl {
  notation?: 'chord'
  /** Executable formula syntax; parsing is not a sandbox. */
  syntax?: 'bytebeat'

  kind: 'text'
  id: string
  label: string
  default: string
  omitAt?: string
}

export interface DrawbarControl extends CallControl {
  kind: 'drawbars'
  id: string
  label: string
  min: number
  max: number
  step: number
  maxBars: number
  default: readonly number[]
}

export type Control =
  DrawbarControl | KnobControl | SwitchControl | StepsControl | GridControl | TextControl

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
  /** An atomic pattern source followed by its required nullary calls. */
  source?: { method: string; control: string; suffix: readonly string[] }
  /** Behavior of absent fields in older saved patches; new modules store the new defaults. */
  legacyDefaults?: Readonly<Record<string, number | string>>
  /** SEND/RETURN wraps a chain as the final function argument. */
  functionLoop?: {
    method: CallBinding['method']
    controls: readonly string[]
    byMethod?: Readonly<Record<string, readonly string[]>>
    preset: string
    role: string
    when?: { control: string; value: string }
  }
  controls: readonly Control[]
  jacks: readonly Jack[]
  /**
   * Strudel functions this module writes. The reader uses this to map calls back to modules,
   * so each function belongs to exactly one module.
   */
  strudel: readonly string[]
  /** Pinned-engine aliases; source spelling is retained by the reader. */
  strudelAliases?: Readonly<Record<string, string>>
  /** Sound selectors that may also start an unpatched voice. */
  soundSource?: string | { fixed: string }
  /** Persistent explanation for exceptional sound behavior. */
  notice?: string
  /** Crate drop slot; prefix constrains the offered inventory. */
  sampleTarget?: { control: string; prefix?: string }
  /** Dedicated modulation panel patched to this destination jack. */
  operatorTarget?: { type: string; jack: string }
  /** Engine waveform names for audio-rate LFOs (pattern names remain unchanged). */
  smoothShapes?: Readonly<Record<string, string>>
  /** Pattern-valued modulation source/utility, interpreted inside a CV argument. */
  modSource?: 'sequence' | 'sampleHold' | 'attenuverter' | 'mix'
  /** True when the module changes the pattern itself, so its position in the chain matters. */
  orderSensitive: boolean
  /** True when a rack may contain at most one. */
  unique?: boolean
}
