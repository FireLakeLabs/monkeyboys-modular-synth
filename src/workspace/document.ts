import { withoutPackSetup } from '../samples/packs'
import { notationLiteral } from '../reader/notationLiteral'
import { creditComments, patchCredits } from './credits'
import { parse, tokenizer } from 'acorn'
import { isGrid, isSteps } from '../codegen/graph'
import { drumText } from '../patch/notation'
import { sequenceText } from '../rack/model'
import { generate, generateDocument } from '../codegen/generate'
import {
  descriptor,
  RACK_MARKER,
  writeLayout,
  type RackLayout,
  type Scope,
} from '../codegen/layout'
import { getModuleSpec } from '../modules/catalog'
import type { Patch } from '../patch/types'
import { read } from '../reader'
import { readLayout, matchRouting } from '../reader/layout'
import { parseSource } from '../reader/syntax'
import type { SourceAddress, SourceDocument, Span } from '../reader/types'
import { planStructure, spliceSource } from './structure'

/** Remove identifiable metadata comments, retaining any executable source after them. */
export function sourceBody(source: string): string {
  const markers: { start: number; end: number }[] = []
  parse(source, {
    ecmaVersion: 'latest',
    onComment: (block, text, start, end) => {
      if (!block && `//${text}` === RACK_MARKER) markers.push({ start, end })
    },
  })
  for (const marker of markers.reverse()) {
    let end = marker.end
    const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(end))?.[0] ?? ''
    end += newline.length
    const json: string[] = []
    while (source.startsWith('// ', end)) {
      const line = /^\/\/ ([^\r\n]*)(?:\r\n|\r|\n|$)/.exec(source.slice(end))
      if (!line) break
      end += line[0].length
      json.push(line[1] ?? '')
      try {
        JSON.parse(json.join('\n'))
        break // A later user comment belongs to the source, even without a blank line.
      } catch {
        /* Continue through an incomplete or malformed metadata object. */
      }
    }
    source = source.slice(0, marker.start) + source.slice(end)
  }
  return source
}

export function fromPatch(patch: Patch): SourceDocument {
  return read(generate(patch))
}

/** Explicitly relinquish source formatting while retaining opaque setup and CODE. */
export function makeRackEditable(document: SourceDocument, next = document.patch): SourceDocument {
  if (JSON.stringify(document.patch) !== document.patchRevision)
    throw new Error('Stale source spans')
  if (document.layout === 'invalid')
    throw new Error('Replace unknown rack metadata explicitly before editing the rack')
  const body = withoutPackSetup(sourceBody(document.source), document.patch.cartridges ?? [])
  const parsed = parseSource(body)
  const bound = new Set(document.bindings.map((binding) => binding.scope))
  const setup: (Span & { text: string })[] = []
  for (const statement of parsed.program.body) {
    const scopes = parsed.scopes.filter(
      (scope) => scope.start >= statement.start && scope.end <= statement.end,
    )
    const owned = scopes.filter(
      (scope) => scope.kind !== 'declaration' || bound.has(scope.descriptor.id),
    )
    if (owned.length) {
      if (owned.length !== scopes.length)
        throw new Error('Separate helper and pattern declarations before converting this patch')
    } else {
      setup.push({
        start: statement.start,
        end: statement.end,
        text: body.slice(statement.start, statement.end),
      })
    }
  }
  const credits = creditComments(body).filter(
    (comment) =>
      !setup.some((span) => comment.start >= span.start && comment.end <= span.end) &&
      !document.bindings.some((binding) => {
        const code = next.modules.find(
          (module) => module.id === binding.module && module.type === 'code',
        )
        return (
          code &&
          comment.start >= binding.start &&
          comment.end <= binding.end &&
          typeof code.values['text'] === 'string' &&
          code.values['text'].includes(body.slice(comment.start, comment.end))
        )
      }),
  )
  const prelude = [...setup, ...credits]
    .sort((a, b) => a.start - b.start)
    .reduce((text, item) => text + (text && !/[\r\n]$/.test(text) ? '\n' : '') + item.text, '')
  const { prelude: _previous, ...patch } = next
  const result = fromPatch({ ...patch, ...(prelude ? { prelude } : {}) })
  if (result.layout !== 'restored') throw new Error('Cannot restore the converted rack')
  if (JSON.stringify(patchCredits(result.source)) !== JSON.stringify(patchCredits(document.source)))
    throw new Error('Cannot preserve credit order during rack conversion; edit the code instead')
  return result
}

/** Stamp current, proven bindings without rewriting a single executable/trivia byte. */
export function saveLayout(document: SourceDocument, patch = document.patch): SourceDocument {
  if (JSON.stringify(document.patch) !== document.patchRevision)
    throw new Error('Stale source spans')
  if (document.layout === 'invalid')
    throw new Error('Replace unknown rack metadata explicitly before editing the rack')
  const body = sourceBody(document.source)
  const parsed = parseSource(body)
  const old = readLayout(document.source)
  const routes =
    old.kind === 'valid'
      ? matchRouting(old.layout.scopes, parsed.scopes, parseSource(old.generated).scopes)
      : undefined
  const scopes = parsed.scopes.map((scope) => {
    const routing = routes?.get(scope.descriptor.id)
    return {
      ...scope.descriptor,
      ...(routing &&
      !document.bindings.some(
        (binding) => binding.scope === scope.descriptor.id && binding.calls.includes(routing.call),
      )
        ? { routing }
        : {}),
    }
  })
  return stampLayout(body, patch, document.bindings, scopes)
}

