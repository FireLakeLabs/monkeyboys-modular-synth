import { parse, type CallExpression, type Expression } from 'acorn'
import { descriptor, type Scope, type Binding, type ExpressionStep } from '../codegen/layout'
import { OUT } from '../modules/catalog'
import type { Span } from './types'

export interface Call extends Span {
  name: string
  receiver?: Expression
  args: CallExpression['arguments']
}

export interface ParsedScope extends Span {
  descriptor: Scope
  expression: Expression
  root: Expression
  calls: Call[]
  kind: 'voice' | 'declaration' | 'tempo'
  label?: string
  loop?: number[]
  path?: ExpressionStep[]
}

export function chain(expression: Expression): { root: Expression; calls: Call[] } {
  if (expression.type !== 'CallExpression' || expression.optional)
    return { root: expression, calls: [] }
  const callee = expression.callee
  if (callee.type === 'Identifier')
    return {
      root: expression,
      calls: [
        {
          name: callee.name,
          start: expression.start,
          end: expression.end,
          args: expression.arguments,
        },
      ],
    }
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.optional ||
    callee.property.type !== 'Identifier' ||
    callee.object.type === 'Super'
  )
    return { root: expression, calls: [] }
  const prefix = chain(callee.object)
  return {
    root: prefix.root,
    calls: [
      ...prefix.calls,
      {
        receiver: callee.object,
        name: callee.property.name,
        start: callee.object.end,
        end: expression.end,
        args: expression.arguments,
      },
    ],
  }
}

export function parseSource(
  source: string,
  { lastExpressionIsVoice = true }: { lastExpressionIsVoice?: boolean } = {},
): {
  program: ReturnType<typeof parse>
  scopes: ParsedScope[]
} {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  const scopes: ParsedScope[] = []
  function add(
    expression: Expression,
    kind: ParsedScope['kind'],
    anchor?: string,
    label?: string,
  ): void {
    const parsed = chain(expression)
    scopes.push({
      expression,
      ...parsed,
      kind,
      ...(label === undefined ? {} : { label }),
      start: expression.start,
      end: expression.end,
      descriptor: {
        id: `scope${scopes.length + 1}`,
        ...(anchor === undefined ? {} : { anchor }),
        root: descriptor(parsed.root),
        calls: parsed.calls.map((call) => ({ name: call.name, arguments: descriptor(call.args) })),
      },
    })
  }
  for (const statement of program.body) {
    if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
      add(statement.body.expression, 'voice', undefined, statement.label.name)
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === 'Identifier' && declaration.init)
          add(declaration.init, 'declaration', declaration.id.name)
      }
    }
    if (statement.type === 'ExpressionStatement') {
      const expression = statement.expression
      if (
        expression.type === 'CallExpression' &&
        expression.callee.type === 'Identifier' &&
        expression.callee.name === 'samples'
      )
        continue
      if (
        expression.type === 'CallExpression' &&
        expression.callee.type === 'Identifier' &&
        OUT.strudel.includes(expression.callee.name)
      )
        add(expression, 'tempo')
      else if (
        expression.type === 'CallExpression' &&
        ((expression.callee.type === 'Identifier' && expression.callee.name === 'stack') ||
          (lastExpressionIsVoice && statement === program.body.at(-1)))
      )
        add(expression, 'voice')
    }
  }
  return { program, scopes }
}

export function scalar(
  expression: CallExpression['arguments'][number] | undefined,
): number | string | undefined {
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return expression.quasis[0]?.value.cooked ?? undefined
  if (expression?.type === 'BinaryExpression' && expression.operator === '/') {
    const left = expression.left.type === 'PrivateIdentifier' ? undefined : scalar(expression.left)
    const right = scalar(expression.right)
    if (typeof left === 'number' && typeof right === 'number' && right !== 0) return left / right
  }
  if (
    expression?.type === 'Literal' &&
    (typeof expression.value === 'string' || typeof expression.value === 'number')
  )
    return expression.value
  if (
    expression?.type === 'UnaryExpression' &&
    ['-', '+'].includes(expression.operator) &&
    expression.argument.type === 'Literal' &&
    typeof expression.argument.value === 'number'
  )
    return (expression.operator === '-' ? -1 : 1) * expression.argument.value
  return undefined
}

/** A reference in an argument cannot be interpreted as a global CV/declaration. */
export function usesParameter(value: unknown, name: string): boolean {
  if (typeof value !== 'object' || value === null) return false
  if ('type' in value && value.type === 'Identifier' && 'name' in value) return value.name === name
  if (
    'type' in value &&
    value.type === 'ArrowFunctionExpression' &&
    'params' in value &&
    Array.isArray(value.params) &&
    value.params.some(
      (p: unknown) =>
        p &&
        typeof p === 'object' &&
        'type' in p &&
        p.type === 'Identifier' &&
        'name' in p &&
        p.name === name,
    )
  )
    return false
  return Object.entries(value).some(([key, child]) => {
    if ((key === 'property' || key === 'key') && 'computed' in value && value.computed === false)
      return false
    return usesParameter(child, name)
  })
}

