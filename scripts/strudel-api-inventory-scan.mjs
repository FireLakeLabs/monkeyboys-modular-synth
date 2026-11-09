import { parse } from 'acorn'

// Acorn parses dependency/corpus bytes only. No imported expression is evaluated.
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}
const keyName = (node) =>
  node?.type === 'Identifier' ? node.name : node?.type === 'Literal' ? node.value : undefined
const strings = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return [node.value]
  if (node?.type === 'ArrayExpression') {
    const values = node.elements.map(strings)
    if (values.every((value) => value?.length === 1)) return values.flat()
  }
  return undefined
}

function literal(node, env) {
  if (node?.type === 'Literal') return node.value
  if (node?.type === 'Identifier') return env[node.name]
  if (node?.type === 'TemplateLiteral') {
    const values = node.expressions.map((x) => literal(x, env))
    if (values.some((x) => x === undefined)) return undefined
    return node.quasis.map((q, i) => q.value.cooked + (i < values.length ? values[i] : '')).join('')
  }
  return undefined
}
// Only fixed, finite numeric for-loops. No calls, assignment evaluation or imported JS execution.
function boundedWalk(node, visit, env = {}) {
  if (!node || typeof node !== 'object') return
  const d =
    node.type === 'ForStatement' && node.init?.type === 'VariableDeclaration'
      ? node.init.declarations[0]
      : undefined
  const start = d?.init?.value,
    end = node.test?.right?.value
  if (
    d?.id.type === 'Identifier' &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    end >= start &&
    end - start <= 64 &&
    node.test?.left?.name === d.id.name &&
    ['<', '<='].includes(node.test.operator) &&
    node.update?.type === 'UpdateExpression' &&
    node.update.operator === '++' &&
    node.update.argument.name === d.id.name
  ) {
    for (let i = start; i < end + (node.test.operator === '<=' ? 1 : 0); i++)
      boundedWalk(node.body, visit, { ...env, [d.id.name]: i })
    return
  }
  if (typeof node.type === 'string') visit(node, env)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue
    if (Array.isArray(value)) value.forEach((child) => boundedWalk(child, visit, env))
    else if (value && typeof value === 'object') boundedWalk(value, visit, env)
  }
}

