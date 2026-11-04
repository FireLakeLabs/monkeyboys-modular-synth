// @strudel/web ships without TypeScript types. Declare only what the app uses.
declare module '@strudel/web' {
  /** Minimal installed core pattern surface used by the scheduling guard. */
  export class Pattern {
    constructor(query: (state: unknown) => unknown[], steps?: unknown)
    onTrigger(
      callback: (
        hap: unknown,
        currentAudioTime: number,
        cps: number,
        targetAudioTime: number,
      ) => void,
      dominant: false,
    ): Pattern
    query(state: unknown): unknown[]
    queryArc(begin: number, end: number, controls: { _cps: number }): unknown[]
    _steps: unknown
  }
  export interface InitStrudelOptions {
    defaultOutput?: typeof webaudioOutput
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
  export function evaluate(code: string, autoplay?: boolean): Promise<Pattern>
  /** Initializes audio worklets; call explicitly after lazy import. */
  export function initAudio(): Promise<void>
  export function getAudioContext(): AudioContext
  export function setAudioContext(context: AudioContext): void
  export function setSuperdoughAudioController(
    controller: ReturnType<typeof getSuperdoughAudioController>,
  ): void
  export function getCps(): number
  export function webaudioOutput(
    hap: unknown,
    deadline: number,
    duration: number,
    cps: number,
    time: number,
  ): Promise<void>
  /** Pinned webaudio 1.3.0: awaits each superdough trigger before startRendering. */
  export function renderPatternAudio(
    pattern: Pick<Pattern, 'queryArc'>,
    cps: number,
    begin: number,
    end: number,
    sampleRate: number,
    maxPolyphony: number,
    multiChannelOrbits: boolean,
    downloadName: string,
  ): Promise<void>
  /** Version-specific output boundary; resetGlobalEffects replaces this gain node. */
  export function getSuperdoughAudioController(): {
    output: { destinationGain: GainNode }
  }
  export function resetGlobalEffects(): void
  /** Stops scheduling; existing notes and effect tails can ring out. */
  export function hush(): void
  /** One voice, without evaluating code or installing a scheduler pattern. */
  export function superdough(
    value: Record<string, unknown>,
    time: number,
    duration: number,
    cps: number,
    cycle: number,
  ): Promise<unknown>
  /** Registers a sample source, e.g. 'github:tidalcycles/dirt-samples'. */
  export function evalScope(scope: { samples: typeof samples }): Promise<unknown>
  export function samples(
    source: string | Record<string, unknown>,
    baseUrl?: string,
  ): Promise<unknown>
}

declare module '@strudel/web' {
  export function miniAllStrings(): void
  export function getTime(): number
  export function getAnalyzerData(type: 'time' | 'frequency', id: number): Float32Array | undefined
}