function stampLayout(
  body: string,
  patch: Patch,
  bindings: SourceAddress[],
  scopes: Scope[],
): SourceDocument {
  // Canonical generated source already proves its complete graph, including folded
  // mixer paths. Retain that representation instead of inventing imported ownership.
  const generated = generate(patch)
  if (sourceBody(generated) === body) return read(generated)
  // The reader independently proves canonical graph ownership by AST, including
  // complete disconnected state. Preserve trivia when only setup/formatting moved.
  if (descriptor(parseSource(generated).program) === descriptor(parseSource(body).program))
    return read(
      `${body}${body.endsWith('\n') ? '' : '\n'}${writeLayout(generateDocument(patch).layout)}`,
    )
  const layout: RackLayout = {
    version: 1,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.cartridges === undefined ? {} : { cartridges: patch.cartridges }),
    ...(patch.prelude === undefined ? {} : { prelude: patch.prelude }),
    source: body,
    scopes,
    modules: patch.modules.map((module) => ({
      ...module,
      bindings: bindings
        .filter((b) => b.module === module.id)
        .map(({ scope, loop, calls, role, target, fx }) => ({
          scope,
          ...(loop ? { loop } : {}),
          calls,
          role,
          ...(target ? { target } : {}),
          ...(fx === undefined ? {} : { fx }),
        })),
    })),
    cables: patch.cables,
    names: patch.names,
    ...(patch.rows === undefined ? {} : { rows: patch.rows }),
    ...(patch.railHp === undefined ? {} : { railHp: patch.railHp }),
  }
  const source = `${body}${body.endsWith('\n') ? '' : '\n'}${writeLayout(layout)}`
  const result = read(source)
  // Object key insertion order is not rack state; module and cable array order is.
  const identity = (rack: Patch) =>
    JSON.stringify(rack, (_key, value: unknown) =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
    )
  if (result.layout !== 'restored' || identity(result.patch) !== identity(patch))
    throw new Error(
      `Cannot prove saved rack identity for this edit: ${result.diagnostics.join('; ')}. Edit the code instead.`,
    )
  return result
}

export class RackEditRefused extends Error {}

