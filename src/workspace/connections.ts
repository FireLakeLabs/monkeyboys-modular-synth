import type { JackRef, Patch } from '../patch/types'
import { assessConnection, connect, type ConnectionAssessment } from '../rack/model'
import type { SourceDocument } from '../reader/types'
import { applyRackEdit, RackEditRefused } from './document'

export function assessDocumentConnection(
  document: SourceDocument,
  from: JackRef,
  to: JackRef,
  moving?: string,
  patch: Patch = document.patch,
): ConnectionAssessment {
  const graph = assessConnection(patch, from, to, moving)
  if (graph.kind === 'blocked') return graph
  try {
    // Include replacement and rerouting, just as the eventual edit does.
    const result = applyRackEdit(document, connect(patch, from, to, true, moving))
    return result.converted
      ? {
          ...graph,
          kind: 'warning',
          message: `${graph.message} · This patch came from code, so connecting here rewrites it in rack style. Undo brings the code back.`,
        }
      : graph
  } catch (failure) {
    return {
      kind: 'blocked',
      message:
        failure instanceof RackEditRefused
          ? failure.message
          : 'This cable cannot be saved. Edit the code instead.',
    }
  }
}
