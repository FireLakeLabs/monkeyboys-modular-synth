import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Rack, type RackEdit } from './rack/Rack'
import { starterPatch } from './rack/model'
import { createPlayback } from './strudel/playback'
import { tryRead } from './reader'
import type { ReadResult, SourceDocument } from './reader/types'
import { editDocument, fromPatch, replaceLayout, saveLayout } from './workspace/document'
import { openFile } from './workspace/open'
import './App.css'
import './rack/Rack.css'
import './looks/looks.css'

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#F4A462" />
      <ellipse cx="36" cy="40" rx="6" ry="9" fill="#1a1b20" />
      <ellipse cx="64" cy="40" rx="6" ry="9" fill="#1a1b20" />
      <path
        d="M27 58 Q50 84 73 58"
        fill="none"
        stroke="#1a1b20"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function App() {
  const [document, setDocument] = useState(() => fromPatch(starterPatch()))
  const [draft, setDraft] = useState(document.source)
  const [phase, setPhase] = useState<'readable' | 'editing' | 'invalid'>('readable')
  const [diagnostic, setDiagnostic] = useState<Extract<ReadResult, { kind: 'invalid' }> | null>(
    null,
  )
  const [playback] = useState(() => createPlayback(document))
  const audio = useSyncExternalStore(playback.subscribe, playback.getSnapshot)
  const [error, setError] = useState<string | null>(null)
  const playing = ['starting', 'playing', 'applying'].includes(audio.status)
  const [selected, setSelected] = useState<string | null>(null)
  const current = useRef({ document, draft, phase })
  const caret = useRef<{ start: number; end: number; top: number; left: number } | null>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const locked = phase !== 'readable'
  const patch = document.patch
  const selectedRanges = locked ? [] : document.bindings.filter((b) => b.module === selected)

  function install(next: SourceDocument) {
    current.current = { document: next, draft: next.source, phase: 'readable' }
    setDocument(next)
    setDraft(next.source)
    setPhase('readable')
    setDiagnostic(null)
    setError(null)
    playback.update(next).catch((failure: unknown) => setError(String(failure)))
  }

  function changeDraft(source: string) {
    current.current = { ...current.current, draft: source, phase: 'editing' }
    setDraft(source)
    setPhase('editing')
    setDiagnostic(null)
  }

  useEffect(() => {
    if (phase !== 'editing') return
    const timer = setTimeout(() => {
      if (current.current.draft !== draft || current.current.phase !== 'editing') return
      try {
        const result = tryRead(draft)
        if (result.kind === 'invalid') {
          current.current = { ...current.current, phase: 'invalid' }
          setPhase('invalid')
          setDiagnostic(result)
          return
        }
        const next =
          result.document.layout === 'invalid' ? result.document : saveLayout(result.document)
        current.current = { document: next, draft: next.source, phase: 'readable' }
        if (editor.current && window.document.activeElement === editor.current)
          caret.current = {
            start: editor.current.selectionStart,
            end: editor.current.selectionEnd,
            top: editor.current.scrollTop,
            left: editor.current.scrollLeft,
          }
        setDocument(next)
        setDraft(next.source)
        setPhase('readable')
        setError(null)
        playback.update(next).catch((failure: unknown) => setError(String(failure)))
      } catch (failure) {
        current.current = { ...current.current, phase: 'invalid' }
        setPhase('invalid')
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, phase, playback])

  useLayoutEffect(() => {
    const position = caret.current
    if (position && editor.current) {
      editor.current.setSelectionRange(position.start, position.end)
      editor.current.scrollTop = position.top
      editor.current.scrollLeft = position.left
      caret.current = null
    }
  }, [draft])

  async function togglePlay() {
    if (playing) await playback.stop()
    else if (current.current.phase === 'readable') await playback.play()
  }

  const edit: RackEdit = (action) => {
    if (current.current.phase !== 'readable') return false
    try {
      install(editDocument(current.current.document, action(current.current.document.patch)))
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    }
  }

  async function newPatch(): Promise<boolean> {
    await playback.stop()
    if (playback.getSnapshot().status !== 'stopped') return false
    install(fromPatch(starterPatch()))
    setSelected(null)
    return true
  }

  function showCode(id: string) {
    setSelected(id)
    const binding = current.current.document.bindings.find((b) => b.module === id)
    if (!binding || current.current.phase !== 'readable') return
    editor.current?.focus()
    editor.current?.setSelectionRange(binding.start, binding.end)
    const line = draft.slice(0, binding.start).split('\n').length
    if (editor.current) editor.current.scrollTop = Math.max(0, (line - 3) * 21)
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([current.current.draft], { type: 'text/plain' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'monkeyboy.strudel'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const status = {
    stopped: 'Stopped',
    starting: 'Starting…',
    playing: 'Pattern scheduled',
    applying: 'Applying…',
    stopping: 'Stopping…',
    error: 'Playback error',
  }[audio.status]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <h1>
            <span className="wordmark">MONKEYBOY’S</span>
            <span className="tagline">MODULAR SYNTH</span>
          </h1>
        </div>
        <output className="transport-status">{status}</output>
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          aria-label={playing ? 'Stop' : 'Play'}
          disabled={audio.status === 'stopping' || (locked && !playing)}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13.5 8 L4 13.5 Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </header>

      <main className="workspace">
        <Rack
          key={locked ? 'locked' : 'ready'}
          patch={patch}
          draft={draft}
          locked={locked || document.layout === 'invalid'}
          showCode={showCode}
          sourceModules={document.bindings.map((b) => b.module)}
          edit={edit}
          selected={selected}
          select={setSelected}
          newPatch={newPatch}
        />

        <section className="code" aria-label="Strudel code">
          <h2>
            STRUDEL <small>Live code · editable</small>
          </h2>
          <output className="sync-status">
            {phase === 'editing'
              ? 'Reading code…'
              : phase === 'invalid'
                ? 'Rack shows previous code'
                : patch.modules.some((m) => m.type === 'code')
                  ? 'Rack matches code · Some code has no controls'
                  : 'Rack matches code'}
          </output>
          <div className="code-actions">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(current.current.draft)
                  .catch((failure: unknown) => setError(String(failure)))
              }
            >
              Copy
            </button>
            <button type="button" onClick={exportDraft}>
              Export
            </button>
            <label className="import-code">
              Open file
              <input
                type="file"
                accept=".strudel,.js,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file)
                    openFile(file, playback)
                      .then(changeDraft)
                      .catch((failure: unknown) => setError(String(failure)))
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          <textarea
            ref={editor}
            className="source-editor"
            aria-label="Strudel source"
            aria-invalid={phase === 'invalid'}
            spellCheck={false}
            value={draft}
            onChange={(event) => changeDraft(event.target.value)}
          />
          {diagnostic && (
            <p className="error" role="alert">
              Line {diagnostic.line}, column {diagnostic.column + 1}: {diagnostic.message}
              <br />
              <mark>{draft.split(/\r?\n/)[diagnostic.line - 1]}</mark>
            </p>
          )}
          {locked && (
            <button type="button" onClick={() => install(current.current.document)}>
              Revert to last readable code
            </button>
          )}
          {selected && (
            <p className="source-selection">
              {selectedRanges.length
                ? `${selected} · source at line ${draft.slice(0, selectedRanges[0]?.start).split('\n').length}`
                : `${selected} has no current sounding source range.`}
            </p>
          )}
          {document.layout === 'invalid' && (
            <div className="error">
              <p>
                Unknown or invalid saved rack metadata retained. Rack editing is disabled until you
                replace it.
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    install(replaceLayout(current.current.document))
                  } catch (failure) {
                    setError(String(failure))
                  }
                }}
              >
                Replace rack metadata
              </button>
            </div>
          )}
          {document.diagnostics.map((message) => (
            <p key={message} className="placeholder">
              {message}
            </p>
          ))}
          <p className="audio-note">
            {locked && playing ? 'Previous pattern scheduled. ' : ''}Sample status unavailable. Stop
            ends scheduling; tails may ring out.
          </p>
          <button type="button" onClick={() => playback.stop()}>
            Stop scheduling
          </button>
          {(error || audio.error) && (
            <p className="error" role="alert">
              {error || audio.error}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
