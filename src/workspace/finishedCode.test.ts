import { describe, expect, it } from 'vitest'
import { tryRead } from '../reader'
import { generate } from '../codegen/generate'
import { starterPatch } from '../rack/model'
import { sourceBody } from './document'
import { changesModules, isFinished } from './finishedCode'
import { createDocumentHistory } from './history'
import type { SourceDocument } from '../reader/types'

const base = '$: note("c2 e2").s("sawtooth")'

function readable(source: string): SourceDocument | null {
  const result = tryRead(source)
  return result.kind === 'invalid' ? null : result.document
}

/** The app's rules, one keystroke at a time: the caret stays at the end of what was typed. */
function type(start: string, keys: string) {
  const first = readable(start)
  if (!first) throw new Error('Unreadable start')
  const history = createDocumentHistory(first)
  let accepted = first
  let group: object | null = null
  const applied: string[] = []
  for (let length = 1; length <= keys.length; length++) {
    const draft = start + keys.slice(0, length)
    const next = readable(draft)
    if (!next || !isFinished(draft, accepted.source, draft.length)) continue
    group ??= {}
    const stops = changesModules(accepted.patch, next.patch)
    history.accept(next, group)
    if (stops) group = null
    accepted = next
    applied.push(keys.slice(0, length))
  }
  return { accepted, applied, history }
}

describe('finished code', () => {
  it.each([
    ['a half-typed method', `${base}\n  .l`],
    ['a method name with no call yet', `${base}\n  .lpf`],
    ['a word starting a statement', `${base}\n$`],
    ['a word starting a voice', `${base}\n$: s`],
    ['a word in a declaration', `${base}\nconst lead = no`],
    ['a method inside a nested chain', '$: stack(s("bd").l)'],
    ['a method inside a callback', `${base}.jux(x => x.l)`],
    ['a method on a Strudel signal', `${base}.lpf(sine.rang)`],
  ])('rejects %s', (_name, draft) => {
    expect(readable(draft)).not.toBeNull()
    expect(isFinished(draft, base)).toBe(false)
  })

  it.each([
    ['a complete call', `${base}\n  .lpf(800)`],
    ['a complete call the rack cannot model', `${base}\n  .notARealCall(2)`],
    ['a comment', `${base}\n// note to self`],
    ['a declared name', `const lead = note("c2")\n$: lead`],
    ['a constant from a global object', `${base}.pan(Math.PI)`],
    ['a chained modifier', `${base}.add.squeeze("1 2")`],
  ])('accepts %s', (_name, draft) => {
    expect(isFinished(draft, base)).toBe(true)
  })

  it('keeps a bare word the accepted code already had', () => {
    const accepted = `${base}.customWord`
    expect(isFinished(`${accepted}\n// edited`, accepted)).toBe(true)
  })

  it('waits while the caret is on a word, which an edited call name needs', () => {
    const draft = `${base}.lp(800)`
    const onWord = draft.indexOf('(800')
    expect(isFinished(draft, base, onWord)).toBe(false)
    expect(isFinished(draft, base, draft.length)).toBe(true)
    expect(isFinished(draft, base)).toBe(true)
  })

  it('ignores the caret inside strings and comments', () => {
    const draft = `${base}\n// word`
    expect(isFinished(draft, base, draft.length)).toBe(true)
    const inString = base.indexOf('e2') + 2
    expect(isFinished(base, base, inString)).toBe(true)
  })

  it('reads generated source with its saved rack block', () => {
    const source = generate(starterPatch())
    expect(isFinished(source, source)).toBe(true)
    expect(sourceBody(source)).not.toBe(source)
  })
})

describe('typing through real keystrokes', () => {
  it('a chain applies only at finished calls, each its own undo step', () => {
    const { applied, history, accepted } = type(base, '\n  .lpf(800)\n  .room(0.5)\n  .delay(0.4)')
    expect(applied.filter((text) => text.endsWith(')'))).toEqual([
      '\n  .lpf(800)',
      '\n  .lpf(800)\n  .room(0.5)',
      '\n  .lpf(800)\n  .room(0.5)\n  .delay(0.4)',
    ])
    expect(accepted.patch.modules.some((module) => module.type === 'code')).toBe(false)
    const undone = [history.step('undo'), history.step('undo'), history.step('undo')]
    expect(undone.map((document) => document?.source)).toEqual([
      `${base}\n  .lpf(800)\n  .room(0.5)`,
      `${base}\n  .lpf(800)`,
      base,
    ])
  })

  it('half-typed .l never reaches the rack', () => {
    const { accepted, applied } = type(base, '\n  .l')
    expect(applied).toEqual(['\n', '\n ', '\n  '])
    expect(accepted.patch.modules.some((module) => module.type === 'code')).toBe(false)
  })

  it('typing inside a pattern string changes no modules, so it needs the pause rule', () => {
    const start = '$: note("c2 e2 ").s("sawtooth")'
    const first = readable(start)
    if (!first) throw new Error('Unreadable start')
    const at = start.indexOf(' ")') + 1
    for (const text of ['g', 'g2', 'g2 ', 'g2 b', 'g2 b2']) {
      const draft = `${start.slice(0, at)}${text}${start.slice(at)}`
      const next = readable(draft)
      if (!next) throw new Error('Unreadable pattern')
      expect(isFinished(draft, first.source, at + text.length)).toBe(true)
      expect(changesModules(first.patch, next.patch)).toBe(false)
    }
  })

  it('a new voice applies once, when finished', () => {
    const { applied, accepted } = type(base, '\n$: s("bd sd")')
    expect(applied.at(-1)).toBe('\n$: s("bd sd")')
    expect(applied.filter((text) => text.includes('$'))).toEqual(['\n$: s("bd sd")'])
    expect(accepted.patch.modules.length).toBeGreaterThan(readable(base)?.patch.modules.length ?? 0)
  })

  it('a complete call the rack cannot model applies and still ends a step', () => {
    const { accepted, history } = type(base, '\n  .notARealCall(2)')
    expect(accepted.patch.modules.some((module) => module.type === 'code')).toBe(true)
    expect(history.step('undo')?.source).toBe(base)
  })
})
