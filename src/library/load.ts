import { read } from '../reader'
import { validateRack } from '../rack/model'
import type { SourceDocument } from '../reader/types'
import type { LibraryPatch } from './catalog'

/** Parse and validate before Stop or installation; never regenerate a library script. */
export function readLibraryPatch(entry: Pick<LibraryPatch, 'source'>): SourceDocument {
  const document = read(entry.source)
  if (document.layout === 'invalid') throw new Error('Library patch has invalid rack metadata')
  validateRack(document.patch)
  return document
}
