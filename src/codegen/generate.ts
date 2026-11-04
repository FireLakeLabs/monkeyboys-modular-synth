import { packSetup } from '../samples/packs'
import { parse, tokenizer } from 'acorn'
import { planEffects } from './effects'
import { routingPlan } from './routing'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { callMethod, tupleControls, patternNumber, controlEnabled } from '../modules/bindings'
import { loopMethod, loopControls } from '../modules/functions'
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
const roundedNumber = (value: number, precision = 3): string =>
  String(Number(value.toFixed(precision)))
const quote = (value: string): string => JSON.stringify(value)
function product(factors: readonly string[], numeric: (value: number) => string): string {
  const constant = factors
    .filter((factor) => Number.isFinite(Number(factor)))
    .reduce((result, factor) => result * Number(factor), 1)
  const signals = factors.filter((factor) => !Number.isFinite(Number(factor)))
  return signals.length
    ? [...signals, ...(constant === 1 ? [] : [numeric(constant)])].reduce(
        (left, right) => (left ? `${left}.mul(${right})` : right),
        '',
      )
    : numeric(constant)
}
interface CodeExpression extends LayoutExpression {
  inline: boolean
  nodes: string[]
}

const blank = (inline = false): CodeExpression => ({
  text: '',
  owners: [],
  sourceRouting: false,
  mixers: [],
  inline,
  nodes: [],
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
    nodes: node ? [...new Set([...expression.nodes, node.module.id])] : expression.nodes,
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
  functions: Record<string, string>
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
export function generateDocument(
  patch: Patch,
  { nativeEffects = false, prefix }: { nativeEffects?: boolean; prefix?: string } = {},
): GeneratedDocument {
  // A probe represents the accepted source at this point, including imported
  // fractional values. Formatting them for a new rack-owned file would drift.
  const numeric = (value: number, precision = 3): string =>
    prefix ? String(value) : roundedNumber(value, precision)
  const nodes = graph(patch)
  const { inline: inlineEffects } = planEffects(nodes)
  const routing = routingPlan(nodes, patch)
  const functions: GeneratedDocument['functions'] = {}
  const cartridges = packSetup(patch.cartridges ?? [])
  const prelude = patch.prelude ?? ''
  const setup = parseSource(prelude, { lastExpressionIsVoice: false })
  if (setup.scopes.some((scope) => scope.kind !== 'declaration'))
    throw new Error('Rack prelude must contain setup statements only')
  const layout: RackLayout = {
    version: 1,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.cartridges === undefined ? {} : { cartridges: patch.cartridges }),
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
  const used = new Set([
    ...CATALOG.filter((spec) => !['aux', 'duck', 'gates', 'switch'].includes(spec.id)).flatMap(
      (spec) => spec.strudel,
    ),
    'rev',
    'press',
    'orbit',
    'FX',
  ])
  if (patch.modules.some((m) => m.type === 'switch')) used.add('silence')
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
    const jack = node.spec.jacks.find(
      (item) => item.direction === 'in' && !item.cvTarget && !['gate', 'side'].includes(item.id),
    )
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

  function cvSequence(node: Node): string {
    const steps = value(node, 'steps')
    if (!isSteps(steps)) throw new Error('Invalid CV SEQ steps')
    return typeof steps === 'string' ? steps : `<${steps.join(' ')}>`
  }

  function namedOutput(node: Node): boolean {
    if (prefix) return false
    const output = node.spec.jacks.find((j) => j.direction === 'out')
    return (
      output !== undefined &&
      ((node.outputs.get(output.id)?.length ?? 0) >= 2 ||
        (node.outputs.get(output.id) ?? []).some(
          (c) => requireNode(nodes, c.to.module).spec.id === 'switch',
        ) ||
        patch.names[`${node.module.id}:${output.id}`] !== undefined)
    )
  }

  function modulation(
    node: Node,
    id: string,
  ): { text: string; modules?: string[]; paths?: Map<string, string>; sourceRouting?: boolean } {
    const base = number(node, id)
    const jack = node.spec.jacks.find((item) => item.cvTarget === id)
    const cable = jack ? node.inputs.get(jack.id) : undefined
    const source = cable ? requireNode(nodes, cable.from.module) : undefined
    if (
      !source ||
      (jack && routing.audioCV.has(`${node.module.id}:${jack.id}`)) ||
      source.spec.id === 'env' ||
      (source.spec.id === 'lfo' && string(source, 'mode') === 'SMOOTH')
    )
      return { text: node.spec.orderSensitive ? patternNumber(base) : numeric(base) }
    if (source.spec.modSource) {
      const signal = emit(source)[0]
      if (!signal) return { text: numeric(base) }
      const paths = new Map<string, string>()
      function trace(node: Node, path = '') {
        paths.set(node.module.id, path)
        for (const [jack, cable] of node.inputs)
          trace(requireNode(nodes, cable.from.module), `${path}${path ? '/' : ''}${jack}`)
      }
      trace(source)
      return {
        text:
          source.spec.modSource === 'sequence' && !namedOutput(source) && node.spec.id !== 'mix'
            ? quote(cvSequence(source))
            : signal.text,
        paths,
        modules: [...paths.keys()],
      }
    }
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

  function audioModulation(
    expression: CodeExpression,
    node: Node,
    id: string,
    depthScale = '1',
  ): CodeExpression {
    const item = control(node, id)
    if (item.kind !== 'knob' || !item.call || !item.modulation) return expression
    const binding = item.call
    const jack = node.spec.jacks.find((jack) => jack.cvTarget === id)
    const cable = jack && node.inputs.get(jack.id)
    const source = cable && requireNode(nodes, cable.from.module)
    if (!source || !jack) return expression
    const bus = routing.audioCV.get(`${node.module.id}:${jack.id}`)
    if (bus !== undefined) {
      const method = item.modulation.pitch ? 'freq' : callMethod(binding, (id) => string(node, id))
      return append(expression, `.bmod({ b: ${bus}, c: ${quote(method)} })`, node)
    }
    const target = { module: node.module.id, jack: jack.id, control: id }
    const env = source.spec.id === 'env' ? source : undefined
    const smooth = source.spec.id === 'lfo' && string(source, 'mode') === 'SMOOTH'
    const genericEnv =
      env &&
      !binding.envelope &&
      !binding.withEnvelope &&
      !node.spec.controls.some((c) => 'call' in c && c.call?.withEnvelope === jack?.id)
    if (smooth || genericEnv) {
      const depth = source.module.values['depth'] ?? item.modulation.default
      depthScale = product([depthScale, String(item.modulation.audioScale ?? 1)], numeric)
      if (typeof depth !== 'number' || depth < item.modulation.min || depth > item.modulation.max)
        throw new Error(`Modulation depth outside target range: ${node.module.id}.${item.id}`)
      if (item.modulation.pitch) {
        if (smooth) {
          const cps = typeof tempo === 'number' ? tempo / 240 : 0.5
          expression = append(
            expression,
            `.vib(${String(cps / number(source, 'rate'))}).vibmod(${numeric(depth)})`,
            source,
            'cv',
            target,
          )
        } else {
          expression = append(expression, `.penv(${numeric(depth)})`, source, 'cv', target)
          expression = envelope(expression, source, target, 'p')
        }
      } else {
        const method = callMethod(binding, (id) => string(node, id))
        const shape = smooth ? source.spec.smoothShapes?.[string(source, 'shape')] : undefined
        if (smooth && !shape) throw new Error('This waveform requires STEP mode')
        // superdough 1.3.0 derives an inverted clamp for negative depth on gain.
        // A positive magnitude with a downward DC bias keeps the output moving.
        const downward =
          smooth &&
          depth < 0 &&
          !(
            number(node, item.id) >= 30 &&
            ['lpf', 'hpf', 'bpf', 'cutoff', 'hcutoff', 'bandf'].includes(method)
          )
        const config = smooth
          ? `c: ${quote(method)}, sync: ${String(1 / number(source, 'rate'))}, depthabs: ${product([numeric(downward ? -depth : depth), depthScale], numeric)}, dc: ${downward ? -1 : 0}, shape: ${quote(shape ?? 'sine')}, skew: ${numeric(number(source, 'skew'))}`
          : `c: ${quote(method)}, a: ${numeric(number(source, 'atk'))}, d: ${numeric(number(source, 'dec'))}, s: ${numeric(number(source, 'sus'))}, r: ${numeric(number(source, 'rel'))}, depthabs: ${product([numeric(depth), depthScale], numeric)}`
        expression = append(
          expression,
          `.${smooth ? 'lfo' : 'env'}({ ${config} })`,
          source,
          'cv',
          target,
        )
      }
    }
    return expression
  }

  function transform(node: Node, expression: CodeExpression, skipControl?: string): CodeExpression {
    if (!nativeEffects && (inlineEffects.has(node.module.id) || node.module.fx === true)) {
      const stage = transformNative(node, blank(true), skipControl)
      if (!stage.text) return expression
      if (node.spec.strudel.includes('ftype') && string(node, 'type') === '24db')
        throw new Error(
          'Ordered FX cannot isolate 24db filters in this engine; use two 12db VCF stages instead',
        )
      const prefix = expression.text && !expression.inline ? '\n  ' : ''
      const offset = expression.text.length + prefix.length + 4
      const wrapped = append(expression, `.FX(${stage.text.slice(1)})`)
      wrapped.sourceRouting ||= stage.sourceRouting
      wrapped.owners.push(
        ...stage.owners.map((owner) => ({
          ...owner,
          start: offset + owner.start,
          end: offset + owner.end,
          fx: 0,
        })),
      )
      return wrapped
    }
    return transformNative(node, expression, skipControl)
  }

  function transformNative(
    node: Node,
    expression: CodeExpression,
    skipControl?: string,
  ): CodeExpression {
    if (node.spec.id === 'code') {
      const text = string(node, 'text')
      if (!chainedCode(text)) throw new Error('Chained CODE must start with a dot')
      // Opaque CODE may end in a line comment; keep separators around it.
      expression = append({ ...expression, inline: false }, text, node)
      expression.sourceRouting ||= syntax(expression.text).hasOrbit
      return expression
    }
    if (node.spec.id === 'duck')
      return { ...expression, nodes: [...expression.nodes, node.module.id] }
    const s = (id: string) => string(node, id)
    const method = loopMethod(node.spec, node.module)
    if (method) {
      const args = loopControls(node.spec, method).map((id) => patternNumber(number(node, id)))
      const returned = node.inputs.get('return')
      let body = blank(true)
      const parameter = node.module.functionParameter ?? 'x'
      body.text = parameter
      function walk(cable: typeof returned): CodeExpression | undefined {
        if (!cable) return undefined
        if (cable.from.module === node.module.id && cable.from.jack === 'send') return body
        const child = requireNode(nodes, cable.from.module)
        const upstream = walk(child.inputs.get('in'))
        return upstream && transform(child, upstream)
      }
      const transformed = returned ? walk(returned) : undefined
      const preset =
        node.spec.id === 'jux'
          ? node.spec.controls.flatMap((c) =>
              'call' in c && c.call?.argument.kind === 'transform'
                ? [c.call.argument.expressions[s(c.id)]]
                : [],
            )[0]
          : node.spec.functionLoop?.preset
      const hasBody = transformed && returned && returned.from.jack !== 'send'
      const callback = hasBody
        ? `${parameter} => ${transformed.text}${transformed.inline ? '' : '\n'}`
        : preset
      if (!callback) throw new Error('Missing function preset')
      functions[node.module.id] = callback
      const prefix = `.${method}(${args.length ? args.join(', ') + ', ' : ''}`
      expression = append(expression, `${prefix}${callback})`, node)
      if (hasBody) {
        const owner = expression.owners.at(-1)
        if (!owner) throw new Error('Missing function owner')
        const offset = owner.start + prefix.length + parameter.length + 4
        expression.owners.push(
          ...transformed.owners.map((o) => ({
            ...o,
            start: offset + o.start,
            end: offset + o.end,
          })),
        )
        expression.sourceRouting ||= transformed.sourceRouting
      }
      return expression
    }
    const controls = node.spec.controls.filter((item) => 'call' in item && item.call)
    if (!controls.length) throw new Error(`Not a chain module: ${node.spec.id}`)
    for (const item of controls) {
      if (!('call' in item) || !item.call) continue
      if (item.id === skipControl) continue
      const binding = item.call
      if (binding.when && s(binding.when.control) !== binding.when.value) continue
      const patched = node.spec.jacks.some(
        (jack) => jack.cvTarget === item.id && node.inputs.has(jack.id),
      )
      if (
        !controlEnabled(node.spec, node.module.values, item) ||
        (!patched && omitted(node, item.id)) ||
        (binding.enabledBy && omitted(node, binding.enabledBy))
      )
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
        case 'array':
          argument = JSON.stringify(value(node, item.id))
          break
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
          if (binding.argument.optional && s(binding.argument.optional) === 'none') {
            argument = ''
            break
          }
          mod = modulation(node, item.id)
          argument =
            binding.argument.precision === undefined || mod.modules
              ? mod.text
              : numeric(number(node, item.id), binding.argument.precision)
          break
        case 'string':
          argument = quote(s(item.id))
          break
        case 'scale':
          argument = quote(`${s(binding.argument.root)}:${s(item.id).replaceAll(' ', ':')}`)
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
          expression.owners.push({
            ...targetOwner,
            module,
            role: 'cv',
            target: {
              ...target,
              ...(mod?.paths?.get(module) ? { path: mod.paths.get(module) ?? '' } : {}),
            },
          })
      }
      expression = audioModulation(expression, node, item.id)
      if (binding.envelope === 'after' && env)
        expression = envelope(
          expression,
          env,
          target,
          typeof binding.method === 'string' ? '' : s(binding.method.control),
        )
    }
    const operator = node.inputs.get('fm')
    if (operator) expression = transform(requireNode(nodes, operator.from.module), expression)
    return expression
  }

  function raw(node: Node): CodeExpression[] {
    if (node.spec.soundSource && !input(node)) {
      const selector = node.spec.soundSource
      return [
        transform(node, append(blank(), `s(${quote(string(node, selector))})`, node), selector),
      ]
    }
    if (node.spec.source) {
      const { method, control, suffix } = node.spec.source
      let expression = append(blank(), `${method}(${quote(string(node, control))})`, node)
      for (const method of suffix) expression = append(expression, `.${method}()`, node)
      return [expression]
    }
    switch (node.spec.id) {
      case 'gates': {
        const steps = value(node, 'steps')
        if (!isSteps(steps)) throw new Error('Invalid GATES steps')
        const text = typeof steps === 'string' ? steps : steps.join(' ')
        const literal = quote(text).slice(1, -1).replaceAll("'", "\\'")
        return [append(blank(true), `mini('${literal}')`, node)]
      }
      case 'aux': {
        const bus = routing.buses.get(`aux:${node.module.id}`)
        return bus === undefined ? [] : [append(blank(), `s("bus").n(${bus})`, node)]
      }
      case 'switch': {
        const steps = value(node, 'steps')
        if (!isSteps(steps)) throw new Error('Invalid SWITCH selection')
        const selection = typeof steps === 'string' ? steps : `<${steps.join(' ')}>`
        let expression = append(blank(), `${quote(selection)}.pick([`, node)
        for (let i = 1; i <= 4; i++) {
          const cable = node.inputs.get(`in${i}`)
          const arms = cable ? emit(requireNode(nodes, cable.from.module)) : []
          if (arms.length > 1 || arms.some((a) => a.mixers.length))
            throw new Error('SWITCH inputs require a single pattern')
          const arm = arms[0] ?? { ...blank(), text: 'silence' }
          const offset = expression.text.length + (i > 1 ? 2 : 0)
          expression.text += `${i > 1 ? ', ' : ''}${arm.text}`
          expression.nodes.push(...arm.nodes)
          expression.owners.push(
            ...arm.owners.map((o) => ({ ...o, start: offset + o.start, end: offset + o.end })),
          )
          expression.sourceRouting ||= arm.sourceRouting
        }
        expression.text += '])'
        return [expression]
      }
      case 'env':
        throw new Error('ENV has no standalone expression')
      case 'cvseq': {
        // Double-quoted strings are already mini-notation in the REPL. Keep this
        // explicit parser argument a plain JS string to avoid parsing a Pattern.
        const literal = quote(cvSequence(node)).slice(1, -1)
        return [append(blank(true), `mini('${literal}')`, node)]
      }
      case 'samplehold':
      case 'attenuverter':
      case 'modmix': {
        const upstream = input(node)
        if (!upstream) return []
        let expression = emit(upstream)[0]
        if (!expression) return []
        expression = { ...expression, inline: true }
        if (node.spec.modSource === 'sampleHold')
          expression = append(expression, `.segment(${numeric(number(node, 'rate'))})`, node)
        else if (node.spec.modSource === 'attenuverter') {
          const low = number(node, 'min'),
            high = number(node, 'max')
          if (string(node, 'scale') === 'EXP' && (low <= 0 || high <= 0))
            throw new Error('Exponential range requires positive endpoints')
          expression = append(
            expression,
            `.mul(${numeric(number(node, 'amount'))}).${string(node, 'scale') === 'EXP' ? 'rangex' : 'range'}(${numeric(low)}, ${numeric(high)})`,
            node,
          )
        } else {
          const cable = node.inputs.get('in2')
          const other = cable && requireNode(nodes, cable.from.module)
          const second = other && emit(other)[0]
          if (!second) return []
          const additionStart = expression.text.length
          expression = append(expression, `.add(${second.text})`, node)
          const end = expression.text.length
          expression.owners.push(
            ...second.owners.map((owner) => ({ ...owner, start: additionStart, end })),
          )
        }
        return [expression]
      }
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
        const gate = node.inputs.get('gate')
        if (gate) {
          const gates = requireNode(nodes, gate.from.module)
          const steps = value(gates, 'steps')
          if (!isSteps(steps)) throw new Error('Invalid GATES steps')
          const pattern = namedOutput(gates) ? emit(gates)[0]?.text : undefined
          expression = append(
            expression,
            `.struct(${pattern ?? quote(typeof steps === 'string' ? steps : steps.join(' '))})`,
            gates,
          )
        }
        return [transform(node, expression)]
      }
      case 'drums': {
        const rows = value(node, 'grid')
        if (!isGrid(rows)) throw new Error('Invalid DRUMS grid')
        const text = typeof rows === 'string' ? rows : drumText(rows)
        let expression = append(blank(), `s(${quote(text)})`, node)
        if (!omitted(node, 'drop'))
          expression = append(expression, `.degradeBy(${numeric(number(node, 'drop'))})`, node)
        return [transform(node, expression)]
      }
      case 'mix':
        return node.spec.jacks.flatMap((jack) => {
          if (jack.direction !== 'in' || jack.cvTarget) return []
          const cable = node.inputs.get(jack.id)
          if (!cable) return []
          const channel = jack.label
          const mod = modulation(node, `ch${channel}`)
          return emit(requireNode(nodes, cable.from.module)).map((expression) => ({
            ...expression,
            sourceRouting: expression.sourceRouting || (mod.sourceRouting ?? false),
            mixers: [
              ...expression.mixers,
              {
                module: node.module.id,
                control: `ch${channel}`,
                gain: mod.text,
                cvModules: mod.modules ?? [],
                cvPaths: mod.paths ?? new Map(),
                mute: string(node, `mute${channel}`) === 'on',
                solo: string(node, `solo${channel}`) === 'on',
                name: string(node, `name${channel}`),
                channels: string(node, `channels${channel}`),
              },
            ],
          }))
        })
      default: {
        if (node.spec.id === 'osc' && string(node, 'mode') === 'freq' && !input(node)) {
          const expression = append(blank(), `freq(${numeric(number(node, 'freq'))})`, node)
          return [transform(node, expression, 'freq')]
        }
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
    if (!output || !namedOutput(node)) return raw(node)
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
      nodes: definition.expressions[i]?.nodes ?? [],
      sourceRouting: definition.expressions[i]?.sourceRouting ?? false,
      mixers: definition.expressions[i]?.mixers ?? [],
    }))
  }

  // Probe callers validate and prune the graph first. No setup, tempo, final
  // routing or downstream transforms belong to an intermediate cable.
  if (prefix) {
    const expressions = emit(requireNode(nodes, prefix))
    if (expressions.length !== 1) throw new Error('Probe needs one readable chain')
    return { code: expressions[0]?.text ?? '', ranges: {}, layout, functions }
  }
  const source = out ? input(out) : undefined
  const audible = source ? emit(source) : []
  const sends = routing.sends.flatMap(({ node, bus }) =>
    emit(node).map((expression) =>
      append(append(expression, `.bus(${bus})`), '.dry(0).delay(0).room(0)'),
    ),
  )
  const sides = routing.ducks.map((duck) => {
    const side = duck.inputs.get('side')
    return { duck, expressions: side ? emit(requireNode(nodes, side.from.module)) : [] }
  })
  // Allocate final audible orbits first; DUCK references the actual destination voice,
  // including nested mixer fan-out. Private send/trigger voices follow those slots.
  const reserved = new Set(
    [
      ...audible,
      ...sends,
      ...sides.flatMap((s) => s.expressions),
      ...[...definitions.values()].flatMap((d) => d.expressions),
    ].flatMap((e) => syntax(e.text).orbitNumbers),
  )
  let nextAllocated = 1
  const orbits = audible.map((e) => {
    if (e.sourceRouting || syntax(e.text).hasOrbit) return undefined
    while (reserved.has(nextAllocated)) nextAllocated++
    return nextAllocated++
  })
  const triggers = sides.flatMap(({ duck, expressions }) => {
    const targets = audible.flatMap((e, i) => (e.nodes.includes(duck.module.id) ? [orbits[i]] : []))
    if (targets.some((n) => n === undefined))
      throw new Error('DUCK cannot target source-owned orbit routing')
    const targetOrbits = targets.filter((n): n is number => n !== undefined)
    if (!targetOrbits.length) {
      if (sends.some((e) => e.nodes.includes(duck.module.id)))
        throw new Error('DUCK requires an audible channel; AUX/CV sends tap before orbit ducking')
      return []
    }
    return expressions.map((e) =>
      append(
        append(
          e,
          `.duck(${targetOrbits.length === 1 ? targetOrbits[0] : quote(targetOrbits.join(':'))}).duckattack(${numeric(number(duck, 'attack'))}).duckdepth(${numeric(number(duck, 'depth'))})`,
          duck,
        ),
        '.dry(0).delay(0).room(0)',
      ),
    )
  })
  const voices = [...audible, ...sends, ...triggers]
  const lines: string[] = cartridges ? [cartridges.trimEnd()] : []
  if (prelude) lines.push(`${prelude}\n`)
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
  const labels = new Set<string>()
  function allocateLabel(wanted: string): string {
    let label = wanted
    let index = 2
    while (labels.has(label)) label = `${wanted}${index++}`
    labels.add(label)
    return label
  }
  const soloing = voices.some(
    (voice) =>
      !voice.mixers.some((mixer) => mixer.mute) && voice.mixers.some((mixer) => mixer.solo),
  )
  voices.forEach((original, index) => {
    const factors = original.mixers.map((mixer) => mixer.gain)
    const gain = product(factors, numeric)
    let voice = original
    if (
      gain !== '1' ||
      original.mixers.some((mixer) => {
        const node = requireNode(nodes, mixer.module)
        const jack = node.spec.jacks.find((j) => j.cvTarget === mixer.control)
        return jack && node.inputs.has(jack.id)
      })
    ) {
      voice = append(voice, `.postgain(${gain})`)
      const start = voice.text.lastIndexOf('.postgain(')
      for (const mixer of original.mixers) {
        voice.owners.push({ module: mixer.module, role: 'mixer', start, end: voice.text.length })
        const jack = getModuleSpec('mix').jacks.find((jack) => jack.cvTarget === mixer.control)
        for (const module of mixer.cvModules) {
          if (!jack) throw new Error('Missing mixer CV jack')
          voice.owners.push({
            module,
            role: 'cv',
            target: {
              module: mixer.module,
              jack: jack.id,
              control: mixer.control,
              ...(mixer.cvPaths.get(module) ? { path: mixer.cvPaths.get(module) ?? '' } : {}),
            },
            start,
            end: voice.text.length,
          })
        }
      }
    }
    for (const [index, mixer] of original.mixers.entries())
      voice = audioModulation(
        voice,
        requireNode(nodes, mixer.module),
        mixer.control,
        product(
          factors.filter((_factor, i) => i !== index),
          numeric,
        ),
      )
    const channels = original.mixers.findLast((mixer) => mixer.channels !== '1:2')?.channels
    if (channels) {
      voice = append(voice, `.channels(${quote(channels)})`)
      const mixer = original.mixers.findLast((mixer) => mixer.channels !== '1:2')
      if (mixer)
        voice.owners.push({
          module: mixer.module,
          role: 'mixer',
          start: voice.text.lastIndexOf('.channels('),
          end: voice.text.length,
        })
    }
    // Opaque routing is source-owned even when its argument happens to be an integer.
    const importedRouting = voice.sourceRouting || syntax(voice.text).hasOrbit
    while (reservedOrbits.has(nextOrbit)) nextOrbit++
    const orbit = importedRouting ? undefined : nextOrbit++
    const expression = orbit === undefined ? voice : append(voice, `.orbit(${orbit})`)
    bindScope(layout, expression, undefined, orbit)
    const mute = original.mixers.some((mixer) => mixer.mute)
    // Private pre-mixer dependencies must survive the REPL's global solo filter.
    const solo = original.mixers.some((mixer) => mixer.solo) || (index >= audible.length && soloing)
    const name = original.mixers.findLast((mixer) => mixer.name)?.name
    const label = `${mute ? '_' : ''}${solo ? 'S' : ''}${name ? allocateLabel(name) : '$'}`
    write(expression, `${label}: `)
  })
  const body = `${lines.join('\n')}\n`
  parse(body, { ecmaVersion: 'latest' })
  return { code: `${body}${writeLayout(layout)}`, ranges, layout, functions }
}
