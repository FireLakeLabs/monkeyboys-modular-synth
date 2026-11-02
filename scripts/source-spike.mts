/** Throwaway #1/#14 research; deliberately not a Patch reader or generator. */
import { parse, type Expression, type CallExpression } from 'acorn'

export interface Span {
  start: number
  end: number
}
export interface Call {
  name: string
  span: Span
  args: CallExpression['arguments']
  signature: string
}
export interface Voice {
  anchor: string
  named: boolean
  root: string
  calls: readonly Call[]
}
export interface Document {
  source: string
  voices: readonly Voice[]
}
export type ReadResult =
  | { kind: 'parsed'; document: Document }
  | { kind: 'invalid'; source: string; offset: number; line: number; column: number }

function signature(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (['start', 'end', 'loc', 'raw'].includes(key)) return undefined
    return typeof item === 'bigint' ? `${item}n` : item
  })
}

function chain(expression: Expression): Call[] {
  if (expression.type !== 'CallExpression' || expression.optional) return []
  const callee = expression.callee
  let prefix: Call[] = []
  let name: string
  let start: number
  if (callee.type === 'Identifier') {
    name = callee.name
    start = expression.start
  } else if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    !callee.optional &&
    callee.property.type === 'Identifier' &&
    callee.object.type !== 'Super'
  ) {
    prefix = chain(callee.object)
    name = callee.property.name
    // Includes the dot and inter-call comments, without swallowing the receiver.
    start = callee.object.end
  } else return []
  const args = expression.arguments
  return [
    ...prefix,
    {
      name,
      span: { start, end: expression.end },
      args,
      signature: `${name}:${signature(expression.arguments)}`,
    },
  ]
}

function root(expression: Expression): string {
  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    !expression.optional &&
    !expression.callee.computed &&
    !expression.callee.optional &&
    expression.callee.object.type !== 'Super'
  )
    return root(expression.callee.object)
  return signature(expression)
}

export function readSource(source: string): ReadResult {
  let program
  try {
    program = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  } catch (error: unknown) {
    // Acorn's SyntaxError adds pos/loc; reject unrelated failures instead of hiding them.
    if (
      !(error instanceof SyntaxError) ||
      !('pos' in error) ||
      !('loc' in error) ||
      typeof error.pos !== 'number' ||
      typeof error.loc !== 'object' ||
      error.loc === null ||
      !('line' in error.loc) ||
      !('column' in error.loc) ||
      typeof error.loc.line !== 'number' ||
      typeof error.loc.column !== 'number'
    )
      throw error
    return {
      kind: 'invalid',
      source,
      offset: error.pos,
      line: error.loc.line,
      column: error.loc.column,
    }
  }
  const voices: Voice[] = []
  function add(expression: Expression, anchor: string, named = false) {
    if (
      !named &&
      expression.type === 'CallExpression' &&
      expression.callee.type === 'Identifier' &&
      expression.callee.name === 'stack'
    ) {
      expression.arguments.forEach((arg, i) => {
        if (arg.type !== 'SpreadElement') add(arg, `${anchor}/${i}`)
      })
      return
    }
    const calls = chain(expression)
    voices.push({ anchor, named, root: root(expression), calls })
  }
  for (const statement of program.body) {
    if (
      statement.type === 'LabeledStatement' &&
      statement.label.name === '$' &&
      statement.body.type === 'ExpressionStatement'
    )
      add(statement.body.expression, '$')
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === 'Identifier' && declaration.init)
          add(declaration.init, declaration.id.name, true)
      }
    }
    if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'CallExpression' &&
      statement.expression.callee.type === 'Identifier' &&
      statement.expression.callee.name === 'stack'
    ) {
      add(statement.expression, '$')
    }
  }
  return { kind: 'parsed', document: { source, voices } }
}

export function editNumber(
  document: Document,
  currentSource: string,
  voiceIndex: number,
  callIndex: number,
  value: number,
): ReadResult {
  if (currentSource !== document.source) throw new Error('Stale source revision')
  if (!Number.isFinite(value)) throw new Error('Expected finite number')
  const arg = document.voices[voiceIndex]?.calls[callIndex]?.args[0]
  const numeric =
    (arg?.type === 'Literal' && typeof arg.value === 'number') ||
    (arg?.type === 'UnaryExpression' &&
      arg.operator === '-' &&
      arg.argument.type === 'Literal' &&
      typeof arg.argument.value === 'number')
  if (!arg || !numeric) throw new Error('No editable numeric literal')
  if (arg.type === 'UnaryExpression' && /\/[/*]/.test(document.source.slice(arg.start, arg.end)))
    throw new Error('Cannot replace a signed literal containing a comment')
  const source =
    document.source.slice(0, arg.start) + String(value) + document.source.slice(arg.end)
  return readSource(source) // New offsets belong only to this new document.
}

export interface SavedVoice {
  voice: Voice
  ids: readonly string[]
}

function uniqueIndex<T>(items: readonly T[], key: (item: T) => string, wanted: string): number {
  const indices = items.flatMap((item, i) => (key(item) === wanted ? [i] : []))
  return indices.length === 1 ? (indices[0] ?? -1) : -1
}

/** Returns saved IDs only for proven matches; undefined means allocate + auto-place. */
export function restoreIds(
  saved: readonly SavedVoice[],
  next: readonly Voice[],
  generatedOrbitRouting = false,
): (string | undefined)[][] {
  return next.map((voice) => {
    // Only known generator-owned routing may be excluded; arbitrary imports stay CODE.
    const moduleCalls = (v: Voice) =>
      v.calls.filter((call) => !generatedOrbitRouting || call.name !== 'orbit')
    const fullKey = (v: Voice) =>
      v.named
        ? `name:${v.anchor}`
        : `voice:${signature([v.root, moduleCalls(v).map((call) => call.signature)])}`
    const rootKey = (v: Voice) => (v.named ? `name:${v.anchor}` : `root:${v.root}`)
    function match(key: (v: Voice) => string) {
      const wanted = key(voice)
      const index = uniqueIndex(saved, (item) => key(item.voice), wanted)
      return uniqueIndex(next, key, wanted) < 0 ? undefined : saved[index]
    }
    // Exact anonymous branches disambiguate fan-out; only unique roots permit edits.
    const previous = match(fullKey) ?? (voice.named ? undefined : match(rootKey))
    if (!previous) return moduleCalls(voice).map(() => undefined)
    const oldCalls = moduleCalls(previous.voice)
    const newCalls = moduleCalls(voice)
    const unchanged =
      signature(oldCalls.map((call) => call.signature)) ===
      signature(newCalls.map((call) => call.signature))
    return newCalls.map((call, index) => {
      if (unchanged) return previous.ids[index]
      let oldIndex = uniqueIndex(oldCalls, (item) => item.signature, call.signature)
      if (uniqueIndex(newCalls, (item) => item.signature, call.signature) < 0) return undefined
      if (oldIndex < 0) {
        // A unique method can keep identity across an argument edit. Repeats cannot.
        oldIndex = uniqueIndex(oldCalls, (item) => item.name, call.name)
        if (uniqueIndex(newCalls, (item) => item.name, call.name) < 0) return undefined
      }
      return previous.ids[oldIndex]
    })
  })
}
