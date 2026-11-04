import { controlValue } from '../modules/values'
import { parseExpressionAt, tokenizer, type Expression, type Node } from 'acorn'
import { graph } from '../codegen/graph'
import { generate } from '../codegen/generate'
import { descriptor, type RackLayout } from '../codegen/layout'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { callMethod, matchControlCall, tupleControls } from '../modules/bindings'
import { DEFAULT_LOOK } from '../modules/looks'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { nextPosition, railWidth } from '../patch/layout'
import { matchRouting, matchScopes, readLayout } from './layout'
import { codeEnd } from './metadata'
import { unclosedBracket } from './diagnostics'
import { chain, parseSource, scalar, type Call, type ParsedScope } from './syntax'
import type { ReadResult, SourceAddress, SourceBinding, SourceDocument, Span } from './types'

import { numericNotation } from '../patch/notation'
import { modConfig, modPattern, type ModPattern } from './modulation'

type Output = { module: PlacedModule; jack: string }

function canonicalCall(name: string): string {
  return (
    CATALOG.find((spec) => Object.hasOwn(spec.strudelAliases ?? {}, name))?.strudelAliases?.[
      name
    ] ?? name
  )
}

/** Catalog ownership selects the adapter; contextual s() is shared by OSC/DRUMS. */
function owner(name: string, source: boolean): string | undefined {
  if (name === 's') return source ? 'drums' : 'osc'
  return CATALOG.find((spec) => spec.strudel.includes(name))?.id
}

function fits(type: string, id: string, value: number | string): boolean {
  const control = getModuleSpec(type).controls.find((control) => control.id === id)
  if (!control) return false
  switch (control.kind) {
    case 'knob':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= control.min &&
        value <= control.max &&
        (control.step !== 1 || Number.isInteger(value))
      )
    case 'switch':
      return control.options.some((option) => option.value === value)
    case 'text':
    case 'steps':
    case 'grid':
      return typeof value === 'string'
  }
}

function transformKey(expression: Expression | undefined): string | undefined {
  if (expression?.type === 'Identifier') return descriptor(['identifier', expression.name])
  if (
    expression?.type !== 'ArrowFunctionExpression' ||
    expression.params.length !== 1 ||
    expression.params[0]?.type !== 'Identifier' ||
    expression.body.type === 'BlockStatement'
  )
    return undefined
  const parsed = chain(expression.body)
  const call = parsed.calls[0]
  if (
    parsed.root.type !== 'Identifier' ||
    parsed.root.name !== expression.params[0].name ||
    parsed.calls.length !== 1 ||
    call?.args.length !== 1
  )
    return undefined
  const value = scalar(call.args[0])
  return value === undefined ? undefined : descriptor([call.name, value])
}

