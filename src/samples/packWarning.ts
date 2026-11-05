import { useSyncExternalStore } from 'react'
import type { SourceDocument } from '../reader/types'
import { getSamplePacks, getSampleWarnings, subscribeSamplePacks } from '../strudel/engine'
import { cartridges } from '../workspace/cartridges'
import { packKey } from './packs'

/** The Packs tab can be closed, so its warning has to reach the dock's tab too. */
export function usePackWarning(document: SourceDocument) {
  const resources = useSyncExternalStore(subscribeSamplePacks, getSamplePacks)
  const warnings = useSyncExternalStore(subscribeSamplePacks, getSampleWarnings)
  return (
    warnings.length > 0 ||
    cartridges(document).some(
      ({ pack }) =>
        pack && resources.find((resource) => resource.key === packKey(pack))?.status === 'failed',
    )
  )
}
