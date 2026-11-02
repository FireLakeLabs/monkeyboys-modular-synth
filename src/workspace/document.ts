import { parse, tokenizer } from 'acorn'
import { generate, generateDocument } from '../codegen/generate'
import { RACK_MARKER, writeLayout, type RackLayout } from '../codegen/layout'
import { getModuleSpec } from '../modules/catalog'
import type { Patch } from '../patch/types'
import { read } from '../reader'
import { readLayout, matchScopes } from '../reader/layout'
import { parseSource } from '../reader/syntax'
import type { SourceDocument, Span } from '../reader/types'

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

/** Stamp current, proven bindings without rewriting a single executable/trivia byte. */
export function saveLayout(document: SourceDocument, patch = document.patch): SourceDocument {
  if (JSON.stringify(document.patch) !== document.patchRevision)
    throw new Error('Stale source spans')
  if (document.layout === 'invalid')
    throw new Error('Replace unknown rack metadata explicitly before editing the rack')
  const body = sourceBody(document.source)
  const parsed = parseSource(body)
  const old = readLayout(document.source)
  const matches = matchScopes(old.kind === 'valid' ? old.layout.scopes : [], parsed.scopes)
  const layout: RackLayout = {
    version: 1,
    source: body,
    scopes: parsed.scopes.map((scope) => {
      const match = matches.get(scope.descriptor.id)
      const routing = match?.saved.routing
      const call = routing && [...match.calls].find(([, old]) => old === routing.call)?.[0]
      return {
        ...scope.descriptor,
        ...(routing &&
        call !== undefined &&
        !document.bindings.some(
          (binding) => binding.scope === scope.descriptor.id && binding.calls.includes(call),
        )
          ? { routing: { call, orbit: routing.orbit } }
          : {}),
      }
    }),
    modules: patch.modules.map((module) => ({
      ...module,
      bindings: document.bindings
        .filter((b) => b.module === module.id)
        .map(({ scope, calls, role, target }) => ({
          scope,
          calls,
          role,
          ...(target ? { target } : {}),
        })),
    })),
    cables: patch.cables,
    names: patch.names,
  }
  const source = `${body}${body.endsWith('\n') ? '' : '\n'}${writeLayout(layout)}`
  const result = read(source)
  if (result.layout !== 'restored' || JSON.stringify(result.patch) !== JSON.stringify(patch))
    throw new Error(
      `Cannot prove saved rack identity for this edit: ${result.diagnostics.join('; ')}`,
    )
  return result
}

interface Edit extends Span {
  text: string
}
function splice(source: string, edits: Edit[]): string {
  const sorted = edits.sort((a, b) => b.start - a.start)
  let end = source.length
  for (const edit of sorted) {
    if (edit.end > end) throw new Error('Overlapping source edits')
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    end = edit.start
  }
  return source
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
  )
    throw new Error('This imported structural edit cannot preserve source. Edit the code instead.')
  const edits: Edit[] = []
  for (const module of next.modules) {
    const previous = before.modules.find((m) => m.id === module.id)
    if (!previous) throw new Error('Missing source owner')
    for (const control of getModuleSpec(module.type).controls) {
      const value = module.values[control.id] ?? control.default
      const old = previous.values[control.id] ?? control.default
      if (JSON.stringify(value) === JSON.stringify(old)) continue
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
      if (!spans.length || (typeof value !== 'number' && typeof value !== 'string'))
        throw new Error(`Cannot safely edit ${module.id} ${control.label}; edit its code instead`)
      for (const span of spans) edits.push({ ...span, text })
    }
  }
  for (const [key, name] of Object.entries(next.names)) {
    const old = before.names[key]
    if (old === name) continue
    if (!old) throw new Error('Rename this imported output in the code')
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
      throw new Error('Name has CODE references; rename it in the code')
    if (
      [...tokenizer(sourceBody(document.source), { ecmaVersion: 'latest' })].some(
        (token) =>
          token.type.label === 'name' && document.source.slice(token.start, token.end) === name,
      )
    )
      throw new Error('Name collides with imported code')
    edits.push(...allowed.map((span) => ({ ...span, text: name })))
  }
  const changed = splice(
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
