import type { JackRef } from '../patch/types'
import { assessConnection, connect, type ConnectionAssessment } from '../rack/model'
import type { SourceDocument } from '../reader/types'
import { editDocument, RackEditRefused } from './document'

export function assessDocumentConnection(
  document: SourceDocument,
  from: JackRef,
  to: JackRef,
  moving?: string,
): ConnectionAssessment {
  const graph = assessConnection(document.patch, from, to, moving)
  if (graph.kind === 'blocked') return graph
  try {
    // Include replacement and rerouting, just as the eventual edit does.
    editDocument(document, connect(document.patch, from, to, true, moving))
    return graph
  } catch (failure) {
    return failure instanceof RackEditRefused
      ? {
          ...graph,
          kind: 'warning',
          message: `${graph.message} · This patch came from code, so connecting here rewrites it in rack style. Undo brings the code back.`,
        }
      : { kind: 'blocked', message: 'This cable cannot be saved. Edit the code instead.' }
  }
}
