import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { foldCode } from '@codemirror/language'
import { tryRead, read } from '../reader'
import { saveLayout, editDocument } from '../workspace/document'
import { setValue } from '../rack/model'
import { play, stop, subscribe, type SourceFeedback } from '../strudel/engine'
import { RACK_MARKER } from '../codegen/layout'
import { CodeMirrorSourceEditor } from './CodeMirrorSourceEditor'
import '../index.css'
import '../App.css'
import '../rack/Rack.css'
import '../looks/looks.css'
import './editor-spike.css'

const fixture = `// exact 🐒\nsetcpm(30)\nconst lead = note("c3 [e3 g3]*2 c4").s("sine");\n$: lead.iter(4).lpf(800).lpq(2)\n$: note("c2 eb2").s("triangle").jux(rev).gain(.1)\n$: note("a2").s("sine").chunk(4, x => x.hurry(2))\n`

export function Spike() {
  const [document, setDocument] = useState(() => saveLayout(read(fixture)))
  const [source, setSource] = useState(document.source)
  const [phase, setPhase] = useState('readable')
  const [selected, setSelected] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [flashes, setFlashes] = useState<SourceFeedback[]>([])
  const feedback = {
    source,
    spans: [
      ...new Map(
        flashes
          .filter((event) => event.source === source)
          .flatMap((event) => event.spans)
          .map((span) => [`${span.start}:${span.end}`, span]),
      ).values(),
    ],
  }
  const [error, setError] = useState<{ offset: number; message: string } | null>(null)
  const [failure, setFailure] = useState('')
  const editor = useRef<EditorView | null>(null)
  const latestSource = useRef(source)
  useEffect(() => {
    latestSource.current = source
  }, [source])
  const events = useRef<SourceFeedback[]>([])
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'activity-clear') setFlashes([])
      }),
    [],
  )
  useEffect(() => {
    if (phase !== 'editing' || composing) return
    const timer = setTimeout(() => {
      const result = tryRead(source)
      if (result.kind === 'invalid') {
        const marker = source.indexOf('\n' + RACK_MARKER)
        setError({
          offset: marker < 0 ? result.offset : Math.min(result.offset, marker),
          message: result.message.replace(/\s*\(\d+:\d+\)$/, ''),
        })
        setPhase('invalid')
      } else {
        const next = saveLayout(result.document)
        setDocument(next)
        setSource(next.source)
        setPhase('readable')
        setError(null)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [source, phase, composing])
  function change(text: string) {
    setSource(text)
    setPhase('editing')
    setFlashes([])
  }
  function show(id: string) {
    setSelected(id)
    const binding = document.bindings.find((b) => b.module === id)
    const view = editor.current
    if (!view || !binding) return
    view.focus()
    view.dispatch({
      selection: EditorSelection.range(binding.start, binding.end),
      effects: EditorView.scrollIntoView(binding.start, { y: 'center' }),
    })
  }
  useEffect(() => {
    return installProbe({
      view: () => editor.current,
      source: () => latestSource.current,
      events: () => events.current,
      replace: change,
    })
  }, [])
  return (
    <main style={{ maxWidth: 1100, margin: '20px auto' }}>
      <h1>CodeMirror 6 spike — #53</h1>
      <p>Opt-in prototype. Production still uses the textarea.</p>
      <div className="code-actions">
        <button
          onClick={() => {
            play(source, {
              sourceFeedback: (event) => {
                events.current.push(event)
                if (event.source === latestSource.current) {
                  setFlashes((flashes) => [...flashes, event])
                  setTimeout(
                    () => setFlashes((flashes) => flashes.filter((flash) => flash !== event)),
                    120,
                  )
                }
              },
            }).catch((failure: unknown) => setFailure(String(failure)))
          }}
        >
          Play
        </button>
        <button
          onClick={() => {
            stop().catch((failure: unknown) => setFailure(String(failure)))
          }}
        >
          Stop
        </button>
        <button
          onClick={() => {
            const next = editDocument(document, setValue(document.patch, 'vcf1', 'cutoff', 1800))
            setDocument(next)
            setSource(next.source)
          }}
        >
          Rack cutoff 1800
        </button>
        <button
          onClick={() => {
            const view = editor.current
            if (!view) return
            const at = source.indexOf('// ── @monkeyboy')
            view.dispatch({ selection: { anchor: at } })
            foldCode(view)
          }}
        >
          Fold rack metadata
        </button>
        {['vcf1', 'code1'].map((id) => (
          <button key={id} onClick={() => show(id)}>
            Show {id}
          </button>
        ))}
      </div>
      <p data-testid="status">
        {phase}
        {composing ? ' composing' : ''}
      </p>
      <p data-testid="cyber" className={editing ? 'cyber-editing' : ''}>
        Cyber cursor <span>▌</span> {editing ?? 'idle'}
      </p>
      <CodeMirrorSourceEditor
        source={source}
        document={phase === 'readable' ? document : null}
        selected={selected}
        editor={editor}
        invalid={phase === 'invalid'}
        change={change}
        composing={setComposing}
        editingModule={setEditing}
        feedback={feedback}
        error={error}
      />
      {failure && <p role="alert">{failure}</p>}
      <pre data-testid="parse-error">{error?.message}</pre>
    </main>
  )
}

declare global {
  interface Window {
    editorSpike?: {
      view: () => EditorView | null
      source: () => string
      events: () => SourceFeedback[]
      replace: (source: string) => void
    }
  }
}
function installProbe(probe: NonNullable<Window['editorSpike']>) {
  window.editorSpike = probe
  return () => {
    delete window.editorSpike
  }
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing app root')
createRoot(root).render(<Spike />)
