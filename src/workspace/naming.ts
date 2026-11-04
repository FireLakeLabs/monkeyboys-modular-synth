import { creditedTitle } from './credits'
import type { Patch } from '../patch/types'
import type { SourceDocument } from '../reader'
import { editDocument } from './document'

export function patchName(patch: Pick<Patch, 'name'>, source = ''): string {
  return patch.name?.trim() || creditedTitle(source) || 'Untitled patch'
}

export function renameDocument(document: SourceDocument, name: string): SourceDocument {
  const normalized = patchName({ name })
  if (patchName(document.patch, document.source) === normalized) return document
  return editDocument(document, { ...document.patch, name: normalized })
}

export function patchFilename(
  patch: Pick<Patch, 'name'>,
  extension: 'strudel' | 'wav' = 'strudel',
  source = '',
): string {
  const stem = patchName(patch, source)
    .replace(/\.strudel$/i, '')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/[.\s]+$/u, '')
    .trim()
  return `${stem || 'Untitled patch'}.${extension}`
}
