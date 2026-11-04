import type { SamplePack } from '../samples/packs'
import { parse, type Expression } from 'acorn'
import { chain, nestedScope, type ParsedScope } from '../reader/syntax'
import type { RailHp } from '../patch/layout'
import type { Cable, PlacedModule } from '../patch/types'

export const RACK_MARKER = '// ── @monkeyboy rack v1 ──'

export interface Binding {
  scope: string
  /** Outer call indices leading into nested final-argument lambdas. */
  loop?: number[]
  calls: number[]
  /** Argument in an outer FX call. */
  fx?: number
  role: 'module' | 'cv' | 'mixer' | 'tempo'
  target?: { module: string; jack: string; control: string; path?: string }
}

export interface Scope {
  id: string
  anchor?: string
  root: string
  calls: { name: string; arguments: string }[]
  /** Only this exact final call has generator-owned routing provenance. */
  routing?: { call: number; orbit: number }
}

export interface RackLayout {
  name?: string
  /** Accepted executable source for source-owned files; never another rack block. */
  source?: string
  prelude?: string
  cartridges?: SamplePack[]
  version: 1
  scopes: Scope[]
  modules: (PlacedModule & { bindings: Binding[] })[]
  cables: Cable[]
  names: Record<string, string>
  rows?: number
  railHp?: RailHp
}

export interface Owner {
  module: string
  fx?: number
  role: Binding['role']
  start: number
  end: number
  target?: Binding['target']
}

export interface CodeExpression {
  text: string
  owners: Owner[]
  sourceRouting: boolean
  mixers: {
    module: string
    control: string
    gain: string
    cvModules: string[]
    cvPaths: Map<string, string>
    mute: boolean
    solo: boolean
    name: string
    channels: string
  }[]
}

/** Full AST descriptors, without source trivia, offsets, or literal quote spelling. */
export function descriptor(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (['start', 'end', 'loc', 'raw'].includes(key)) return undefined
    return typeof item === 'bigint' ? { bigint: String(item) } : item
  })
}

export function syntax(text: string): {
  root: string
  calls: { name: string; arguments: string; start: number; end: number }[]
  hasOrbit: boolean
  orbitNumbers: number[]
} {
  // Parentheses make CODE sources (including object/arrow expressions) unambiguous.
  const program = parse(`(${text}\n)`, { ecmaVersion: 'latest', sourceType: 'script' })
  const statement = program.body[0]
  if (statement?.type !== 'ExpressionStatement') throw new Error('Expected a pattern expression')
  const calls: { name: string; arguments: string; start: number; end: number }[] = []
  function chain(expression: Expression): string {
    if (expression.type !== 'CallExpression' || expression.optional) return descriptor(expression)
    const callee = expression.callee
    let root: string
    let name: string
    let start: number
    if (callee.type === 'Identifier') {
      root = descriptor(expression)
      name = callee.name
      start = expression.start - 1
    } else if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      !callee.optional &&
      callee.property.type === 'Identifier' &&
      callee.object.type !== 'Super'
    ) {
      root = chain(callee.object)
      name = callee.property.name
      start = callee.object.end - 1
    } else return descriptor(expression)
    calls.push({
      name,
      arguments: descriptor(expression.arguments),
      start,
      end: expression.end - 1,
    })
    return root
  }
  const root = chain(statement.expression)
  function usesOrbit(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false
    if ('type' in value && value.type === 'Identifier' && 'name' in value && value.name === 'orbit')
      return true
    // Computed ["orbit"] routing also remains source-owned; unrelated string literals do not.
    if (
      'type' in value &&
      value.type === 'MemberExpression' &&
      'property' in value &&
      typeof value.property === 'object' &&
      value.property !== null &&
      'value' in value.property &&
      value.property.value === 'orbit'
    )
      return true
    return Object.values(value).some(usesOrbit)
  }
  const orbitNumbers = new Set<number>()
  function reserveOrbits(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    if (
      'type' in value &&
      value.type === 'CallExpression' &&
      'callee' in value &&
      typeof value.callee === 'object' &&
      value.callee !== null &&
      'type' in value.callee &&
      value.callee.type === 'MemberExpression' &&
      'property' in value.callee &&
      typeof value.callee.property === 'object' &&
      value.callee.property !== null &&
      (('name' in value.callee.property && value.callee.property.name === 'orbit') ||
        ('value' in value.callee.property && value.callee.property.value === 'orbit')) &&
      'arguments' in value &&
      Array.isArray(value.arguments)
    ) {
      const argument: unknown = value.arguments[0]
      if (
        typeof argument === 'object' &&
        argument !== null &&
        'type' in argument &&
        argument.type === 'Literal' &&
        'value' in argument &&
        typeof argument.value === 'number' &&
        Number.isInteger(argument.value) &&
        argument.value > 0
      )
        orbitNumbers.add(argument.value)
    }
    for (const child of Object.values(value)) reserveOrbits(child)
  }
  reserveOrbits(statement.expression)
  return { root, calls, hasOrbit: usesOrbit(statement.expression), orbitNumbers: [...orbitNumbers] }
}

