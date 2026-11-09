// Research only. No application import, evaluator, control inference or graph projection.
import { parse, parseExpressionAt } from 'acorn'

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

const named = (node, name) => node?.type === 'Identifier' && node.name === name
const registration = (node) => node.type === 'CallExpression' && named(node.callee, 'register')

/** Returns syntax candidates, never proof of runtime types, purity or isolation. */
export function discover(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const definitions = []
  const calls = []
  const diagnostics = []
  const direct = new Set()
  for (const statement of ast.body) {
    const call = statement.type === 'ExpressionStatement' && statement.expression
    if (!call || !registration(call)) continue
    direct.add(call)
    const [name, fn] = call.arguments
    if (
      call.arguments.length !== 2 ||
      name?.type !== 'Literal' ||
      typeof name.value !== 'string' ||
      !['ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type) ||
      fn.async ||
      fn.generator ||
      !fn.params.length ||
      fn.params.some((p) => p.type !== 'Identifier')
    ) {
      diagnostics.push({ reason: 'unsupported registration', start: call.start })
      continue
    }
    definitions.push({
      id: `definition:${call.start}`,
      name: name.value,
      start: call.start,
      end: call.end,
      source: source.slice(call.start, call.end),
      parameters: fn.params.slice(0, -1).map((p) => p.name),
      receiver: fn.params.at(-1).name,
      body: source.slice(fn.body.start, fn.body.end),
    })
  }
  let hazardous = false
  walk(ast, (node) => {
    if (
      (registration(node) && !direct.has(node)) ||
      (node.type === 'VariableDeclarator' && named(node.id, 'register')) ||
      (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) &&
        named(node.id, 'register')) ||
      (['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(
        node.type,
      ) &&
        node.params.some((p) => named(p, 'register'))) ||
      (node.type === 'AssignmentExpression' && named(node.left, 'register'))
    )
      hazardous = true
  })
  if (hazardous) diagnostics.push({ reason: 'nested registration or shadowed register' })
  const duplicates = new Set(
    definitions
      .filter((d) => definitions.filter((other) => other.name === d.name).length !== 1)
      .map((d) => d.name),
  )
  // Unsupported direct registrations could redefine a literal candidate (aliases,
  // computed names/options). Decline the whole document rather than guessing.
  const uncertain = hazardous || diagnostics.length > 0
  function chain(node) {
    if (node?.type !== 'CallExpression') return
    const callee = node.callee
    if (callee.type !== 'MemberExpression') return
    chain(callee.object)
    if (
      callee.computed ||
      callee.optional ||
      node.optional ||
      callee.property.type !== 'Identifier'
    )
      return
    const definition = definitions.find((d) => d.name === callee.property.name)
    if (!definition) return
    const reason = uncertain
      ? 'unresolved registration environment'
      : duplicates.has(definition.name)
        ? 'duplicate definition'
        : node.start < definition.end
          ? 'call before definition'
          : node.arguments.some((a) => a.type === 'SpreadElement') ||
              node.arguments.length !== definition.parameters.length
            ? 'unsupported arity'
            : null
    calls.push({
      id: `call:${node.start}:${node.end}`,
      definition: definition.id,
      name: definition.name,
      start: callee.object.end,
      end: node.end,
      source: source.slice(callee.object.end, node.end),
      status: reason ? 'code' : 'candidate',
      reason,
      arguments: node.arguments.map((arg) => ({
        start: arg.start,
        end: arg.end,
        source: source.slice(arg.start, arg.end),
        kind: arg.type === 'Literal' && typeof arg.value === 'number' ? 'number' : 'expression',
      })),
    })
  }
  for (const statement of ast.body) {
    if (statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement')
      chain(statement.body.expression)
  }
  return { version: 'research-247-1', source, definitions, calls, diagnostics }
}

/** An explicit edit owns exactly one existing argument, against an exact revision. */
export function editArgument(
  currentSource,
  snapshot,
  callId,
  index,
  replacement,
  mode = 'expression',
) {
  if (currentSource !== snapshot.source) throw new Error('Stale source revision')
  const call = discover(currentSource).calls.find((c) => c.id === callId)
  const arg = call?.arguments[index]
  if (!call || call.status !== 'candidate' || !arg) throw new Error('Unproven argument binding')
  if (mode === 'number' && (arg.kind !== 'number' || !Number.isFinite(Number(replacement))))
    throw new Error('Expression needs explicit text editing')
  // Parse as one full expression, so comma/spread/trailing comments cannot escape
  // the argument boundary. No evaluation or numeric range inference occurs.
  const wrapped = `(${replacement})`
  const expression = parseExpressionAt(wrapped, 0, { ecmaVersion: 'latest', preserveParens: true })
  if (
    expression.type !== 'ParenthesizedExpression' ||
    expression.start !== 0 ||
    expression.end !== wrapped.length ||
    expression.expression.type === 'SequenceExpression'
  )
    throw new Error('Expected one argument expression')
  const source = currentSource.slice(0, arg.start) + replacement + currentSource.slice(arg.end)
  return discover(source)
}

/** A deliberately exact-revision research envelope, NOT the production rack format. */
export function reopen(serialized) {
  const saved = JSON.parse(serialized)
  if (saved?.version !== 'research-247-1' || typeof saved.source !== 'string')
    throw new Error('Unsupported research envelope')
  const fresh = discover(saved.source)
  if (JSON.stringify(fresh) !== JSON.stringify(saved))
    throw new Error('Stale or invalid research bindings')
  return fresh
}
