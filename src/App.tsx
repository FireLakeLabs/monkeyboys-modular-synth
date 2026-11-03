import {
  useCallback,
  useEffect,
  lazy,
  Suspense,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Rack, type RackEdit } from './rack/Rack'
import type { JackRef, Patch } from './patch/types'
import { starterPatch, validateRack } from './rack/model'
import { createPlayback } from './strudel/playback'
import { tryRead } from './reader'
import type { ReadResult, SourceDocument } from './reader/types'
import {
  editDocument,
  fromPatch,
  makeRackEditable,
  RackEditRefused,
  replaceLayout,
  saveLayout,
  sourceBody,
} from './workspace/document'
import { prepareReplacement } from './workspace/open'
import { ReplacementPrompt } from './workspace/ReplacementPrompt'
import { PatchLibrary } from './library/PatchLibrary'
import { readLibraryPatch } from './library/load'
import { assessDocumentConnection } from './workspace/connections'
import type { LibraryPatch } from './library/catalog'
import type { EditorView } from '@codemirror/view'
import './App.css'
import './rack/Rack.css'
import './looks/looks.css'

const SourceEditor = lazy(() =>
  import('./workspace/SourceEditor').then((module) => ({ default: module.SourceEditor })),
)

type Replacement =
  { kind: 'file'; file: File } | { kind: 'new' } | { kind: 'library'; entry: LibraryPatch }

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
  const [refusedEdit, setRefusedEdit] = useState<{
    document: SourceDocument
    patch: Patch
    revision: number
    message: string
    point: { x: number; y: number }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingReplacement, setPendingReplacement] = useState<Replacement | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [rackGeneration, setRackGeneration] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const [slowAudio, setSlowAudio] = useState<typeof audio | null>(null)
  const workRevision = useRef(0)
  const replacementRevision = useRef(0)
  const playing = ['starting', 'playing', 'applying'].includes(audio.status)
  const [composing, setComposing] = useState(false)
  const [editingModule, setEditingModule] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const current = useRef({ document, draft, phase })
  const editor = useRef<EditorView>(null)
  const locked = phase !== 'readable' || composing
  const patch = document.patch
  const assess = useCallback(
    (from: JackRef, to: JackRef, moving?: string) =>
      assessDocumentConnection(document, from, to, moving),
    [document],
  )
  const selectedRanges = locked ? [] : document.bindings.filter((b) => b.module === selected)
  const cancelReplacement = useCallback(() => {
    setRefusedEdit(null)
    replacementRevision.current++
    setReplacing(false)
    setPendingReplacement(null)
  }, [])

  function install(next: SourceDocument) {
    setRefusedEdit(null)
    workRevision.current++
    current.current = { document: next, draft: next.source, phase: 'readable' }
    setDocument(next)
    setDraft(next.source)
    setPhase('readable')
    setDiagnostic(null)
    setError(null)
    playback.update(next).catch((failure: unknown) => setError(String(failure)))
  }

  function changeDraft(source: string) {
    setRefusedEdit(null)
    workRevision.current++
    current.current = { ...current.current, draft: source, phase: 'editing' }
    setDraft(source)
    setPhase('editing')
    setDiagnostic(null)
  }

  useEffect(() => {
    if (!['starting', 'applying', 'stopping'].includes(audio.status)) return
    const timer = setTimeout(() => setSlowAudio(audio), 10_000)
    return () => clearTimeout(timer)
  }, [audio])

  useEffect(() => {
    if (phase !== 'editing' || composing) return
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
        validateRack(next.patch)
        current.current = { document: next, draft: next.source, phase: 'readable' }
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
  }, [draft, phase, playback, composing])

  async function togglePlay() {
    if (playing) await playback.stop()
    else if (current.current.phase === 'readable') await playback.play()
  }

  const edit: RackEdit = (action, point = { x: 220, y: 150 }) => {
    if (current.current.phase !== 'readable' || composing) return false
    setRefusedEdit(null)
    const accepted = current.current.document
    let next: Patch
    try {
      next = action(accepted.patch)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    }
    try {
      install(editDocument(accepted, next))
      return true
    } catch (failure) {
      if (failure instanceof RackEditRefused) {
        setError(null)
        setRefusedEdit({
          document: accepted,
          patch: next,
          revision: workRevision.current,
          message: failure.message,
          point,
        })
      } else setError(failure instanceof Error ? failure.message : String(failure))
      return false
    }
  }

  function convertAndRetry() {
    if (!refusedEdit) return
    if (
      refusedEdit.revision !== workRevision.current ||
      refusedEdit.document !== current.current.document ||
      current.current.phase !== 'readable'
    ) {
      setRefusedEdit(null)
      return
    }
    try {
      install(makeRackEditable(refusedEdit.document, refusedEdit.patch))
      setRackGeneration((generation) => generation + 1)
    } catch (failure) {
      setRefusedEdit(null)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  async function replaceWork(load: () => Promise<string | SourceDocument>): Promise<boolean> {
    const operation = ++replacementRevision.current
    const revision = workRevision.current
    setReplacing(true)
    setError(null)
    try {
      const next = await prepareReplacement(
        load,
        playback,
        () => operation === replacementRevision.current && revision === workRevision.current,
      )
      if (typeof next === 'string') changeDraft(next)
      else install(next)
      setSelected(null)
      setPendingReplacement(null)
      setRackGeneration((generation) => generation + 1)
      return true
    } catch (failure) {
      if (operation === replacementRevision.current)
        setError(failure instanceof Error ? failure.message : String(failure))
      return false
    } finally {
      if (operation === replacementRevision.current) setReplacing(false)
    }
  }

  function requestReplacement(replacement: Replacement) {
    cancelReplacement()
    setError(null)
    setPendingReplacement(replacement)
  }

  async function confirmReplacement() {
    const replacement = pendingReplacement
    if (!replacement) return
    const loaded = await replaceWork(async () => {
      switch (replacement.kind) {
        case 'file':
          return replacement.file.text()
        case 'new':
          return fromPatch(starterPatch())
        case 'library':
          return readLibraryPatch(replacement.entry)
      }
    })
    if (loaded) setLibraryOpen(false)
  }

  function showCode(id: string) {
    setSelected(id)
    const binding = current.current.document.bindings.find((b) => b.module === id)
    if (!binding || current.current.phase !== 'readable') return
    editor.current?.focus()
    editor.current?.dispatch({
      selection: { anchor: binding.start, head: binding.end },
      scrollIntoView: true,
    })
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
    starting: 'Enabling audio / starting…',
    playing: 'Pattern scheduled',
    applying: 'Applying…',
    stopping: 'Stopping… · audio state unknown',
    error:
      audio.scheduling === 'stopped' ? 'Scheduling stopped after error' : 'Audio state unknown',
  }[audio.status]

  const replacementPrompt = pendingReplacement && (
    <ReplacementPrompt
      title={
        pendingReplacement.kind === 'new'
          ? 'Replace this patch?'
          : `Replace this patch with ${pendingReplacement.kind === 'file' ? pendingReplacement.file.name : pendingReplacement.entry.title}?`
      }
      action={
        pendingReplacement.kind === 'new'
          ? 'Replace patch'
          : pendingReplacement.kind === 'file'
            ? 'Open patch'
            : 'Load patch'
      }
      replacing={replacing}
      cancel={cancelReplacement}
      exportCurrent={exportDraft}
      confirm={confirmReplacement}
    />
  )

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
        <button
          type="button"
          className="open-library"
          onClick={() => {
            cancelReplacement()
            setError(null)
            setLibraryOpen(true)
          }}
        >
          Patch library
        </button>
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
          key={`${locked ? 'locked' : 'ready'}-${rackGeneration}`}
          patch={patch}
          locked={locked || document.layout === 'invalid'}
          showCode={showCode}
          sourceModules={document.bindings.map((b) => b.module)}
          editingModule={editingModule}
          edit={edit}
          assess={assess}
          selected={selected}
          select={setSelected}
          newPatch={() => requestReplacement({ kind: 'new' })}
          replacementPrompt={pendingReplacement?.kind === 'new' ? replacementPrompt : null}
          cancelReplacement={cancelReplacement}
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
                  if (file) {
                    requestReplacement({ kind: 'file', file })
                  }
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          {pendingReplacement?.kind === 'file' && replacementPrompt}
          <Suspense fallback={<output className="source-surface">Loading source editor…</output>}>
            <SourceEditor
              editor={editor}
              source={draft}
              document={locked ? null : document}
              selected={selected}
              invalid={phase === 'invalid'}
              change={changeDraft}
              composing={setComposing}
              editingModule={setEditingModule}
            />
          </Suspense>
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
                : locked
                  ? `${selected} · source highlights paused until code is readable.`
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
            {locked && audio.scheduling === 'scheduled' ? 'Previous pattern scheduled. ' : ''}Sample
            status:{' '}
            {
              {
                unknown: 'unknown; audio has not initialized',
                loading: 'loading manifests; audio readiness unverified',
                registered: 'manifests registered; sample decoding and output unverified',
                failed: 'resource/output failure observed; readiness unknown',
              }[audio.resources]
            }
            . Stop ends scheduling; tails may ring out.
          </p>
          {slowAudio === audio && (
            <output className="pending-note error">
              Still waiting for audio. Stop cancels scheduling intent without waiting for
              evaluation. Running code cannot be interrupted. If it never completes, export your
              draft before reloading this page. Reloading discards unsaved work and ends this page’s
              audio.
            </output>
          )}
          <button type="button" onClick={() => playback.stop()}>
            Stop scheduling
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {audio.error && (
            <div className="error" role="alert">
              <p>
                {audio.errorSource &&
                (locked || sourceBody(audio.errorSource) !== sourceBody(document.source))
                  ? 'An earlier code revision failed. Current draft retained.'
                  : 'Audio failure. Current draft retained.'}{' '}
                Correct code or check audio access, then press Play explicitly. Stop can be retried
                if audio state is unknown.
              </p>
              <details>
                <summary>Audio error details</summary>
                {audio.error}
              </details>
            </div>
          )}
        </section>
      </main>
      {refusedEdit && (
        <div
          className="rack-edit-refusal"
          role="alertdialog"
          aria-label="Make rack-editable?"
          aria-describedby="rack-edit-refusal-description"
          style={{
            left: Math.max(8, Math.min(refusedEdit.point.x, window.innerWidth - 348)),
            top: Math.max(8, Math.min(refusedEdit.point.y, window.innerHeight - 300)),
          }}
        >
          <p id="rack-edit-refusal-description">
            This edit cannot preserve the imported source. Make rack-editable rewrites the code in
            MonkeyBoy’s style, retaining setup code and CODE blocks, then completes this edit.
          </p>
          <details>
            <summary>Why this edit was refused</summary>
            {refusedEdit.message}
          </details>
          <button
            type="button"
            ref={(element) => element?.focus()}
            onClick={() => setRefusedEdit(null)}
          >
            Cancel
          </button>
          <button type="button" onClick={convertAndRetry}>
            Make rack-editable
          </button>
        </div>
      )}
      {libraryOpen && (
        <PatchLibrary
          close={() => {
            cancelReplacement()
            setLibraryOpen(false)
          }}
          requestLoad={(entry) => requestReplacement({ kind: 'library', entry })}
          cancelReplacement={() => {
            cancelReplacement()
            setError(null)
          }}
          confirmation={pendingReplacement?.kind === 'library' ? replacementPrompt : null}
          error={error}
        />
      )}
    </div>
  )
}
