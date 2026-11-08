import { SoundCrate } from './samples/SoundCrate'
import { seatedResources } from './samples/crate'
import { getSamplePacks, subscribeSamplePacks } from './strudel/engine'
import { CartridgeBay } from './samples/CartridgeBay'
import { usePackWarning } from './samples/packWarning'
import { withFactoryPacks } from './workspace/cartridges'

import { CycleClock } from './rack/PatternVisuals'
import { defaultRailWidth, visibleRailHp } from './patch/layout'
import {
  useCallback,
  useMemo,
  useEffect,
  lazy,
  Suspense,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Rack, type RackEdit } from './rack/Rack'
import type { JackRef, Patch } from './patch/types'
import { setValue, starterPatch, validateRack } from './rack/model'
import { getModuleSpec } from './modules/catalog'
import { Numeric } from './rack/Controls'
import { createPlayback } from './strudel/playback'
import { read, tryRead } from './reader'
import type { ReadResult, SourceDocument } from './reader/types'
import {
  applyRackEdit,
  fromPatch,
  RackEditRefused,
  replaceLayout,
  saveLayout,
  sourceBody,
} from './workspace/document'
import { codeConversions } from './workspace/codeConversion'
import { prepareReplacement } from './workspace/open'
import { mayHaveOutput, strudelUrl } from './workspace/transport'
import { ReplacementPrompt } from './workspace/ReplacementPrompt'
import { createAutosave } from './workspace/autosave'
import { WorkspaceNotice, type Notice, type NoticeAction } from './workspace/WorkspaceNotice'
import { RackLock, type LockReason } from './workspace/RackLock'
import { FileMenu } from './workspace/FileMenu'
import { changesModules, isFinished } from './workspace/finishedCode'
import { createDocumentHistory } from './workspace/history'
import { patchFilename, patchName, renameDocument } from './workspace/naming'
import { PatchLibrary } from './library/PatchLibrary'
import { SavePrompt } from './library/SavePrompt'
import {
  createMyPatches,
  failureMessage,
  STORE_FAILURES,
  type SavedPatch,
} from './library/myPatches'
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

/** Typing has paused: a step ends here, and a rack still locked says so. */
const PAUSE_MS = 1200

type Replacement =
  | { kind: 'file'; file: File }
  | { kind: 'new' }
  | { kind: 'library'; entry: LibraryPatch }
  | { kind: 'saved'; entry: SavedPatch }

const replacementName = (replacement: Exclude<Replacement, { kind: 'new' }>) =>
  replacement.kind === 'file'
    ? replacement.file.name
    : replacement.kind === 'library'
      ? replacement.entry.title
      : replacement.entry.name

/** The revision a readable draft would become, with its rack proven. */
function acceptable(document: SourceDocument) {
  const next =
    document.layout === 'invalid' || document.layout === 'restored'
      ? document
      : saveLayout(document)
  validateRack(next.patch)
  return next
}