export function bindScope(
  layout: RackLayout,
  expression: CodeExpression,
  anchor?: string,
  orbit?: number,
): void {
  const parsed = syntax(expression.text)
  const id = `scope${layout.scopes.length + 1}`
  const scope: Scope = {
    id,
    ...(anchor === undefined ? {} : { anchor }),
    root: parsed.root,
    calls: parsed.calls.map(({ name, arguments: args }) => ({ name, arguments: args })),
    ...(orbit === undefined ? {} : { routing: { call: parsed.calls.length - 1, orbit } }),
  }
  layout.scopes.push(scope)
  const program = parse(`(${expression.text}\n)`, { ecmaVersion: 'latest' })
  const statement = program.body[0]
  if (statement?.type !== 'ExpressionStatement') throw new Error('Expected expression')
  const top: ParsedScope = {
    ...chain(statement.expression),
    expression: statement.expression,
    start: 1,
    end: expression.text.length + 1,
    kind: 'voice' as const,
    descriptor: scope,
  }
  const scopes = [top]
  function descend(current: ParsedScope) {
    current.calls.forEach((_call, i) => {
      const child = nestedScope(current, i)
      if (child) {
        scopes.push(child)
        descend(child)
      }
    })
  }
  descend(top)
  for (const owner of expression.owners) {
    const module = layout.modules.find((item) => item.id === owner.module)
    if (!module) throw new Error(`Unknown binding owner: ${owner.module}`)
    const local =
      scopes
        .filter((candidate) => candidate.start - 1 <= owner.start && candidate.end - 1 >= owner.end)
        .at(-1) ?? top
    const calls = local.calls.flatMap((call, index) =>
      // A chained call's range starts at its receiver's end, including whitespace.
      (
        owner.fx === undefined
          ? call.end - 1 > owner.start && call.end - 1 <= owner.end
          : call.start - 1 <= owner.start && call.end - 1 >= owner.end
      )
        ? [index]
        : [],
    )
    module.bindings.push({
      scope: id,
      ...(local.loop ? { loop: local.loop } : {}),
      calls,
      role: owner.role,
      ...(owner.fx === undefined ? {} : { fx: owner.fx }),
      ...(owner.target === undefined ? {} : { target: owner.target }),
    })
  }
}

/** OUT has stable identity and bindings, but belongs to the case rather than a rail. */
export function diskLayout(layout: RackLayout): unknown {
  return {
    ...layout,
    modules: layout.modules.map((module) => {
      if (module.type !== 'out') return module
      const { row: _row, hp: _hp, ...output } = module
      return output
    }),
  }
}

export function writeLayout(layout: RackLayout): string {
  return `${RACK_MARKER}\n${JSON.stringify(diskLayout(layout), null, 2)
    .split('\n')
    .map((line) => `// ${line}`)
    .join('\n')}\n`
}
