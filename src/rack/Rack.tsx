import type { SourceDocument } from '../reader/types'
import { CableProbe, PatchCredits, ScopeDisplay } from './PatternVisuals'

import { SampleSlot, Tape, RazorMarks } from '../samples/SamplePanel'
import { dropSound, variantCount, type SoundChoice } from '../samples/crate'
import type { SamplePackResource } from '../strudel/engine'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { generateDocument } from '../codegen/generate'
import { functionMembers, graph } from '../codegen/graph'
import { loopRole } from '../modules/functions'
import { LOOK_LABELS, looksFor } from '../modules/looks'
import { LOOK_LAYOUT } from '../looks/layout'
import { PALETTE_CATEGORIES, paletteModules, getModuleSpec } from '../modules/catalog'
import type { JackRef, Patch } from '../patch/types'
import type { CodeConversion } from '../workspace/codeConversion'
import { RAIL_WIDTHS, railWidth, OUTPUT_PANEL_WIDTH } from '../patch/layout'
import { observeActivity } from './activity'
import type { Control } from '../modules/types'
import { ControlEditor } from './Controls'
import { MoreFlyout } from './MoreFlyout'
import {
  HP,
  ROW_HEIGHT,
  setRailWidth,
  cableSignal,
  cableKind,
  cableWarnings,
  effectNotes,
  removeRow,
  addRow,
  rackRows,
  panelControls,
  routedModules,
  connect,
  placementPosition,
  placeModule,
  removeCable,
  removeModule,
  setValue,
  setLook,
  duplicateModule,
  renameOutput,
  type ConnectionAssessment,
} from './model'

export interface RackEditOptions {
  /** Live values of one gesture share a group, and so one undo step. */
  group?: object | undefined
  /** Says what happened when the rack alone would not show it, with an Undo. */
  notice?: string | undefined
  /** Where keyboard focus goes after that Undo. */
  undoFocus?: string | undefined
}
export type RackEdit = (action: (patch: Patch) => Patch, options?: RackEditOptions) => boolean
interface Point {
  x: number
  y: number
}
interface Wiring {
  from: JackRef
  moving?: string
}
interface Placement {
  type: string
  moving?: string
}
/** A load fits the whole rack when it can; below this, jacks and labels stop being usable. */
const READABLE_ZOOM = 0.75
const CABLE_MODES = [
  { id: 'all', label: 'All' },
  { id: 'focus', label: 'Focus' },
  { id: 'dim', label: 'Dim' },
] as const
const keyOf = (ref: JackRef) => `${ref.module}:${ref.jack}`
const moduleHeader = (id: string) => `[data-module="${CSS.escape(id)}"] .module-header`
const curve = (a: Point, b: Point) =>
  `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + Math.min(120, 28 + Math.abs(a.x - b.x) / 5)} ${b.x} ${b.y}`

