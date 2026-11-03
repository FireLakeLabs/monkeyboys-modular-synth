import { useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { read } from '../reader'
import type { EditorView } from '@codemirror/view'
import type { CodeMirrorSourceEditor } from './CodeMirrorSourceEditor'
import type { SourceEditor } from '../workspace/SourceEditor'
import '../index.css'
import '../App.css'
import '../rack/Rack.css'

const source = '// exact 🐒\nnote("c3 [e3 g3]*2 c4").s("sine").iter(4).lpf(800)\n'
const document = read(source)
const common = {
  source,
  document,
  selected: null,
  invalid: false,
  change: () => {},
  composing: () => {},
  editingModule: () => {},
}
type Choice =
  | { kind: 'cm'; Editor: typeof CodeMirrorSourceEditor }
  | { kind: 'native'; Editor: typeof SourceEditor }

export function Comparison({ choice }: { choice: Choice }) {
  const cm = useRef<EditorView | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      const actual =
        choice.kind === 'cm' ? cm.current?.state.doc.toString() : textarea.current?.value
      if (actual !== source) throw new Error('Cost fixture did not mount exact source')
      performance.mark('editor-ready')
      window.document.body.dataset.ready = 'true'
    })
  }, [choice])
  if (choice.kind === 'cm')
    return <choice.Editor {...common} editor={cm} feedback={null} error={null} />
  return <choice.Editor {...common} editor={textarea} />
}
async function mount() {
  const choice: Choice =
    new URLSearchParams(location.search).get('editor') === 'cm'
      ? { kind: 'cm', Editor: (await import('./CodeMirrorSourceEditor')).CodeMirrorSourceEditor }
      : { kind: 'native', Editor: (await import('../workspace/SourceEditor')).SourceEditor }
  const root = window.document.getElementById('root')
  if (!root) throw new Error('Missing root')
  createRoot(root).render(<Comparison choice={choice} />)
}
mount().catch((error: unknown) => {
  throw error
})
