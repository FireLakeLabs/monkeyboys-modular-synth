import { describe, expect, it, vi } from 'vitest'
import { CATALOG } from '../modules/catalog'
import { generate } from '../codegen/generate'
import { read } from '../reader'
import {
  connect,
  placeModule,
  routedModules,
  setLook,
  setValue,
  validateRack,
  setRailWidth,
} from '../rack/model'
import { editDocument, saveLayout, sourceBody } from '../workspace/document'
import { prepareReplacement } from '../workspace/open'
import { libraryPatches, PATCH_LIBRARY, type LibraryNode } from './catalog'
import { readLibraryPatch } from './load'
import type { PlaybackState } from '../strudel/playback'

function snapshot(status: PlaybackState['status']): PlaybackState {
  return { status, scheduling: 'unknown', resources: 'unknown', error: null, errorSource: null }
}

describe('built-in patch library', () => {
  it('starts with four rack-owned exercises in workshop order, each with a try-this and credit', () => {
    const first = PATCH_LIBRARY[0]
    if (!first || first.kind !== 'collection') throw new Error('Missing first collection')
    expect(first.id).toBe('start-here')
    expect(first.title).toBe('Start here')
    const entries = libraryPatches(first.children)
    expect(entries.map((entry) => entry.id)).toEqual([
      'first-sounds',
      'first-notes',
      'first-effects',
      'pattern-effects',
    ])
    for (const entry of entries) {
      expect(entry.tryThis?.trim(), entry.id).toBeTruthy()
      expect(entry.tryThis, entry.id).not.toContain('\n')
      expect(entry.attribution.author).toContain('Original exercise')
      expect(entry.attribution.url).toBe(`https://strudel.cc/workshop/${entry.id}/`)
      const document = readLibraryPatch(entry)
      expect(document.layout, entry.id).toBe('restored')
      expect(document.source, entry.id).toBe(generate(document.patch))
    }
  })

  it('gives every nested collection and patch a stable unique ID', () => {
    const ids: string[] = []
    function visit(nodes: readonly LibraryNode[]) {
      for (const node of nodes) {
        expect(node.id).toMatch(/^[a-z][a-z0-9-]+$/)
        expect(node.title.trim()).not.toBe('')
        ids.push(node.id)
        if (node.kind === 'collection') {
          expect(node.children.length).toBeGreaterThan(0)
          visit(node.children)
        } else {
          expect(node.description.trim()).not.toBe('')
          expect(node.attribution.author.trim()).not.toBe('')
        }
      }
    }
    visit(PATCH_LIBRARY)
    expect(new Set(ids).size).toBe(ids.length)
    expect(libraryPatches().map((entry) => entry.id)).toContain('quantized-sequence')
  })

  it('exercises every shipped module in an active route, with the advertised controls', () => {
    const covered = new Set<string>()
    for (const entry of libraryPatches()) {
      const document = readLibraryPatch(entry)
      expect(document.source, entry.id).toBe(entry.source)
      const routed = routedModules(document.patch)
      const active = new Set(
        document.patch.modules.filter((m) => routed.has(m.id)).map((m) => m.type),
      )
      for (const type of entry.exercises) {
        expect(active.has(type), `${entry.id}: missing active ${type}`).toBe(true)
        expect(
          document.bindings.some((binding) =>
            document.patch.modules.some((m) => m.id === binding.module && m.type === type),
          ),
          `${entry.id}: missing source for ${type}`,
        ).toBe(true)
        covered.add(type)
      }
    }
    expect([...covered].sort()).toEqual(CATALOG.map((module) => module.id).sort())
  })

  for (const entry of libraryPatches().filter((entry) => entry.id !== 'switch-angel-trance-demo')) {
    it(`${entry.id}: loads rack-owned and accepts CV, effects and mixer edits`, () => {
      let document = readLibraryPatch(entry)
      const row = Math.max(...document.patch.modules.map((module) => module.row)) + 1
      const edit = (patch: typeof document.patch) => {
        document = editDocument(document, patch)
        expect(read(document.source).patch).toEqual(document.patch)
      }
      edit(placeModule(document.patch, 'lfo', row))
      const lfo = document.patch.modules.find((module) => module.type === 'lfo')
      if (!lfo) throw new Error('Missing LFO')
      for (const target of document.patch.modules.filter((module) =>
        ['vcf', 'vca'].includes(module.type),
      )) {
        edit(
          connect(
            document.patch,
            { module: lfo.id, jack: 'out' },
            { module: target.id, jack: 'cv' },
            true,
          ),
        )
      }
      expect(sourceBody(document.source)).toBe(sourceBody(generate(document.patch)))
      edit(placeModule(document.patch, 'delay', row + 1))
      const delay = document.patch.modules.filter((module) => module.type === 'delay').at(-1)
      const mixer = document.patch.modules.find((module) => module.type === 'mix')
      if (!delay || !mixer) throw new Error('Missing effect or mixer')
      const incoming = document.patch.cables.find((cable) => cable.to.module === mixer.id)
      if (!incoming) throw new Error('Missing voice')
      edit(connect(document.patch, incoming.from, { module: delay.id, jack: 'in' }))
      edit(connect(document.patch, { module: delay.id, jack: 'out' }, incoming.to, true))
      edit(setValue(document.patch, mixer.id, 'ch1', 0.55))
      const spare = ['in2', 'in3', 'in4'].find(
        (jack) =>
          !document.patch.cables.some(
            (cable) => cable.to.module === mixer.id && cable.to.jack === jack,
          ),
      )
      if (!spare) throw new Error('Missing spare channel')
      edit(connect(document.patch, incoming.from, { module: mixer.id, jack: spare }))
    })
  }

  for (const entry of libraryPatches()) {
    it.each([64, 84, 104] as const)(
      `${entry.id}: retains executable bytes and saved %i HP`,
      (width) => {
        const original = readLibraryPatch(entry)
        const saved = editDocument(saveLayout(original), setRailWidth(original.patch, width))
        expect(sourceBody(saved.source)).toBe(sourceBody(entry.source))
        expect(saved.patch.railHp).toBe(width)
        expect(read(saved.source).patch).toEqual(saved.patch)
        expect(() => validateRack(saved.patch)).not.toThrow()
      },
    )
  }

  for (const entry of libraryPatches()) {
    it(`${entry.id}: preserves exact source and independently restores saved rack state`, async () => {
      const original = readLibraryPatch(entry)
      // Includes source ownership and saved state after the #133 OUT metadata migration.
      const digest = async (text: string) => {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(
          '',
        )
      }
      expect({
        generated: await digest(generate(original.patch)),
        projection: await digest(JSON.stringify(original)),
      }).toMatchSnapshot()
      expect(generate(original)).toBe(entry.source)
      const out = original.patch.modules.find((m) => m.type === 'out')
      if (!out) throw new Error('Missing output')
      const edited = editDocument(
        saveLayout(original),
        setValue(original.patch, out.id, 'vol', 0.35),
      )
      const looked = editDocument(edited, setLook(edited.patch, out.id, 'vintage'))
      expect(sourceBody(looked.source)).toBe(sourceBody(entry.source))
      const reopened = read(looked.source)
      validateRack(reopened.patch)
      expect(reopened.source).toBe(looked.source)
      expect(reopened.layout).toBe('restored')
      expect(reopened.patch).toEqual(looked.patch)
      expect(reopened.patch.modules.find((m) => m.id === out.id)).toMatchObject({
        look: 'vintage',
        values: { vol: 0.35 },
      })
      expect(readLibraryPatch(entry)).toEqual(original)
    })
  }

  it('keeps opaque helper declarations and CODE exact when editing a recognized control', () => {
    const entry = libraryPatches().find((entry) => entry.id === 'custom-helper')
    if (!entry) throw new Error('Missing helper exercise')
    const original = readLibraryPatch(entry)
    const amp = original.patch.modules.find((module) => module.type === 'vca')
    if (!amp) throw new Error('Missing amplifier')
    const edited = editDocument(original, setValue(original.patch, amp.id, 'level', 0.4))
    expect(sourceBody(edited.source)).toBe(
      sourceBody(entry.source).replace('.gain(0.2)', '.gain(0.4)'),
    )
    expect(
      edited.patch.modules.some(
        (m) =>
          m.type === 'code' &&
          typeof m.values.text === 'string' &&
          m.values.text.includes('.chunk(4, turn)'),
      ),
    ).toBe(true)
    expect(readLibraryPatch(entry).source).toBe(entry.source)
  })
})

