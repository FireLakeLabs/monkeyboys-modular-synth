import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { auditionSample, type SamplePackResource } from '../strudel/engine'
import { soundToken, type SoundChoice } from './crate'
import { latestAudition } from './latestAudition'
import { recentSounds } from './recentSounds'
import './SoundPicker.css'
import {
  findSound,
  findSounds,
  parseToken,
  soundIndex,
  SOUND_KINDS,
  type IndexedSound,
  type SoundKind,
} from './soundIndex'

const GAP = 8
const SHOWN = 40

/** Groups keep each pack's ranked order and appear in order of their best match. */
function byPack(rows: readonly Row[]): Row[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) groups.set(row.groupKey, [...(groups.get(row.groupKey) ?? []), row])
  return [...groups.values()].flat()
}

interface Row {
  key: string
  /** The heading; packs that share a label still group by `groupKey`. */
  group: string
  groupKey: string
  sound: IndexedSound
  n: number
}

function homeRows(
  resources: readonly SamplePackResource[],
  prefix: string | undefined,
  groups: readonly (readonly [string, readonly string[]])[],
): Row[] {
  return groups.flatMap(([group, tokens]) =>
    [...new Set(tokens)].flatMap((token) => {
      const choice = parseToken(token)
      const sound = choice && findSound(resources, choice.name)
      if (!choice || !sound || (prefix && !sound.name.startsWith(prefix))) return []
      const n = Math.min(choice.n, sound.count - 1)
      return [{ key: `${group}:${token}`, group, groupKey: group, sound, n }]
    }),
  )
}

