import type { SamplePackResource } from '../strudel/engine'
import { variantCount, type SoundChoice } from './crate'
import { packLabel } from './packs'

export const SOUND_KINDS = [
  'Kick',
  'Snare',
  'Hat',
  'Open hat',
  'Clap',
  'Tom',
  'Cymbal',
  'Perc',
  'Other',
] as const
export type SoundKind = (typeof SOUND_KINDS)[number]

// Strudel's drum names, which `.bank()` relies on: `s("bd").bank("RolandTR909")`
// plays `RolandTR909_bd`. Packs may name sounds anything, so this is a convention.
const SUFFIX_KINDS = new Map<string, SoundKind>([
  ['bd', 'Kick'],
  ['sd', 'Snare'],
  ['hh', 'Hat'],
  ['oh', 'Open hat'],
  ['cp', 'Clap'],
  ['ht', 'Tom'],
  ['mt', 'Tom'],
  ['lt', 'Tom'],
  ['cr', 'Cymbal'],
  ['rd', 'Cymbal'],
  ['perc', 'Perc'],
  ['cb', 'Perc'],
  ['rim', 'Perc'],
  ['sh', 'Perc'],
  ['tb', 'Perc'],
])
// Dirt Samples names that do not follow that convention. Unlisted names are Other.
const NAMED_KINDS = new Map<string, SoundKind>([
  ['808bd', 'Kick'],
  ['clubkick', 'Kick'],
  ['hardkick', 'Kick'],
  ['popkick', 'Kick'],
  ['kicklinn', 'Kick'],
  ['sn', 'Snare'],
  ['808sd', 'Snare'],
  ['hh27', 'Hat'],
  ['linnhats', 'Hat'],
  ['808hc', 'Hat'],
  ['808oh', 'Open hat'],
  ['realclaps', 'Clap'],
  ['808ht', 'Tom'],
  ['808mt', 'Tom'],
  ['808lt', 'Tom'],
  ['808cy', 'Cymbal'],
  ['tabla', 'Perc'],
  ['808mc', 'Perc'],
  ['808lc', 'Perc'],
])

/** A `<Bank>_<suffix>` name or a bare suffix takes the suffix's kind. */
export function soundKind(name: string): SoundKind {
  const at = name.lastIndexOf('_')
  return SUFFIX_KINDS.get(at > 0 ? name.slice(at + 1) : name) ?? NAMED_KINDS.get(name) ?? 'Other'
}

/** Readout lines: a bank-prefixed name splits at its last `_`; others show their pack. */
export function soundParts(name: string, pack: string): { bank: string; short: string } {
  const at = name.lastIndexOf('_')
  return at > 0 && at < name.length - 1 && !name.startsWith('wt_')
    ? { bank: name.slice(0, at), short: name.slice(at + 1) }
    : { bank: pack, short: name }
}

export interface IndexedSound {
  name: string
  /** The pack's label. Two packs can share one, so filters use `packKey`. */
  pack: string
  packKey: string
  bank: string
  short: string
  count: number
  kind: SoundKind
}

interface PackIndex {
  sounds: readonly IndexedSound[]
  byName: ReadonlyMap<string, IndexedSound>
}

// Resources are replaced, never mutated, when a pack loads, so each snapshot is indexed once.
const packs = new WeakMap<SamplePackResource, PackIndex>()
function packIndex(resource: SamplePackResource): PackIndex {
  const cached = packs.get(resource)
  if (cached) return cached
  const pack = packLabel(resource.pack).name
  const sounds = resource.sounds.flatMap((sound) => {
    const count = variantCount(sound.bank)
    return count
      ? [
          {
            name: sound.name,
            pack,
            packKey: resource.key,
            count,
            kind: soundKind(sound.name),
            ...soundParts(sound.name, pack),
          },
        ]
      : []
  })
  const index = { sounds, byName: new Map(sounds.map((sound) => [sound.name, sound])) }
  packs.set(resource, index)
  return index
}

/** The sound a name plays: Strudel keeps the last registration of a repeated name. */
export function findSound(
  resources: readonly SamplePackResource[],
  name: string,
): IndexedSound | undefined {
  for (let at = resources.length - 1; at >= 0; at--) {
    const resource = resources[at]
    const sound = resource && packIndex(resource).byName.get(name)
    if (sound) return sound
  }
  return undefined
}

/** One row per playable sound, in pack and manifest order. */
export function soundIndex(resources: readonly SamplePackResource[]): readonly IndexedSound[] {
  return resources.flatMap((resource) =>
    packIndex(resource).sounds.filter((sound) => findSound(resources, sound.name) === sound),
  )
}

export interface SoundQuery {
  text: string
  kind: SoundKind | null
  /** A pack resource key. */
  pack: string | null
  prefix?: string | undefined
}

function rank(sound: IndexedSound, text: string): number | null {
  if (!text) return 0
  const name = sound.name.toLowerCase()
  if (name.startsWith(text)) return 0
  if (sound.short.toLowerCase().startsWith(text)) return 1
  if (name.includes(text)) return 2
  if (sound.kind !== 'Other' && sound.kind.toLowerCase().includes(text)) return 3
  return null
}

/** Name prefix first, then the part after the bank, then anywhere in the name, then kind. */
export function findSounds(
  index: readonly IndexedSound[],
  { text, kind, pack, prefix }: SoundQuery,
): IndexedSound[] {
  const query = text.trim().toLowerCase()
  const found: { sound: IndexedSound; score: number; order: number }[] = []
  index.forEach((sound, order) => {
    if (prefix && !sound.name.startsWith(prefix)) return
    if (kind && sound.kind !== kind) return
    if (pack && sound.packKey !== pack) return
    const score = rank(sound, query)
    if (score !== null) found.push({ sound, score, order })
  })
  return found.sort((a, b) => a.score - b.score || a.order - b.order).map(({ sound }) => sound)
}

/** A `name:n` token, or null for anything else a slot may hold. */
export function parseToken(value: string): SoundChoice | null {
  const match = /^([\w-]+):(\d+)$/.exec(value)
  return match?.[1] && match[2] ? { name: match[1], n: Number(match[2]) } : null
}
