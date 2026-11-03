import type { Patch } from '../patch/types'
import type { Binding } from '../codegen/layout'

export interface Span {
  start: number
  end: number
}

/** A semantic address can be planned before the edited source has new byte ranges. */
export interface SourceAddress extends Binding {
  module: string
}

export interface SourceBinding extends SourceAddress, Span {
  /** Only literal tokens with a proven catalog meaning can be spliced. */
  controls: Record<string, Span>
}

/** Source and graph are one revision. Imported text is never regenerated from its projection. */
export interface SourceDocument {
  kind: 'source'
  source: string
  patch: Patch
  bindings: SourceBinding[]
  layout: 'restored' | 'reconciled' | 'absent' | 'invalid'
  diagnostics: string[]
  /** Mutation guard: edits must go through the source-aware operations. */
  patchRevision: string
}

export type ReadResult =
  | { kind: 'parsed'; document: SourceDocument }
  | {
      kind: 'invalid'
      source: string
      offset: number
      line: number
      column: number
      message: string
    }