function project(
  source: string,
  scopes: ParsedScope[],
  saved?: RackLayout,
  snapshot?: ParsedScope[],
): { patch: Patch; bindings: SourceBinding[]; represented: Map<string, Set<string>> } {
  const patch: Patch = { version: 1, modules: [], cables: [], names: {} }
  if (saved?.name !== undefined) patch.name = saved.name
  if (saved?.prelude !== undefined && source.startsWith(saved.prelude))
    patch.prelude = saved.prelude
  if (saved?.railHp !== undefined) patch.railHp = saved.railHp
  const bindings: SourceBinding[] = []
  const represented = new Map<string, Set<string>>()
  const reserved = new Set(saved?.modules.map((module) => module.id))
  const routing = saved && snapshot ? matchRouting(saved.scopes, scopes, snapshot) : undefined
  const gains = new Map<string, { value: number; index: number }>()
  const depths = new Map<string, { value: number; isDefault: boolean }[]>()
  let row = 0
  let hp = 0
  let cableId = 0
  const nextRow = () => patch.modules.reduce((end, module) => Math.max(end, module.row + 1), 0)
  function add(type: string, values: Record<string, ControlValue> = {}): PlacedModule {
    const spec = getModuleSpec(type)
    const position = nextPosition(patch.modules, type, row, hp, railWidth(patch))
    if (type !== 'out') {
      row = position.row
      hp = position.hp
    }
    let counter = 1
    while (reserved.has(`${type}${counter}`)) counter++
    const id = `${type}${counter}`
    reserved.add(id)
    const module = { id, type, ...position, look: DEFAULT_LOOK[spec.family], values }
    if (type !== 'out') hp += spec.hp
    patch.modules.push(module)
    if (type === 'env' || type === 'lfo') represented.set(id, new Set(Object.keys(values)))
    return module
  }
  function output(module: PlacedModule): Output {
    const jack = getModuleSpec(module.type).jacks.find((jack) => jack.direction === 'out')
    if (!jack) throw new Error('Module has no output')
    return { module, jack: jack.id }
  }
  function wire(from: Output, to: PlacedModule, jack?: string): void {
    const input =
      jack ??
      getModuleSpec(to.type).jacks.find((jack) => jack.direction === 'in' && !jack.cvTarget)?.id
    if (!input) throw new Error('Module has no input')
    patch.cables.push({
      id: `cable${++cableId}`,
      from: { module: from.module.id, jack: from.jack },
      to: { module: to.id, jack: input },
    })
  }
  function needsSampler(from: Output): boolean {
    if (from.module.type === 'drums') return true
    const spec = getModuleSpec(from.module.type)
    if (spec.jacks.find((jack) => jack.id === from.jack)?.signal !== 'any') return false
    const input = patch.cables.find(
      (cable) => cable.to.module === from.module.id && cable.to.jack === 'in',
    )
    const receiver = input && patch.modules.find((module) => module.id === input.from.module)
    return receiver && input ? needsSampler({ module: receiver, jack: input.from.jack }) : false
  }
  function bind(
    module: PlacedModule,
    scope: ParsedScope,
    indices: number[],
    controls: Record<string, Span> = {},
    semantic: Pick<SourceAddress, 'role' | 'target'> = { role: 'module' },
  ): void {
    const calls = indices.flatMap((index) => scope.calls[index] ?? [])
    const start = calls[0]?.start ?? scope.start
    const end = calls.at(-1)?.end ?? scope.end
    const previous = bindings.find(
      (binding) =>
        binding.module === module.id &&
        binding.scope === scope.descriptor.id &&
        binding.role === semantic.role &&
        descriptor(binding.target) === descriptor(semantic.target),
    )
    if (previous) {
      previous.calls.push(...indices.filter((index) => !previous.calls.includes(index)))
      previous.end = Math.max(previous.end, end)
      Object.assign(previous.controls, controls)
    } else
      bindings.push({
        module: module.id,
        scope: scope.descriptor.id,
        calls: indices,
        ...semantic,
        start,
        end,
        controls,
      })
  }
  function literal(
    module: PlacedModule,
    id: string,
    call: Call,
    scope: ParsedScope,
    index: number,
  ): boolean {
    const value = scalar(call.args[0])
    const arg = call.args[0]
    if (call.args.length !== 1 || value === undefined || !arg || !fits(module.type, id, value))
      return false
    module.values[id] = value
    represented.get(module.id)?.add(id)
    bind(module, scope, [index], literalControls(id, arg))
    return true
  }
  function literalControls(id: string, arg: Node | undefined): Record<string, Span> {
    if (
      !arg ||
      !['Literal', 'UnaryExpression', 'BinaryExpression'].includes(arg.type) ||
      /\/[/*]/.test(source.slice(arg.start, arg.end))
    )
      return {}
    return { [id]: { start: arg.start, end: arg.end } }
  }
  const declarations = new Map(
    scopes
      .filter((scope) => scope.kind === 'declaration')
      .map((scope) => [scope.descriptor.anchor, scope]),
  )
  const resolved = new Map<string, Output>()
  const resolving = new Set<string>()
  function resolve(name: string): Output | undefined {
    const previous = resolved.get(name)
    if (previous) return previous
    const scope = declarations.get(name)
    if (!scope || resolving.has(name)) return undefined
    resolving.add(name)
    const result = expression(scope)
    resolving.delete(name)
    resolved.set(name, result)
    return result
  }
  function code(scope: ParsedScope, indices: number[], text: string, upstream?: Output): Output {
    const module = add('code', { text })
    if (upstream) wire(upstream, module)
    bind(module, scope, indices)
    if (!upstream && indices.length === scope.calls.length) {
      const binding = bindings.at(-1)
      if (binding) {
        binding.start = scope.start
        binding.end = scope.end
      }
    }
    return output(module)
  }
  function lfo(
    arg: Expression,
    target: PlacedModule,
    control: string,
    scope: ParsedScope,
    index: number,
  ): boolean {
    const parsed = chain(arg)
    const range = parsed.calls.find((call) => call.name === 'range')
    if (!range || range.args.length !== 2) return false
    const base = scalar(range.args[0]),
      top = scalar(range.args[1])
    if (typeof base !== 'number' || typeof top !== 'number' || !fits(target.type, control, base))
      return false
    const data = getModuleSpec(target.type).controls.find((item) => item.id === control)
    if (
      data?.kind !== 'knob' ||
      !data.modulation ||
      top - base < data.modulation.min ||
      top - base > data.modulation.max
    )
      return false
    let signal: Output | undefined
    if (parsed.root.type === 'Identifier' && declarations.has(parsed.root.name)) {
      // A local rate transform affects only this use, not the shared declaration.
      // Keep the outer call opaque until the graph can represent that distinction.
      if (parsed.calls.some((call) => call !== range)) return false
      // Shared signal declarations are projected once, but depth belongs to all uses.
      signal = resolve(parsed.root.name)
      if (signal?.module.type !== 'lfo') return false
    } else {
      if (parsed.root.type !== 'Identifier' || !fits('lfo', 'shape', parsed.root.name)) return false
    }
    let rate = 1
    for (const call of parsed.calls) {
      if (call === range) continue
      const value = scalar(call.args[0])
      if (
        !['slow', 'fast'].includes(call.name) ||
        call.args.length !== 1 ||
        typeof value !== 'number' ||
        value <= 0
      )
        return false
      rate *= call.name === 'slow' ? value : 1 / value
    }
    if (!fits('lfo', 'rate', rate)) return false
    signal ??= output(
      add('lfo', { shape: parsed.root.type === 'Identifier' ? parsed.root.name : 'sine', rate }),
    )
    const uses = [
      ...(depths.get(signal.module.id) ?? []),
      { value: top - base, isDefault: Math.abs(top - base - data.modulation.default) < 1e-9 },
    ]
    const sameDepth = uses.every((use) => Math.abs(use.value - (top - base)) < 1e-9)
    if (!sameDepth && !uses.every((use) => use.isDefault)) return false
    represented.get(signal.module.id)?.add('mode')
    represented.get(signal.module.id)?.add('depth')
    depths.set(signal.module.id, uses)
    if (sameDepth) signal.module.values['depth'] = top - base
    else delete signal.module.values['depth']
    const jack = getModuleSpec(target.type).jacks.find((jack) => jack.cvTarget === control)
    if (!jack) return false
    target.values[control] = base
    wire(signal, target, jack.id)
    // CV values are coupled expressions; no scalar edit is advertised for them.
    bind(
      signal.module,
      scope,
      [index],
      {},
      { role: 'cv', target: { module: target.id, jack: jack.id, control } },
    )
    bind(target, scope, [index])
    return true
  }
  function patternCV(
    arg: Expression,
    target: PlacedModule,
    control: string,
    scope: ParsedScope,
    index: number,
  ): boolean {
    const parsed = modPattern(arg, (name) => declarations.has(name))
    if (!parsed || parsed.type === 'lfo') return false
    if (parsed.type === 'reference') {
      const reference = typeof parsed.values.name === 'string' && resolve(parsed.values.name)
      if (!reference || !getModuleSpec(reference.module.type).modSource) return false
    }
    const jack = getModuleSpec(target.type).jacks.find((j) => j.cvTarget === control)
    if (!jack) return false
    const semantic = { role: 'cv' as const, target: { module: target.id, jack: jack.id, control } }
    function insert(pattern: ModPattern): Output {
      if (pattern.type === 'reference') {
        const reference = typeof pattern.values.name === 'string' && resolve(pattern.values.name)
        if (!reference) throw new Error('Unknown mod reference')
        return reference
      }
      const module = add(pattern.type, pattern.values)
      pattern.inputs.forEach((child, index) =>
        wire(insert(child), module, index === 0 ? 'in' : 'in2'),
      )
      return output(module)
    }
    const signal = insert(parsed)
    wire(signal, target, jack.id)
    const paths = new Map<PlacedModule, string>()
    function trace(module: PlacedModule, path = '') {
      paths.set(module, path)
      for (const cable of patch.cables.filter((c) => c.to.module === module.id)) {
        const upstream = patch.modules.find((m) => m.id === cable.from.module)
        if (upstream) trace(upstream, `${path}${path ? '/' : ''}${cable.to.jack}`)
      }
    }
    trace(signal.module)
    for (const [module, path] of paths)
      bind(
        module,
        scope,
        [index],
        {},
        { ...semantic, target: { ...semantic.target, ...(path ? { path } : {}) } },
      )
    bind(target, scope, [index])
    return true
  }

  function expression(scope: ParsedScope): Output {
    const { root, calls } = scope
    const savedScope = saved?.scopes.find(
      (item) =>
        item.id === scope.descriptor.id &&
        descriptor([item.root, item.calls]) ===
          descriptor([scope.descriptor.root, scope.descriptor.calls]),
    )
    // New adapters must not replace an older file's explicit CODE owners.
    // Check the receiver before projecting it, as well as later suffixes.
    // Exact bytes and the independent saved-graph validation remain required.
    function retainedCode(index: number, receiver = false) {
      const begin = receiver ? scope.start : calls[index]?.start
      return (
        savedScope &&
        saved?.modules.flatMap((module) =>
          module.type === 'code'
            ? module.bindings.flatMap((binding) => {
                const indices = binding.calls
                const end =
                  calls[indices.at(-1) ?? -1]?.end ??
                  (receiver && !calls.length ? scope.end : undefined)
                return binding.scope === savedScope.id &&
                  binding.role === 'module' &&
                  (indices[0] === index || (receiver && !calls.length && !indices.length)) &&
                  indices.every((value, offset) => value === index + offset) &&
                  begin !== undefined &&
                  end !== undefined &&
                  typeof module.values['text'] === 'string' &&
                  source.slice(begin, end).trimStart() === module.values['text'].trimStart()
                  ? [{ indices, text: source.slice(begin, end) }]
                  : []
              })
            : [],
        )[0]
      )
    }
    if (scope.kind === 'declaration' && !retainedCode(0, true)) {
      const pattern = modPattern(scope.expression, (name) => declarations.has(name))
      if (pattern) {
        function insert(item: ModPattern): Output {
          if (item.type === 'reference') {
            const result = typeof item.values.name === 'string' && resolve(item.values.name)
            if (!result) throw new Error('Unknown mod reference')
            return result
          }
          const module = add(item.type, item.values)
          item.inputs.forEach((child, i) => wire(insert(child), module, i === 0 ? 'in' : 'in2'))
          let indices = calls.flatMap((c, i) =>
            c.end > item.start && c.end <= item.end ? [i] : [],
          )
          if (!indices.length && item.start !== scope.root.start) {
            const containing = calls.findIndex((c) => c.start <= item.start && c.end >= item.end)
            if (containing >= 0) indices = [containing]
          }
          bind(module, scope, indices)
          if (item.type === 'lfo' && item.start === scope.root.start && indices.length)
            bindings.push({
              module: module.id,
              scope: scope.descriptor.id,
              calls: [],
              role: 'module',
              controls: {},
              start: item.start,
              end: scope.root.end,
            })
          return output(module)
        }
        return insert(pattern)
      }
    }
    // Acorn omits receiver parentheses from object.end. A suffix starting there
    // would contain an unmatched ')'; preserve the complete expression instead.
    if (
      calls.some(
        (call) =>
          tokenizer(source.slice(call.start, call.end), { ecmaVersion: 'latest' }).getToken().type
            .label === ')',
      )
    )
      return code(
        scope,
        calls.map((_, index) => index),
        source.slice(scope.start, scope.end),
      )
    let upstream: Output | undefined
    let start = 0
    let group: PlacedModule | undefined
    const receiver = retainedCode(0, true)
    if (receiver) {
      upstream = code(scope, receiver.indices, receiver.text)
      start = (receiver.indices.at(-1) ?? -1) + 1
    }
    if (!upstream && root.type === 'Identifier') {
      upstream = resolve(root.name)
      if (!upstream && fits('lfo', 'shape', root.name)) {
        group = add('lfo', { shape: root.name, rate: 1 })
        bind(group, scope, [])
        upstream = output(group)
      }
    }
    const initial = calls[0]
    if (!upstream && initial && initial.start === root.start) {
      const type = owner(initial.name, true)
      const form = type && getModuleSpec(type).source
      if (
        type &&
        form &&
        initial.name === form.method &&
        initial.args.length === 1 &&
        typeof scalar(initial.args[0]) === 'string' &&
        form.suffix.every(
          (name, offset) =>
            calls[offset + 1]?.name === name && calls[offset + 1]?.args.length === 0,
        )
      ) {
        const text = scalar(initial.args[0])
        if (typeof text === 'string') {
          group = add(type, { [form.control]: text })
          bind(
            group,
            scope,
            Array.from({ length: form.suffix.length + 1 }, (_, i) => i),
            literalControls(form.control, initial.args[0]),
          )
          upstream = output(group)
          start = form.suffix.length + 1
        }
      }
      if (type === 'seq' || type === 'drums') {
        const id = type === 'seq' ? 'steps' : 'grid'
        const value = scalar(initial.args[0])
        if (initial.args.length === 1 && typeof value === 'string') {
          group = add(type, {
            [id]: value,
            ...(type === 'seq'
              ? { mode: initial.name === 'n' ? 'degree' : 'note', rate: 1 }
              : { drop: 0 }),
          })
          literal(group, id, initial, scope, 0)
          upstream = output(group)
          start = 1
        }
      }
    }
    if (!upstream) {
      // An opaque receiver keeps every character and can still have readable suffixes.
      const end = calls[0]?.start === root.start ? calls[0].end : root.end
      start = calls[0]?.start === root.start ? 1 : 0
      upstream = code(scope, start ? [0] : [], source.slice(scope.start, end))
    }
    for (let index = start; index < calls.length; index++) {
      const call = calls[index]
      if (!call) continue
      if (routing?.get(scope.descriptor.id)?.call === index) continue
      const opaque = retainedCode(index)
      if (opaque) {
        upstream = code(scope, opaque.indices, opaque.text, upstream)
        group = undefined
        index = opaque.indices.at(-1) ?? index
        continue
      }
      const name = canonicalCall(call.name)
      const type = owner(name, false)
      if (
        type === 'mix' &&
        call.name === 'postgain' &&
        scope.kind === 'voice' &&
        calls.slice(index + 1).every((call) => call.name === 'orbit')
      ) {
        const value = scalar(call.args[0])
        if (call.args.length === 1 && typeof value === 'number' && fits('mix', 'ch1', value)) {
          gains.set(scope.descriptor.id, { value, index })
          continue
        }
      }
      if (
        ['lfo', 'env'].includes(call.name) &&
        group &&
        call.args.length === 1 &&
        call.args[0]?.type !== 'SpreadElement'
      ) {
        const config = modConfig(call.args[0])
        const spec = getModuleSpec(group.type)
        const targetControl = spec.controls.find(
          (item) =>
            item.kind === 'knob' &&
            item.call &&
            spec.jacks.some((j) => j.cvTarget === item.id) &&
            ((config?.c === undefined &&
              canonicalCall(calls[index - 1]?.name ?? '') ===
                callMethod(item.call, (id) => {
                  const v = group?.values[id] ?? spec.controls.find((c) => c.id === id)?.default
                  return typeof v === 'string' ? v : ''
                })) ||
              config?.c ===
                callMethod(item.call, (id) => {
                  const value = group?.values[id] ?? spec.controls.find((c) => c.id === id)?.default
                  return typeof value === 'string' ? value : ''
                })),
        )
        const jack = targetControl && spec.jacks.find((j) => j.cvTarget === targetControl.id)
        const data = targetControl?.kind === 'knob' ? targetControl.modulation : undefined
        if (
          config &&
          targetControl &&
          jack &&
          data &&
          typeof config.depthabs === 'number' &&
          config.depthabs >= data.min &&
          config.depthabs <= data.max &&
          !patch.cables.some((c) => c.to.module === group?.id && c.to.jack === jack.id)
        ) {
          const allowed =
            call.name === 'lfo'
              ? ['c', 'sync', 'depthabs', 'dc', 'shape', 'skew']
              : ['c', 'a', 'd', 's', 'r', 'depthabs']
          const shape = Object.entries(getModuleSpec('lfo').smoothShapes ?? {}).find(
            ([, value]) => value === config.shape,
          )?.[0]
          const rate = typeof config.sync === 'number' ? 1 / config.sync : undefined
          const targetMethod =
            targetControl.kind === 'knob' && targetControl.call
              ? callMethod(targetControl.call, (id) => {
                  const v = group?.values[id] ?? spec.controls.find((c) => c.id === id)?.default
                  return typeof v === 'string' ? v : ''
                })
              : ''
          const base = group.values[targetControl.id] ?? targetControl.default
          const frequencyTarget =
            typeof base === 'number' &&
            base >= 30 &&
            ['lpf', 'hpf', 'bpf', 'cutoff', 'hcutoff', 'bandf'].includes(targetMethod)
          const compatibleBias =
            call.name !== 'lfo' ||
            (config.dc === -1
              ? !frequencyTarget && config.depthabs >= 0
              : frequencyTarget || config.depthabs >= 0)
          const nativeEnvelope =
            (targetControl.kind === 'knob' && targetControl.call?.envelope) ||
            spec.controls.some((c) => 'call' in c && c.call?.withEnvelope === jack.id)
          const valid =
            !(call.name === 'env' && nativeEnvelope) &&
            compatibleBias &&
            !data.pitch &&
            Object.keys(config).every((key) => allowed.includes(key)) &&
            (call.name === 'lfo'
              ? rate !== undefined &&
                fits('lfo', 'rate', rate) &&
                (config.dc === 0 || config.dc === -1) &&
                typeof shape === 'string' &&
                fits('lfo', 'shape', shape) &&
                typeof config.skew === 'number' &&
                fits('lfo', 'skew', config.skew)
              : ['a', 'd', 's', 'r'].every((key, i) =>
                  fits('env', ['atk', 'dec', 'sus', 'rel'][i] ?? '', config[key] ?? ''),
                ))
          if (valid) {
            const module =
              call.name === 'lfo'
                ? add('lfo', {
                    mode: 'SMOOTH',
                    rate: rate ?? 1,
                    shape: shape ?? 'sine',
                    skew: config.skew ?? 0.5,
                    depth: config.dc === -1 ? -config.depthabs : config.depthabs,
                  })
                : add('env', {
                    atk: config.a ?? 0,
                    dec: config.d ?? 0,
                    sus: config.s ?? 0,
                    rel: config.r ?? 0,
                    depth: config.depthabs,
                  })
            wire(output(module), group, jack.id)
            bind(
              module,
              scope,
              [index],
              {},
              {
                role: 'cv',
                target: { module: group.id, jack: jack.id, control: targetControl.id },
              },
            )
            continue
          }
        }
      }
      if (group?.type === 'osc' && ['vib', 'penv'].includes(call.name)) {
        const pitch = getModuleSpec(group.type).controls.find(
          (c) => c.kind === 'knob' && c.modulation?.pitch,
        )
        const jack = pitch && getModuleSpec(group.type).jacks.find((j) => j.cvTarget === pitch.id)
        const depth = scalar(call.name === 'vib' ? calls[index + 1]?.args[0] : call.args[0])
        const data = pitch?.kind === 'knob' ? pitch.modulation : undefined
        const bpm = scopes.find((s) => s.kind === 'tempo')?.calls[0]
        const tempoArg = bpm?.args[0]
        const bpmValue =
          tempoArg?.type === 'BinaryExpression' &&
          tempoArg.operator === '/' &&
          scalar(tempoArg.right) === 4
            ? tempoArg.left.type === 'PrivateIdentifier'
              ? undefined
              : scalar(tempoArg.left)
            : undefined
        const directTempo = scalar(tempoArg)
        const cps =
          typeof bpmValue === 'number'
            ? bpmValue / 240
            : typeof directTempo === 'number'
              ? bpm?.name === 'setcps'
                ? directTempo
                : directTempo / 60
              : 0.5
        const frequency = scalar(call.args[0])
        const rate = typeof frequency === 'number' && frequency > 0 ? cps / frequency : 0
        const envelopeCalls = calls.slice(index + 1, index + 5)
        const valid =
          call.args.length === 1 &&
          (call.name === 'vib'
            ? calls[index + 1]?.name === 'vibmod' &&
              calls[index + 1]?.args.length === 1 &&
              fits('lfo', 'rate', rate)
            : envelopeCalls.length === 4 &&
              envelopeCalls.every(
                (c, i) =>
                  c.name === ['pattack', 'pdecay', 'psustain', 'prelease'][i] &&
                  c.args.length === 1 &&
                  fits('env', ['atk', 'dec', 'sus', 'rel'][i] ?? '', scalar(c.args[0]) ?? ''),
              ))
        if (
          valid &&
          pitch &&
          jack &&
          data &&
          typeof depth === 'number' &&
          depth >= data.min &&
          depth <= data.max &&
          !patch.cables.some((c) => c.to.module === group?.id && c.to.jack === jack.id)
        ) {
          const module =
            call.name === 'vib'
              ? add('lfo', { mode: 'SMOOTH', shape: 'sine', rate, depth })
              : add('env', { depth })
          if (call.name === 'vib') represented.get(module.id)?.delete('shape')
          const count = call.name === 'vib' ? 2 : 5
          if (call.name === 'penv')
            envelopeCalls.forEach((c, i) => {
              const id = ['atk', 'dec', 'sus', 'rel'][i]
              const v = scalar(c.args[0])
              if (id && v !== undefined) {
                module.values[id] = v
                represented.get(module.id)?.add(id)
              }
            })
          wire(output(module), group, jack.id)
          bind(
            module,
            scope,
            Array.from({ length: count }, (_, i) => index + i),
            {},
            { role: 'cv', target: { module: group.id, jack: jack.id, control: pitch.id } },
          )
          index += count - 1
          continue
        }
      }
      if (type === 'env') {
        const prefix = name.endsWith('attack') ? name.slice(0, -6) : undefined
        const ids = ['atk', 'dec', 'sus', 'rel']
        const methods = ['attack', 'decay', 'sustain', 'release']
        const envelope = calls.slice(index, index + 4)
        const valid =
          prefix !== undefined &&
          envelope.length === 4 &&
          envelope.every(
            (item, offset) =>
              canonicalCall(item.name) === `${prefix}${methods[offset]}` &&
              item.args.length === 1 &&
              typeof scalar(item.args[0]) === 'number' &&
              fits('env', ids[offset] ?? '', scalar(item.args[0]) ?? ''),
          )
        let target =
          prefix && group?.type === 'vcf' && group.values['mode'] === prefix ? group : undefined
        const gain = calls[index + 4]
        if (valid && prefix === '' && gain?.name === 'gain' && gain.args.length === 1) {
          const level = scalar(gain.args[0])
          if (typeof level === 'number' && fits('vca', 'level', level)) {
            target = add('vca', { level })
            wire(upstream, target)
            upstream = output(target)
            literal(target, 'level', gain, scope, index + 4)
          }
        }
        const jack = target && getModuleSpec(target.type).jacks.find((jack) => jack.cvTarget)
        if (
          valid &&
          target &&
          jack?.cvTarget &&
          !patch.cables.some((cable) => cable.to.module === target?.id && cable.to.jack === jack.id)
        ) {
          const env = add('env')
          envelope.forEach((call, offset) => {
            const id = ids[offset]
            if (id) literal(env, id, call, scope, index + offset)
          })
          wire(output(env), target, jack.id)
          for (const binding of bindings.filter((binding) => binding.module === env.id)) {
            binding.role = 'cv'
            binding.target = {
              module: target.id,
              jack: jack.id,
              control: jack.cvTarget,
            }
          }
          group = target
          index += prefix === '' ? 4 : 3
          continue
        }
      }
      let id: string | undefined
      let values: Record<string, ControlValue> = {}
      let merge = false
      if (group?.type === 'seq' && call.name === 'fast') {
        const value = scalar(call.args[0])
        const rate = typeof value === 'number' ? value : undefined
        if (
          rate !== undefined &&
          fits('seq', 'rate', rate) &&
          call.args.length === 1 &&
          group.values['rate'] === 1
        ) {
          group.values['rate'] = rate
          bind(
            group,
            scope,
            [index],
            call.name === 'fast' ? literalControls('rate', call.args[0]) : {},
          )
          continue
        }
      }
      if (group?.type === 'lfo' && ['slow', 'fast'].includes(call.name)) {
        const value = scalar(call.args[0])
        const rate =
          typeof value === 'number' ? (call.name === 'slow' ? value : 1 / value) : undefined
        if (
          rate !== undefined &&
          fits('lfo', 'rate', rate) &&
          call.args.length === 1 &&
          group.values['rate'] === 1
        ) {
          group.values['rate'] = rate
          bind(
            group,
            scope,
            [index],
            call.name === 'slow' ? literalControls('rate', call.args[0]) : {},
          )
          continue
        }
      }
      const spec = type ? getModuleSpec(type) : undefined
      // Preserve DRUMS' existing unseeded drop control; a seeded gate is CHANCE.
      const drumDrop =
        name === 'degradeBy' && group?.type === 'drums' && calls[index + 1]?.name !== 'seed'
      const matched = !drumDrop && spec && matchControlCall(spec, name)
      const activation =
        matched && matched.binding.when
          ? { [matched.binding.when.control]: matched.binding.when.value }
          : {}
      if (matched) {
        id = matched.control.id
        values = { ...spec?.readDefaults, ...matched.values, ...activation }
        merge =
          matched.binding.read === 'merge' &&
          Object.entries(matched.values).every(([id, value]) => group?.values[id] === value)
        if (merge && spec?.orderSensitive && group?.type === type) {
          const rank = spec.controls.indexOf(matched.control)
          // A grouped node writes in catalog order. Keep earlier/repeated calls
          // as separate nodes when grouping would move them through a transform.
          merge = !bindings.some(
            (binding) =>
              binding.module === group?.id &&
              binding.scope === scope.descriptor.id &&
              binding.calls.some((index) => {
                const previous = calls[index]
                const owned = previous && matchControlCall(spec, canonicalCall(previous.name))
                return owned && spec.controls.indexOf(owned.control) >= rank
              }),
          )
        }
        const form = matched.binding.argument
        if (form.kind === 'tuple' && type) {
          const ids = tupleControls(matched.binding, call.name)
          const args = call.args.map((arg) => scalar(arg))
          if (
            args.length === ids.length &&
            ids.every((id, i) => {
              const candidate = args[i]
              return candidate !== undefined && fits(type, id, candidate)
            })
          ) {
            const reuse =
              merge &&
              group?.type === type &&
              !bindings.some(
                (binding) =>
                  binding.module === group?.id && ids.some((id) => id in binding.controls),
              )
            const module = reuse && group ? group : add(type, values)
            Object.assign(module.values, activation)
            const controls: Record<string, Span> = {}
            ids.forEach((id, i) => {
              const candidate = args[i]
              if (candidate !== undefined) module.values[id] = candidate
              Object.assign(controls, literalControls(id, call.args[i]))
            })
            if (!reuse) wire(upstream, module)
            bind(module, scope, [index], controls)
            group = module
            upstream = output(module)
            continue
          }
          id = undefined
        } else if (form.kind === 'transform') {
          const arg = call.args[0]
          const key =
            call.args.length === 1 && arg?.type !== 'SpreadElement' ? transformKey(arg) : undefined
          const right =
            key &&
            Object.entries(form.expressions).find(
              ([, text]) =>
                transformKey(parseExpressionAt(text, 0, { ecmaVersion: 'latest' })) === key,
            )?.[0]
          if (right && type) {
            group = add(type, { ...values, [id]: right })
            wire(upstream, group)
            bind(group, scope, [index])
            upstream = output(group)
            continue
          }
          id = undefined
        } else if (form.kind === 'scale') {
          const value = scalar(call.args[0])
          const [writtenRoot, scale, extra] = typeof value === 'string' ? value.split(':') : []
          const root = writtenRoot && writtenRoot.charAt(0).toUpperCase() + writtenRoot.slice(1)
          if (
            type &&
            call.args.length === 1 &&
            root &&
            scale &&
            !extra &&
            fits(type, form.root, root) &&
            fits(type, id, scale)
          ) {
            group = add(type, { ...values, [form.root]: root, [id]: scale })
            wire(upstream, group)
            bind(group, scope, [index])
            upstream = output(group)
            continue
          }
          id = undefined
        }
      } else if (drumDrop) {
        id = 'drop'
        merge = true
      }
      const scalarType = drumDrop ? 'drums' : type
      if (scalarType && id) {
        const arg = call.args[0]
        const candidate = scalar(arg)
        const numericCV = spec?.jacks.some((jack) => jack.cvTarget === id)
        if (
          (candidate !== undefined && call.args.length === 1 && fits(scalarType, id, candidate)) ||
          (numericCV &&
            arg &&
            arg.type !== 'SpreadElement' &&
            (candidate === undefined || numericNotation(candidate)))
        ) {
          const reuse =
            merge &&
            group?.type === scalarType &&
            !bindings.some((binding) => binding.module === group?.id && id in binding.controls)
          const module = reuse && group ? group : add(scalarType, values)
          const accepted =
            numericCV &&
            arg &&
            arg.type !== 'SpreadElement' &&
            (candidate === undefined || numericNotation(candidate))
              ? lfo(arg, module, id, scope, index) || patternCV(arg, module, id, scope, index)
              : literal(module, id, call, scope, index)
          if (accepted) {
            Object.assign(module.values, activation)
            if (
              !reuse &&
              needsSampler(upstream) &&
              getModuleSpec(scalarType).jacks.some(
                (jack) => jack.direction === 'in' && jack.signal === 'audio',
              )
            ) {
              const sampler = add('smpl', { bank: '', speed: 1 })
              wire(upstream, sampler)
              upstream = output(sampler)
            }
            if (!reuse) wire(upstream, module)
            group = module
            upstream = output(module)
            continue
          }
          if (!reuse) patch.modules.splice(patch.modules.indexOf(module), 1)
        }
      }
      upstream = code(scope, [index], source.slice(call.start, call.end), upstream)
      group = undefined
    }
    // A bare sample source already produces sound in Strudel; the silent sampler
    // settings make that implicit audio boundary explicit in the rack.
    if (scope.kind === 'voice' && needsSampler(upstream)) {
      const sampler = add('smpl', { bank: '', speed: 1 })
      wire(upstream, sampler)
      upstream = output(sampler)
    }
    return upstream
  }

  const voices: { output: Output; scope: ParsedScope }[] = []
  for (const scope of scopes.filter((scope) => scope.kind === 'voice')) {
    row = nextRow()
    const voiceRow = row
    hp = 0
    const checkpoint = structuredClone(patch)
    const previousBindings = structuredClone(bindings)
    const previousDepths = new Map(depths)
    const resolvedBefore = new Map(resolved)
    let voice: Output
    try {
      voice = expression(scope)
      // Validate the final audio boundary before retaining any projected nodes.
      const testOut = add('out')
      wire(voice, testOut)
      graph(patch)
      patch.modules.pop()
      patch.cables.pop()
    } catch {
      patch.modules = checkpoint.modules
      patch.cables = checkpoint.cables
      patch.names = checkpoint.names
      bindings.splice(0, bindings.length, ...previousBindings)
      depths.clear()
      previousDepths.forEach((value, key) => depths.set(key, value))
      gains.delete(scope.descriptor.id)
      resolved.clear()
      resolvedBefore.forEach((value, key) => {
        const module = patch.modules.find((module) => module.id === value.module.id)
        if (module) resolved.set(key, { module, jack: value.jack })
      })
      resolving.clear()
      row = voiceRow
      hp = 0
      voice = code(
        scope,
        scope.calls.map((_, index) => index),
        source.slice(scope.start, scope.end),
      )
    }
    voices.push({ output: voice, scope })
  }
  row = nextRow()
  hp = 0
  // Four physical channels per bus; chain buses for larger imported scores.
  let bus: PlacedModule | undefined
  let firstBus: PlacedModule | undefined
  for (let index = 0; index < voices.length; index++) {
    if (!bus || index % 3 === 0) {
      const next = add('mix', { ch1: 1, ch2: 1, ch3: 1, ch4: 1 })
      if (bus) wire(output(next), bus, 'in4')
      firstBus ??= next
      bus = next
    }
    const voice = voices[index]
    if (voice) {
      const channel = (index % 3) + 1
      wire(voice.output, bus, `in${channel}`)
      const gain = gains.get(voice.scope.descriptor.id)
      if (gain) {
        bus.values[`ch${channel}`] = gain.value
        const call = voice.scope.calls[gain.index]
        const arg = call?.args[0]
        bind(bus, voice.scope, [gain.index], literalControls(`ch${channel}`, arg), {
          role: 'mixer',
        })
      }
    }
  }
  const out = add('out')
  if (firstBus) wire(output(firstBus), out)
  const tempos = scopes.filter((scope) => scope.kind === 'tempo')
  const tempo = tempos.length === 1 ? tempos[0] : undefined
  const call = tempo?.calls[0]
  if (tempo && call?.args.length === 1) {
    const arg = call.args[0]
    let value = scalar(arg)
    if (arg?.type === 'BinaryExpression' && arg.operator === '/' && scalar(arg.right) === 4) {
      const bpm = arg.left.type === 'PrivateIdentifier' ? undefined : scalar(arg.left)
      if (
        typeof bpm === 'number' &&
        call.name.toLowerCase() === 'setcpm' &&
        fits('out', 'bpm', bpm)
      ) {
        out.values['bpm'] = bpm
        bind(out, tempo, [0], literalControls('bpm', arg.left), { role: 'tempo' })
      }
    } else if (typeof value === 'number') {
      value *= call.name === 'setcps' ? 240 : 4
      if (fits('out', 'bpm', value)) {
        out.values['bpm'] = value
        bind(out, tempo, [0], {}, { role: 'tempo' })
      }
    }
  }
  for (const [name, signal] of resolved) {
    if (
      patch.cables.filter(
        (cable) => cable.from.module === signal.module.id && cable.from.jack === signal.jack,
      ).length >= (Object.values(saved?.names ?? {}).includes(name) ? 1 : 2)
    )
      patch.names[`${signal.module.id}:${signal.jack}`] = name
  }
  graph(patch)
  return { patch, bindings, represented }
}

/** Parse without executing any JavaScript. Syntax errors throw with Acorn's location. */
export function read(source: string): SourceDocument {
  const parsed = parseSource(source)
  let saved = readLayout(source)
  if (saved.kind === 'valid' && saved.layout.source !== undefined) {
    try {
      const snapshot = parseSource(saved.generated)
      const projected = project(saved.generated, snapshot.scopes, saved.layout, snapshot.scopes)
      restore(
        projected.patch,
        projected.bindings,
        saved.layout,
        matchScopes(saved.layout.scopes, snapshot.scopes, true),
        projected.represented,
      )
      // The generator can omit inactive controls that are nevertheless explicit
      // in imported source (for example lpenv without an ENV cable).
      for (const binding of projected.bindings) {
        if (binding.role !== 'module' && binding.role !== 'tempo') continue
        const module = projected.patch.modules.find((item) => item.id === binding.module)
        const stored = saved.patch.modules.find((item) => item.id === binding.module)
        if (!module || !stored) throw new Error('Missing source owner')
        for (const id of Object.keys(binding.controls)) {
          const control = getModuleSpec(module.type).controls.find((item) => item.id === id)
          if (control?.kind !== 'knob' && control?.kind !== 'switch') continue
          if (module.values[id] !== (stored.values[id] ?? control.default))
            throw new Error('Saved control does not agree with source')
        }
      }
      if (
        descriptor(parseSource(generate(projected.patch)).program) !==
        descriptor(parseSource(generate(saved.patch)).program)
      )
        throw new Error('Saved graph does not agree with source')
      // Every sounding binding must also be justified by the reader, not just valid indices.
      const actual = (bindings: SourceBinding[]) =>
        bindings
          .map((b) => [b.module, b.scope, b.role, b.calls, b.target])
          .sort((a, b) => descriptor(a).localeCompare(descriptor(b)))
      const expected = saved.layout.modules.flatMap((m) =>
        m.bindings.map((b) => ({ ...b, module: m.id, start: 0, end: 0, controls: {} })),
      )
      // Grouped reader bindings and per-call generator bindings are compared as individual addresses.
      const expand = (bindings: SourceBinding[]) =>
        bindings.flatMap((b) => (b.calls.length ? b.calls.map((c) => ({ ...b, calls: [c] })) : [b]))
      if (descriptor(actual(expand(projected.bindings))) !== descriptor(actual(expand(expected))))
        throw new Error('Unverifiable source ownership')
    } catch (error) {
      saved = {
        kind: 'invalid',
        message: error instanceof Error ? error.message : 'Invalid source metadata',
      }
    }
  }
  const original = saved.kind === 'valid' ? parseSource(saved.generated) : undefined
  const projection = project(
    source,
    parsed.scopes,
    saved.kind === 'valid' ? saved.layout : undefined,
    original?.scopes,
  )
  let layout: SourceDocument['layout'] = saved.kind === 'invalid' ? 'invalid' : 'absent'
  const diagnostics = saved.kind === 'invalid' ? [`Layout not restored: ${saved.message}`] : []
  if (saved.kind === 'valid' && original) {
    if (descriptor(parsed.program) === descriptor(original.program)) {
      // All executable statements agree, including declarations and statement order.
      // It is now safe to restore omitted/bypassed/disconnected state and cables.
      const matches = matchScopes(saved.layout.scopes, parsed.scopes, true)
      restore(projection.patch, projection.bindings, saved.layout, matches, projection.represented)
      projection.patch = saved.patch
      const controls = projection.bindings
      projection.bindings = saved.layout.modules.flatMap((module) =>
        module.bindings.flatMap((binding) => {
          const index = saved.layout.scopes.findIndex((scope) => scope.id === binding.scope)
          const scope = parsed.scopes[index]
          const old = saved.layout.scopes[index]
          if (
            !scope ||
            !old ||
            descriptor([scope.descriptor.root, scope.descriptor.calls]) !==
              descriptor([old.root, old.calls])
          )
            return []
          const calls = binding.calls.flatMap((index) => scope.calls[index] ?? [])
          const editable =
            controls.find((item) => item.module === module.id && item.scope === scope.descriptor.id)
              ?.controls ?? {}
          return [
            {
              module: module.id,
              scope: scope.descriptor.id,
              calls: binding.calls,
              role: binding.role,
              ...(binding.target === undefined ? {} : { target: binding.target }),
              start: calls[0]?.start ?? scope.start,
              end: calls.at(-1)?.end ?? scope.end,
              controls: editable,
            },
          ]
        }),
      )
      layout = 'restored'
    } else {
      restore(
        projection.patch,
        projection.bindings,
        saved.layout,
        matchScopes(saved.layout.scopes, parsed.scopes),
        projection.represented,
      )
      layout = 'reconciled'
      diagnostics.push(
        'Code changed: restored only unambiguous sounding module identities; saved disconnected state was not applied.',
      )
    }
  }
  return {
    kind: 'source',
    source,
    patch: projection.patch,
    bindings: projection.bindings,
    layout,
    diagnostics,
    patchRevision: JSON.stringify(projection.patch),
  }
}

function restore(
  patch: Patch,
  bindings: SourceBinding[],
  saved: RackLayout,
  matches: ReturnType<typeof matchScopes>,
  represented: Map<string, Set<string>>,
): void {
  if (saved.railHp !== undefined) patch.railHp = saved.railHp
  const rename = new Map<string, string>()
  const claimed = new Set<string>()
  // CV identity is constrained by the already matched target, including shared ENV.
  const ordered = [
    ...patch.modules.filter((module) => !['env', 'lfo'].includes(module.type)),
    ...patch.modules.filter((module) => ['env', 'lfo'].includes(module.type)),
  ]
  for (const module of ordered) {
    const own = bindings.filter((binding) => binding.module === module.id)
    const candidates = saved.modules.filter(
      (old) =>
        old.type === module.type &&
        (!claimed.has(old.id) || ['env', 'lfo'].includes(module.type)) &&
        own.some((binding) => {
          const match = matches.get(binding.scope)
          if (!match) return false
          const calls = binding.calls.map((index) => match.calls.get(index))
          const oldBindings = old.bindings.filter(
            (oldBinding) =>
              oldBinding.scope === match.saved.id &&
              oldBinding.role === binding.role &&
              (!['env', 'lfo'].includes(module.type) ||
                oldBinding.target?.module === rename.get(binding.target?.module ?? '')) &&
              oldBinding.target?.jack === binding.target?.jack &&
              oldBinding.target?.control === binding.target?.control &&
              oldBinding.target?.path === binding.target?.path,
          )
          const oldCalls = oldBindings.flatMap((binding) => binding.calls)
          // The writer records one binding per call; the reader groups settings.
          // A readable subset split by opaque code can still keep its identity.
          return (
            !calls.includes(undefined) &&
            oldBindings.length > 0 &&
            (calls.length === 0
              ? oldCalls.length === 0
              : calls.every((index) => index !== undefined && oldCalls.includes(index)))
          )
        }),
    )
    if (candidates.length !== 1) continue
    const old = candidates[0]
    if (!old) continue
    // Only controls expressed by this adapter constrain a shared source. The saved
    // binding proves ownership; final graph/source comparison still checks semantics.
    const written = represented.get(module.id)
    if (written)
      for (const c of getModuleSpec(module.type).controls) {
        if (written.has(c.id)) continue
        const stored = old.values[c.id]
        if (stored === undefined) delete module.values[c.id]
        else module.values[c.id] = stored
      }
    // An absent shared depth means target-owned defaults, even when they differ in units.
    if (['env', 'lfo'].includes(module.type) && old.values['depth'] === undefined) {
      const defaults = own.flatMap((b) => {
        const target = patch.modules.find((m) => m.id === b.target?.module)
        const c =
          target && getModuleSpec(target.type).controls.find((c) => c.id === b.target?.control)
        return c?.kind === 'knob' && c.modulation ? [c.modulation.default] : []
      })
      if (defaults.length && defaults.every((depth) => module.values['depth'] === depth))
        delete module.values['depth']
    }
    if (claimed.has(old.id)) {
      const shared = patch.modules.find((item) => rename.get(item.id) === old.id)
      // Repeated context-specific calls represent one ENV only while all values agree.
      const effective = (m: PlacedModule) =>
        getModuleSpec(m.type).controls.map((c) => controlValue(m, c))
      if (!shared || descriptor(effective(shared)) !== descriptor(effective(module))) continue
    }
    claimed.add(old.id)
    rename.set(module.id, old.id)
    module.row = old.row
    module.hp = old.hp
    module.look = old.look
  }
  patch.modules = patch.modules.filter(
    (module, index, modules) =>
      modules.findIndex(
        (item) => (rename.get(item.id) ?? item.id) === (rename.get(module.id) ?? module.id),
      ) === index,
  )
  // Restored positions are occupied even when they are on a later overflow row.
  const occupied = patch.modules.filter((module) => module.type !== 'out' && rename.has(module.id))
  const ends = new Map<number, number>()
  for (const module of occupied)
    ends.set(
      module.row,
      Math.max(ends.get(module.row) ?? 0, module.hp + getModuleSpec(module.type).hp),
    )
  for (const module of patch.modules) {
    if (!rename.has(module.id)) {
      Object.assign(
        module,
        nextPosition(
          occupied,
          module.type,
          module.row,
          ends.get(module.row) ?? 0,
          railWidth(patch),
        ),
      )
      occupied.push(module)
      ends.set(module.row, module.hp + getModuleSpec(module.type).hp)
    }
    module.id = rename.get(module.id) ?? module.id
  }
  for (const cable of patch.cables) {
    cable.from.module = rename.get(cable.from.module) ?? cable.from.module
    cable.to.module = rename.get(cable.to.module) ?? cable.to.module
  }
  for (const binding of bindings) {
    binding.module = rename.get(binding.module) ?? binding.module
    if (binding.target)
      binding.target.module = rename.get(binding.target.module) ?? binding.target.module
  }
  patch.names = Object.fromEntries(
    Object.entries(patch.names).map(([key, name]) => {
      const [id, jack] = key.split(':')
      return [`${rename.get(id ?? '') ?? id}:${jack}`, name]
    }),
  )
  for (const module of patch.modules.filter((module) => module.type === 'mix')) {
    const old = saved.modules.find((item) => item.id === module.id)
    if (!old) continue
    const incoming = patch.cables.filter((cable) => cable.to.module === module.id)
    const channels = incoming.map((cable) => {
      const previous = saved.cables.filter(
        (item) =>
          item.to.module === old.id &&
          item.from.module === cable.from.module &&
          item.from.jack === cable.from.jack,
      )
      return previous.length === 1 ? previous[0]?.to.jack : undefined
    })
    // A changed/ambiguous receiver or reordered voice set cannot prove channel ownership.
    if (
      channels.some((jack) => jack === undefined) ||
      new Set(channels).size !== channels.length ||
      channels.some((jack, index) => index > 0 && String(jack) <= String(channels[index - 1]))
    )
      continue
    const values = { ...old.values }
    const controls = new Map<string, string>()
    incoming.forEach((cable, index) => {
      const jack = channels[index]
      if (!jack) return
      const before = `ch${cable.to.jack.slice(2)}`
      const after = `ch${jack.slice(2)}`
      values[after] = module.values[before] ?? 1
      controls.set(before, after)
      cable.to.jack = jack
    })
    module.values = values
    for (const binding of bindings.filter(
      (binding) => binding.module === module.id && binding.role === 'mixer',
    ))
      binding.controls = Object.fromEntries(
        Object.entries(binding.controls).map(([id, span]) => [controls.get(id) ?? id, span]),
      )
  }
  graph(patch)
}

export function tryRead(source: string): ReadResult {
  try {
    return { kind: 'parsed', document: read(source) }
  } catch (error) {
    if (
      !(error instanceof SyntaxError) ||
      !('pos' in error) ||
      typeof error.pos !== 'number' ||
      !('loc' in error) ||
      typeof error.loc !== 'object' ||
      error.loc === null ||
      !('line' in error.loc) ||
      typeof error.loc.line !== 'number' ||
      !('column' in error.loc) ||
      typeof error.loc.column !== 'number'
    )
      throw error
    const opener = unclosedBracket(source, error.pos)
    const offset = opener?.offset ?? Math.min(error.pos, codeEnd(source))
    const lines = source.slice(0, offset).split(/\r\n|\r|\n/)
    const line = lines.length
    const column = lines.at(-1)?.length ?? 0
    return {
      kind: 'invalid',
      source,
      offset,
      line,
      column,
      message: opener
        ? `Unclosed '${opener.bracket}' (${line}:${column})`
        : error.message.replace(/\(\d+:\d+\)$/, `(${line}:${column})`),
    }
  }
}