const newPatch = () =>
  fromPatch(starterPatch(defaultRailWidth(window.innerWidth), visibleRailHp(window.innerWidth)))

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
  const sampleResources = useSyncExternalStore(subscribeSamplePacks, getSamplePacks)
  const [autosave] = useState(() => createAutosave())
  // Reloading returns your work at once; a draft comes back beside its accepted rack.
  const [restored] = useState(() => autosave.load())
  const [document, setDocument] = useState(() => restored?.document ?? newPatch())
  const [history] = useState(() => createDocumentHistory(document))
  const draggingKnob = useRef(false)
  const [draft, setDraft] = useState(restored?.draft ?? document.source)
  // `held` is readable code waiting for Apply, or for its half-typed word to finish.
  const [phase, setPhase] = useState<'readable' | 'editing' | 'held' | 'invalid'>(
    draft === document.source ? 'readable' : 'editing',
  )
  const [diagnostic, setDiagnostic] = useState<Extract<ReadResult, { kind: 'invalid' }> | null>(
    null,
  )
  const [playback] = useState(() => createPlayback(document))
  const audio = useSyncExternalStore(playback.subscribe, playback.getSnapshot)
  const [myPatches] = useState(() => createMyPatches())
  const [saved, setSaved] = useState(() => myPatches.load())
  // The entry Ctrl/Cmd+S updates; a patch without one asks for a name first. Each revision
  // remembers its entry, so undoing a load can never save the old patch over the new one.
  const savedId = useRef<string | null>(null)
  const [savedIds] = useState(() => new WeakMap<SourceDocument, string | null>())
  const [savedRevisions] = useState(() => new Map<string, string>())
  const [naming, setNaming] = useState<string | null>(null)
  // Its own message: work isn't safe until this is dealt with, whatever else happens.
  const [saveFailure, setSaveFailure] = useState<Notice | null>(null)
  const dismissSaveFailure = useCallback(() => setSaveFailure(null), [])
  const [notice, setNotice] = useState<Notice | null>(
    restored && {
      message:
        restored.draft === restored.document.source
          ? 'Restored your last patch'
          : 'Restored your last patch and its unapplied code',
      action: 'start-new',
    },
  )
  const dismissNotice = useCallback(() => setNotice(null), [])
  const undoFocus = useRef<string | null>(null)
  useEffect(() => {
    if (!undoFocus.current) return
    // Undo rebuilds the panels. Only focus that fell to the page moves; a caret stays put.
    const active = window.document.activeElement
    if (!active || active === window.document.body)
      window.document.querySelector<HTMLElement>(undoFocus.current)?.focus()
    undoFocus.current = null
  })
  const [error, setError] = useState<string | null>(null)
  const [pendingReplacement, setPendingReplacement] = useState<Replacement | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [rackGeneration, setRackGeneration] = useState(0)
  const [patchLoads, setPatchLoads] = useState(0)
  const [patchOpens, setPatchOpens] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const [slowAudio, setSlowAudio] = useState<typeof audio | null>(null)
  const [emptyPlay, setEmptyPlay] = useState<SourceDocument | null>(null)
  const workRevision = useRef(0)
  const replacementRevision = useRef(0)
  const playing = ['starting', 'playing', 'applying'].includes(audio.status)
  const needsStop =
    playing ||
    audio.scheduling === 'unknown' ||
    audio.status === 'stopping' ||
    audio.status === 'bouncing'
  const [composing, setComposing] = useState(false)
  const [autoApply, setAutoApply] = useState(false)
  const applying = audio.status !== 'bouncing' && (autoApply || !needsStop)
  const applyingNow = useRef(applying)
  applyingNow.current = applying
  // A restored draft waits for you; only code you are typing applies by itself.
  const draftTyped = useRef(false)
  // A paste is finished text, so the half-typed word check is only for typing.
  const draftPasted = useRef(false)
  const typingGroup = useRef<object | null>(null)
  const [editorFocused, setEditorFocused] = useState(false)
  const [lockSettled, setLockSettled] = useState(false)
  const [pulsing, setPulsing] = useState(false)
  const [bounceCycles, setBounceCycles] = useState('4')
  const [editingModule, setEditingModule] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rackFocus, setRackFocus] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'rack' | 'code' | 'both'>('both')
  const [codeSelection, setCodeSelection] = useState<{ start: number; end: number } | null>(null)
  const current = useRef({ document, draft, phase })
  // Exact source includes saved rack layout; files and recovered work stay protected.
  const cleanSource = useRef<string | null>(restored ? null : document.source)
  const draftSaved = useRef(true)
  const editor = useRef<EditorView>(null)
  useEffect(() => {
    if (!codeSelection) return
    // Reveal the pane before focusing or asking CodeMirror to measure its selection.
    editor.current?.focus()
    editor.current?.dispatch({
      selection: { anchor: codeSelection.start, head: codeSelection.end },
      scrollIntoView: true,
    })
  }, [codeSelection])
  const fileInput = useRef<HTMLInputElement>(null)
  const locked = phase !== 'readable' || composing
  // Every keystroke is briefly unapplied while stopped, so the rack only looks and acts
  // locked once that has lasted, or once you have left the editor.
  const rackLocked = locked && (lockSettled || !editorFocused)
  const conversions = useMemo(() => codeConversions(document), [document])
  const patch = document.patch
  const out = patch.modules.find((module) => module.type === 'out')
  const tempoControl = getModuleSpec('out').controls.find((control) => control.id === 'bpm')
  const emptyOutput = emptyPlay === document
  const packWarning = usePackWarning(document)
  const assess = useCallback(
    (from: JackRef, to: JackRef, moving?: string) =>
      assessDocumentConnection(document, from, to, moving),
    [document],
  )
  const selectedRanges = locked ? [] : document.bindings.filter((b) => b.module === selected)
  const cancelReplacement = useCallback(() => {
    setNotice((shown) => (shown?.action === 'cancel-load' ? null : shown))
    replacementRevision.current++
    setReplacing(false)
    setPendingReplacement(null)
  }, [])

  const install = useCallback(
    (next: SourceDocument, record = true, historyGroup?: object) => {
      if (record) history.accept(next, historyGroup)
      if (!historyGroup) typingGroup.current = null
      if (record) savedIds.set(next, savedId.current)
      else savedId.current = savedIds.get(next) ?? null
      draftTyped.current = false
      setLockSettled(false)
      // A notice's Undo must take back that action, so newer work retires it.
      setNotice((shown) => (shown && historyGroup && shown.group === historyGroup ? shown : null))
      workRevision.current++
      current.current = { document: next, draft: next.source, phase: 'readable' }
      setDocument(next)
      setDraft(next.source)
      setPhase('readable')
      setDiagnostic(null)
      setError(null)
      draftSaved.current = autosave.save(next)
      playback.update(next).catch((failure: unknown) => setError(String(failure)))
    },
    [autosave, playback, history, savedIds],
  )

  useEffect(() => {
    const start = (event: PointerEvent) => {
      if (event.button === 0 && event.target instanceof Element && event.target.closest('.knob'))
        draggingKnob.current = true
    }
    const end = () => {
      draggingKnob.current = false
    }
    window.addEventListener('pointerdown', start, true)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    return () => {
      window.removeEventListener('pointerdown', start, true)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
    }
  }, [])

  function stepHistory(direction: 'undo' | 'redo') {
    typingGroup.current = null
    if (
      composing ||
      editor.current?.composing ||
      draggingKnob.current ||
      replacing ||
      pendingReplacement ||
      libraryOpen ||
      naming !== null
    )
      return false
    if (current.current.phase !== 'readable') {
      if (direction === 'redo') return false
      install(current.current.document, false)
      return true
    }
    const next = history.step(direction)
    if (!next) return false
    if (direction === 'undo' && notice?.action === 'undo')
      undoFocus.current = notice.undoFocus ?? '.history-redo'
    cancelReplacement()
    install(next, false)
    setSelected((id) => (next.patch.modules.some((module) => module.id === id) ? id : null))
    setRackGeneration((generation) => generation + 1)
    return true
  }

  function changeDraft(source: string, pasted = false) {
    setNotice(null)
    draftTyped.current = true
    draftPasted.current = pasted
    workRevision.current++
    const previous = current.current.draft
    current.current = { ...current.current, draft: source, phase: 'editing' }
    setDraft(source)
    setPhase('editing')
    setDiagnostic(null)
    // Save before the reader debounce, including invalid and composing text.
    draftSaved.current = autosave.save(current.current.document, source)
    applyFinishedCall(source, previous)
  }

  /**
   * Fast typing never reaches the delay, so typing or deleting a finished call that adds
   * or removes a module is its own stopping spot, as it would be with a pause.
   */
  function applyFinishedCall(source: string, previous: string) {
    const view = editor.current
    const accepted = current.current.document
    if (!view?.hasFocus || view.composing || !applyingNow.current) return
    const caret = view.state.selection.main.head
    const removed = previous.slice(caret, caret + previous.length - source.length)
    if (source[caret - 1] !== ')' && !removed.includes(')')) return
    try {
      const result = tryRead(source)
      if (result.kind === 'invalid') return
      const next = acceptable(result.document)
      if (
        !isFinished(source, accepted.source, caret) ||
        !changesModules(accepted.patch, next.patch)
      )
        return
      installDraft(next, (typingGroup.current ??= {}))
      typingGroup.current = null
    } catch {
      /* The delayed read reports anything wrong with this draft. */
    }
  }

  /** A held word can be released by moving off it, which changes no text. */
  function caretMoved() {
    if (current.current.phase !== 'held' || !draftTyped.current || !applyingNow.current) return
    current.current = { ...current.current, phase: 'editing' }
    setPhase('editing')
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current.phase === 'readable' || draftSaved.current) return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    if (!['starting', 'applying', 'stopping', 'bouncing'].includes(audio.status)) return
    const timer = setTimeout(() => setSlowAudio(audio), 10_000)
    return () => clearTimeout(timer)
  }, [audio])

  const readDraft = useCallback((source: string): SourceDocument | null => {
    try {
      const result = tryRead(source)
      if (result.kind === 'invalid') {
        current.current = { ...current.current, phase: 'invalid' }
        setPhase('invalid')
        setDiagnostic(result)
        return null
      }
      return acceptable(result.document)
    } catch (failure) {
      current.current = { ...current.current, phase: 'invalid' }
      setPhase('invalid')
      setError(failure instanceof Error ? failure.message : String(failure))
      return null
    }
  }, [])

  /** Panels rebuild their local state when code changes what they show. */
  const installDraft = useCallback(
    (next: SourceDocument, group?: object) => {
      const changed = next.patchRevision !== current.current.document.patchRevision
      install(next, true, group)
      if (changed) setRackGeneration((generation) => generation + 1)
    },
    [install],
  )

  /** Read the draft and apply it if allowed, so half-typed code never reaches the rack. */
  const settleDraft = useCallback(
    (endStep: boolean, caretMatters = true) => {
      const work = current.current
      if (work.phase === 'readable') {
        if (endStep) typingGroup.current = null
        return
      }
      if (work.phase === 'invalid' || editor.current?.composing) return
      const next = readDraft(work.draft)
      if (!next) return
      const view = editor.current
      const caret = caretMatters && view?.hasFocus ? view.state.selection.main.head : undefined
      if (
        !draftTyped.current ||
        !applyingNow.current ||
        !(draftPasted.current || isFinished(work.draft, work.document.source, caret))
      ) {
        current.current = { ...current.current, phase: 'held' }
        setPhase('held')
        return
      }
      typingGroup.current ??= {}
      const stop = endStep || changesModules(work.document.patch, next.patch)
      installDraft(next, typingGroup.current)
      if (stop) typingGroup.current = null
    },
    [readDraft, installDraft],
  )

  useEffect(() => {
    if (phase !== 'editing' || composing) return
    const timer = setTimeout(() => {
      if (current.current.draft !== draft || current.current.phase !== 'editing') return
      settleDraft(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, phase, composing, settleDraft])

  // Stopping, or turning the toggle on, lets held code apply.
  useEffect(() => {
    if (applying && current.current.phase === 'held') settleDraft(false)
  }, [applying, settleDraft])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!composing) settleDraft(true)
      setLockSettled(current.current.phase !== 'readable' || composing)
    }, PAUSE_MS)
    return () => clearTimeout(timer)
  }, [draft, composing, settleDraft])

  useEffect(() => {
    if (!pulsing) return undefined
    const timer = setTimeout(() => setPulsing(false), 450)
    return () => clearTimeout(timer)
  }, [pulsing])

  function focusEditor(focused: boolean) {
    setEditorFocused(focused)
    if (!focused) settleDraft(true, false)
  }

  function playAccepted() {
    const accepted = current.current.document
    if (!mayHaveOutput(accepted)) {
      setEmptyPlay(accepted)
      setSelected(accepted.patch.modules.find((module) => module.type === 'out')?.id ?? null)
      return
    }
    setEmptyPlay(null)
    playback.play().catch((failure: unknown) => setError(String(failure)))
  }

  function applyCode(start = true) {
    if (
      composing ||
      editor.current?.composing ||
      replacing ||
      pendingReplacement ||
      libraryOpen ||
      audio.status === 'bouncing'
    )
      return
    const next = readDraft(current.current.draft)
    if (!next) return
    installDraft(next)
    if (start && !['starting', 'playing', 'applying'].includes(playback.getSnapshot().status))
      playAccepted()
  }

  // Capture before CodeMirror handles Enter, so applying never inserts a newline.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.key.toLowerCase() === 'z' && !event.isComposing) {
        if (event.target instanceof Node && editor.current?.dom.contains(event.target)) return
        if (
          event.target instanceof Element &&
          event.target.closest('input, textarea, [contenteditable]')
        )
          return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) stepHistory(event.shiftKey ? 'redo' : 'undo')
      } else if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) savePatch()
      } else if (event.key === '.') {
        event.preventDefault()
        event.stopPropagation()
        playback.stop().catch((failure: unknown) => setError(String(failure)))
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) applyCode()
      }
    }
    window.addEventListener('keydown', shortcut, true)
    return () => window.removeEventListener('keydown', shortcut, true)
  })

  async function togglePlay() {
    if (needsStop) await playback.stop()
    else {
      // Play is a stopping spot, and always plays the last applied code.
      settleDraft(true, false)
      playAccepted()
    }
  }

  const edit: RackEdit = (action, { group, notice: done, undoFocus: focus } = {}) => {
    if (current.current.phase !== 'readable' || composing) return false
    const accepted = current.current.document
    let next: Patch
    try {
      next = action(accepted.patch)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    }
    try {
      const result = applyRackEdit(accepted, next)
      install(result.document, true, group)
      // Every rewrite says so, whatever else this edit reports.
      const messages = [done, result.converted ? 'Code rewritten in rack style' : undefined]
      const message = messages.filter(Boolean).join(' · ')
      if (message) setNotice({ message, action: 'undo', group, undoFocus: focus })
      return true
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      if (failure instanceof RackEditRefused)
        setNotice({ message: `Can’t make that edit from the rack: ${reason}`, tone: 'error' })
      else setError(reason)
      return false
    }
  }

  function noticeAction(action: NoticeAction) {
    if (action === 'cancel-load') {
      cancelReplacement()
      return
    }
    if (action === 'start-new') {
      setNotice(null)
      requestReplacement({ kind: 'new' }).catch((failure: unknown) => setError(String(failure)))
      return
    }
    stepHistory('undo')
  }

  async function replaceWork(replacement: Replacement): Promise<void> {
    const operation = ++replacementRevision.current
    const revision = workRevision.current
    const replaced = current.current.document.source
    const stopsAudio = needsStop
    setReplacing(true)
    setError(null)
    if (stopsAudio)
      setNotice({ message: 'Waiting for audio to stop…', action: 'cancel-load', sticky: true })
    try {
      const next = await prepareReplacement(
        async () => {
          switch (replacement.kind) {
            case 'file':
              return replacement.file.text()
            case 'new':
              return newPatch()
            case 'saved':
              return replacement.entry.source
            case 'library':
              return renameDocument(readLibraryPatch(replacement.entry), replacement.entry.title)
          }
        },
        playback,
        () => operation === replacementRevision.current && revision === workRevision.current,
      )
      if (typeof next === 'string') {
        changeDraft(next)
        const readable = readDraft(next)
        if (readable) install(readable)
      } else install(next)
      const opened = current.current.phase === 'readable'
      // Identical source records no history step, so Undo would take back something older.
      const replacedWork = current.current.document.source !== replaced
      if (opened && replacedWork && replaced !== cleanSource.current)
        setNotice({
          message: [
            replacement.kind === 'new'
              ? 'Started a new patch'
              : `Loaded ${replacementName(replacement)}`,
            ...(stopsAudio ? ['Playback stopped'] : []),
          ].join(' · '),
          action: 'undo',
        })
      cleanSource.current =
        replacement.kind === 'saved' && opened
          ? current.current.document.source
          : typeof next === 'string'
            ? null
            : next.source
      // An unreadable saved draft leaves the old accepted patch, which stays unlinked.
      savedId.current = replacement.kind === 'saved' && opened ? replacement.entry.id : null
      if (replacement.kind === 'saved' && opened)
        savedRevisions.set(replacement.entry.id, replacement.entry.revision)
      savedIds.set(current.current.document, savedId.current)
      setSelected(null)
      setPendingReplacement(null)
      setRackGeneration((generation) => generation + 1)
      setPatchLoads((loads) => loads + 1)
      if (opened && replacement.kind !== 'new') setPatchOpens((opens) => opens + 1)
      setLibraryOpen(false)
    } catch (failure) {
      setNotice((shown) => (shown?.action === 'cancel-load' ? null : shown))
      if (operation === replacementRevision.current)
        setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (operation === replacementRevision.current) setReplacing(false)
    }
  }

  async function requestReplacement(replacement: Replacement) {
    cancelReplacement()
    setError(null)
    // Undo restores accepted work, but it cannot restore a draft that was never applied.
    if (current.current.phase === 'readable' && !composing) await replaceWork(replacement)
    else setPendingReplacement(replacement)
  }

  function replaceMetadata() {
    try {
      install(replaceLayout(current.current.document))
    } catch (failure) {
      setError(String(failure))
    }
  }

  function showCode(id: string) {
    setSelected(id)
    const binding = current.current.document.bindings.find((b) => b.module === id)
    if (!binding || current.current.phase !== 'readable') return
    setRackFocus(false)
    setWorkspaceView((view) => (view === 'rack' ? 'code' : view))
    setCodeSelection({ start: binding.start, end: binding.end })
  }

  function exportSource() {
    const work = current.current
    return work.phase === 'readable' && work.document.layout !== 'invalid'
      ? withFactoryPacks(work.document).source
      : work.draft
  }

  function download(source: string, filename: string) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportDraft() {
    const { patch, source } = current.current.document
    download(exportSource(), patchFilename(patch, 'strudel', source))
  }

  /** Ctrl/Cmd+S. A failed save keeps the work open and says so until dismissed. */
  function writeSaved(name: string) {
    // The exact accepted file, or the exact draft; Export adds factory setup, not saving.
    const { document: accepted, draft, phase: state } = current.current
    const id = savedId.current ?? undefined
    const result = myPatches.save({
      id,
      revision: id && savedRevisions.get(id),
      name,
      source: state === 'readable' ? accepted.source : draft,
    })
    setSaved(myPatches.load())
    if (!result.ok) {
      // Nothing was overwritten, so the next save asks for a new name.
      if (result.failure === 'conflict') {
        savedId.current = null
        savedIds.set(accepted, null)
      }
      setSaveFailure({
        message: `Couldn’t save ${name}. ${STORE_FAILURES[result.failure]}`,
        tone: 'error',
        sticky: true,
      })
      return
    }
    setSaveFailure(null)
    savedId.current = result.value.id
    savedRevisions.set(result.value.id, result.value.revision)
    savedIds.set(accepted, result.value.id)
    if (state === 'readable') cleanSource.current = accepted.source
    setNotice({ message: `Saved ${name}${state === 'readable' ? '' : ' with its unapplied code'}` })
  }

  function savePatch() {
    if (composing || editor.current?.composing || libraryOpen || naming !== null) return
    settleDraft(true, false)
    const work = current.current
    const fallback = patchName(work.document.patch, work.document.source)
    if (!savedId.current) {
      setNaming(fallback)
      return
    }
    // A name typed in the header wins; otherwise the entry keeps the name you gave it.
    const latest = myPatches.load()
    const entry = latest.ok ? latest.value.find((item) => item.id === savedId.current) : undefined
    const typed = work.phase === 'readable' ? work.document.patch.name?.trim() : undefined
    saveNamed(typed || entry?.name || fallback)
  }

  function nameOpenPatch(name: string) {
    if (current.current.phase !== 'readable' || current.current.document.layout === 'invalid')
      return
    try {
      const named = renameDocument(current.current.document, name)
      if (named !== current.current.document) install(named)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  function saveNamed(name: string) {
    setNaming(null)
    nameOpenPatch(name)
    writeSaved(name)
  }

  function storeChanged(result: Parameters<typeof failureMessage>[0]) {
    setSaved(myPatches.load())
    return failureMessage(result)
  }

  const status = {
    stopped: 'Ready',
    bouncing: 'Bouncing WAV…',
    starting: audio.resources === 'loading' ? 'Loading samples' : 'Starting audio',
    playing: 'Playing',
    applying: 'Applying code',
    stopping: 'Stopping audio',
    error: audio.scheduling === 'stopped' ? 'Audio error' : 'Audio state unknown',
  }[audio.status]

  const lockReason: LockReason | null = rackLocked
    ? composing
      ? 'composing'
      : phase === 'invalid'
        ? 'unreadable'
        : 'draft'
    : document.layout === 'invalid'
      ? 'metadata'
      : null

  const replacementPrompt = pendingReplacement && (
    <ReplacementPrompt
      title={
        pendingReplacement.kind === 'new'
          ? 'Replace this patch?'
          : `Replace this patch with ${replacementName(pendingReplacement)}?`
      }
      action={
        pendingReplacement.kind === 'new'
          ? 'Replace patch'
          : pendingReplacement.kind === 'file'
            ? 'Open patch'
            : 'Load patch'
      }
      stopWarning={
        pendingReplacement.kind === 'new'
          ? 'Starting a new patch stops playback.'
          : `Loading ${replacementName(pendingReplacement)} stops playback.`
      }
      replacing={replacing}
      cancel={cancelReplacement}
      exportCurrent={exportDraft}
      confirm={async () => {
        if (pendingReplacement) await replaceWork(pendingReplacement)
      }}
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
        <input
          key={patchName(patch, document.source)}
          className="patch-name"
          aria-label="Patch name"
          defaultValue={patchName(patch, document.source)}
          disabled={rackLocked || replacing || document.layout === 'invalid'}
          onBlur={(event) => {
            if (current.current.phase !== 'readable') return
            try {
              const next = renameDocument(current.current.document, event.currentTarget.value)
              event.currentTarget.value = patchName(next.patch, next.source)
              if (next !== current.current.document) install(next)
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : String(failure))
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Escape')
              event.currentTarget.value = patchName(patch, document.source)
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
        />
        <FileMenu
          newPatch={() => {
            cancelReplacement()
            requestReplacement({ kind: 'new' }).catch((failure: unknown) =>
              setError(String(failure)),
            )
          }}
          openFile={() => fileInput.current?.click()}
          openLibrary={() => {
            cancelReplacement()
            setError(null)
            setSaved(myPatches.load())
            setLibraryOpen(true)
          }}
          save={savePatch}
          exportFile={exportDraft}
          bounce={() => {
            playback
              .bounce(Number(bounceCycles))
              .catch((failure: unknown) => setError(String(failure)))
          }}
          bounceCycles={bounceCycles}
          setBounceCycles={setBounceCycles}
          bouncing={audio.status === 'bouncing'}
          bounceDisabled={
            rackLocked ||
            audio.status === 'bouncing' ||
            !Number.isInteger(Number(bounceCycles)) ||
            Number(bounceCycles) < 1 ||
            Number(bounceCycles) > 128
          }
          openInStrudel={() =>
            window.open(strudelUrl(current.current.document), '_blank', 'noopener,noreferrer')
          }
        />
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".strudel,.js,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              requestReplacement({ kind: 'file', file }).catch((failure: unknown) =>
                setError(String(failure)),
              )
            }
            event.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => stepHistory('undo')}
          disabled={composing || replacing || (!history.canUndo && !locked)}
          title="Ctrl/Cmd+Z"
        >
          Undo
        </button>
        <button
          type="button"
          className="button history-redo"
          onClick={() => stepHistory('redo')}
          disabled={composing || replacing || locked || !history.canRedo}
          title="Shift+Ctrl/Cmd+Z"
        >
          Redo
        </button>
        <fieldset
          className="header-tempo"
          disabled={rackLocked || document.layout === 'invalid' || !out}
        >
          <legend className="sr-only">Tempo</legend>
          {tempoControl?.kind === 'knob' && (
            <Numeric
              key={`${out?.id}:${typeof out?.values.bpm === 'number' ? out.values.bpm : tempoControl.default}:${rackGeneration}`}
              control={tempoControl}
              value={typeof out?.values.bpm === 'number' ? out.values.bpm : tempoControl.default}
              commit={(value, historyGroup) =>
                !!out &&
                edit((p) => setValue(p, out.id, tempoControl.id, value), { group: historyGroup })
              }
            />
          )}
        </fieldset>
        <CycleClock />
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          aria-label={needsStop ? 'Stop' : 'Play'}
          title="Ctrl/Cmd+Enter: apply code and play · Ctrl/Cmd+.: stop"
        >
          {needsStop ? (
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
        <a
          className="github-link"
          href="https://github.com/FireLakeLabs/monkeyboys-modular-synth"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub (opens in a new tab)"
          title="View source on GitHub"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {/* GitHub mark from Primer Octicons (MIT). */}
            <path
              fill="currentColor"
              d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"
            />
          </svg>
        </a>
      </header>

      <fieldset className="workspace-views" aria-label="Workspace view">
        {(['rack', 'code', 'both'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={workspaceView === view}
            onClick={() => setWorkspaceView(view)}
          >
            {view === 'rack' ? 'Rack' : view === 'code' ? 'Code' : 'Both'}
          </button>
        ))}
      </fieldset>
      <main
        className="workspace"
        data-view={workspaceView}
        data-rack-focus={rackFocus}
        data-locked={lockReason !== null}
      >
        <Rack
          panelKey={String(rackGeneration)}
          patchLoads={patchLoads}
          patchOpens={patchOpens}
          focusToggle={
            <button
              type="button"
              aria-pressed={rackFocus}
              onClick={() => setRackFocus((focus) => !focus)}
            >
              {rackFocus ? 'Restore workspace' : 'Focus rack'}
            </button>
          }
          patch={patch}
          sampleResources={seatedResources(document, sampleResources)}
          soundCrate={(active) => (
            <SoundCrate
              document={document}
              locked={rackLocked || audio.status === 'bouncing'}
              active={active}
            />
          )}
          cartridgeBay={
            <CartridgeBay
              document={document}
              locked={rackLocked || document.layout === 'invalid' || audio.status === 'bouncing'}
              install={install}
            />
          }

          document={document}
          locked={lockReason !== null}
          packWarning={packWarning}
          lockStrip={
            <RackLock
              reason={lockReason}
              pulsing={pulsing}
              apply={() => {
                applyCode(false)
                editor.current?.focus()
              }}
              revert={() => {
                install(current.current.document)
                editor.current?.focus()
              }}
              replaceMetadata={replaceMetadata}
            />
          }
          touchBlocked={() => setPulsing(true)}
          showCode={showCode}
          sourceModules={document.bindings.map((b) => b.module)}
          escapedNotation={document.bindings.flatMap((b) =>
            Object.entries(b.controls).flatMap(([id, span]) =>
              document.source.slice(span.start, span.end).includes('\\')
                ? [`${b.module}:${id}`]
                : [],
            ),
          )}
          conversions={conversions}
          conversionStopped={audio.status === 'stopped' && audio.scheduling === 'stopped'}
          convertCode={(id) => {
            const transport = playback.getSnapshot()
            if (
              locked ||
              current.current.phase !== 'readable' ||
              current.current.document !== document ||
              transport.status !== 'stopped' ||
              transport.scheduling !== 'stopped'
            )
              return
            const offer = conversions.find((item) => item.module === id)
            if (!offer) return
            install(offer.document)
            setSelected(null)
          }}
          editingModule={editingModule}
          emptyOutput={emptyOutput}
          edit={edit}
          assess={assess}
          selected={selected}
          select={setSelected}
          prompting={!!pendingReplacement}
          cancelReplacement={cancelReplacement}
        />

        <section className="code" aria-label="Strudel code">
          <h2>
            STRUDEL <small>Live code · editable</small>
          </h2>
          <div className="code-actions">
            <button
              type="button"
              onClick={() => applyCode()}
              disabled={composing || audio.status === 'bouncing'}
              title="Ctrl/Cmd+Enter to apply · Ctrl/Cmd+. to stop"
            >
              Apply code
            </button>
            <label className="auto-apply">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(event) => setAutoApply(event.target.checked)}
              />
              Auto-apply while playing
            </label>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(exportSource())
                  .catch((failure: unknown) => setError(String(failure)))
              }
            >
              Copy
            </button>
          </div>
          <Suspense fallback={<output className="source-surface">Loading source editor…</output>}>
            <SourceEditor
              editor={editor}
              sourceFeedback={playback.subscribeSourceFeedback}
              source={draft}
              document={locked ? null : document}
              keepDecorations={locked && !rackLocked}
              selected={selected}
              invalid={phase === 'invalid'}
              diagnostic={diagnostic}
              status={
                <>
                  <output className="sync-status">
                    {phase === 'editing' && applying
                      ? 'Reading code…'
                      : phase === 'editing' || phase === 'held'
                        ? 'Unapplied changes'
                        : phase === 'invalid'
                          ? 'Rack shows previous code'
                          : patch.modules.some((m) => m.type === 'code')
                            ? 'Rack matches code · Some code has no controls'
                            : 'Rack matches code'}
                  </output>
                  {phase === 'invalid' && <span>Unapplied changes</span>}
                  <output className="transport-status" aria-live="polite">
                    {emptyOutput ? 'Nothing reaches OUT yet' : status}
                  </output>
                  <details className="engine-info" data-warning={audio.resources === 'failed'}>
                    <summary aria-label="Audio engine info" title="Audio engine info">
                      ⓘ
                    </summary>
                    <div className="engine-info-content">
                      <p className="audio-note">
                        {locked && audio.scheduling === 'scheduled'
                          ? 'Previous pattern scheduled. '
                          : ''}
                        Sample status:{' '}
                        {
                          {
                            unknown: 'unknown; audio has not initialized',
                            loading: 'loading manifests; audio readiness unverified',
                            registered:
                              'manifests registered; sample decoding and output unverified',
                            failed: 'resource/output failure observed; readiness unknown',
                          }[audio.resources]
                        }
                        . Stop ends scheduling; tails may ring out.
                      </p>
                    </div>
                  </details>
                  {diagnostic && (
                    <p className="error" role="alert">
                      Line {diagnostic.line}, column {diagnostic.column + 1}: {diagnostic.message}
                      <br />
                      <mark>{draft.split(/\r?\n/)[diagnostic.line - 1]}</mark>
                    </p>
                  )}
                  {(rackLocked || phase === 'invalid') && (
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
                        Unknown or invalid saved rack metadata retained. Rack editing is disabled
                        until you replace it.
                      </p>
                      <button type="button" onClick={replaceMetadata}>
                        Replace rack metadata
                      </button>
                    </div>
                  )}
                  {document.diagnostics.map((message) => (
                    <p key={message} className="placeholder">
                      {message}
                    </p>
                  ))}
                  {slowAudio === audio && (
                    <output className="pending-note error">
                      Still waiting for audio. Stop cancels scheduling intent without waiting for
                      evaluation. Running code cannot be interrupted. If it never completes, export
                      your draft before reloading this page. Reloading discards unsaved work and
                      ends this page’s audio.
                    </output>
                  )}
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
                        Correct code or check audio access, then apply with Ctrl/Cmd+Enter or press
                        Play. Stop can be retried if audio state is unknown.
                      </p>
                      <details>
                        <summary>Audio error details</summary>
                        {audio.error}
                      </details>
                    </div>
                  )}
                </>
              }
              change={changeDraft}
              focused={focusEditor}
              caretMoved={caretMoved}
              composing={setComposing}
              editingModule={setEditingModule}
              stepHistory={stepHistory}
            />
          </Suspense>
        </section>
      </main>
      {/* Any file action can run while the rack or code pane is hidden, so this floats. */}
      {pendingReplacement && !['library', 'saved'].includes(pendingReplacement.kind) && (
        <div className="workspace-prompt">{replacementPrompt}</div>
      )}
      <WorkspaceNotice notice={notice} act={noticeAction} dismiss={dismissNotice} />
      <WorkspaceNotice
        notice={saveFailure}
        act={noticeAction}
        dismiss={dismissSaveFailure}
        raised
      />
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
          confirmation={
            pendingReplacement?.kind === 'library' || pendingReplacement?.kind === 'saved' ? (
              replacementPrompt
            ) : replacing ? (
              <output className="pending-note" aria-live="polite">
                Waiting for audio to stop. Close cancels the load.
              </output>
            ) : null
          }
          error={error}
          saved={saved}
          usage={myPatches.usage()}
          loadSaved={(entry) => {
            requestReplacement({ kind: 'saved', entry }).catch((failure: unknown) =>
              setError(String(failure)),
            )
          }}
          renameSaved={(entry, name) => {
            const result = myPatches.rename(entry.id, name)
            // Only a tab that was up to date stays so; a stale one must still conflict.
            if (result.ok && savedRevisions.get(entry.id) === result.value.previous)
              savedRevisions.set(entry.id, result.value.revision)
            const failure = storeChanged(result)
            // The open patch is this entry, so its name changes too.
            if (!failure && savedId.current === entry.id) nameOpenPatch(name)
            return failure
          }}
          exportSaved={(entry) => {
            const filename = patchFilename({ name: entry.name }, 'strudel', entry.source)
            try {
              const saved = read(entry.source)
              download(
                saved.layout === 'invalid' ? entry.source : withFactoryPacks(saved).source,
                filename,
              )
            } catch {
              download(entry.source, filename) // An unreadable draft exports exactly.
            }
          }}
          deleteSaved={(entry) => {
            const result = myPatches.remove(entry.id)
            if (result.ok && savedId.current === entry.id) savedId.current = null
            return storeChanged(result)
          }}
          restoreSaved={(entry, index) => storeChanged(myPatches.restore(entry, index))}
        />
      )}
      {naming !== null && (
        <SavePrompt name={naming} save={saveNamed} cancel={() => setNaming(null)} />
      )}
    </div>
  )
}
