import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import type { SourceDocument } from '../reader/types'
import { sourceSegments, sourceTreatments } from './highlighting'

export function SourceEditor({
  source,
  document,
  selected,
  editor,
  invalid,
  change,
  composing,
  editingModule,
}: {
  source: string
  document: SourceDocument | null
  selected: string | null
  editor: RefObject<HTMLTextAreaElement | null>
  invalid: boolean
  change: (source: string) => void
  composing: (value: boolean) => void
  editingModule: (id: string | null) => void
}) {
  const ink = useRef<HTMLPreElement>(null)
  const treatments = useMemo(() => (document ? sourceTreatments(document) : []), [document])
  const segments = useMemo(
    () => sourceSegments(source, treatments, selected),
    [source, treatments, selected],
  )
  const sync = useCallback(() => {
    if (ink.current && editor.current) {
      ink.current.style.width = `${editor.current.clientWidth + 2}px`
      ink.current.style.height = `${editor.current.clientHeight + 2}px`
      ink.current.scrollTop = editor.current.scrollTop
      ink.current.scrollLeft = editor.current.scrollLeft
    }
  }, [editor])
  useEffect(() => {
    const element = editor.current
    if (!element) return undefined
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => observer.disconnect()
  }, [editor, sync])
  const reportEditing = useCallback(() => {
    if (!document) return
    const element = editor.current
    const owner =
      element &&
      window.document.activeElement === element &&
      treatments.find(
        (span) =>
          span.className.includes('source-cyber') &&
          span.start <= element.selectionStart &&
          span.end >= element.selectionEnd,
      )
    editingModule(owner ? (owner.modules[0] ?? null) : null)
  }, [document, editor, editingModule, treatments])
  useEffect(() => {
    window.document.addEventListener('selectionchange', reportEditing)
    return () => window.document.removeEventListener('selectionchange', reportEditing)
  }, [reportEditing])
  useLayoutEffect(() => {
    sync()
    reportEditing()
  })
  return (
    <div className="source-surface">
      <pre ref={ink} className="source-ink" aria-hidden="true">
        {segments.map((segment) => (
          <span key={segment.start} className={segment.className}>
            {segment.text}
          </span>
        ))}
        {'\n'}
      </pre>
      <textarea
        ref={editor}
        className="source-editor"
        aria-label="Strudel source"
        aria-invalid={invalid}
        spellCheck={false}
        wrap="off"
        value={source}
        onScroll={sync}
        onFocus={reportEditing}
        onSelect={reportEditing}
        onBlur={() => editingModule(null)}
        onCompositionStart={() => composing(true)}
        onCompositionEnd={() => composing(false)}
        onChange={(event) => change(event.target.value)}
      />
    </div>
  )
}
