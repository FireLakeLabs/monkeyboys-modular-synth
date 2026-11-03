// @strudel/web ships without TypeScript types. Declare only what the app uses.
declare module '@strudel/web' {
  /** Minimal installed core pattern surface used by the scheduling guard. */
  export class Pattern {
    constructor(query: (state: unknown) => unknown[], steps?: unknown)
    query(state: unknown): unknown[]
    _steps: unknown
  }
  export interface InitStrudelOptions {
    /** Runs before the first evaluation; typically loads samples. */
    prebake?: () => unknown
    /** Version-specific guard immediately before scheduler installation. */
    editPattern?: (pattern: Pattern) => Pattern
    onToggle?: (started: boolean) => void
    /** The upstream evaluator catches errors unless this callback rethrows. */
    onEvalError?: (error: unknown) => void
  }

  export function initStrudel(options?: InitStrudelOptions): Promise<unknown>
  /** Evaluates code the way the Strudel REPL does (double quotes are mini-notation). */
  export function evaluate(code: string): Promise<unknown>
  /** Initializes audio worklets; call explicitly after lazy import. */
  export function initAudio(): Promise<void>
  export function getAudioContext(): AudioContext
  /** Version-specific output boundary; resetGlobalEffects replaces this gain node. */
  export function getSuperdoughAudioController(): {
    output: { destinationGain: GainNode }
  }
  export function resetGlobalEffects(): void
  /** Stops scheduling; existing notes and effect tails can ring out. */
  export function hush(): void
  /** Registers a sample source, e.g. 'github:tidalcycles/dirt-samples'. */
  export function samples(
    source: string | Record<string, unknown>,
    baseUrl?: string,
  ): Promise<unknown>
}
