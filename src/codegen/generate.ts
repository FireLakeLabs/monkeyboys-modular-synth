import { parse, tokenizer } from 'acorn'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { callMethod, tupleControls, patternNumber } from '../modules/bindings'
import { drumText } from '../patch/notation'
import type { Patch } from '../patch/types'
import type { SourceDocument } from '../reader/types'
import { parseSource } from '../reader/syntax'
import {
  control,
  graph,
  isSteps,
  isGrid,
  number,
  requireNode,
  string,
  value,
  type Node,
} from './graph'
import {
  bindScope,
  syntax,
  writeLayout,
  type CodeExpression as LayoutExpression,
  type Owner,
  type RackLayout,
} from './layout'

const chainedCode = (text: string): boolean =>
  tokenizer(text, { ecmaVersion: 'latest' }).getToken().type.label === '.'
const numeric = (value: number): string => String(Number(value.toFixed(3)))
const quote = (value: string): string => JSON.stringify(value)
interface CodeExpression extends LayoutExpression {
  inline: boolean
}

const blank = (inline = false): CodeExpression => ({
  text: '',
  owners: [],
  sourceRouting: false,
  mixers: [],
  inline,
})

function append(
  expression: CodeExpression,
  text: string,
  node?: Node,
  role: Owner['role'] = 'module',
  target?: Owner['target'],
): CodeExpression {
  if (!text) return expression
  const prefix = expression.text && !expression.inline ? '\n  ' : ''
  const start = expression.text.length + prefix.length
  return {
    text: expression.text + prefix + text,
    inline: expression.inline,
    sourceRouting: expression.sourceRouting,
    mixers: expression.mixers,
    owners: [
      ...expression.owners,
      ...(node
        ? [
            {
              module: node.module.id,
              role,
              start,
              end: start + text.length,
              ...(target === undefined ? {} : { target }),
            },
          ]
        : []),
    ],
  }
}

function omitted(node: Node, id: string): boolean {
  const item = control(node, id)
  return 'omitAt' in item && value(node, id) === item.omitAt
}

/** Generate new rack-owned code. Imported documents must use source-preserving edits (#6). */
export interface GeneratedDocument {
  code: string
  ranges: Record<string, { start: number; end: number }[]>
  layout: RackLayout
}

export function generate(patch: Patch | SourceDocument): string {
  if ('kind' in patch) {
    if (JSON.stringify(patch.patch) !== patch.patchRevision)
      throw new Error('Imported patch changed outside a source-aware edit')
    return patch.source
  }
  return generateDocument(patch).code
}