describe('library replacement preparation', () => {
  const entry = libraryPatches()[0]
  if (!entry) throw new Error('No library patches')

  it('validates before Stop and only returns a fresh document after confirmed Stop', async () => {
    let release = () => {}
    let stopped = false
    const playback = {
      stop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = () => {
              stopped = true
              resolve()
            }
          }),
      ),
      getSnapshot: () => snapshot(stopped ? 'stopped' : 'stopping'),
    }
    let installed = false
    const replacement = prepareReplacement(async () => readLibraryPatch(entry), playback).then(
      (document) => {
        installed = true
        return document
      },
    )
    await vi.waitFor(() => expect(playback.stop).toHaveBeenCalledOnce())
    expect(installed).toBe(false)
    release()
    const document = await replacement
    expect(installed).toBe(true)
    expect(document.source).toBe(entry.source)
    expect(document).not.toBe(readLibraryPatch(entry))
  })

  it('refuses invalid source or saved layout before touching playback', async () => {
    const playback = { stop: vi.fn(), getSnapshot: () => snapshot('stopped') }
    await expect(
      prepareReplacement(async () => readLibraryPatch({ source: '$: note(' }), playback),
    ).rejects.toThrow()
    const saved = saveLayout(readLibraryPatch(entry)).source.replace(
      '"version": 1',
      '"version": 999',
    )
    await expect(
      prepareReplacement(async () => readLibraryPatch({ source: saved }), playback),
    ).rejects.toThrow(/metadata/)
    expect(playback.stop).not.toHaveBeenCalled()
  })

  it('returns no replacement after Stop failure or cancellation during Stop', async () => {
    const playback = {
      stop: vi.fn(async () => {}),
      getSnapshot: () => snapshot('error'),
    }
    await expect(prepareReplacement(async () => readLibraryPatch(entry), playback)).rejects.toThrow(
      /not stopped/,
    )
    let current = true
    const cancelled = {
      stop: async () => {
        current = false
      },
      getSnapshot: () => snapshot('stopped'),
    }
    await expect(
      prepareReplacement(
        async () => readLibraryPatch(entry),
        cancelled,
        () => current,
      ),
    ).rejects.toThrow(/cancelled/)
  })
})
