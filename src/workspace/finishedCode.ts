import { parse, tokenizer } from 'acorn'
import type { Patch } from '../patch/types'

type Program = ReturnType<typeof parse>
type Statement = Program['body'][number]

function statementRoots(statement: Statement) {
  if (statement.type === 'ExpressionStatement') return [statement.expression]
  if (statement.type === 'LabeledStatement') return statementRoots(statement.body as Statement)
  if (statement.type === 'VariableDeclaration')
    return statement.declarations.flatMap((item) => (item.init ? [item.init] : []))
  return []
}

/** `Math.PI` is a finished value; `sine.rang` is half of `sine.range()`. */
const CONSTANT_HOLDERS = new Set(['Math', 'Number'])

interface SyntaxNode {
  type: string
  [field: string]: unknown
}

const isNode = (value: unknown): value is SyntaxNode =>
  typeof value === 'object' && value !== null && 'type' in value

function walk(node: SyntaxNode, visit: (node: SyntaxNode, parent?: SyntaxNode) => void) {
  const step = (current: SyntaxNode, parent?: SyntaxNode) => {
    visit(current, parent)
    for (const value of Object.values(current))
      for (const child of Array.isArray(value) ? value : [value])
        if (isNode(child)) step(child, current)
  }
  step(node)
}

/** A member left dangling: not called, not chained further and not assigned to. */
function dangling(node: SyntaxNode, parent?: SyntaxNode) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    isNode(node.property) &&
    node.property.type === 'Identifier' &&
    !(parent?.type === 'CallExpression' && parent.callee === node) &&
    !(parent?.type === 'MemberExpression' && parent.object === node) &&
    !(parent?.type === 'AssignmentExpression' && parent.left === node)
  )
}

/** A chain or statement that ends on a word with no call, such as `.l` or `$: s`. */
function bareWords(source: string): string[] {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const roots = new Set<unknown>(program.body.flatMap(statementRoots))
  const names = new Set<string>()
  const members: { node: SyntaxNode; name: string }[] = []
  walk(program as unknown as SyntaxNode, (node, parent) => {
    if (node.type === 'VariableDeclarator' && isNode(node.id) && node.id.type === 'Identifier')
      names.add(String(node.id.name))
    if (node.type === 'FunctionDeclaration' && isNode(node.id)) names.add(String(node.id.name))
    if (Array.isArray(node.params))
      for (const param of node.params)
        if (isNode(param) && param.type === 'Identifier') names.add(String(param.name))
    if (dangling(node, parent) && isNode(node.property))
      members.push({ node, name: String(node.property.name) })
  })
  const words = members.flatMap(({ node, name }) =>
    isNode(node.object) &&
    node.object.type === 'Identifier' &&
    CONSTANT_HOLDERS.has(String(node.object.name))
      ? []
      : [name],
  )
  for (const root of roots)
    if (isNode(root) && root.type === 'Identifier' && !names.has(String(root.name)))
      words.push(String(root.name))
  return words
}

function caretOnWord(source: string, caret: number) {
  for (const token of tokenizer(source, { ecmaVersion: 'latest' })) {
    if (token.start >= caret) return false
    if (token.type.label === 'name' && token.end >= caret) return true
  }
  return false
}

/**
 * Parser-valid is not enough: a half-typed `.l` reads as code and collapses its voice
 * into CODE. Readable `draft` is finished when it adds no word left without a call,
 * and, while the editor has focus, the caret has moved off any word. A complete call
 * the rack cannot model is finished. Words `accepted` already has stay allowed.
 */
export function isFinished(draft: string, accepted: string, caret?: number): boolean {
  const known = bareWords(accepted)
  for (const word of bareWords(draft)) {
    const index = known.indexOf(word)
    if (index < 0) return false
    known.splice(index, 1)
  }
  return caret === undefined || !caretOnWord(draft, caret)
}

/** Adding or removing a module is a good place to end an undo step. */
export function changesModules(before: Patch, after: Patch): boolean {
  const ids = (patch: Patch) => JSON.stringify(patch.modules.map((module) => module.id))
  return ids(before) !== ids(after)
}