export function scan(source, path, registrationAliases = {}) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true })
  const exports = []
  const registrations = []
  const methods = []
  const unresolved = []
  const definitions = []
  const factories = []
  const namespaces = []
  const aliases = []
  const wrappers = []
  const evalScopes = []
  let composers
  let hows
  const registrationNames = new Map(
    ['register', 'registerControl', 'registerMultiControl', 'createParam'].map((x) => [x, x]),
  )
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    for (const spec of node.specifiers) {
      exports.push({ name: keyName(spec.exported), local: keyName(spec.local) })
      if (registrationNames.has(keyName(spec.exported)))
        registrationNames.set(keyName(spec.local), keyName(spec.exported))
    }
    const decl = node.declaration
    if (decl?.id) exports.push({ name: decl.id.name, local: decl.id.name })
    if (decl?.type === 'VariableDeclaration')
      for (const d of decl.declarations)
        walk(d.id, (n) => {
          if (n.type === 'Identifier') exports.push({ name: n.name, local: n.name })
        })
  }
  for (const [local, canonical] of Object.entries(registrationAliases))
    registrationNames.set(local, canonical)
  const scopeLocal = exports.find((x) => x.name === 'evalScope')?.local
  const ref = (node) => ({ path, line: node.loc.start.line })
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      if (node.init?.type === 'Identifier')
        aliases.push({ ...ref(node), name: node.id.name, target: node.init.name })
      if (
        node.init?.type === 'ArrowFunctionExpression' &&
        node.init.body.type === 'CallExpression' &&
        node.init.body.callee.type === 'Identifier'
      )
        wrappers.push({ ...ref(node), name: node.id.name, target: node.init.body.callee.name })
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      keyName(node.left.property) === 'prototype' &&
      node.right.type === 'ObjectExpression'
    ) {
      for (const method of node.right.properties) {
        const name = keyName(method.key)
        if (
          method.type === 'Property' &&
          typeof name === 'string' &&
          ['FunctionExpression', 'ArrowFunctionExpression'].includes(method.value.type)
        )
          methods.push({
            ...ref(method),
            owner: keyName(node.left.object),
            name,
            static: false,
            kind: 'prototype-object',
          })
      }
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.init?.type === 'CallExpression'
    ) {
      walk(node.init, (child) => {
        if (
          child.type === 'ObjectExpression' &&
          child.properties.some((p) => keyName(p.key) === '__proto__')
        )
          namespaces.push({
            local: node.id.name,
            ...ref(child),
            members: child.properties
              .filter((p) => p.type === 'Property' && keyName(p.key) !== '__proto__')
              .map((p) => ({ name: keyName(p.key), local: keyName(p.value) })),
          })
      })
    }
    if (scopeLocal && node.type === 'CallExpression' && node.callee.name === scopeLocal) {
      const references = [],
        direct = []
      for (const arg of node.arguments)
        walk(arg, (child) => {
          if (child.type === 'ArrowFunctionExpression' && child.body.type === 'Identifier')
            references.push(child.body.name)
          if (child.type === 'ObjectExpression')
            direct.push(
              ...child.properties.map((p) => keyName(p.key)).filter((n) => typeof n === 'string'),
            )
        })
      if (references.length) evalScopes.push({ ...ref(node), references, direct })
    }
    if (node.type === 'VariableDeclarator' && node.init?.type === 'ObjectExpression') {
      const keys = node.init.properties.map((p) => keyName(p.key))
      if (['add', 'sub', 'mul', 'keepif'].every((k) => keys.includes(k)))
        composers = { names: keys, ...ref(node) }
    }
    if (node.type === 'VariableDeclarator' && node.init?.type === 'ArrayExpression') {
      const names = strings(node.init)
      if (names?.includes('In') && names.includes('Out') && names.includes('Squeeze')) hows = names
    }
    if (node.type === 'CallExpression' && registrationNames.has(node.callee.name)) {
      const kind = registrationNames.get(node.callee.name)
      const first = strings(node.arguments[0])
      const aliasesAt = kind === 'registerMultiControl' ? 2 : 1
      // register's function/options are not aliases; control rest arguments are.
      const aliasArgs =
        kind === 'register' || kind === 'createParam' ? [] : node.arguments.slice(aliasesAt)
      const aliasValues = aliasArgs.map(strings)
      if (!first || !aliasValues.every((x) => x?.length === 1)) {
        unresolved.push({
          ...ref(node),
          kind,
          reason: 'computed registration name/alias',
          expression: source.slice(node.start, Math.min(node.end, node.start + 180)),
        })
        return
      }
      const canonical = first[0]
      const names = kind === 'register' ? first : [canonical, ...aliasValues.flat()]
      const fields = kind === 'register' ? [] : first
      if (kind === 'registerMultiControl') {
        const max = node.arguments[1]?.value
        if (!Number.isSafeInteger(max) || max < 1 || max > 64) {
          unresolved.push({
            ...ref(node),
            kind,
            reason: 'computed/unbounded numbered control count',
          })
          return
        }
        for (let i = 1; i <= max; i++)
          registrations.push({
            ...ref(node),
            kind,
            canonical: i === 1 ? canonical : `${canonical}${i}`,
            names:
              i === 1
                ? [...names, ...names.map((n) => `${n}1`), ...fields.map((n) => `${n}1`)]
                : names.map((n) => `${n}${i}`),
            fields: fields.map((n) => (i === 1 ? n : `${n}${i}`)),
            expanded: true,
          })
      } else registrations.push({ ...ref(node), kind, canonical, names, fields, expanded: false })
    }
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      definitions.push({ ...ref(node), kind: 'class', name: node.id?.name ?? '<anonymous>' })
      for (const method of node.body.body) {
        const name = keyName(method.key)
        if (method.type !== 'MethodDefinition') continue
        if (typeof name === 'string')
          methods.push({
            ...ref(method),
            owner: node.id?.name ?? '<anonymous>',
            name,
            static: method.static,
            kind: method.kind,
          })
        else
          unresolved.push({ ...ref(method), kind: 'class-method', reason: 'computed method key' })
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id)
      definitions.push({ ...ref(node), kind: 'function', name: node.id.name })
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'MemberExpression' &&
      keyName(node.left.object.property) === 'prototype'
    ) {
      const name = node.left.computed
        ? strings(node.left.property)?.[0]
        : keyName(node.left.property)
      if (typeof name === 'string')
        methods.push({
          ...ref(node),
          owner: keyName(node.left.object.object),
          name,
          static: false,
          kind: 'prototype-assignment',
        })
      else
        unresolved.push({
          ...ref(node),
          kind: 'prototype-factory',
          reason: 'computed prototype assignment',
          expression: source.slice(node.start, Math.min(node.end, node.start + 180)),
        })
    }
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      keyName(node.callee.object) === 'Object' &&
      keyName(node.callee.property) === 'defineProperty' &&
      node.arguments[0]?.type === 'MemberExpression' &&
      keyName(node.arguments[0].property) === 'prototype'
    )
      unresolved.push({
        ...ref(node),
        kind: 'prototype-factory',
        reason: 'Object.defineProperty prototype factory',
        expression: source.slice(node.start, Math.min(node.end, node.start + 180)),
      })
  })
  boundedWalk(ast, (node, env) => {
    if (
      node.type !== 'CallExpression' ||
      registrationNames.get(node.callee.name) !== 'registerControl' ||
      node.arguments[0]?.type !== 'TemplateLiteral'
    )
      return
    const names = node.arguments.map((arg) => literal(arg, env))
    if (!names.length || !names.every((x) => typeof x === 'string')) return
    registrations.push({
      ...ref(node),
      kind: 'registerControl',
      canonical: names[0],
      names,
      fields: [names[0]],
      expanded: true,
      expansion: 'bounded-numeric-for',
    })
  })
  if (composers && hows) {
    for (const name of composers.names)
      factories.push({
        path,
        line: composers.line,
        kind: 'composer-matrix',
        canonical: name,
        names: [name],
        methods: [name, '_' + name],
        variants: [...hows.map((h) => h.toLowerCase()), 'squeezein'],
      })
    for (const how of hows)
      factories.push({
        path,
        line: composers.line,
        kind: 'composer-default',
        canonical: how.toLowerCase(),
        names: [how.toLowerCase()],
      })
  }
  return {
    exports,
    registrations,
    methods,
    definitions,
    factories,
    namespaces,
    aliases,
    wrappers,
    evalScopes,
    unresolved,
  }
}

export function callsIn(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true })
  const counts = {}
  const customRegistrations = []
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return
    const name =
      node.callee.type === 'Identifier'
        ? node.callee.name
        : node.callee.type === 'MemberExpression' && !node.callee.computed
          ? keyName(node.callee.property)
          : undefined
    if (!name) return
    counts[name] = (counts[name] ?? 0) + 1
    if (name === 'register')
      customRegistrations.push({
        names: strings(node.arguments[0]) ?? null,
        line: node.loc.start.line,
      })
  })
  return {
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    customRegistrations,
  }
}