/** The search popup beside a sound slot. Choosing goes through the slot's own drop path. */
export function SoundPicker({
  moduleId,
  prefix,
  value,
  resources,
  packOrder,
  patchSounds,
  anchor,
  choose,
  clear,
  browseAll,
  openPacks,
  loadSounds,
  close,
}: {
  moduleId: string
  prefix: string | undefined
  value: string
  /** Registration order, which decides a name that two packs share. */
  resources: readonly SamplePackResource[]
  /** Seated pack keys in seating order, which is how the list shows packs. */
  packOrder: readonly string[]
  patchSounds: readonly string[]
  anchor: RefObject<HTMLElement | null>
  /** Returns false when the rack refused the edit and reported why. */
  choose: (choice: SoundChoice) => boolean
  clear: () => void
  browseAll: (query: string) => void
  openPacks: () => void
  loadSounds: () => Promise<void>
  close: (refocus: boolean) => void
}) {
  const id = useId()
  const popup = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SoundKind | null>(null)
  const [pack, setPack] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [variants, setVariants] = useState<ReadonlyMap<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audition] = useState(() =>
    latestAudition(
      (choice) => auditionSample(choice.name, choice.n),
      (failure) => setError(String(failure)),
    ),
  )
  const loadOnOpen = useEffectEvent(loadSounds)
  useEffect(() => {
    let current = true
    loadOnOpen()
      .catch((failure: unknown) => {
        if (current) setError(String(failure))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [])
  useEffect(() => () => audition.cancel(), [audition])

  const seating = (sound: IndexedSound) => packOrder.indexOf(sound.packKey)
  const index = soundIndex(resources)
    .filter((sound) => !prefix || sound.name.startsWith(prefix))
    .sort((a, b) => seating(a) - seating(b))
  const packs = [...new Map(index.map((sound) => [sound.packKey, sound.pack]))]
  const filtered = !!query.trim() || !!kind || !!pack
  // Unfiltered, the list still shows sounds after the patch's and recent ones, so it never looks empty.
  const found = (filtered ? findSounds(index, { text: query, kind, pack }) : index).map(
    (sound): Row => ({ key: sound.name, group: sound.pack, groupKey: sound.packKey, sound, n: 0 }),
  )
  const own = parseToken(value)
  const listed = byPack(found.slice(0, SHOWN)).map((row) =>
    row.sound.name === own?.name ? { ...row, n: own.n } : row,
  )
  const rows = filtered
    ? listed
    : [
        ...homeRows(resources, prefix, [
          ['In this patch', patchSounds],
          ['Recent', recentSounds()],
        ]),
        ...listed,
      ]
  const at = Math.min(active, rows.length - 1)
  const row = rows[at]
  const variant = (row: Row) => variants.get(row.key) ?? row.n
  const busy = loading || resources.some((resource) => resource.status === 'loading')
  const playable = index.length > 0

  function place() {
    const element = popup.current
    const panel = anchor.current?.closest('.module-panel')?.getBoundingClientRect()
    const slot = anchor.current?.getBoundingClientRect()
    if (!element || !panel || !slot) return
    const { width, height } = element.getBoundingClientRect()
    const right = panel.right + GAP
    const left = right + width + GAP <= window.innerWidth ? right : panel.left - width - GAP
    element.style.left = `${Math.max(GAP, left)}px`
    element.style.top = `${Math.max(GAP, Math.min(window.innerHeight - height - GAP, slot.top))}px`
  }
  useLayoutEffect(place)
  useLayoutEffect(() => {
    search.current?.focus()
  }, [])
  useEffect(() => {
    if (row) document.getElementById(`${id}-${row.key}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, row])
  useEffect(() => {
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !popup.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        close(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    // Selecting a panel can scroll the rack, so the popup follows it instead of closing.
    document.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  })

  function flip(row: Row, step: number) {
    const n = (variant(row) + step + row.sound.count) % row.sound.count
    setVariants(new Map(variants).set(row.key, n))
    audition.request({ name: row.sound.name, n })
  }
  function use(row: Row) {
    try {
      if (choose({ name: row.sound.name, n: variant(row) })) close(true)
      else setError('Sound assignment was refused; see the rack message')
    } catch (failure) {
      setError(String(failure))
    }
  }
  function refocus() {
    search.current?.focus()
  }

  return createPortal(
    <dialog open ref={popup} className="sound-picker" aria-label={`Choose sound for ${moduleId}`}>
      <input
        ref={search}
        type="search"
        className="sound-picker-search"
        role="combobox"
        aria-label="Search sounds"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={row ? `${id}-${row.key}` : undefined}
        placeholder={`Search ${index.length} ${prefix ? 'wavetable' : 'sound'}${index.length === 1 ? '' : 's'}`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setError('')
        }}
        onKeyDown={(event) => {
          const keys: Record<string, () => void> = {
            ArrowDown: () => setActive(Math.min(at + 1, rows.length - 1)),
            ArrowUp: () => setActive(Math.max(at - 1, 0)),
            ArrowRight: () => row && flip(row, 1),
            ArrowLeft: () => row && flip(row, -1),
            ' ': () => row && audition.request({ name: row.sound.name, n: variant(row) }, true),
            Enter: () => row && use(row),
          }
          const action = keys[event.key]
          if (!action || event.nativeEvent.isComposing) return
          event.preventDefault()
          event.stopPropagation()
          action()
        }}
      />
      {/* Kinds name drum sounds; a prefixed slot such as WAVETABLE has none. */}
      {!prefix && (
        <fieldset className="sound-picker-chips">
          <legend className="sr-only">Kind</legend>
          {([null, ...SOUND_KINDS] as const).map((option) => (
            <button
              key={option ?? 'All'}
              type="button"
              aria-pressed={kind === option}
              onClick={() => {
                setKind(kind === option ? null : option)
                setActive(0)
                refocus()
              }}
            >
              {option ?? 'All'}
            </button>
          ))}
        </fieldset>
      )}
      {packs.length > 2 && (
        <fieldset className="sound-picker-chips">
          <legend className="sr-only">Pack</legend>
          {[[null, 'All packs'] as const, ...packs].map(([key, label]) => (
            <button
              key={key ?? label}
              type="button"
              aria-pressed={pack === key}
              onClick={() => {
                setPack(pack === key ? null : key)
                setActive(0)
                refocus()
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
      )}
      {/* Rows carry a bank line and a variant stepper, which a native select cannot show. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div className="sound-picker-list" role="listbox" id={`${id}-list`} aria-label="Sounds">
        {rows.map((row, position) => {
          const n = variant(row)
          const first = rows[position - 1]?.groupKey !== row.groupKey
          return (
            <div key={row.key}>
              {first && (
                <div className="sound-picker-group" aria-hidden="true">
                  {row.group}
                </div>
              )}
              {/* The search box owns the keyboard through aria-activedescendant. */}
              {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <div
                id={`${id}-${row.key}`}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="option"
                tabIndex={-1}
                aria-selected={position === at}
                aria-label={`${soundToken({ name: row.sound.name, n })}, ${row.group}, variant ${n + 1} of ${row.sound.count}`}
                className="sound-picker-row"
                onPointerMove={() => {
                  if (position !== at) setActive(position)
                }}
                onClick={() => use(row)}
              >
                <span className="sound-picker-name">
                  {row.sound.bank !== row.sound.pack && <small>{row.sound.bank}</small>}
                  {row.sound.short}
                </span>
                {row.sound.count > 1 && (
                  <span className="sound-picker-flip" aria-hidden="true">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation()
                        flip(row, -1)
                        refocus()
                      }}
                    >
                      ‹
                    </button>
                    <span>
                      :{n} of {row.sound.count}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation()
                        flip(row, 1)
                        refocus()
                      }}
                    >
                      ›
                    </button>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <output className="sound-picker-note">
        {busy && <span>Loading sounds…</span>}
        {!busy && !playable && (
          <span>
            {prefix
              ? `This slot takes wavetables, sounds named ${prefix}…, and none of the seated packs has any. `
              : 'The seated packs have no sounds. '}
            <button type="button" className="sound-picker-link" onClick={openPacks}>
              Open Packs
            </button>
          </span>
        )}
        {playable && filtered && !found.length && (
          <span>No sounds match. Try a kind above, or browse all sounds.</span>
        )}
        {found.length > SHOWN && (
          <span>
            Showing {SHOWN} of {found.length}
            {filtered ? '' : '. Type to narrow, or pick a kind.'}
          </span>
        )}
        {error && <span role="alert">{error}</span>}
      </output>
      <div className="sound-picker-footer">
        <span>↑↓ move · ←→ variant · Space play · Enter use · Esc close</span>
        <button type="button" onClick={() => browseAll(query)}>
          Browse all in Sounds ›
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              clear()
              close(true)
            }}
          >
            Clear slot
          </button>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
