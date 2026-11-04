import { parse, type CallExpression, type Expression } from 'acorn'
import { descriptor, type Scope } from '../codegen/layout'
import { OUT } from '../modules/catalog'
import type { Span } from './types'

export interface Call extends Span {
  name: string
  args: CallExpression['arguments']
}

export interface ParsedScope extends Span {
  descriptor: Scope
  expression: Expression
  root: Expression
  calls: Call[]
  kind: 'voice' | 'declaration' | 'tempo'
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
  function add(expression: Expression, kind: ParsedScope['kind'], anchor?: string): void {
    if (
      kind === 'voice' &&
      expression.type === 'CallExpression' &&
      expression.callee.type === 'Identifier' &&
      expression.callee.name === 'stack' &&
      expression.arguments.every((arg) => arg.type !== 'SpreadElement')
    ) {
      for (const arg of expression.arguments) add(arg, kind)
      return
    }
    const parsed = chain(expression)
    scopes.push({
      expression,
      ...parsed,
      kind,
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
    if (
      statement.type === 'LabeledStatement' &&
      statement.label.name === '$' &&
      statement.body.type === 'ExpressionStatement'
    )
      add(statement.body.expression, 'voice')
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
