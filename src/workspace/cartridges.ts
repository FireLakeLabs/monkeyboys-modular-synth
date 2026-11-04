import { parse } from 'acorn'
import { getModuleSpec } from '../modules/catalog'
import type { SourceDocument } from '../reader/types'
import type { SamplePack } from '../samples/packs'
import {
  FACTORY_PACKS,
  packKey,
  packSetup,
  sampleCalls,
  isFactoryPack,
  ownedSampleCalls,
  removeSampleCalls,
} from '../samples/packs'
import { saveLayout, sourceBody } from './document'

export function ownedPacks(document: SourceDocument): SamplePack[] {
  const packs = document.patch.cartridges ?? []
  return (document.layout === 'restored' || document.layout === 'reconciled') &&
    ownedSampleCalls(sourceBody(document.source), packs).length === packs.length
    ? packs
    : []
}

export function cartridges(document: SourceDocument) {
  const owned = ownedPacks(document)
  const proven = ownedSampleCalls(sourceBody(document.source), owned)
  const calls = sampleCalls(sourceBody(document.source))
  const entries = calls.map((call) => ({
    ...call,
    ownership:
      call.pack && isFactoryPack(call.pack)
        ? ('factory' as const)
        : proven.some((owned) => owned.start === call.start)
          ? ('bay' as const)
          : ('source' as const),
  }))
  return [
    ...FACTORY_PACKS.filter(
      (factory) => !calls.some((call) => call.pack && packKey(call.pack) === packKey(factory)),
    ).map((pack) => ({ pack, text: '', start: -1, end: -1, ownership: 'factory' as const })),
    ...entries,
  ]
}

function writePacks(document: SourceDocument, packs: SamplePack[], source: string): SourceDocument {
  const { cartridges: _old, ...patch } = document.patch
  return saveLayout(
    { ...document, source },
    { ...patch, ...(packs.length ? { cartridges: packs } : {}) },
  )
}

export function seatPack(document: SourceDocument, pack: SamplePack): SourceDocument {
  if (
    sampleCalls(sourceBody(document.source)).some(
      (call) => call.pack && packKey(call.pack) === packKey(pack),
    )
  )
    return document
  const previous = ownedPacks(document)
  const body = sourceBody(document.source)
  const insertion = previous.length
    ? (parse(body, { ecmaVersion: 'latest' }).body[previous.length]?.start ?? body.length)
    : 0
  return writePacks(
    document,
    [...previous, pack],
    body.slice(0, insertion) + packSetup([pack]) + body.slice(insertion),
  )
}

export function ejectPack(document: SourceDocument, pack: SamplePack): SourceDocument {
  if (isFactoryPack(pack)) throw new Error('Factory cartridges stay seated.')
  const previous = ownedPacks(document)
  if (!previous.some((p) => packKey(p) === packKey(pack)))
    throw new Error('This samples() line is source-owned; edit it in the code.')
  const body = sourceBody(document.source)
  const calls = ownedSampleCalls(body, previous).filter(
    (call) => call.pack && packKey(call.pack) === packKey(pack),
  )
  return writePacks(
    document,
    previous.filter((p) => packKey(p) !== packKey(pack)),
    removeSampleCalls(body, calls),
  )
}

/** Export adds missing factory setup and restamps the same complete rack, without changing the editor. */
export function withFactoryPacks(document: SourceDocument): SourceDocument {
  const present = sampleCalls(sourceBody(document.source))
  const missing = FACTORY_PACKS.filter(
    (pack) => !present.some((call) => call.pack && packKey(call.pack) === packKey(pack)),
  )
  // Factories load before user setup in the app. Preserve override order in the REPL too.
  return missing.length
    ? writePacks(
        document,
        [...missing, ...ownedPacks(document)],
        packSetup(missing) + sourceBody(document.source),
      )
    : document
}

/** Conservative warning: opaque code/patterns can compute names, so they also require consent. */
export function packUsers(document: SourceDocument, names: readonly string[]): string[] {
  const sounds = new Set(names)
  return document.patch.modules.flatMap((module) => {
    if (module.type === 'code') return [module.id]
    if (!['drums', 'smpl'].includes(module.type)) return []
    const text = JSON.stringify(
      Object.fromEntries(
        getModuleSpec(module.type).controls.map((control) => [
          control.id,
          module.values[control.id] ?? control.default,
        ]),
      ),
    )
    const tokens = text.match(/[\w-]+/g) ?? []
    return !names.length ||
      tokens.some((token) => sounds.has(token) || names.some((name) => name.endsWith(`_${token}`)))
      ? [module.id]
      : []
  })
}
