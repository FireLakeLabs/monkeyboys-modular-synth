import { expect, it } from 'vitest'
import { parseSource } from '../reader/syntax'
import { setValue } from '../rack/model'
import { editDocument } from '../workspace/document'
import { libraryPatches } from './catalog'
import { readLibraryPatch } from './load'

it('OFF keeps the copy quieter and lets its loop VCA silence only the copy', async () => {
  const runtime: Record<string, unknown> = Object.assign(
    {},
    ...(await Promise.all(
      ['@strudel/core', '@strudel/mini/mini.mjs'].map((path) => import(/* @vite-ignore */ path)),
    )),
  )
  if (typeof runtime.miniAllStrings !== 'function') throw new Error('Missing mini parser')
  runtime.miniAllStrings()
  function gains(source: string): unknown {
    const voice = parseSource(source).scopes.find((scope) => scope.kind === 'voice')
    if (!voice) throw new Error('Missing exercise voice')
    // Only repository-owned exercise source enters this pinned-engine query.
    // oxlint-disable-next-line typescript/no-implied-eval
    return new Function(
      ...Object.keys(runtime),
      `return (${source.slice(voice.start, voice.end)}).queryArc(0,1)
        .filter(h => h.hasOnset()).map(h => h.value.gain).sort((a,b) => a-b)`,
    )(...Object.values(runtime))
  }
  const entry = libraryPatches().find((patch) => patch.id === 'exercise-off')
  if (!entry) throw new Error('Missing OFF exercise')
  const document = readLibraryPatch(entry)
  expect(gains(document.source)).toEqual([0.06, 0.06, 0.06, 0.06, 0.15, 0.15, 0.15, 0.15])
  const off = document.patch.modules.find((module) => module.type === 'off')
  const copy = document.patch.cables.find(
    (cable) => cable.from.module === off?.id && cable.from.jack === 'send',
  )?.to.module
  if (!copy) throw new Error('Missing copy VCA')
  const muted = editDocument(document, setValue(document.patch, copy, 'level', 0))
  expect(gains(muted.source)).toEqual([0, 0, 0, 0, 0.15, 0.15, 0.15, 0.15])
})