interface Edit extends Span {
  text: string
}
/** Source-aware mutation boundary. Unsafe imported structural edits are refused. */
export function editDocument(document: SourceDocument, next: Patch): SourceDocument {
  generate(next)
  if (JSON.stringify(document.patch) !== document.patchRevision)
    throw new Error('Stale source spans')
  if (document.layout === 'invalid')
    throw new Error('Replace unknown rack metadata explicitly before editing the rack')
  const before = document.patch
  const sounding = (patch: Patch) =>
    JSON.stringify({
      modules: patch.modules.map(({ id, type, values }) => ({ id, type, values })),
      cables: patch.cables,
      names: patch.names,
    })
  if (sounding(before) === sounding(next)) return saveLayout(document, next)
  const oldCode = generateDocument(before).code
  if (sourceBody(document.source) === sourceBody(oldCode)) return fromPatch(next)
  const bound = new Set(document.bindings.map((binding) => binding.module))
  const changedModules = [...before.modules, ...next.modules].filter((module) => {
    const previous = before.modules.find((item) => item.id === module.id)
    const changed = next.modules.find((item) => item.id === module.id)
    return (
      JSON.stringify(previous?.values) !== JSON.stringify(changed?.values) ||
      previous?.type !== changed?.type
    )
  })
  const changedCables = [...before.cables, ...next.cables].filter(
    (cable) =>
      !before.cables.some((item) => JSON.stringify(item) === JSON.stringify(cable)) ||
      !next.cables.some((item) => JSON.stringify(item) === JSON.stringify(cable)),
  )
  if (
    changedModules.every((module) => !bound.has(module.id)) &&
    changedCables.every((cable) => !bound.has(cable.from.module) && !bound.has(cable.to.module)) &&
    JSON.stringify(before.names) === JSON.stringify(next.names) &&
    sourceBody(oldCode) === sourceBody(generate(next))
  )
    return saveLayout(document, next)
  if (
    JSON.stringify(before.cables) !== JSON.stringify(next.cables) ||
    before.modules.length !== next.modules.length ||
    before.modules.some((m, i) => m.id !== next.modules[i]?.id)
  ) {
    try {
      const plan = planStructure(document, next, sourceBody(document.source))
      return stampLayout(plan.source, next, plan.bindings, plan.scopes)
    } catch (failure) {
      throw new RackEditRefused(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const edits: Edit[] = []
  for (const module of next.modules) {
    const previous = before.modules.find((m) => m.id === module.id)
    if (!previous) throw new Error('Missing source owner')
    for (const control of getModuleSpec(module.type).controls) {
      const value = module.values[control.id] ?? control.default
      const old = previous.values[control.id] ?? control.default
      if (JSON.stringify(value) === JSON.stringify(old)) continue
      if ('presentationOnly' in control && control.presentationOnly) continue
      const bindings = document.bindings.filter((b) => b.module === module.id)
      if (!bindings.length || (module.type === 'out' && control.id === 'vol')) continue
      let spans = bindings.flatMap((b) => b.controls[control.id] ?? [])
      let text =
        typeof value === 'string'
          ? JSON.stringify(value)
          : typeof value === 'number'
            ? String(value)
            : JSON.stringify(value)
      if (
        module.type === 'out' &&
        control.id === 'bpm' &&
        typeof value === 'number' &&
        !spans.length
      ) {
        const scope = parseSource(document.source).scopes.find(
          (s) => s.descriptor.id === bindings.find((b) => b.role === 'tempo')?.scope,
        )
        const call = scope?.calls[0],
          arg = call?.args[0]
        if (
          arg &&
          ['Literal', 'UnaryExpression'].includes(arg.type) &&
          !/\/[/*]/.test(document.source.slice(arg.start, arg.end))
        ) {
          spans = [{ start: arg.start, end: arg.end }]
          text = String(value / (call?.name === 'setcps' ? 240 : 4))
        }
      }
      if (module.type === 'code' && control.id === 'text' && typeof value === 'string') {
        spans = bindings
        text = value
      }
      const notation =
        control.kind === 'steps' && isSteps(value) && typeof value !== 'string'
          ? typeof old === 'string'
            ? value.join(' ')
            : sequenceText(module, value)
          : control.kind === 'grid' && isGrid(value) && typeof value !== 'string'
            ? drumText(value)
            : undefined
      if (notation !== undefined) text = JSON.stringify(notation)
      if (
        !spans.length ||
        (notation === undefined &&
          control.kind !== 'drawbars' &&
          typeof value !== 'number' &&
          typeof value !== 'string')
      )
        throw new RackEditRefused(
          `Cannot safely edit ${module.id} ${control.label}; edit its code instead`,
        )
      for (const span of spans) {
        const nextText = notation ?? (typeof value === 'string' ? value : undefined)
        const oldText = typeof old === 'string' ? old : undefined
        const literal =
          oldText === undefined ? undefined : notationLiteral(document.source, span, oldText)
        // Template cooking normalizes line endings; map mini boundaries back to
        // original bytes while keeping delimiters and untouched raw trivia.
        if (
          (control.kind === 'steps' ||
            control.kind === 'grid' ||
            (control.kind === 'text' && control.notation)) &&
          nextText !== undefined &&
          oldText !== undefined &&
          literal &&
          !nextText.includes(literal.quote) &&
          !nextText.includes('\\') &&
          (literal.quote === '`' ? !nextText.includes('${') : !/[\r\n]/.test(nextText))
        ) {
          let start = 0,
            end = oldText.length,
            nextEnd = nextText.length
          while (start < end && start < nextEnd && oldText[start] === nextText[start]) start++
          while (end > start && nextEnd > start && oldText[end - 1] === nextText[nextEnd - 1]) {
            end--
            nextEnd--
          }
          edits.push({
            start: literal.boundaries[start] ?? span.start + 1,
            end: literal.boundaries[end] ?? span.end - 1,
            text: nextText.slice(start, nextEnd),
          })
        } else edits.push({ ...span, text })
      }
    }
  }
  for (const [key, name] of Object.entries(next.names)) {
    const old = before.names[key]
    if (old === name) continue
    if (!old) throw new RackEditRefused('Rename this imported output in the code')
    const parsed = parseSource(document.source)
    const allowed: Span[] = []
    for (const statement of parsed.program.body)
      if (statement.type === 'VariableDeclaration')
        for (const declaration of statement.declarations)
          if (declaration.id.type === 'Identifier' && declaration.id.name === old)
            allowed.push(declaration.id)
    for (const scope of parsed.scopes)
      if (scope.root.type === 'Identifier' && scope.root.name === old) allowed.push(scope.root)
    const tokens = [...tokenizer(sourceBody(document.source), { ecmaVersion: 'latest' })].filter(
      (token) =>
        token.type.label === 'name' && document.source.slice(token.start, token.end) === old,
    )
    if (!allowed.length || tokens.length !== allowed.length)
      throw new RackEditRefused('Name has CODE references; rename it in the code')
    if (
      [...tokenizer(sourceBody(document.source), { ecmaVersion: 'latest' })].some(
        (token) =>
          token.type.label === 'name' && document.source.slice(token.start, token.end) === name,
      )
    )
      throw new RackEditRefused('Name collides with imported code')
    edits.push(...allowed.map((span) => ({ ...span, text: name })))
  }
  const changed = spliceSource(
    document.source,
    edits.filter(
      (edit, i, all) =>
        all.findIndex((other) => other.start === edit.start && other.end === edit.end) === i,
    ),
  )
  return saveLayout({ ...document, source: changed }, next)
}

export function replaceLayout(document: SourceDocument): SourceDocument {
  return saveLayout(read(sourceBody(document.source)))
}
