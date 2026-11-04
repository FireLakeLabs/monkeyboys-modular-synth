import type { Patch } from '../patch/types'
import type { SourceDocument } from '../reader'
import { editDocument } from './document'

export function patchName(patch: Pick<Patch, 'name'>): string {
  return patch.name?.trim() || 'Untitled patch'
}

export function renameDocument(document: SourceDocument, name: string): SourceDocument {
  const normalized = patchName({ name })
  if (patchName(document.patch) === normalized) return document
  return editDocument(document, { ...document.patch, name: normalized })
}

export function patchFilename(
  patch: Pick<Patch, 'name'>,
  extension: 'strudel' | 'wav' = 'strudel',
): string {
  const stem = patchName(patch)
    .replace(/\.strudel$/i, '')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/[.\s]+$/u, '')
    .trim()
  return `${stem || 'Untitled patch'}.${extension}`
}
