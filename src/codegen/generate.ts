import { parse } from 'acorn'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import type { GridRow } from '../modules/types'
import type { Patch } from '../patch/types'
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
  type CodeExpression,
  type Owner,
  type RackLayout,
} from './layout'

const numeric = (value: number): string => String(Number(value.toFixed(3)))
const quote = (value: string): string => JSON.stringify(value)
const blank = (): CodeExpression => ({ text: '', owners: [], sourceRouting: false, mixers: [] })

function append(
  expression: CodeExpression,
  text: string,
  node?: Node,
  role: Owner['role'] = 'module',
  target?: Owner['target'],
): CodeExpression {
  if (!text) return expression
  const prefix = expression.text ? '\n  ' : ''
  const start = expression.text.length + prefix.length
  return {
    text: expression.text + prefix + text,
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

function grid(rows: readonly GridRow[]): string {
  return (
    rows
      .flatMap(({ sample, steps }) => {
        if (!steps.includes(1)) return []
        if (steps.every((step) => step === 1)) return `${sample}*${steps.length}`
        let period = steps.length
        for (let p = 1; p < steps.length; p++) {
          if (steps.length % p === 0 && steps.every((step, i) => step === steps[i % p])) {
            period = p
            break
          }
        }
        const tokens = steps
          .slice(0, period)
          .map((step) => (step ? sample : '~'))
          .join(' ')
        return period === steps.length ? tokens : `[${tokens}]*${steps.length / period}`
      })
      .join(', ') || '~'
  )
}

function omitted(node: Node, id: string): boolean {
  const item = control(node, id)
  return item.kind === 'knob' && value(node, id) === item.omitAt
}

/** Generate new rack-owned code. Imported documents must use source-preserving edits (#6). */
export function generate(patch: Patch): string {
  const nodes = graph(patch)
  const layout: RackLayout = {
    version: 1,
    scopes: [],
    modules: patch.modules.map((module) => ({ ...module, bindings: [] })),
    cables: patch.cables,
    names: { ...patch.names },
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
    target: Node,
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
          {
            module: target.module.id,
            jack: 'cv',
            control: target.spec.id === 'vcf' ? 'cutoff' : 'level',
          },
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
    if (!source || source.spec.id === 'env') return { text: numeric(base) }
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
      text: `${signal.text}.range(${numeric(base)}, ${numeric(base + depth)})`,
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
    const n = (id: string) => numeric(number(node, id))
    const s = (id: string) => string(node, id)
    const call = (method: string, arg: string) => {
      expression = append(expression, `.${method}(${arg})`, node)
    }
    switch (node.spec.id) {
      case 'quant':
        call('scale', quote(`${s('root')}:${s('scale')}`))
        break
      case 'osc':
        call('s', quote(s('wave')))
        if (!omitted(node, 'tune')) call('transpose', n('tune'))
        break
      case 'smpl':
        if (s('bank')) call('bank', quote(s('bank')))
        if (!omitted(node, 'speed')) call('speed', n('speed'))
        break
      case 'vcf':
      case 'vca': {
        const isFilter = node.spec.id === 'vcf'
        const prefix = isFilter ? s('mode') : ''
        const id = isFilter ? 'cutoff' : 'level'
        const cv = node.inputs.get('cv')
        const env = cv ? requireNode(nodes, cv.from.module) : undefined
        if (!isFilter && env?.spec.id === 'env') expression = envelope(expression, env, node)
        const mod = modulation(node, id)
        call(isFilter ? `${prefix}f` : 'gain', mod.text)
        expression.sourceRouting ||= mod.sourceRouting ?? false
        const targetOwner = expression.owners.at(-1)
        if (targetOwner) {
          for (const module of mod.modules ?? [])
            expression.owners.push({
              ...targetOwner,
              module,
              role: 'cv',
              target: { module: node.module.id, jack: 'cv', control: id },
            })
        }
        if (isFilter) {
          call(`${prefix}q`, n('res'))
          if (env?.spec.id === 'env') {
            call(`${prefix}env`, n('envAmt'))
            expression = envelope(expression, env, node, prefix)
          }
        }
        break
      }
      case 'delay':
        if (!omitted(node, 'mix')) {
          call('delay', n('mix'))
          call('delaytime', n('time'))
          call('delayfeedback', n('fdbk'))
        }
        break
      case 'reverb':
        if (!omitted(node, 'room')) {
          call('room', n('room'))
          call('roomsize', n('size'))
        }
        break
      case 'iter':
        call('iter', n('steps'))
        break
      case 'jux': {
        const transforms: Record<string, string> = {
          rev: 'rev',
          fast2: 'x => x.fast(2)',
          press: 'press',
          iter4: 'x => x.iter(4)',
        }
        const right = transforms[s('right')]
        if (!right) throw new Error('Unknown JUX transform')
        call('jux', right)
        break
      }
      case 'code': {
        const text = s('text')
        if (!text.trimStart().startsWith('.')) throw new Error('Chained CODE must start with a dot')
        expression = append(expression, text, node)
        expression.sourceRouting ||= syntax(expression.text).hasOrbit
        break
      }
      default:
        throw new Error(`Not a chain module: ${node.spec.id}`)
    }
    return expression
  }

  function raw(node: Node): CodeExpression[] {
    switch (node.spec.id) {
      case 'env':
        throw new Error('ENV has no standalone expression')
      case 'lfo': {
        let expression = append(blank(), string(node, 'shape'), node)
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
        const text = typeof rows === 'string' ? rows : grid(rows)
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
    if (!output || (node.outputs.get(output.id)?.length ?? 0) < 2) return raw(node)
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
      owners: [],
      sourceRouting: definition.expressions[i]?.sourceRouting ?? false,
      mixers: definition.expressions[i]?.mixers ?? [],
    }))
  }

  const source = out ? input(out) : undefined
  const voices = source ? emit(source) : []
  const lines = [tempoExpression.text + '\n']
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
      lines.push(`const ${name} = ${expression.text}\n`)
    })
    written.add(key)
  }
  for (const node of nodes.values()) {
    for (const jack of node.spec.jacks.filter((item) => item.direction === 'out')) {
      const key = `${node.module.id}:${jack.id}`
      if (definitions.has(key)) writeDefinition(key)
    }
  }
  voices.forEach((original, index) => {
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
    const orbit = importedRouting ? undefined : index + 1
    const expression = orbit === undefined ? voice : append(voice, `.orbit(${orbit})`)
    bindScope(layout, expression, undefined, orbit)
    lines.push(`$: ${expression.text}\n`)
  })
  return `${lines.join('\n')}\n${writeLayout(layout)}`
}
