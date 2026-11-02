// @strudel/web ships without TypeScript types. Declare only what the app uses.
declare module '@strudel/web' {
  export interface InitStrudelOptions {
    /** Runs before the first evaluation; typically loads samples. */
    prebake?: () => unknown
    /** The upstream evaluator catches errors unless this callback rethrows. */
    onEvalError?: (error: unknown) => void
  }

  export function initStrudel(options?: InitStrudelOptions): Promise<unknown>
  /** Evaluates code the way the Strudel REPL does (double quotes are mini-notation). */
  export function evaluate(code: string): Promise<unknown>
  /** Initializes audio worklets; call explicitly after lazy import. */
  export function initAudio(): Promise<void>
  export function getAudioContext(): AudioContext
  /** Stops scheduling; existing notes and effect tails can ring out. */
  export function hush(): void
  /** Registers a sample source, e.g. 'github:tidalcycles/dirt-samples'. */
  export function samples(
    source: string | Record<string, unknown>,
    baseUrl?: string,
  ): Promise<unknown>
}
