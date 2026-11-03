import type { JackRef } from '../patch/types'
import { assessConnection, connect, type ConnectionAssessment } from '../rack/model'
import type { SourceDocument } from '../reader/types'
import { editDocument, RackEditRefused } from './document'

export type SourceConnectionAssessment =
  ConnectionAssessment | { kind: 'blocked'; message: string; sourceRefused: true }

export function assessDocumentConnection(
  document: SourceDocument,
  from: JackRef,
  to: JackRef,
  moving?: string,
): SourceConnectionAssessment {
  const graph = assessConnection(document.patch, from, to, moving)
  if (graph.kind === 'blocked') return graph
  try {
    // Include replacement and rerouting, just as the eventual confirmed edit does.
    editDocument(document, connect(document.patch, from, to, true, moving))
    return graph
  } catch (failure) {
    return failure instanceof RackEditRefused
      ? {
          kind: 'blocked',
          sourceRefused: true,
          message: 'This patch came from code. Add the cable in code, or make the rack editable.',
        }
      : { kind: 'blocked', message: 'This cable cannot be saved. Edit the code instead.' }
  }
}