export function Rack({
  panelKey,
  patchLoads,
  patchOpens,
  focusToggle,
  patch,
  cartridgeBay,

  document: sourceDocument,

  soundCrate,
  sampleResources,
  edit,
  selected,
  select,
  newPatch,
  replacementPrompt,
  cancelReplacement,
  locked,
  lockStrip,
  touchBlocked,
  showCode,
  sourceModules,
  escapedNotation,
  conversions,
  conversionStopped,
  convertCode,
  editingModule,
  emptyOutput,
  assess,
}: {
  /** Panels rebuild their local drafts on this; the rack's own view state does not. */
  panelKey: string
  patchLoads: number
  /** Counts file and library loads, which open at a readable view. */
  patchOpens: number
  focusToggle: ReactNode
  patch: Patch
  cartridgeBay?: ReactNode

  document: SourceDocument

  soundCrate?: ReactNode
  sampleResources: readonly SamplePackResource[]
  locked: boolean
  lockStrip: ReactNode
  touchBlocked: () => void
  showCode: (id: string) => void
  editingModule: string | null
  emptyOutput: boolean
  escapedNotation: readonly string[]
  sourceModules: readonly string[]
  conversions: readonly CodeConversion[]
  conversionStopped: boolean
  convertCode: (id: string) => void
  edit: RackEdit
  assess: (from: JackRef, to: JackRef, moving?: string) => ConnectionAssessment
  selected: string | null
  select: (id: string | null) => void
  newPatch: () => void
  replacementPrompt: ReactNode
  cancelReplacement: () => void
}) {
  const [moduleFilter, setModuleFilter] = useState('')
  const [probeCable, setProbeCable] = useState<string | null>(null)
  const [pinnedProbe, setPinnedProbe] = useState(false)
  const palette = PALETTE_CATEGORIES.map((category) => ({
    ...category,
    modules: paletteModules(category.id, moduleFilter),
  })).filter((category) => category.modules.length > 0)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const menuElement = useRef<HTMLDialogElement>(null)
  const [allLooks, setAllLooks] = useState(false)
  const menuModule = patch.modules.find((m) => m.id === menu?.id)
  const surface = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const rails = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<number | 'fit'>(1)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () =>
      setViewportSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (surface.current) return observeActivity(surface.current)
    return undefined
  }, [])
  useEffect(() => {
    if (emptyOutput)
      surface.current
        ?.querySelector('.needs-source')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [emptyOutput])
  useEffect(() => {
    if (!menu || locked) return undefined
    const id = menu.id
    const element = menuElement.current
    element?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus()
    function dismiss() {
      setMenu(null)
      Array.from(surface.current?.querySelectorAll<HTMLElement>('[data-module]') ?? [])
        .find((panel) => panel.dataset.module === id)
        ?.querySelector<HTMLButtonElement>('.module-header')
        ?.focus()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    const outside = (event: PointerEvent) => {
      if (event.button === 0 && event.target instanceof Node && !element?.contains(event.target))
        dismiss()
    }
    window.addEventListener('keydown', escape, true)
    window.addEventListener('pointerup', outside)
    return () => {
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('pointerup', outside)
    }
  }, [menu, locked])
  const [points, setPoints] = useState<Record<string, Point>>({})
  const tools = useRef<HTMLDivElement>(null)
  const [toolPoint, setToolPoint] = useState<Point | null>(null)
  const [wire, setWire] = useState<Wiring | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [target, setTarget] = useState<JackRef | null>(null)
  const [hintPoint, setHintPoint] = useState<Point | null>(null)
  const [selectedCable, setSelectedCable] = useState<string | null>(null)
  const [hoveredModule, setHoveredModule] = useState<string | null>(null)
  const [cableVisibility, setCableVisibility] =
    useState<(typeof CABLE_MODES)[number]['id']>('focus')
  const cableFocus = hoveredModule ?? selected
  const cableVisibilityText =
    cableVisibility === 'all'
      ? 'All cables visible'
      : cableVisibility === 'dim'
        ? 'All cables dimmed'
        : cableFocus
          ? `Focus: ${cableFocus} (${hoveredModule ? 'hovered' : 'selected'})`
          : 'Focus: no module · all visible'
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [ghost, setGhost] = useState<{ row: number; hp: number } | null>(null)
  const [message, setMessage] = useState(
    'Add a module, then drag or click from an output to an input.',
  )
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null)
  const wireGesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingFocus.current) return
    surface.current?.querySelector<HTMLElement>(pendingFocus.current)?.focus()
    pendingFocus.current = null
  })
  const routed = routedModules(patch)
  const railHp = railWidth(patch)
  const rows = rackRows(patch)
  const height = rows * ROW_HEIGHT
  // Leave room below the last rail for inverse-scaled jack targets that wrap.
  const fitScale = Math.max(
    0.1,
    Math.min(
      1,
      (viewportSize.width - 36) / (railHp * HP),
      (viewportSize.height - 36 - 24) / height,
    ),
  )
  const scale = zoom === 'fit' ? fitScale : zoom
  const latestFit = useRef(fitScale)
  latestFit.current = fitScale
  const outputScale = Math.max(0.1, Math.min(1, viewportSize.height / 430))
  const candidates = useMemo(() => {
    const results = new Map<string, ConnectionAssessment>()
    if (wire)
      for (const module of patch.modules)
        for (const jack of getModuleSpec(module.type).jacks)
          if (jack.direction === 'in') {
            const to = { module: module.id, jack: jack.id }
            results.set(keyOf(to), assess(wire.from, to, wire.moving))
          }
    return results
  }, [patch, wire, assess])
  useLayoutEffect(() => {
    const element = surface.current
    if (!element) return
    const measure = () => {
      const bounds =
        element.querySelector('.cables')?.getBoundingClientRect() ?? element.getBoundingClientRect()
      const next: Record<string, Point> = {}
      for (const jack of element.querySelectorAll<HTMLButtonElement>('[data-jack]')) {
        const rect = jack.getBoundingClientRect()
        const id = jack.dataset.jack
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const box = jack.closest('.patch-box')?.getBoundingClientRect()
        // Scrolled-out jacks have geometry beyond their panel. Drawing to those
        // hidden targets makes fitted MIX cables appear to end on other rails.
        if (box && (x < box.left || x > box.right || y < box.top || y > box.bottom)) continue
        // Rail jacks scrolled out of the viewport pin to its edge, so cables never cross OUT.
        const rail = jack.closest('.rack-scroll')
        const visible = rail?.getBoundingClientRect()
        const edge = rail &&
          visible && {
            left: visible.left,
            top: visible.top,
            right: visible.left + rail.clientWidth,
            bottom: visible.top + rail.clientHeight,
          }
        if (id)
          next[id] = {
            x: (edge ? Math.max(edge.left, Math.min(x, edge.right)) : x) - bounds.left,
            y: (edge ? Math.max(edge.top, Math.min(y, edge.bottom)) : y) - bounds.top,
          }
      }
      setPoints(next)
      const panel = selected && element.querySelector(`[data-module="${CSS.escape(selected)}"]`)
      if (panel) {
        const frame = element.getBoundingClientRect()
        const rect = panel.getBoundingClientRect()
        const size = tools.current?.getBoundingClientRect()
        const height = size?.height ?? 0
        const above = rect.top - frame.top - height - 4
        // Without room above, the bottom edge keeps the tools off this module's controls.
        setToolPoint({
          x: Math.max(8, Math.min(rect.left - frame.left, frame.width - (size?.width ?? 0) - 8)),
          y: above >= 8 ? above : frame.height - height - 8,
        })
      }
    }
    const contextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const panel = event.target.closest<HTMLElement>('[data-module]')
      const id = panel?.dataset.module
      if (!id || locked) return
      event.preventDefault()
      select(id)
      setMenu({
        id,
        x: Math.min(event.clientX, window.innerWidth - 280),
        y: Math.min(event.clientY, window.innerHeight - 380),
      })
    }
    element.addEventListener('contextmenu', contextMenu)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const part of element.querySelectorAll('.module-panel, .patch-box, [data-jack]'))
      observer.observe(part)
    window.addEventListener('resize', measure)
    element.addEventListener('scroll', measure, true)
    return () => {
      element.removeEventListener('contextmenu', contextMenu)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      element.removeEventListener('scroll', measure, true)
    }
  }, [patch, rows, locked, select, selected, scale, outputScale, panelKey])

  // Gestures and selections belong to the panels they started on.
  const [seenPanels, setSeenPanels] = useState(panelKey)
  if (seenPanels !== panelKey) {
    setSeenPanels(panelKey)
    setWire(null)
    setPointer(null)
    setTarget(null)
    setHintPoint(null)
    setPlacement(null)
    setGhost(null)
    setMenu(null)
    setSelectedOutput(null)
    setSelectedCable(null)
    setProbeCable(null)
    setPinnedProbe(false)
  }
  useLayoutEffect(() => {
    viewport.current?.scrollTo(0, 0)
  }, [patchLoads])
  useLayoutEffect(() => {
    if (patchOpens) setZoom(latestFit.current >= READABLE_ZOOM ? 'fit' : READABLE_ZOOM)
  }, [patchOpens])
  function clearWire() {
    setWire(null)
    setPointer(null)
    setTarget(null)
    setHintPoint(null)
    wireGesture.current = null
  }
  function cancel() {
    clearWire()
    setPlacement(null)
    setGhost(null)
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
        setMenu(null)
        cancelReplacement()
        setSelectedOutput(null)
        setMessage('Cancelled')
      }
    }
    const outsideDrop = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-jack]')) clearWire()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('pointerup', outsideDrop)
    window.addEventListener('pointercancel', clearWire)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('pointerup', outsideDrop)
      window.removeEventListener('pointercancel', clearWire)
    }
  }, [cancelReplacement])
  useEffect(() => {
    const remove = (event: KeyboardEvent) => {
      if (!['Delete', 'Backspace'].includes(event.key) || event.defaultPrevented) return
      const focus = event.target
      if (locked || event.isComposing || !(focus instanceof Element)) return
      if (focus !== focus.ownerDocument.body && !focus.closest('.rack')) return
      if (focus.closest('input, textarea, select, [contenteditable], dialog')) return
      const focused = focus.closest<HTMLElement>('[data-module]')?.dataset.module
      if (!focused && selectedCable) {
        event.preventDefault()
        if (edit((p) => removeCable(p, selectedCable))) {
          setSelectedCable(null)
          setMessage('Cable removed')
        }
        return
      }
      const id = focused ?? selected
      const target = patch.modules.find((m) => m.id === id)
      if (!target || getModuleSpec(target.type).unique) return
      event.preventDefault()
      deleteModule(target.id)
    }
    window.addEventListener('keydown', remove)
    return () => window.removeEventListener('keydown', remove)
  })
  function deleteModule(id: string) {
    const index = patch.modules.findIndex((m) => m.id === id)
    const target = patch.modules[index]
    if (!target) return
    const cables = patch.cables.filter((c) => c.from.module === id || c.to.module === id).length
    const name = getModuleSpec(target.type).name
    if (
      edit((p) => removeModule(p, id), {
        notice: `Deleted ${name}${cables ? ` and ${cables} ${cables === 1 ? 'cable' : 'cables'}` : ''}`,
        undoFocus: moduleHeader(id),
      })
    ) {
      const neighbour = patch.modules[index + 1]?.id ?? patch.modules[index - 1]?.id ?? null
      select(neighbour)
      if (neighbour) pendingFocus.current = moduleHeader(neighbour)
      cancel()
    }
  }
  function candidate(to: JackRef) {
    return candidates.get(keyOf(to)) ?? null
  }
  function inspectJack(to: JackRef, element: HTMLElement) {
    if (!wire) return
    const bounds = element.getBoundingClientRect()
    setTarget(to)
    setHintPoint({
      x: Math.max(8, Math.min(bounds.left, window.innerWidth - 308)),
      y: Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 110)),
    })
    setMessage(candidate(to)?.message ?? '')
  }
  function finish(to: JackRef) {
    if (!wire) return
    const result = candidate(to)
    setMessage(result?.message ?? '')
    if (!result || result.kind === 'blocked') {
      cancel()
      return
    }
    const occupied = patch.cables.some((c) => keyOf(c.to) === keyOf(to) && c.id !== wire.moving)
    edit(
      (p) => connect(p, wire.from, to, occupied, wire.moving),
      occupied
        ? {
            notice: `Replaced the cable into ${to.module} ${to.jack}`,
            undoFocus: `[data-jack="${CSS.escape(keyOf(to))}"]`,
          }
        : undefined,
    )
    cancel()
  }
  function place(row: number, hp: number) {
    if (!placement) return
    if (edit((p) => placeModule(p, placement.type, row, hp, placement.moving))) {
      setMessage(`${getModuleSpec(placement.type).name} placed`)
    }
    setPlacement(null)
    setGhost(null)
  }
  const currentCable = patch.cables.find((c) => c.id === selectedCable)
  const module = patch.modules.find((m) => m.id === selected)
  const loopInfo = useMemo(() => {
    const members = functionMembers(graph(patch))
    const { functions } = generateDocument(patch)
    return { members, functions }
  }, [patch])
  function functionLabel(from: JackRef): string {
    const id = from.jack === 'send' ? from.module : loopInfo.members.get(from.module)
    const owner = patch.modules.find((module) => module.id === id)
    if (!owner) return ''
    const spec = getModuleSpec(owner.type)
    return `function · ${loopRole(spec, owner)} · ${loopInfo.functions[owner.id] ?? 'Close RETURN and connect the module to OUT to write the function'}`
  }
  // Prompts sit top-centre, where the module tools could otherwise cover them.
  const prompting = !!replacementPrompt
  const notes = effectNotes(patch)
  const uniqueWarnings = [...new Set(patch.cables.flatMap((c) => cableWarnings(patch, c)))]
  function applySound(module: string, choice: SoundChoice, row?: number) {
    if (
      !sampleResources.some((resource) =>
        resource.sounds.some(
          (sound) => sound.name === choice.name && choice.n < variantCount(sound.bank),
        ),
      )
    )
      throw new Error('Choose a sound variant from a seated pack')
    edit((p) => dropSound(p, module, choice, row))
  }
  function selectModule(id: string) {
    select(id)
    setSelectedCable(null)
  }
  const renderModules = (modules: Patch['modules']) =>
    modules.map((m) => {
      const spec = getModuleSpec(m.type)
      const layout = panelControls(spec)
      const controlEditor = (control: Control) => (
        <ControlEditor
          key={control.id}
          patch={patch}
          module={m}
          control={control}
          dropSample={
            m.type === 'drums'
              ? (choice, row) => {
                  applySound(m.id, choice, row)
                }
              : undefined
          }
          notationEscaped={escapedNotation.includes(`${m.id}:${control.id}`)}
          {...(m.type === 'code' && sourceModules.includes(m.id)
            ? { editSource: () => showCode(m.id) }
            : {})}
          commit={(value, historyGroup) =>
            edit((p) => setValue(p, m.id, control.id, value), { group: historyGroup })
          }
        />
      )
      return (
        <section
          key={`${m.id}:${panelKey}`}
          aria-label={`${spec.name} ${m.id}${!routed.has(m.id) ? ' · not connected to OUT' : ''}`}
          data-jacks={LOOK_LAYOUT[m.look].jacks}
          data-module={m.id}
          data-editing={editingModule === m.id}
          className={`module-panel cat-${spec.category} family-${spec.family} look-${m.look} ${selected === m.id ? 'selected' : ''} ${!routed.has(m.id) ? 'inactive' : ''}`}
          style={
            m.type === 'out'
              ? { right: 8, top: 20, width: spec.hp * HP }
              : { left: m.hp * HP, top: m.row * ROW_HEIGHT + 20, width: spec.hp * HP }
          }
        >
          {spec.family === 'alien' && <span className="activity-glow" aria-hidden="true" />}
          <button
            type="button"
            className="module-header"
            aria-label={`Select ${m.id}`}
            aria-pressed={selected === m.id}
            draggable={m.type !== 'out'}
            onClick={() => selectModule(m.id)}
            onDragStart={(event) => {
              if (m.type === 'out') {
                event.preventDefault()
                return
              }
              event.dataTransfer.setData('text/plain', m.id)
              setPlacement({ type: m.type, moving: m.id })
            }}
            onDragEnd={() => {
              setPlacement(null)
              setGhost(null)
            }}
          >
            <span
              className="module-dot"
              title={routed.has(m.id) ? 'Connected to OUT' : 'Not connected to OUT'}
            />
            {spec.family === 'cyber' && (
              <span className="cyber-cursor" aria-hidden="true">
                ▌
              </span>
            )}
            <strong data-tight={spec.name.split(' ').some((word) => word.length > spec.hp)}>
              {spec.name}
            </strong>
            <small>{spec.title}</small>
          </button>
          <div
            className="module-controls"
            onFocus={() => selectModule(m.id)}
            onPointerDown={() => selectModule(m.id)}
          >
            {m.type === 'scope' && <ScopeDisplay module={m} />}

            <SampleSlot
              module={m}
              resources={sampleResources}
              clear={() => {
                const target = spec.sampleTarget
                if (target) edit((p) => setValue(p, m.id, target.control, ''))
              }}
              drop={(choice) => applySound(m.id, choice)}
            />
            {m.type === 'smpl' && (
              <Tape
                module={m}
                commit={(id, value, group) => edit((p) => setValue(p, m.id, id, value), { group })}
              />
            )}
            {m.type === 'splice' && <RazorMarks module={m} />}
            {layout.loose.map(controlEditor)}
            {layout.strips.map(({ group, controls }) => (
              // A channel's controls read as one labelled strip.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              <div key={group} className="channel-strip" role="group" aria-label={group}>
                {controls.map(controlEditor)}
              </div>
            ))}
            {layout.more.length > 0 && (
              <MoreFlyout label={`${spec.name} ${m.id} settings`} locked={locked}>
                {layout.more.map(controlEditor)}
              </MoreFlyout>
            )}
            {conversions
              .filter((offer) => offer.module === m.id)
              .map((offer) => (
                <button
                  key={offer.module}
                  type="button"
                  className="code-conversion"
                  disabled={locked || !conversionStopped}
                  title={conversionStopped ? undefined : 'Stop playback to convert'}
                  onClick={() => convertCode(m.id)}
                >
                  Looks like {getModuleSpec(offer.type).name}: convert?
                </button>
              ))}
          </div>
          <div className="patch-box">
            {spec.jacks.map((jack) => {
              const ref = { module: m.id, jack: jack.id }
              const state = wire && jack.direction === 'in' ? candidate(ref) : null
              const connected = patch.cables.some(
                (c) => keyOf(c.from) === keyOf(ref) || keyOf(c.to) === keyOf(ref),
              )
              const incoming = patch.cables.find((c) => keyOf(c.to) === keyOf(ref))
              const signal =
                state && state.kind !== 'blocked'
                  ? state.signal
                  : incoming
                    ? cableKind(patch, incoming, loopInfo.members)
                    : cableSignal(patch, ref, loopInfo.members)
              return (
                <div key={jack.id} className={`jack-label jack-${jack.direction}`}>
                  <button
                    type="button"
                    data-jack={keyOf(ref)}
                    className={`jack signal-${signal} ${connected ? 'connected' : ''} ${emptyOutput && m.type === 'out' && jack.id === 'in' ? 'needs-source' : ''} ${state ? (state.kind === 'blocked' ? 'blocked' : `valid ${state.kind}`) : ''}`}
                    aria-label={`${m.id} ${jack.label} ${jack.direction} · ${signal === 'any' ? 'unresolved signal' : signal}${jack.id === 'send' ? ` · ${loopRole(spec, m)}` : ''}`}
                    aria-describedby={
                      wire && target && keyOf(target) === keyOf(ref)
                        ? 'cable-target-hint'
                        : undefined
                    }
                    title={
                      state?.message ??
                      ((signal === 'function' ? functionLabel(incoming?.from ?? ref) : '') ||
                        (wire && jack.direction === 'out'
                          ? 'Choose an input. Output-to-output is blocked.'
                          : `${jack.label} · ${signal === 'any' ? 'unresolved signal' : signal} ${jack.direction}`))
                    }
                    onPointerDown={(event) => {
                      if (jack.direction === 'in' && event.button === 0) wireGesture.current = null
                      if (jack.direction === 'out' && event.button === 0) {
                        if (wire) return
                        wireGesture.current = {
                          x: event.clientX,
                          y: event.clientY,
                          dragged: false,
                        }
                        setSelectedOutput(keyOf(ref))
                        setWire({ from: ref })
                        setMessage('Choose an input. Escape cancels.')
                        setPointer(points[keyOf(ref)] ?? null)
                      }
                    }}
                    onFocus={(event) => {
                      if (jack.direction === 'in') inspectJack(ref, event.currentTarget)
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.matches(':hover')) setTarget(null)
                    }}
                    onPointerEnter={(event) => {
                      if (jack.direction === 'in') inspectJack(ref, event.currentTarget)
                    }}
                    onPointerLeave={(event) => {
                      if (event.currentTarget !== document.activeElement) {
                        setTarget(null)
                        if (wire) setMessage('Choose an input. Escape cancels.')
                      }
                    }}
                    onPointerUp={() => {
                      // Layout can move an input under a source click's release.
                      // Only a drag or a fresh input press completes that connection.
                      if (
                        wire &&
                        jack.direction === 'in' &&
                        (!wireGesture.current || wireGesture.current.dragged)
                      )
                        finish(ref)
                      else if (
                        wire &&
                        jack.direction === 'out' &&
                        (keyOf(ref) !== keyOf(wire.from) || wireGesture.current?.dragged)
                      ) {
                        cancel()
                        setMessage('Choose an input. Output-to-output is blocked.')
                      }
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        if (jack.direction === 'out') setWire({ from: ref })
                        else finish(ref)
                      }
                    }}
                  />
                  <span>
                    {jack.label}
                    <span className="jack-state-mark" aria-hidden="true">
                      {state
                        ? state.kind === 'blocked'
                          ? '×'
                          : state.kind === 'valid'
                            ? '✓'
                            : '△'
                        : wire && jack.direction === 'out'
                          ? '×'
                          : ' '}
                    </span>
                    {jack.id === 'send' && (
                      <small className="function-role">{loopRole(spec, m)}</small>
                    )}
                  </span>
                  {jack.direction === 'out' &&
                    (patch.cables.filter((c) => keyOf(c.from) === keyOf(ref)).length > 1 ||
                      patch.names[keyOf(ref)]) && (
                      <input
                        key={`${m.id}:${jack.id}:${patch.names[keyOf(ref)]}`}
                        className="output-name"
                        aria-label={`Name ${m.id} ${jack.label}`}
                        defaultValue={patch.names[keyOf(ref)] ?? ''}
                        onPointerDown={(event) => event.stopPropagation()}
                        onBlur={(event) => {
                          if (event.target.value !== patch.names[keyOf(ref)])
                            edit((p) => renameOutput(p, keyOf(ref), event.target.value))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                          if (event.key === 'Escape') {
                            event.currentTarget.value = patch.names[keyOf(ref)] ?? ''
                            event.currentTarget.blur()
                          }
                        }}
                      />
                    )}
                </div>
              )
            })}
          </div>
          <span className="module-id">{m.id}</span>
        </section>
      )
    })
  return (
    <>
      <aside
        className={`library ${locked ? 'library-locked' : ''}`}
        inert={locked}
        aria-label="Module library"
      >
        {soundCrate}
        <div className="palette-heading">
          <h2>MODULES</h2>
          <label className="module-filter">
            Filter modules
            <input
              type="search"
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              placeholder="Name or Strudel call"
            />
          </label>
        </div>
        {palette.length === 0 && <output>No matching modules.</output>}
        {palette.map((category) => (
          <section key={category.id}>
            <h3>{category.label}</h3>
            <ul>
              {category.modules.map((spec) => (
                <li key={spec.id}>
                  <button
                    type="button"
                    draggable
                    className={`chip cat-${spec.category} chip-${spec.family}`}
                    aria-label={`Add ${spec.name}`}
                    title={`${spec.title} · ${spec.hp} HP · click to add or drag onto a rail`}
                    onDragStart={(event) => {
                      const existing = spec.unique && patch.modules.find((m) => m.type === spec.id)
                      if (existing) {
                        event.preventDefault()
                        select(existing.id)
                        return
                      }
                      event.dataTransfer.setData('text/plain', spec.id)
                      setPlacement({ type: spec.id })
                    }}
                    onDragEnd={() => {
                      setPlacement(null)
                      setGhost(null)
                    }}
                    onClick={() => {
                      const existing = spec.unique && patch.modules.find((m) => m.type === spec.id)
                      if (existing) {
                        select(existing.id)
                        return
                      }
                      const position = placementPosition(patch, spec.id)
                      edit((p) => placeModule(p, spec.id, position.row, position.hp))
                    }}
                  >
                    <span className="chip-heading">
                      <span className="chip-name">{spec.name}</span>
                      <span className="chip-family">{spec.family}</span>
                    </span>
                    <span className="chip-title">{spec.title}</span>
                    <code className="chip-call">{spec.paletteCall}</code>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
      <div className={`rack ${locked ? 'rack-locked' : ''}`} aria-label="Rack">
        {cartridgeBay}

        <PatchCredits source={sourceDocument.source} />
        <div className="rack-toolbar">
          <h2>
            RACK <small>{patch.modules.length} modules</small>
          </h2>
          <fieldset
            className="cable-visibility"
            aria-label="Cable visibility"
            aria-describedby="cable-visibility-state"
          >
            <span>Cables</span>
            {CABLE_MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-label={`${label} cables`}
                aria-pressed={cableVisibility === id}
                onClick={() => setCableVisibility(id)}
              >
                <span className="cable-mode-mark" aria-hidden="true">
                  {cableVisibility === id ? '✓' : ''}
                </span>
                {label}
              </button>
            ))}
            <span id="cable-visibility-state" className="cable-visibility-state">
              {cableVisibilityText}
            </span>
          </fieldset>
          <label className="rail-width">
            Rail width
            <select
              aria-label="Rail width"
              value={railHp}
              disabled={locked}
              onChange={(event) => {
                const width = RAIL_WIDTHS.find((width) => width === Number(event.target.value))
                if (width) edit((patch) => setRailWidth(patch, width))
              }}
            >
              {RAIL_WIDTHS.map((width) => (
                <option key={width} value={width}>
                  {width} HP
                </option>
              ))}
            </select>
          </label>
          {focusToggle}
          <div className="rack-zoom">
            <button type="button" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
              Fit rack
            </button>
            <label>
              Zoom
              <select
                aria-label="Rack zoom"
                value={zoom}
                onChange={(event) =>
                  setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))
                }
              >
                <option value="fit">Fit ({Math.round(fitScale * 100)}%)</option>
                {[0.75, 1, 1.25, 1.5].map((value) => (
                  <option key={value} value={value}>
                    {value * 100}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              cancelReplacement()
              newPatch()
            }}
          >
            New patch
          </button>
        </div>
        {/* An inert rack passes a touch to the stage, which reports it. */}
        <div
          className="rack-stage"
          data-locked={locked}
          onPointerDown={(event) => {
            if (locked && event.target === event.currentTarget) touchBlocked()
          }}
        >
          {lockStrip}
          <div
            ref={surface}
            inert={locked}
            className="rack-frame"
            onDragOver={(event) => {
              if (!placement) return
              event.preventDefault()
              const bounds = rails.current?.getBoundingClientRect()
              if (!bounds) return
              const row = Math.max(
                0,
                Math.min(rows - 1, Math.floor((event.clientY - bounds.top) / scale / ROW_HEIGHT)),
              )
              const position = placementPosition(
                patch,
                placement.type,
                row,
                Math.round((event.clientX - bounds.left) / scale / HP),
                placement.moving,
              )
              setGhost(position)
              setMessage(
                `${getModuleSpec(placement.type).name} · row ${position.row + 1}, HP ${position.hp}`,
              )
            }}
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              )
                setGhost(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (ghost) place(ghost.row, ghost.hp)
            }}
            onPointerMove={(event) => {
              const panel = document
                .elementsFromPoint(event.clientX, event.clientY)
                .find((element) => element.matches('[data-module]'))
              setHoveredModule(panel?.getAttribute('data-module') ?? null)
              if (wire && surface.current) {
                const gesture = wireGesture.current
                if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4)
                  gesture.dragged = true
                const b =
                  surface.current.querySelector('.cables')?.getBoundingClientRect() ??
                  surface.current.getBoundingClientRect()
                setPointer({
                  x: event.clientX - b.left,
                  y: event.clientY - b.top,
                })
              }
            }}
            onPointerLeave={() => setHoveredModule(null)}
            onPointerUp={(event) => {
              if (wire && event.target instanceof Element && !event.target.closest('[data-jack]'))
                cancel()
            }}
          >
            <div ref={viewport} className="rack-scroll">
              <div
                ref={rails}
                className="rack-surface"
                style={
                  { width: railHp * HP, height, zoom: scale, '--rack-zoom': scale } as CSSProperties
                }
              >
                {Array.from({ length: rows }, (_, row) => (
                  <div key={row} className="rack-row" style={{ top: row * ROW_HEIGHT }}>
                    <span className="row-label">
                      {row + 1} / {railHp} HP
                    </span>
                    {!patch.modules.some((m) => m.type !== 'out' && m.row === row) && rows > 1 && (
                      <button
                        type="button"
                        className="remove-row"
                        aria-label={`Remove row ${row + 1}`}
                        onClick={() => {
                          edit((p) => removeRow(p, row))
                        }}
                      >
                        Remove row
                      </button>
                    )}
                  </div>
                ))}
                {renderModules(patch.modules.filter((m) => m.type !== 'out'))}
                {placement && ghost && ghost.row < rows && (
                  <div
                    className="placement-ghost"
                    style={{
                      left: ghost.hp * HP,
                      top: ghost.row * ROW_HEIGHT + 20,
                      width: getModuleSpec(placement.type).hp * HP,
                    }}
                  >
                    {getModuleSpec(placement.type).name}
                  </div>
                )}
              </div>
            </div>
            <div
              className="output-panel"
              style={{ flexBasis: OUTPUT_PANEL_WIDTH * outputScale }}
              aria-label="Pinned output panel"
            >
              <div
                className="output-surface"
                style={
                  {
                    width: OUTPUT_PANEL_WIDTH,
                    height: 430,
                    zoom: outputScale,
                    '--rack-zoom': outputScale,
                  } as CSSProperties
                }
              >
                {renderModules(patch.modules.filter((m) => m.type === 'out'))}
              </div>
            </div>
            <svg className="cables" width="100%" height="100%" aria-label="Patch cables">
              {patch.cables.map((c) => {
                const start = points[keyOf(c.from)],
                  b = points[keyOf(c.to)]
                const siblings = patch.cables.filter((other) => keyOf(other.from) === keyOf(c.from))
                const offset =
                  (siblings.findIndex((other) => other.id === c.id) - (siblings.length - 1) / 2) * 5
                const a = start && { x: start.x + offset, y: start.y }
                const warning = cableWarnings(patch, c).join(' ')
                return a && b ? (
                  <g
                    key={c.id}
                    className={`cable signal-${cableKind(patch, c, loopInfo.members)} ${selectedCable === c.id ? 'selected-cable' : ''} ${warning ? 'warning-cable' : ''} ${cableVisibility === 'dim' || (cableVisibility === 'focus' && cableFocus && c.from.module !== cableFocus && c.to.module !== cableFocus) ? 'faded' : ''}`}
                  >
                    <path d={curve(a, b)} className="cable-shadow" />
                    <circle cx={a.x} cy={a.y + 8} r="5" className="plug-collar" />
                    <path
                      d={curve(a, b)}
                      onPointerEnter={() => {
                        if (
                          !pinnedProbe &&
                          cableSignal(patch, c.from, loopInfo.members) === 'pattern'
                        )
                          setProbeCable(c.id)
                      }}
                      onPointerLeave={() => {
                        if (!pinnedProbe) setProbeCable(null)
                      }}
                      onClick={(event) => {
                        if (event.altKey) {
                          setProbeCable(c.id)
                          setPinnedProbe(true)
                          return
                        }
                        setSelectedCable(c.id)
                        cancel()
                      }}
                    >
                      <title>
                        {keyOf(c.from)} → {keyOf(c.to)}
                        {cableKind(patch, c, loopInfo.members) === 'audio-mod'
                          ? ' · audio-mod ≋'
                          : ''}
                        {functionLabel(c.from) ? ` · ${functionLabel(c.from)}` : ''}
                        {warning ? ` · △ ${warning}` : ''}
                      </title>
                    </path>
                    {cableKind(patch, c, loopInfo.members) === 'audio-mod' && (
                      <path d={curve(a, b)} className="audio-mod-core" />
                    )}
                  </g>
                ) : null
              })}
              {wire && points[keyOf(wire.from)] && (pointer || target) && (
                <path
                  className={`provisional signal-${target ? cableKind(patch, { id: 'pending', from: wire.from, to: target }, loopInfo.members) : cableSignal(patch, wire.from, loopInfo.members)}`}
                  d={curve(
                    points[keyOf(wire.from)] ?? { x: 0, y: 0 },
                    (target && points[keyOf(target)]) || pointer || { x: 0, y: 0 },
                  )}
                />
              )}
            </svg>
          </div>
          {replacementPrompt}
          {module && toolPoint && !locked && !prompting && !currentCable && (
            <div
              ref={tools}
              className="selection-tools"
              style={{ left: toolPoint.x, top: toolPoint.y }}
            >
              <span>
                {module.id} · {getModuleSpec(module.type).hp} HP
              </span>
              <button type="button" onClick={() => setMenu({ id: module.id, x: 220, y: 150 })}>
                Module menu
              </button>
              <button
                type="button"
                disabled={!!getModuleSpec(module.type).unique}
                className="button destructive"
                aria-label={`Delete ${module.id} and attached cables`}
                onClick={() => deleteModule(module.id)}
              >
                Delete
              </button>
            </div>
          )}
          {currentCable && !locked && (
            <div className="selection-tools cable-tools">
              <span>
                {keyOf(currentCable.from)} → {keyOf(currentCable.to)}
              </span>
              <button
                type="button"
                onClick={() => {
                  edit((p) => removeCable(p, currentCable.id))
                  setSelectedCable(null)
                  setMessage('Cable removed')
                }}
              >
                Remove cable
              </button>
              <button
                type="button"
                onClick={() => {
                  setProbeCable(currentCable.id)
                  setPinnedProbe(true)
                }}
              >
                Probe cable
              </button>
              <button
                type="button"
                onClick={() => {
                  setWire({ from: currentCable.from, moving: currentCable.id })
                  setMessage(
                    'Choose a new input. Original cable stays until accepted. Escape cancels.',
                  )
                }}
              >
                Move destination
              </button>
            </div>
          )}
          {selectedOutput && !locked && (
            <div
              className="connections output-connections"
              aria-label={`${selectedOutput} destinations`}
            >
              <strong>{selectedOutput} destinations</strong>
              {patch.cables
                .filter((c) => keyOf(c.from) === selectedOutput)
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setSelectedCable(c.id)
                      cancel()
                    }}
                  >
                    Select cable to {keyOf(c.to)}
                  </button>
                ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="add-row"
          disabled={locked}
          onClick={() => edit(addRow)}
          onDragOver={(event) => {
            if (placement) {
              event.preventDefault()
              setGhost({ row: rows, hp: 0 })
              setMessage(`${getModuleSpec(placement.type).name} · new row, HP 0`)
            }
          }}
          onDragLeave={() => setGhost(null)}
          onDrop={(event) => {
            event.preventDefault()
            place(rows, 0)
          }}
        >
          + Add row
          {placement && ghost?.row === rows
            ? ` · ${getModuleSpec(placement.type).name} · ${getModuleSpec(placement.type).hp} HP at 0`
            : ''}
        </button>
        <footer className="rack-footer">
          <div className="rack-status" aria-live="polite">
            {message}
            {wire && (
              <button type="button" onClick={cancel}>
                Cancel cable
              </button>
            )}
          </div>
          {notes.length + uniqueWarnings.length > 0 && (
            <details name="rack-popover" className="rack-notes rack-popover">
              <summary data-warning={uniqueWarnings.length > 0}>
                {uniqueWarnings.length ? `△ Warnings (${uniqueWarnings.length})` : 'You hear'}
              </summary>
              <div>
                {notes.map((note) => (
                  <p className="rack-note" key={note}>
                    {note}
                  </p>
                ))}
                {uniqueWarnings.map((warning) => (
                  <p className="rack-warning" key={warning}>
                    △ {warning}
                  </p>
                ))}
              </div>
            </details>
          )}
          <details name="rack-popover" className="connections rack-popover">
            <summary>Connections ({patch.cables.length})</summary>
            <div>
              {patch.cables.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={selectedCable === c.id}
                  title={functionLabel(c.from) || undefined}
                  onClick={() => setSelectedCable(c.id)}
                >
                  {keyOf(c.from)} → {keyOf(c.to)}
                  {functionLabel(c.from) ? ' · function λ' : ''}
                  {cableKind(patch, c, loopInfo.members) === 'audio-mod' ? ' · audio-mod ≋' : ''}
                </button>
              ))}
            </div>
          </details>
        </footer>
        {wire && target && hintPoint && (
          <div
            id="cable-target-hint"
            role="tooltip"
            className="cable-target-hint"
            style={{ left: hintPoint.x, top: hintPoint.y }}
          >
            {candidate(target)?.message}
          </div>
        )}
        {menu && menuModule && !locked && (
          <dialog
            open
            ref={menuElement}
            className="module-menu"
            aria-label={`${menuModule.id} menu`}
            style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          >
            <strong>{menuModule.id}</strong>
            <details open>
              <summary>Look</summary>
              {looksFor(getModuleSpec(menuModule.type).family).map((look) => (
                <button
                  type="button"
                  key={look}
                  aria-label={`Look ${LOOK_LABELS[look]}`}
                  aria-pressed={menuModule.look === look}
                  onClick={() => {
                    edit((p) => setLook(p, menuModule.id, look, allLooks))
                    setMenu(null)
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`module-panel look-swatch look-${look} cat-${getModuleSpec(menuModule.type).category}`}
                  >
                    <span className="knob">
                      <span />
                    </span>
                  </span>
                  <span>{LOOK_LABELS[look]}</span>
                  {menuModule.look === look && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={allLooks}
                  onChange={(event) => setAllLooks(event.target.checked)}
                />{' '}
                Use for all modules in this family
              </label>
            </details>
            <button
              type="button"
              disabled={!!getModuleSpec(menuModule.type).unique}
              onClick={() => {
                edit((p) => duplicateModule(p, menuModule.id))
                setMenu(null)
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                showCode(menuModule.id)
                setMenu(null)
              }}
            >
              Show in code
            </button>
            <button
              type="button"
              disabled={!!getModuleSpec(menuModule.type).unique}
              className="button destructive"
              aria-keyshortcuts="Delete Backspace"
              onClick={() => {
                deleteModule(menuModule.id)
                setMenu(null)
              }}
            >
              Delete <kbd aria-hidden="true">⌫</kbd>
            </button>
          </dialog>
        )}
        {probeCable && (
          <CableProbe
            key={`${sourceDocument.source}:${probeCable}`}
            document={sourceDocument}
            cable={probeCable}
            close={() => {
              setProbeCable(null)
              setPinnedProbe(false)
            }}
          />
        )}
      </div>
    </>
  )
}