/** Source ownership for selection, captured while writing this exact revision. */
export function generateDocument(patch: Patch): GeneratedDocument {
  const nodes = graph(patch)
  const prelude = patch.prelude ?? ''
  const setup = parseSource(prelude, { lastExpressionIsVoice: false })
  if (setup.scopes.some((scope) => scope.kind !== 'declaration'))
    throw new Error('Rack prelude must contain setup statements only')
  const layout: RackLayout = {
    version: 1,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    scopes: setup.scopes.map((scope) => scope.descriptor),
    ...(patch.prelude === undefined ? {} : { prelude }),
    modules: patch.modules.map((module) => ({ ...module, bindings: [] })),
    cables: patch.cables,
    names: { ...patch.names },
    ...(patch.rows === undefined ? {} : { rows: patch.rows }),
    ...(patch.railHp === undefined ? {} : { railHp: patch.railHp }),
  }
  const out = [...nodes.values()].find((node) => node.spec.id === 'out')
  const tempo = out
    ? number(out, 'bpm')
    : getModuleSpec('out').controls.find((item) => item.id === 'bpm')?.default
  if (typeof tempo !== 'number') throw new Error('Missing catalog tempo')
  const tempoExpression = append(blank(), `setcpm(${numeric(tempo)}/4)`, out, 'tempo')
  bindScope(layout, tempoExpression)

  // Reserving runtime names prevents a const from shadowing Strudel's functions/signals.
  const used = new Set([...CATALOG.flatMap((spec) => spec.strudel), 'rev', 'press', 'orbit'])
  for (const token of tokenizer(prelude, { ecmaVersion: 'latest' }))
    if (token.type.label === 'name') used.add(prelude.slice(token.start, token.end))
  for (const [key, name] of Object.entries(patch.names)) {
    const [moduleId, jackId, extra] = key.split(':')
    const node = moduleId ? nodes.get(moduleId) : undefined
    if (
      extra !== undefined ||
      !node?.spec.jacks.some((jack) => jack.id === jackId && jack.direction === 'out')
    )
      throw new Error(`Invalid named output: ${key}`)
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || used.has(name))
      throw new Error(`Invalid or colliding output name: ${name}`)
    parse(`const ${name} = 0`, { ecmaVersion: 'latest', sourceType: 'module' })
    used.add(name)
  }
  const definitions = new Map<
    string,
    { expressions: CodeExpression[]; names: string[]; dependencies: Set<string> }
  >()
  const activeDefinitions: string[] = []

  function allocate(wanted: string): string {
    let name = wanted.replace(/[^\w$]/g, '_')
    if (!/^[A-Za-z_$]/.test(name)) name = `mb_${name}`
    const base = name
    let suffix = 2
    while (used.has(name)) name = `${base}_${suffix++}`
    used.add(name)
    return name
  }

  function input(node: Node): Node | undefined {
    const jack = node.spec.jacks.find((item) => item.direction === 'in' && !item.cvTarget)
    const cable = jack ? node.inputs.get(jack.id) : undefined
    return cable ? requireNode(nodes, cable.from.module) : undefined
  }

  function envelope(
    expression: CodeExpression,
    env: Node,
    target: Owner['target'],
    prefix = '',
  ): CodeExpression {
    for (const [id, method] of [
      ['atk', 'attack'],
      ['dec', 'decay'],
      ['sus', 'sustain'],
      ['rel', 'release'],
    ]) {
      if (id && method)
        expression = append(
          expression,
          `.${prefix}${method}(${numeric(number(env, id))})`,
          env,
          'cv',
          target,
        )
    }
    return expression
  }

  function modulation(
    node: Node,
    id: string,
  ): { text: string; modules?: string[]; sourceRouting?: boolean } {
    const base = number(node, id)
    const jack = node.spec.jacks.find((item) => item.cvTarget === id)
    const cable = jack ? node.inputs.get(jack.id) : undefined
    const source = cable ? requireNode(nodes, cable.from.module) : undefined
    if (!source || source.spec.id === 'env')
      return { text: node.spec.orderSensitive ? patternNumber(base) : numeric(base) }
    // LFO may travel through Alien/CODE transformations before reaching CV.
    let lfo: Node | undefined = source
    while (lfo && lfo.spec.id !== 'lfo') lfo = input(lfo)
    const target = control(node, id)
    if (target.kind !== 'knob' || !target.modulation)
      throw new Error('Missing modulation target data')
    const depth = lfo?.module.values['depth'] ?? target.modulation.default
    if (typeof depth !== 'number' || depth < target.modulation.min || depth > target.modulation.max)
      throw new Error(`LFO depth outside target range: ${node.module.id}.${id}`)
    const expressions = emit(source)
    const signal = expressions[0]
    if (expressions.length !== 1 || !signal)
      throw new Error('CV requires one modulation expression')
    return {
      text: append(signal, `.range(${numeric(base)}, ${numeric(base + depth)})`).text,
      modules: [
        ...new Set([
          ...signal.owners.map((owner) => owner.module),
          ...(lfo ? [lfo.module.id] : []),
          source.module.id,
        ]),
      ],
      sourceRouting: signal.sourceRouting,
    }
  }

  function transform(node: Node, expression: CodeExpression): CodeExpression {
    if (node.spec.id === 'code') {
      const text = string(node, 'text')
      if (!chainedCode(text)) throw new Error('Chained CODE must start with a dot')
      // Opaque CODE may end in a line comment; keep separators around it.
      expression = append({ ...expression, inline: false }, text, node)
      expression.sourceRouting ||= syntax(expression.text).hasOrbit
      return expression
    }
    const s = (id: string) => string(node, id)
    const controls = node.spec.controls.filter((item) => 'call' in item && item.call)
    if (!controls.length) throw new Error(`Not a chain module: ${node.spec.id}`)
    for (const item of controls) {
      if (!('call' in item) || !item.call) continue
      const binding = item.call
      if (binding.when && s(binding.when.control) !== binding.when.value) continue
      if (omitted(node, item.id) || (binding.enabledBy && omitted(node, binding.enabledBy)))
        continue
      const jack = node.spec.jacks.find((jack) =>
        binding.withEnvelope ? jack.id === binding.withEnvelope : jack.cvTarget === item.id,
      )
      const cv = jack ? node.inputs.get(jack.id) : undefined
      const source = cv ? requireNode(nodes, cv.from.module) : undefined
      const env = source?.spec.id === 'env' ? source : undefined
      if (binding.withEnvelope && !env) continue
      const target = jack?.cvTarget
        ? { module: node.module.id, jack: jack.id, control: jack.cvTarget }
        : undefined
      if (binding.envelope === 'before' && env) expression = envelope(expression, env, target)
      let argument: string
      let mod: ReturnType<typeof modulation> | undefined
      switch (binding.argument.kind) {
        case 'tuple':
          argument = tupleControls(binding, callMethod(binding, s))
            .map((id) => {
              const candidate = value(node, id)
              if (typeof candidate === 'number') return patternNumber(candidate)
              if (typeof candidate === 'string') return quote(candidate)
              throw new Error('Tuple arguments require scalar controls')
            })
            .join(', ')
          break
        case 'number':
          mod = modulation(node, item.id)
          argument = mod.text
          break
        case 'string':
          argument = quote(s(item.id))
          break
        case 'scale':
          argument = quote(`${s(binding.argument.root)}:${s(item.id)}`)
          break
        case 'transform': {
          const transform = binding.argument.expressions[s(item.id)]
          if (!transform) throw new Error('Unknown transform')
          argument = transform
          break
        }
      }
      expression = append(expression, `.${callMethod(binding, s)}(${argument})`, node)
      expression.sourceRouting ||= mod?.sourceRouting ?? false
      const targetOwner = expression.owners.at(-1)
      if (targetOwner && target) {
        for (const module of mod?.modules ?? [])
          expression.owners.push({ ...targetOwner, module, role: 'cv', target })
      }
      if (binding.envelope === 'after' && env)
        expression = envelope(
          expression,
          env,
          target,
          typeof binding.method === 'string' ? '' : s(binding.method.control),
        )
    }
    return expression
  }

  function raw(node: Node): CodeExpression[] {
    if (node.spec.source) {
      const { method, control, suffix } = node.spec.source
      let expression = append(blank(), `${method}(${quote(string(node, control))})`, node)
      for (const method of suffix) expression = append(expression, `.${method}()`, node)
      return [expression]
    }
    switch (node.spec.id) {
      case 'env':
        throw new Error('ENV has no standalone expression')
      case 'lfo': {
        let expression = append(blank(true), string(node, 'shape'), node)
        const rate = number(node, 'rate')
        if (rate !== 1)
          expression = append(
            expression,
            `.${rate < 1 ? 'fast' : 'slow'}(${numeric(rate < 1 ? 1 / rate : rate)})`,
            node,
          )
        return [expression]
      }
      case 'seq': {
        const steps = value(node, 'steps')
        if (!isSteps(steps)) throw new Error('Invalid SEQ steps')
        const text =
          typeof steps === 'string' ? steps : steps.slice(0, number(node, 'len')).join(' ')
        let expression = append(
          blank(),
          `${string(node, 'mode') === 'note' ? 'note' : 'n'}(${quote(text)})`,
          node,
        )
        if (!omitted(node, 'rate'))
          expression = append(expression, `.fast(${numeric(number(node, 'rate'))})`, node)
        return [expression]
      }
      case 'drums': {
        const rows = value(node, 'grid')
        if (!isGrid(rows)) throw new Error('Invalid DRUMS grid')
        const text = typeof rows === 'string' ? rows : drumText(rows)
        let expression = append(blank(), `s(${quote(text)})`, node)
        if (!omitted(node, 'drop'))
          expression = append(expression, `.degradeBy(${numeric(number(node, 'drop'))})`, node)
        return [expression]
      }
      case 'mix':
        return node.spec.jacks.flatMap((jack) => {
          if (jack.direction !== 'in') return []
          const cable = node.inputs.get(jack.id)
          if (!cable) return []
          return emit(requireNode(nodes, cable.from.module)).map((expression) => ({
            ...expression,
            mixers: [
              ...expression.mixers,
              { module: node.module.id, gain: number(node, `ch${jack.label}`) },
            ],
          }))
        })
      default: {
        const upstream = input(node)
        if (upstream) return emit(upstream).map((expression) => transform(node, expression))
        if (node.spec.id === 'code') {
          const text = string(node, 'text')
          // A chained fragment with no receiver is an incomplete, silent path.
          if (chainedCode(text)) return []
          syntax(text)
          // Preserve the exact source inside parentheses, including terminal line comments.
          return [{ ...append(blank(), `(${text}\n)`, node), sourceRouting: syntax(text).hasOrbit }]
        }
        return []
      }
    }
  }

  function emit(node: Node): CodeExpression[] {
    const output = node.spec.jacks.find((jack) => jack.direction === 'out')
    const key = `${node.module.id}:${output?.id ?? ''}`
    if (!output || ((node.outputs.get(output.id)?.length ?? 0) < 2 && !patch.names[key]))
      return raw(node)
    const parent = activeDefinitions.at(-1)
    let definition = definitions.get(key)
    if (!definition) {
      definition = { expressions: [], names: [], dependencies: new Set() }
      definitions.set(key, definition)
      activeDefinitions.push(key)
      definition.expressions = raw(node)
      activeDefinitions.pop()
      const preferred = patch.names[key]
      const base = preferred ?? allocate(`mb_${node.module.id}`)
      layout.names[key] = base
      const count = definition.expressions.length
      definition.names = definition.expressions.map((_, i) =>
        count === 1 ? base : allocate(`${base}_${i + 1}`),
      )
    }
    if (parent) definitions.get(parent)?.dependencies.add(key)
    return definition.names.map((name, i) => ({
      text: name,
      inline: definition.expressions[i]?.inline ?? false,
      owners: [],
      sourceRouting: definition.expressions[i]?.sourceRouting ?? false,
      mixers: definition.expressions[i]?.mixers ?? [],
    }))
  }

  const source = out ? input(out) : undefined
  const voices = source ? emit(source) : []
  const lines: string[] = prelude ? [`${prelude}\n`] : []
  const ranges: GeneratedDocument['ranges'] = {}
  function write(expression: CodeExpression, prefix = '') {
    const offset = lines.join('\n').length + (lines.length ? 1 : 0) + prefix.length
    for (const owner of expression.owners) {
      ;(ranges[owner.module] ??= []).push({
        start: offset + owner.start,
        end: offset + owner.end,
      })
    }
    lines.push(`${prefix}${expression.text}\n`)
  }
  write(tempoExpression)
  const written = new Set<string>()
  function writeDefinition(key: string): void {
    if (written.has(key)) return
    const definition = definitions.get(key)
    if (!definition) throw new Error('Missing named output')
    for (const dependency of definition.dependencies) writeDefinition(dependency)
    definition.expressions.forEach((expression, i) => {
      const name = definition.names[i]
      if (!name) throw new Error('Missing declaration name')
      bindScope(layout, expression, name)
      write(expression, `const ${name} = `)
    })
    written.add(key)
  }
  for (const node of nodes.values()) {
    for (const jack of node.spec.jacks.filter((item) => item.direction === 'out')) {
      const key = `${node.module.id}:${jack.id}`
      if (definitions.has(key)) writeDefinition(key)
    }
  }
  const reservedOrbits = new Set(
    [
      ...voices,
      ...[...definitions.values()].flatMap((definition) => definition.expressions),
    ].flatMap((expression) => syntax(expression.text).orbitNumbers),
  )
  let nextOrbit = 1
  voices.forEach((original) => {
    const gain = original.mixers.reduce((total, mixer) => total * mixer.gain, 1)
    let voice = original
    if (gain !== 1) {
      voice = append(voice, `.postgain(${numeric(gain)})`)
      const start = voice.text.lastIndexOf('.postgain(')
      for (const mixer of original.mixers)
        voice.owners.push({ module: mixer.module, role: 'mixer', start, end: voice.text.length })
    }
    // Opaque routing is source-owned even when its argument happens to be an integer.
    const importedRouting = voice.sourceRouting || syntax(voice.text).hasOrbit
    while (reservedOrbits.has(nextOrbit)) nextOrbit++
    const orbit = importedRouting ? undefined : nextOrbit++
    const expression = orbit === undefined ? voice : append(voice, `.orbit(${orbit})`)
    bindScope(layout, expression, undefined, orbit)
    write(expression, '$: ')
  })
  const body = `${lines.join('\n')}\n`
  parse(body, { ecmaVersion: 'latest' })
  return { code: `${body}${writeLayout(layout)}`, ranges, layout }
}