/** The only local binding form: a synchronous single-identifier expression lambda, applied once. */
export function localBinding(expression: Expression) {
  if (
    expression.type !== 'CallExpression' ||
    expression.optional ||
    expression.arguments.length !== 1
  )
    return undefined
  const lambda = expression.callee,
    value = expression.arguments[0]
  if (
    lambda.type !== 'ArrowFunctionExpression' ||
    lambda.async ||
    lambda.params.length !== 1 ||
    lambda.params[0]?.type !== 'Identifier' ||
    lambda.body.type === 'BlockStatement' ||
    !value ||
    value.type === 'SpreadElement'
  )
    return undefined
  return { parameter: lambda.params[0].name, body: lambda.body, value }
}

/** Shape only: projection separately proves all roots and ownership without evaluation. */
export function nestedScope(parent: ParsedScope, index: number): ParsedScope | undefined {
  const call = parent.calls[index]
  const lambda = call?.args.at(-1)
  if (
    lambda?.type !== 'ArrowFunctionExpression' ||
    lambda.async ||
    lambda.params.length !== 1 ||
    lambda.params[0]?.type !== 'Identifier' ||
    lambda.body.type === 'BlockStatement'
  )
    return undefined
  const parsed = chain(lambda.body)
  const receiver =
    parsed.root.type === 'Identifier' &&
    parsed.root.name === lambda.params[0].name &&
    lambda.body.start === parsed.root.start
  const stack = parsed.calls.some((c) => c.name === 'stack')
  if (!receiver && !stack && !localBinding(parsed.root)) return undefined
  return {
    ...parsed,
    expression: lambda.body,
    start: lambda.body.start,
    end: lambda.body.end,
    descriptor: {
      id: parent.descriptor.id,
      root: descriptor(parsed.root),
      calls: parsed.calls.map((c) => ({ name: c.name, arguments: descriptor(c.args) })),
    },
    kind: 'declaration',
    ...(parent.path
      ? { path: [...parent.path, { call: index, argument: 'body' as const }] }
      : { loop: [...(parent.loop ?? []), index] }),
  }
}

export function bindingScope(
  scopes: readonly ParsedScope[],
  binding: Pick<Binding, 'scope' | 'loop' | 'path'>,
): ParsedScope | undefined {
  let scope = scopes.find((item) => item.descriptor.id === binding.scope)
  for (const step of binding.path ?? []) scope = scope && expressionScope(scope, step)
  for (const index of binding.loop ?? []) scope = scope && nestedScope(scope, index)
  return scope
}

/** A static argument/receiver retains its exact lexical location and expression boundary. */
export function expressionScope(
  parent: ParsedScope,
  step: ExpressionStep,
): ParsedScope | undefined {
  if (step.argument === 'body') return nestedScope(parent, step.call)
  const call = parent.calls[step.call]
  const binding = localBinding(parent.root)
  const expression =
    step.argument === 'binding'
      ? step.call === 0
        ? binding?.body
        : undefined
      : step.argument === 'value'
        ? step.call === 0
          ? binding?.value
          : undefined
        : step.argument === 'receiver'
          ? call?.receiver
          : call?.args[step.argument]
  if (!expression || expression.type === 'SpreadElement') return undefined
  const parsed = chain(expression)
  return {
    ...parsed,
    expression,
    start: expression.start,
    end: expression.end,
    kind: 'declaration',
    descriptor: {
      id: parent.descriptor.id,
      root: descriptor(parsed.root),
      calls: parsed.calls.map((c) => ({ name: c.name, arguments: descriptor(c.args) })),
    },
    path: [
      ...(parent.path ?? (parent.loop ?? []).map((call) => ({ call, argument: 'body' as const }))),
      step,
    ],
  }
}

/** Descend only through the supported static combiner; never evaluate arguments. */
export function expressionChildren(parent: ParsedScope): ParsedScope[] {
  return [
    ...(localBinding(parent.root)
      ? (['value', 'binding'] as const).flatMap(
          (argument) => expressionScope(parent, { call: 0, argument }) ?? [],
        )
      : []),
    ...parent.calls.flatMap((call, index) => {
      if (call.name !== 'stack') return []
      return [
        ...(call.receiver ? [{ call: index, argument: 'receiver' as const }] : []),
        ...call.args.map((_, argument) => ({ call: index, argument })),
      ].flatMap((step) => expressionScope(parent, step) ?? [])
    }),
  ]
}
