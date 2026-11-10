import { packImported } from '../patch/importLayout'
import { bytebeatSyntax } from '../modules/bytebeat'
import { packSetup } from '../samples/packs'
import { planEffects } from '../codegen/effects'
import { effectRank } from '../modules/effects'
import { isLoopChain, loopControls, patternRuntimeNames } from '../modules/functions'
import { controlValue } from '../modules/values'
import { sectionOrder } from '../modules/sections'
import { parseExpressionAt, tokenizer, type Expression, type Node } from 'acorn'
import { graph } from '../codegen/graph'
import { generate, generateDocument } from '../codegen/generate'
import { descriptor, type RackLayout } from '../codegen/layout'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { callMethod, matchControlCall, tupleControls, controlEnabled } from '../modules/bindings'
import { DEFAULT_LOOK } from '../modules/looks'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { nextPosition, railWidth } from '../patch/layout'
import { matchRouting, matchScopes, readLayout } from './layout'
import { codeEnd } from './metadata'
import { unclosedBracket } from './diagnostics'
import {
  chain,
  expressionScope,
  parseSource,
  scalar,
  nestedScope,
  localBinding,
  usesParameter,
  bindingScope,
  type Call,
  type ParsedScope,
} from './syntax'
import type { ReadResult, SourceAddress, SourceBinding, SourceDocument, Span } from './types'

import { numericNotation } from '../patch/notation'
import { isArrangement } from '../patch/arrangement'
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

function soundOwner(call: Call, next?: Call, source = false): string | undefined {
  const wave = scalar(call.args[0])
  if (call.args.length !== 1 || typeof wave !== 'string') return undefined
  const knownWave = CATALOG.some((spec) => {
    if (typeof spec.soundSource === 'object') return spec.soundSource.fixed === wave
    const control = spec.controls.find(
      (control) => control.id === (spec.id === 'osc' ? 'wave' : spec.soundSource),
    )
    return (
      control?.kind === 'switch' &&
      control.options.some((option) => option.value === (control.aliases?.[wave] ?? wave))
    )
  })
  if (/^wt_[\w-]+(?::\d+)?$/.test(wave)) return 'wavetable'
  if (
    /^[\w-]+(?::\d+)?$/.test(wave) &&
    next &&
    ['slice', 'splice', 'chop', 'striate'].includes(next.name) &&
    (() => {
      const match = matchControlCall(getModuleSpec('splice'), next.name)
      if (!match || match.binding.argument.kind !== 'tuple') return false
      const ids = tupleControls(match.binding, next.name)
      return (
        next.args.length === ids.length &&
        ids.every((id, i) => {
          const value = scalar(next.args[i])
          return value !== undefined && fits('splice', id, value)
        })
      )
    })()
  )
    return 'splice'
  return CATALOG.find((spec) => {
    if (typeof spec.soundSource === 'object') return spec.soundSource.fixed === wave
    const control = spec.controls.find((c) => c.id === spec.soundSource)
    if (spec.id === 'smpl' && !source && !knownWave && /^[\w-]+(?::\d+)?$/.test(wave)) return true
    if (
      control?.kind !== 'switch' ||
      !control.options.some((o) => o.value === (control.aliases?.[wave] ?? wave))
    )
      return false
    if (spec.id !== 'harmonic') return true
    const arg = next?.args[0]
    const bars = spec.controls.find((control) => control.kind === 'drawbars')
    return (
      next?.name === 'partials' &&
      next.args.length === 1 &&
      arg?.type === 'ArrayExpression' &&
      arg.elements.length > 0 &&
      bars?.kind === 'drawbars' &&
      arg.elements.length <= bars.maxBars &&
      arg.elements.every((e) => {
        const n = e && scalar(e)
        return typeof n === 'number' && n >= bars.min && n <= bars.max
      })
    )
  })?.id
}

function fits(type: string, id: string, value: number | string): boolean {
  const control = getModuleSpec(type).controls.find((control) => control.id === id)
  if (!control) return false
  switch (control.kind) {
    case 'drawbars':
      return false
    case 'knob':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= control.min &&
        value <= control.max &&
        (control.step !== 1 || Number.isInteger(value))
      )
    case 'switch':
      return control.options.some(
        (option) =>
          option.value ===
          (typeof value === 'string' ? (control.aliases?.[value] ?? value) : value),
      )
    case 'text':
      return (
        typeof value === 'string' &&
        (control.syntax !== 'bytebeat' || (value !== '' && bytebeatSyntax(value)))
      )
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
  parsed: ReturnType<typeof parseSource>,
  saved?: RackLayout,
  snapshot?: ParsedScope[],
): { patch: Patch; bindings: SourceBinding[]; represented: Map<string, Set<string>> } {
  const { scopes, program } = parsed
  // A local helper is executable CODE, not the engine's literal-pattern constructor.
  function mayShadowCombiner(value: unknown, name = 'stack'): boolean {
    if (!value || typeof value !== 'object') return false
    const node = Object.fromEntries(Object.entries(value))
    if (
      (node.type === 'VariableDeclarator' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration') &&
      usesParameter(node.id, name)
    )
      return true
    if (
      (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
      usesParameter(node.params, name)
    )
      return true
    if (node.type === 'AssignmentExpression') {
      const left = node.left
      if (usesParameter(left, name)) return true
      if (left && typeof left === 'object' && 'property' in left) {
        const property = left.property
        if (
          property &&
          typeof property === 'object' &&
          (('name' in property && property.name === name) ||
            ('value' in property && property.value === name))
        )
          return true
      }
    }
    const callee = node.callee
    if (
      node.type === 'CallExpression' &&
      callee &&
      typeof callee === 'object' &&
      'name' in callee &&
      callee.name === 'register' &&
      Array.isArray(node.arguments)
    ) {
      const registration: unknown = node.arguments[0]
      const knownOtherName = (item: unknown): boolean =>
        !!item &&
        typeof item === 'object' &&
        'type' in item &&
        item.type === 'Literal' &&
        'value' in item &&
        typeof item.value === 'string' &&
        item.value !== name
      if (
        !knownOtherName(registration) &&
        !(
          registration &&
          typeof registration === 'object' &&
          'type' in registration &&
          registration.type === 'ArrayExpression' &&
          'elements' in registration &&
          Array.isArray(registration.elements) &&
          registration.elements.every(knownOtherName)
        )
      )
        return true
    }
    return Object.values(value).some((child) => mayShadowCombiner(child, name))
  }
  const stackShadowed = mayShadowCombiner(program)
  const arrangeShadowed = mayShadowCombiner(program, 'arrange')
  const localRuntimeNames = new Set([...patternRuntimeNames(), 'silence'])
  const pureShadowed = program.body.some((statement) =>
    statement.type === 'ExpressionStatement'
      ? statement.expression.type === 'AssignmentExpression' &&
        usesParameter(statement.expression.left, 'pure')
      : statement.type !== 'LabeledStatement' && usesParameter(statement, 'pure'),
  )
  const patch: Patch = { version: 1, modules: [], cables: [], names: {} }
  if (saved?.name !== undefined) patch.name = saved.name
  const cartridges = packSetup(saved?.cartridges ?? [])
  if (saved?.cartridges !== undefined && source.startsWith(cartridges))
    patch.cartridges = saved.cartridges
  if (saved?.prelude !== undefined && source.slice(cartridges.length).startsWith(saved.prelude))
    patch.prelude = saved.prelude
  if (saved?.railHp !== undefined) patch.railHp = saved.railHp
  const bindings: SourceBinding[] = []
  const represented = new Map<string, Set<string>>()
  const reserved = new Set(saved?.modules.map((module) => module.id))
  const routing = saved && snapshot ? matchRouting(saved.scopes, scopes, snapshot) : undefined
  const gains = new Map<string, { call: Call; index: number; upstream: Output }>()
  const mixerModulations = new Map<string, { index: number; upstream: Output }[]>()
  const outputChannels = new Map<string, { value: string; index: number }>()
  const arrangements = new Map<string, { index: number }>()
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
    if (spec.operatorTarget) represented.set(id, new Set())
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
  function soundInput(from: Output, type: string): Output {
    if (
      !needsSampler(from) ||
      !getModuleSpec(type).jacks.some((jack) => jack.direction === 'in' && jack.signal === 'audio')
    )
      return from
    const sampler = add('smpl', { bank: '', speed: 1 })
    wire(from, sampler)
    return output(sampler)
  }
  function hasOpaqueInput(from: Output, visited = new Set<string>()): boolean {
    if (visited.has(from.module.id)) return false
    visited.add(from.module.id)
    if (from.module.type === 'code') return true
    return patch.cables
      .filter((cable) => cable.to.module === from.module.id)
      .some((cable) => {
        const module = patch.modules.find((module) => module.id === cable.from.module)
        return module ? hasOpaqueInput({ module, jack: cable.from.jack }, visited) : false
      })
  }
  function bind(
    module: PlacedModule,
    scope: ParsedScope,
    indices: number[],
    controls: Record<string, Span> = {},
    semantic: Pick<SourceAddress, 'role' | 'target' | 'part'> = { role: 'module' },
  ): void {
    const calls = indices.flatMap((index) => scope.calls[index] ?? [])
    const start = calls[0]?.start ?? scope.start
    const end = calls.at(-1)?.end ?? scope.end
    const previous = bindings.find(
      (binding) =>
        binding.module === module.id &&
        binding.scope === scope.descriptor.id &&
        descriptor([binding.loop, binding.path]) === descriptor([scope.loop, scope.path]) &&
        binding.role === semantic.role &&
        binding.part === semantic.part &&
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
        ...(scope.loop ? { loop: scope.loop } : {}),
        ...(scope.path ? { path: scope.path } : {}),
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
    const arg = literalArgument(module.type, id, call.args[0])
    const value = scalar(arg)
    if (call.args.length !== 1 || value === undefined || !arg || !fits(module.type, id, value))
      return false
    const control = getModuleSpec(module.type).controls.find((c) => c.id === id)
    module.values[id] =
      control?.kind === 'switch' && typeof value === 'string'
        ? (control.aliases?.[value] ?? value)
        : value
    represented.get(module.id)?.add(id)
    bind(module, scope, [index], literalControls(id, arg))
    return true
  }
  function literalControls(id: string, arg: Node | undefined): Record<string, Span> {
    if (
      !arg ||
      !['Literal', 'TemplateLiteral', 'UnaryExpression', 'BinaryExpression'].includes(arg.type) ||
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
  function literalArgument(
    type: string,
    id: string,
    arg: Call['args'][number] | undefined,
  ): Call['args'][number] | undefined {
    const control = getModuleSpec(type).controls.find((c) => c.id === id)
    if (control?.kind !== 'text' || control.syntax !== 'bytebeat') return arg
    if (
      pureShadowed ||
      arg?.type !== 'CallExpression' ||
      arg.callee.type !== 'Identifier' ||
      arg.callee.name !== 'pure' ||
      arg.arguments.length !== 1
    )
      return undefined
    const text = arg.arguments[0]
    return text?.type === 'Literal' && typeof text.value === 'string' && source[text.start] === "'"
      ? text
      : undefined
  }
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
  function code(
    scope: ParsedScope,
    indices: number[],
    text: string,
    upstream?: Output,
    span?: Span,
  ): Output {
    const module = add('code', { text })
    if (upstream) wire(upstream, module)
    bind(module, scope, indices)
    if (span || (!upstream && indices.length === scope.calls.length)) {
      const binding = bindings.at(-1)
      if (binding) {
        binding.start = span?.start ?? scope.start
        binding.end = span?.end ?? scope.end
      }
    }
    return output(module)
  }
  function retainDeferredCode(
    scope: ParsedScope,
    index: number,
    upstream: Output,
    target: Patch['cables'][number]['to'],
  ) {
    const call = scope.calls[index]
    if (!call) return
    const cable = patch.cables.find(
      (cable) =>
        cable.from.module === upstream.module.id &&
        cable.from.jack === upstream.jack &&
        ((cable.to.module === target.module && cable.to.jack === target.jack) ||
          bindings.some(
            (binding) =>
              binding.module === cable.to.module &&
              binding.scope === scope.descriptor.id &&
              descriptor([binding.loop, binding.path]) === descriptor([scope.loop, scope.path]) &&
              binding.calls.some((later) => later > index),
          )),
    )
    const opaque = code(scope, [index], source.slice(call.start, call.end), upstream)
    if (cable) cable.from = { module: opaque.module.id, jack: opaque.jack }
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
    const patterns = new Map<PlacedModule, ModPattern>()
    function insert(pattern: ModPattern): Output {
      if (pattern.type === 'reference') {
        const reference = typeof pattern.values.name === 'string' && resolve(pattern.values.name)
        if (!reference) throw new Error('Unknown mod reference')
        return reference
      }
      const module = add(pattern.type, pattern.values)
      patterns.set(module, pattern)
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
        patterns.get(module)?.literal ? { steps: patterns.get(module)?.literal ?? arg } : {},
        { ...semantic, target: { ...semantic.target, ...(path ? { path } : {}) } },
      )
    bind(target, scope, [index])
    return true
  }

  function audioCV(
    call: Call,
    targetModule: PlacedModule,
    scope: ParsedScope,
    index: number,
    controlId?: string,
  ): boolean {
    if (
      !['lfo', 'env'].includes(call.name) ||
      call.args.length !== 1 ||
      call.args[0]?.type === 'SpreadElement'
    )
      return false
    const config = modConfig(call.args[0])
    const spec = getModuleSpec(targetModule.type)
    const targetControl = spec.controls.find(
      (item) =>
        item.kind === 'knob' &&
        item.call &&
        (controlId === undefined || item.id === controlId) &&
        spec.jacks.some((j) => j.cvTarget === item.id) &&
        ((config?.c === undefined &&
          canonicalCall(scope.calls[index - 1]?.name ?? '') ===
            callMethod(item.call, (id) => {
              const v = targetModule.values[id] ?? spec.controls.find((c) => c.id === id)?.default
              return typeof v === 'string' ? v : ''
            })) ||
          config?.c ===
            callMethod(item.call, (id) => {
              const value =
                targetModule.values[id] ?? spec.controls.find((c) => c.id === id)?.default
              return typeof value === 'string' ? value : ''
            })),
    )
    const jack = targetControl && spec.jacks.find((j) => j.cvTarget === targetControl.id)
    const data = targetControl?.kind === 'knob' ? targetControl.modulation : undefined
    const normalizedDepth =
      typeof config?.depthabs === 'number' ? config.depthabs / (data?.audioScale ?? 1) : undefined
    if (
      config &&
      targetControl &&
      jack &&
      data &&
      typeof config.depthabs === 'number' &&
      normalizedDepth !== undefined &&
      normalizedDepth >= data.min &&
      normalizedDepth <= data.max &&
      !patch.cables.some((c) => c.to.module === targetModule.id && c.to.jack === jack.id)
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
              const v = targetModule.values[id] ?? spec.controls.find((c) => c.id === id)?.default
              return typeof v === 'string' ? v : ''
            })
          : ''
      const base = targetModule.values[targetControl.id] ?? targetControl.default
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
                depth: config.dc === -1 ? -normalizedDepth : normalizedDepth,
              })
            : add('env', {
                atk: config.a ?? 0,
                dec: config.d ?? 0,
                sus: config.s ?? 0,
                rel: config.r ?? 0,
                depth: normalizedDepth,
              })
        wire(output(module), targetModule, jack.id)
        bind(
          module,
          scope,
          [index],
          {},
          {
            role: 'cv',
            target: { module: targetModule.id, jack: jack.id, control: targetControl.id },
          },
        )
        return true
      }
    }
    return false
  }

  function expression(
    scope: ParsedScope,
    receiverOutput?: Output,
    locals?: ReadonlyMap<string, Output>,
  ): Output {
    const { root, calls } = scope
    const previous =
      saved &&
      snapshot &&
      bindingScope(snapshot, {
        scope: scope.descriptor.id,
        ...(scope.loop ? { loop: scope.loop } : {}),
        ...(scope.path ? { path: scope.path } : {}),
      })
    const savedScope =
      previous &&
      descriptor([previous.descriptor.root, previous.descriptor.calls]) ===
        descriptor([scope.descriptor.root, scope.descriptor.calls])
        ? previous.descriptor
        : undefined
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
                if (!(
                  binding.scope === savedScope.id &&
                  descriptor([binding.loop, binding.path]) ===
                    descriptor([scope.loop, scope.path]) &&
                  binding.role === 'module' &&
                  (indices[0] === index || (receiver && !calls.length && !indices.length)) &&
                  indices.every((value, offset) => value === index + offset) &&
                  begin !== undefined &&
                  end !== undefined &&
                  typeof module.values['text'] === 'string'
                ))
                  return []
                const text = module.values['text']
                if (!receiver && text.trimStart().startsWith('.')) {
                  try {
                    const prefix = 'silence'
                    const ast = parseExpressionAt(`${prefix}${text}\n`, 0, {
                      ecmaVersion: 'latest',
                    })
                    const start = end - (ast.end - prefix.length),
                      stop = start + text.length
                    const comments: Span[] = []
                    const next = tokenizer(source.slice(end), {
                      ecmaVersion: 'latest',
                      onComment: (_block, _text, start, stop) => {
                        comments.push({ start: end + start, end: end + stop })
                      },
                    }).getToken()
                    if (
                      start >= begin &&
                      stop > end &&
                      [...tokenizer(source.slice(begin, start), { ecmaVersion: 'latest' })]
                        .length === 0 &&
                      source.slice(start, stop) === text &&
                      // Own whole trivia only: a saved comment prefix is not its boundary.
                      end + next.start >= stop &&
                      !comments.some((comment) => comment.start < stop && stop < comment.end)
                    )
                      return [{ indices, text, span: { start, end: stop } }]
                  } catch {
                    /* Unsupported stored syntax cannot acquire ownership. */
                  }
                }
                if (receiver && !text.trimStart().startsWith('.')) {
                  try {
                    // The stored CODE expression proves trivia offsets inside its wrapper.
                    // Require its entire current byte range, including comments, to match.
                    const ast = parseExpressionAt(`(${text}\n)`, 0, { ecmaVersion: 'latest' })
                    const start = begin - (ast.start - 1),
                      stop = start + text.length
                    if (
                      start >= 0 &&
                      start + ast.end - 1 === end &&
                      source.slice(start, stop) === text
                    )
                      return [{ indices, text, span: { start, end: stop } }]
                  } catch {
                    /* Unsupported stored syntax cannot acquire ownership. */
                  }
                }
                return source.slice(begin, end).trimStart() === text.trimStart()
                  ? [{ indices, text: source.slice(begin, end), span: { start: begin, end } }]
                  : []
              })
            : [],
        )[0]
      )
    }
    function soundAt(call: Call, index: number, source = false) {
      const wave = getModuleSpec('osc').controls.find((control) => control.id === 'wave')
      const literal = scalar(call.args[0])
      const sound =
        soundOwner(call, calls[index + 1], source) ??
        (wave?.kind === 'switch' && typeof literal === 'string' && wave.aliases?.[literal]
          ? 'osc'
          : undefined)
      // A new oscillator alias must retain earlier source/chained sampler ownership.
      // Exact scope/call ownership is still independently checked against its graph.
      if (
        sound === 'osc' &&
        savedScope &&
        saved?.modules.some(
          (module) =>
            (module.type === 'smpl' || (source && module.type === 'drums')) &&
            module.bindings.some(
              (binding) =>
                binding.scope === savedScope.id &&
                descriptor([binding.loop, binding.path]) === descriptor([scope.loop, scope.path]) &&
                binding.role === 'module' &&
                binding.calls.includes(index),
            ),
        )
      )
        return source ? undefined : 'smpl'
      return sound
    }
    if (!scope.loop && !scope.path && scope.kind === 'declaration' && !retainedCode(0, true)) {
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
          bind(module, scope, indices, item.literal ? { steps: item.literal } : {})
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
    let upstream: Output | undefined = receiverOutput
    let start = 0
    let group: PlacedModule | undefined
    const arrangeIndex = calls.findLastIndex((call) => call.name === 'arrange' && !call.receiver)
    if (
      !receiverOutput &&
      !locals &&
      arrangeIndex >= 0 &&
      !arrangeShadowed &&
      !retainedCode(0, true) &&
      !calls.some((_, index) => retainedCode(index)?.indices.includes(arrangeIndex))
    ) {
      const call = calls[arrangeIndex]
      const tuples = call?.args
      if (
        tuples?.length &&
        tuples.every(
          (tuple) =>
            tuple.type === 'ArrayExpression' &&
            tuple.elements.length === 2 &&
            tuple.elements[0]?.type === 'Literal' &&
            typeof tuple.elements[0].value === 'number' &&
            Number.isFinite(tuple.elements[0].value) &&
            tuple.elements[0].value > 0 &&
            tuple.elements[1] &&
            tuple.elements[1].type !== 'SpreadElement',
        )
      ) {
        const inputs = tuples.map((tuple, argument) => {
          if (tuple.type !== 'ArrayExpression') throw new Error('Invalid section tuple')
          const duration = tuple.elements[0]
          if (duration?.type !== 'Literal' || typeof duration.value !== 'number')
            throw new Error('Invalid section cycles')
          const child = expressionScope(scope, { call: arrangeIndex, argument, element: 1 })
          if (!child) throw new Error('Invalid section expression')
          const from = expression(child)
          return { from: needsSampler(from) ? soundInput(from, 'vca') : from, duration }
        })
        const sections = getModuleSpec('sections').sections
        if (!sections) throw new Error('Missing section catalog')
        const { inputs: sockets, next: nextJack } = sections
        function combine(offset: number): Output {
          const bus = add('sections')
          const controls: Record<string, Span> = {}
          for (const [index, slot] of sockets.entries()) {
            const input = inputs[offset + index]
            if (!input) continue
            bus.values[slot.cycles] = String(input.duration.value)
            represented.get(bus.id)?.add(slot.cycles)
            Object.assign(controls, literalControls(slot.cycles, input.duration))
            wire(input.from, bus, slot.jack)
          }
          if (offset + sockets.length < inputs.length)
            wire(combine(offset + sockets.length), bus, nextJack)
          bind(bus, scope, [arrangeIndex], controls, { role: 'module', part: offset })
          return output(bus)
        }
        upstream = combine(0)
        start = arrangeIndex + 1
      }
    }
    const stackIndex = calls.findLastIndex((call) => call.name === 'stack')
    if (
      !upstream &&
      !receiverOutput &&
      stackIndex >= 0 &&
      !stackShadowed &&
      !locals?.has('stack') &&
      !retainedCode(0, true) &&
      !calls.some((_, index) => retainedCode(index)?.indices.includes(stackIndex))
    ) {
      const call = calls[stackIndex]
      if (call && call.args.every((arg) => arg.type !== 'SpreadElement')) {
        const parts = [
          ...(call.receiver ? [{ call: stackIndex, argument: 'receiver' as const }] : []),
          ...call.args.map((_, argument) => ({ call: stackIndex, argument })),
        ]
        if (locals && !parts.length) throw new Error('Empty local Stack stays CODE')
        const inputs = parts.map((step) => {
          const child = expressionScope(scope, step)
          if (!child) throw new Error('Invalid static input')
          const value = expression(child, undefined, locals)
          if (step.argument === 'receiver' && hasOpaqueInput(value))
            throw new Error('Ambiguous receiver stack method stays CODE')
          return needsSampler(value) ? soundInput(value, 'vca') : value
        })
        const spec = getModuleSpec('mix')
        const sockets = spec.composition?.inputs ?? []
        function combine(offset: number): Output {
          const bus = add('mix', { mode: 'Stack' })
          const remaining = inputs.length - offset
          const count = remaining > sockets.length ? sockets.length - 1 : remaining
          for (let i = 0; i < count; i++) {
            const input = inputs[offset + i],
              socket = sockets[i]
            if (input && socket) wire(input, bus, socket)
          }
          if (remaining > sockets.length) wire(combine(offset + count), bus, sockets.at(-1))
          bind(
            bus,
            scope,
            [stackIndex],
            {},
            { role: 'module', ...(inputs.length > sockets.length ? { part: offset } : {}) },
          )
          return output(bus)
        }
        upstream = combine(0)
        start = stackIndex + 1
      }
    }
    const receiver = !receiverOutput && retainedCode(0, true)
    if (receiver && !upstream) {
      upstream = code(scope, receiver.indices, receiver.text, undefined, receiver.span)
      start = (receiver.indices.at(-1) ?? -1) + 1
    }
    const local = localBinding(root)
    if (!upstream && local && locals) {
      if (
        !/^[A-Za-z_$][\w$]*$/.test(local.parameter) ||
        locals.has(local.parameter) ||
        localRuntimeNames.has(local.parameter)
      )
        throw new Error('Ambiguous local binding shadow')
      const argument = expressionScope(scope, { call: 0, argument: 'value' })
      const body = expressionScope(scope, { call: 0, argument: 'binding' })
      if (!argument || !body) throw new Error('Invalid local binding')
      const bound = expression(argument, undefined, locals)
      if (
        [...locals.values()].some(
          (value) => value.module.id === bound.module.id && value.jack === bound.jack,
        )
      )
        throw new Error('Local reference aliases stay CODE')
      patch.names[`${bound.module.id}:${bound.jack}`] = local.parameter
      upstream = expression(body, undefined, new Map([...locals, [local.parameter, bound]]))
      if (
        (upstream.module !== bound.module || upstream.jack !== bound.jack) &&
        !patch.cables.some((c) => c.from.module === bound.module.id && c.from.jack === bound.jack)
      )
        throw new Error('Opaque-only or unused local bindings stay CODE')
    }
    if (!upstream && root.type === 'Identifier') {
      upstream = locals?.get(root.name) ?? (!locals ? resolve(root.name) : undefined)
      if (locals && !upstream) throw new Error('Captured patterns stay CODE')
      if (!upstream && fits('lfo', 'shape', root.name)) {
        group = add('lfo', { shape: root.name, rate: 1 })
        bind(group, scope, [])
        upstream = output(group)
      }
    }
    if (locals && !upstream) throw new Error('Unsupported local expression')
    const initial = calls[0]
    if (
      !upstream &&
      initial?.name === 'pick' &&
      initial.args.length === 1 &&
      typeof scalar(root) === 'string' &&
      initial.args[0]?.type === 'ArrayExpression' &&
      initial.args[0].elements.length === 4
    ) {
      const inputs = initial.args[0].elements.map((e) =>
        e?.type === 'Identifier' ? (e.name === 'silence' ? null : resolve(e.name)) : undefined,
      )
      if (inputs.every((e) => e !== undefined)) {
        const module = add('switch', { steps: String(scalar(root)) })
        inputs.forEach((e, i) => {
          if (e) wire(e, module, `in${i + 1}`)
        })
        bind(module, scope, [0], literalControls('steps', root))
        upstream = output(module)
        group = module
        start = 1
      }
    }
    if (
      !upstream &&
      initial?.name === 'freq' &&
      initial.args.length === 1 &&
      calls[1]?.name === 's' &&
      calls[1].args.length === 1 &&
      fits('osc', 'wave', scalar(calls[1].args[0]) ?? '')
    ) {
      const frequency = scalar(initial.args[0])
      if (typeof frequency === 'number' && fits('osc', 'freq', frequency)) {
        group = add('osc', { mode: 'freq', freq: frequency })
        literal(group, 'freq', initial, scope, 0)
        upstream = output(group)
        start = 1
      }
    }
    if (!upstream && initial && initial.start === root.start && initial.name !== 'stack') {
      const sound = initial.name === 's' && soundAt(initial, 0, true)
      const type = sound || owner(initial.name, true)
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
      if (sound) {
        const spec = getModuleSpec(sound)
        const id =
          sound === 'osc'
            ? 'wave'
            : typeof spec.soundSource === 'string'
              ? spec.soundSource
              : undefined
        group = add(sound, {
          ...spec.readDefaults,
          ...(sound === 'splice' ? { mode: calls[1]?.name ?? 'slice' } : {}),
        })
        if (id) literal(group, id, initial, scope, 0)
        else bind(group, scope, [0])
        upstream = output(group)
        start = 1
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
      if (!scope.loop && !scope.path && routing?.get(scope.descriptor.id)?.call === index) continue
      const opaque = retainedCode(index)
      if (opaque) {
        upstream = code(scope, opaque.indices, opaque.text, upstream, opaque.span)
        group = undefined
        index = opaque.indices.at(-1) ?? index
        continue
      }
      // A local Pattern used as an argument is not a global CV source or preset.
      if (
        locals &&
        call.args.some((arg) => [...locals.keys()].some((name) => usesParameter(arg, name)))
      )
        return code(
          scope,
          calls.flatMap((_, i) => (i >= index ? [i] : [])),
          source.slice(call.start, scope.end),
          upstream,
        )
      if (
        call.name === 'struct' &&
        call.args.length === 1 &&
        group?.type === 'seq' &&
        upstream.module === group &&
        typeof scalar(call.args[0]) === 'string' &&
        !patch.cables.some((c) => c.to.module === group?.id && c.to.jack === 'gate')
      ) {
        const gates = add('gates', { steps: String(scalar(call.args[0])) })
        wire(output(gates), group, 'gate')
        literal(gates, 'steps', call, scope, index)
        group = undefined // later fast/velocity calls act after the gate rhythm
        continue
      }
      if (call.name === 'FX' && call.args.length > 0) {
        const checkpoint = structuredClone(patch)
        const bindingStart = bindings.length
        const previousDepths = new Map(depths)
        const previousResolved = new Map(resolved)
        const oldRow = row,
          oldHp = hp
        let current: Output = upstream
        let accepted = true
        for (const [argumentIndex, argument] of call.args.entries()) {
          if (argument.type === 'SpreadElement') {
            accepted = false
            break
          }
          const nested = chain(argument)
          if (
            nested.root.type !== 'CallExpression' ||
            nested.root.callee.type !== 'Identifier' ||
            !nested.calls.length ||
            nested.calls.some((c) => c.name === 'FX')
          ) {
            accepted = false
            break
          }
          const moduleStart = patch.modules.length
          const firstBinding = bindings.length
          const nestedScope: ParsedScope = {
            ...scope,
            expression: argument,
            root: parseExpressionAt('_', 0, { ecmaVersion: 'latest' }),
            calls: nested.calls,
            start: argument.start,
            end: argument.end,
            descriptor: {
              ...scope.descriptor,
              id: `${scope.descriptor.id}/FX/${index}/${argumentIndex}`,
            },
          }
          current = expression(nestedScope, current)
          const added = patch.modules.slice(moduleStart)
          const stages = added.filter((m) => effectRank(m) !== undefined)
          // One argument is one fixed-order stage. Unsupported companions, helpers,
          // pattern transforms, or repeated owners remain exact outer CODE.
          if (
            stages.length !== 1 ||
            stages.some(
              (m) => getModuleSpec(m.type).strudel.includes('ftype') && m.values.type === '24db',
            ) ||
            added.some(
              (m) =>
                effectRank(m) === undefined &&
                !['lfo', 'env', 'cvseq', 'samplehold', 'attenuverter', 'modmix'].includes(m.type),
            )
          ) {
            accepted = false
            break
          }
          for (const stage of stages) stage.fx = true
          for (const binding of bindings
            .slice(firstBinding)
            .filter((b) => b.scope === nestedScope.descriptor.id)) {
            binding.scope = scope.descriptor.id
            binding.calls = [index]
            binding.fx = argumentIndex
            binding.start = argument.start
            binding.end = argument.end
          }
        }
        if (accepted) {
          upstream = current
          group = undefined
          continue
        }
        patch.modules = checkpoint.modules
        patch.cables = checkpoint.cables
        patch.names = checkpoint.names
        bindings.splice(bindingStart)
        depths.clear()
        previousDepths.forEach((value, key) => depths.set(key, value))
        resolved.clear()
        previousResolved.forEach((value, key) => resolved.set(key, value))
        row = oldRow
        hp = oldHp
      }
      const name = canonicalCall(call.name)
      const type =
        name === 'n'
          ? group?.type === 'bytebeat'
            ? 'bytebeat'
            : 'smpl'
          : name === 'velocity' &&
              (group?.type === 'seq' || group?.type === 'drums') &&
              typeof scalar(call.args[0]) === 'string'
            ? group.type
            : name === 'fast' && group?.type !== 'seq'
              ? 'clock'
              : (name === 's' && soundAt(call, index)) || owner(name, false)
      const mixerModulation = (call: Call) =>
        ['lfo', 'env'].includes(call.name) &&
        call.args.length === 1 &&
        call.args[0]?.type !== 'SpreadElement' &&
        modConfig(call.args[0])?.c === 'postgain'
      if (
        gains.has(scope.descriptor.id) &&
        mixerModulation(call) &&
        calls
          .slice(index + 1)
          .every((call) => ['orbit', 'channels'].includes(call.name) || mixerModulation(call))
      ) {
        mixerModulations.set(scope.descriptor.id, [
          ...(mixerModulations.get(scope.descriptor.id) ?? []),
          { index, upstream },
        ])
        continue
      }
      if (
        type === 'mix' &&
        call.name === 'postgain' &&
        scope.kind === 'voice' &&
        calls
          .slice(index + 1)
          .every((call) => ['orbit', 'channels'].includes(call.name) || mixerModulation(call))
      ) {
        const value = scalar(call.args[0])
        if (
          call.args.length === 1 &&
          typeof value === 'number' &&
          fits('mix', 'ch1', value) &&
          !(value === 1 && hasOpaqueInput(upstream))
        ) {
          // An explicit unity setter must not disappear over an earlier opaque setter.
          gains.set(scope.descriptor.id, { call, index, upstream })
          continue
        }
        if (
          call.args.length === 1 &&
          (numericNotation(value) ||
            (call.args[0]?.type === 'CallExpression' &&
              (modPattern(call.args[0], (name) => declarations.has(name)) ||
                chain(call.args[0]).calls.every((item) =>
                  ['range', 'slow', 'fast'].includes(item.name),
                ))))
        ) {
          gains.set(scope.descriptor.id, { call, index, upstream })
          continue
        }
      }
      if (
        call.name === 'mask' &&
        scope.kind === 'voice' &&
        call.args.length === 1 &&
        typeof scalar(call.args[0]) === 'string' &&
        scalar(call.args[0]) !== '' &&
        isArrangement(String(scalar(call.args[0]))) &&
        calls
          .slice(index + 1)
          .every(
            (call) =>
              ['postgain', 'orbit', 'channels'].includes(call.name) || mixerModulation(call),
          )
      ) {
        // Only a final lane mask is the channel's arranger lane; others stay CODE.
        arrangements.set(scope.descriptor.id, { index })
        continue
      }
      if (
        name === 'channels' &&
        scope.kind === 'voice' &&
        calls.slice(index + 1).every((call) => call.name === 'orbit')
      ) {
        const value = scalar(call.args[0])
        if (
          call.args.length === 1 &&
          typeof value === 'string' &&
          /^[1-9]\d*:[1-9]\d*$/.test(value) &&
          !(value === '1:2' && hasOpaqueInput(upstream))
        ) {
          outputChannels.set(scope.descriptor.id, { value, index })
          continue
        }
      }
      if (group && audioCV(call, group, scope, index)) continue
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
      // RATE is emitted before ACCENT. A later fast() must keep its position.
      if (group?.type === 'seq' && call.name === 'fast' && !Object.hasOwn(group.values, 'accent')) {
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
      const loopSpec = type ? getModuleSpec(type) : undefined
      const loop = loopSpec?.functionLoop
      const loopVariant =
        loop &&
        (typeof loop.method === 'string'
          ? loop.method === name
            ? {}
            : undefined
          : Object.entries(loop.method.names).find(([, method]) => method === name))
      const loopValues: Record<string, ControlValue> | undefined = Array.isArray(loopVariant)
        ? typeof loop?.method === 'object'
          ? { [loop.method.control]: loopVariant[0] }
          : undefined
        : loopVariant
      const legacyTransform =
        loopSpec?.id === 'jux' &&
        call.args.length === 1 &&
        call.args[0]?.type !== 'SpreadElement' &&
        (() => {
          const key = transformKey(call.args[0])
          return (
            key &&
            loopSpec.controls.some(
              (c) =>
                'call' in c &&
                c.call?.argument.kind === 'transform' &&
                Object.values(c.call.argument.expressions).some(
                  (text) =>
                    transformKey(parseExpressionAt(text, 0, { ecmaVersion: 'latest' })) === key,
                ),
            )
          )
        })()
      if (loop && loopSpec && loopValues && !legacyTransform) {
        const ids = loopControls(loopSpec, name)
        const args = call.args.slice(0, -1).map((arg) => scalar(arg))
        const callback = call.args.at(-1)
        const child = nestedScope(scope, index)
        const preset = callback?.type === 'Identifier' && callback.name === loop.preset
        const valid =
          call.args.length === ids.length + 1 &&
          ids.every((id, i) => args[i] !== undefined && fits(loopSpec.id, id, args[i])) &&
          (name !== 'within' ||
            (typeof args[0] === 'number' && typeof args[1] === 'number' && args[0] < args[1]))
        if (valid && (preset || (child && (child.calls.length > 0 || localBinding(child.root))))) {
          const loopCheckpoint = {
            modules: patch.modules.length,
            cables: patch.cables.length,
            bindings: bindings.length,
            names: { ...patch.names },
            resolved: new Map(resolved),
            depths: new Map(depths),
            values: new Map(patch.modules.map((m) => [m.id, { ...m.values }])),
            represented: new Map([...represented].map(([id, controls]) => [id, new Set(controls)])),
            row,
            hp,
          }
          const module = add(loopSpec.id, {
            ...loopValues,
            ...(loop.when ? { [loop.when.control]: loop.when.value } : {}),
          })
          const controls: Record<string, Span> = {}
          ids.forEach((id, i) => {
            const arg = args[i]
            if (arg !== undefined) module.values[id] = arg
            Object.assign(controls, literalControls(id, call.args[i]))
          })
          wire(upstream, module)
          bind(module, scope, [index], controls)
          if (
            child &&
            callback?.type === 'ArrowFunctionExpression' &&
            callback.params[0]?.type === 'Identifier'
          ) {
            const parameter = callback.params[0].name
            if (parameter !== 'x') module.functionParameter = parameter
            const checkpoint = {
              modules: patch.modules.length,
              cables: patch.cables.length,
              bindings: bindings.length,
              row,
              hp,
            }
            const send = { module, jack: 'send' }
            const localScope = new Map([[parameter, send]])
            const branched =
              child.calls.some((c) => c.name === 'stack') || !!localBinding(child.root)
            let result: Output | undefined
            try {
              const refersToParameter =
                !branched &&
                child.calls.some((call) => call.args.some((arg) => usesParameter(arg, parameter)))
              result = refersToParameter ? undefined : expression(child, undefined, localScope)
              if (
                patch.modules.slice(checkpoint.modules).some((m) => {
                  const spec = getModuleSpec(m.type)
                  return (
                    !spec.modSource &&
                    !['lfo', 'env'].includes(spec.id) &&
                    !(
                      spec.composition && m.values[spec.composition.mode] === spec.composition.stack
                    ) &&
                    !isLoopChain(spec)
                  )
                })
              )
                result = undefined
              if (!result) throw new Error('Unsupported callback')
            } catch {
              patch.modules.splice(branched ? loopCheckpoint.modules : checkpoint.modules)
              patch.cables.splice(branched ? loopCheckpoint.cables : checkpoint.cables)
              bindings.splice(branched ? loopCheckpoint.bindings : checkpoint.bindings)
              patch.names = loopCheckpoint.names
              resolved.clear()
              loopCheckpoint.resolved.forEach((value, key) => resolved.set(key, value))
              depths.clear()
              loopCheckpoint.depths.forEach((value, key) => depths.set(key, value))
              represented.clear()
              loopCheckpoint.represented.forEach((value, key) => represented.set(key, value))
              for (const m of patch.modules) {
                const values = loopCheckpoint.values.get(m.id)
                if (values) m.values = values
              }
              row = branched ? loopCheckpoint.row : checkpoint.row
              hp = branched ? loopCheckpoint.hp : checkpoint.hp
              if (branched) {
                upstream = code(scope, [index], source.slice(call.start, call.end), upstream)
                group = undefined
                continue
              }
              result = code(
                child,
                child.calls.map((_, i) => i),
                source.slice(child.root.end, child.end),
                send,
              )
            }
            wire(result, module, 'return')
          }
          group = module
          upstream = output(module)
          continue
        }
      }
      if (loopValues && !legacyTransform) {
        upstream = code(scope, [index], source.slice(call.start, call.end), upstream)
        group = undefined
        continue
      }
      const spec = type ? getModuleSpec(type) : undefined
      if (name === 's' && type && typeof spec?.soundSource === 'object') {
        group = add(type, { ...spec.readDefaults })
        wire(upstream, group)
        bind(group, scope, [index])
        upstream = output(group)
        continue
      }
      // Preserve DRUMS' existing unseeded drop control; a seeded gate is CHANCE.
      const drumDrop =
        name === 'degradeBy' && group?.type === 'drums' && calls[index + 1]?.name !== 'seed'
      // MIX is a virtual bus. Its setters are handled only by the terminal-gain adapter.
      // Explicit delaytime wins over delaysync in the pinned engine, in either order.
      const mixedDelayTime =
        type === 'delay' &&
        ['delaytime', 'delaysync'].includes(name) &&
        ['delaytime', 'delaysync'].every((method) =>
          calls.some((call, callIndex) => call.name === method && !retainedCode(callIndex)),
        )
      const matched =
        !drumDrop && spec && type !== 'mix' && !mixedDelayTime
          ? matchControlCall(spec, name)
          : undefined
      const activation =
        matched && matched.binding.when
          ? { [matched.binding.when.control]: matched.binding.when.value }
          : {}
      if (matched) {
        id = matched.control.id
        values = {
          ...spec?.readDefaults,
          ...matched.values,
          ...activation,
          ...(type === 'splice' && name === 's' ? { mode: calls[index + 1]?.name ?? 'slice' } : {}),
        }
        for (const [id, value] of Object.entries(matched.binding.selects ?? {})) {
          if (spec?.controls.find((control) => control.id === id)?.default !== value)
            values[id] = value
        }
        merge =
          matched.binding.read !== undefined &&
          Object.entries(matched.values).every(([id, value]) => group?.values[id] === value)
        if (merge && spec?.orderSensitive && group?.type === type) {
          const rank = spec.controls.indexOf(matched.control)
          // A grouped node writes in catalog order. Keep earlier/repeated calls
          // as separate nodes when grouping would move them through a transform.
          merge = !bindings.some(
            (binding) =>
              binding.module === group?.id &&
              binding.scope === scope.descriptor.id &&
              descriptor([binding.loop, binding.path]) === descriptor([scope.loop, scope.path]) &&
              binding.calls.some((index) => {
                const previous = calls[index]
                const owned = previous && matchControlCall(spec, canonicalCall(previous.name))
                return owned && spec.controls.indexOf(owned.control) >= rank
              }),
          )
        }
        const form = matched.binding.argument
        if (spec?.operatorTarget && type) {
          const target = upstream.module
          if (target.type === spec.operatorTarget.type) {
            const existing = patch.cables.find(
              (c) => c.to.module === target.id && c.to.jack === spec.operatorTarget?.jack,
            )
            const operator = existing
              ? patch.modules.find((m) => m.id === existing.from.module)
              : undefined
            if (
              (!existing || group?.id === operator?.id) &&
              (!operator ||
                !bindings.some((b) => b.module === operator.id && id && id in b.controls))
            ) {
              const module = operator ?? add(type, values)
              if (literal(module, id, call, scope, index)) {
                Object.assign(module.values, activation)
                for (const id of Object.keys(activation)) represented.get(module.id)?.add(id)
                if (!existing) wire(output(module), target, spec.operatorTarget.jack)
                group = module
                continue
              }
              if (!operator) patch.modules.splice(patch.modules.indexOf(module), 1)
            }
          }
          id = undefined
        } else if (form.kind === 'array' && type) {
          const arg = call.args[0]
          const bars =
            arg?.type === 'ArrayExpression'
              ? arg.elements.map((e) => (e ? scalar(e) : undefined))
              : []
          const control = matched.control
          if (
            call.args.length === 1 &&
            control.kind === 'drawbars' &&
            bars.length > 0 &&
            bars.length <= control.maxBars &&
            bars.every(
              (n) =>
                typeof n === 'number' && Number.isFinite(n) && n >= control.min && n <= control.max,
            ) &&
            group?.type === type &&
            !bindings.some((b) => b.module === group?.id && id && id in b.controls)
          ) {
            group.values[id] = bars.filter((n): n is number => typeof n === 'number')
            if (arg)
              bind(
                group,
                scope,
                [index],
                /\/[/*]/.test(source.slice(arg.start, arg.end))
                  ? {}
                  : { [id]: { start: arg.start, end: arg.end } },
              )
            continue
          }
          id = undefined
        } else if (form.kind === 'number' && form.optional && call.args.length === 0 && type) {
          group = add(type, { ...values, [form.optional]: 'none' })
          upstream = soundInput(upstream, type)
          wire(upstream, group)
          bind(group, scope, [index])
          upstream = output(group)
          continue
        } else if (form.kind === 'tuple' && type) {
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
        } else if (
          form.kind === 'string' &&
          type === 'ratchet' &&
          call.args.length === 1 &&
          typeof scalar(call.args[0]) === 'number'
        ) {
          const repeats = scalar(call.args[0])
          const module = add(type, { repeats: String(repeats) })
          wire(upstream, module)
          bind(module, scope, [index], literalControls('repeats', call.args[0]))
          group = module
          upstream = output(module)
          continue
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
          const [writtenRoot, ...scaleWords] = typeof value === 'string' ? value.split(':') : []
          const scale = scaleWords.join(' ')
          const root = writtenRoot && writtenRoot.charAt(0).toUpperCase() + writtenRoot.slice(1)
          if (
            type &&
            call.args.length === 1 &&
            root &&
            scale &&
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
        const arg = literalArgument(scalarType, id, call.args[0])
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
          const needsOwner =
            matched?.binding.read === 'companion' ||
            (matched?.binding.aliasRead === 'companion' && name !== call.name)
          const compatibleOwner =
            reuse &&
            group &&
            spec &&
            matched &&
            controlEnabled(spec, { ...group.values, ...matched.binding.selects }, matched.control)
          const erasesOverride =
            matched &&
            'omitAt' in matched.control &&
            candidate === matched.control.omitAt &&
            ((!spec?.orderSensitive &&
              (hasOpaqueInput(upstream) ||
                calls.slice(0, index).some((previous) => canonicalCall(previous.name) === name))) ||
              (matched.binding.selects &&
                !reuse &&
                (hasOpaqueInput(upstream) ||
                  (group?.type === type &&
                    bindings.some(
                      (binding) => binding.module === group?.id && id in binding.controls,
                    )))))
          if ((needsOwner && !compatibleOwner) || erasesOverride) {
            upstream = code(scope, [index], source.slice(call.start, call.end), upstream)
            group = undefined
            continue
          }
          const positionBefore = { row, hp }
          const module = reuse && group ? group : add(scalarType, values)
          if (reuse) {
            for (const [id, value] of Object.entries(matched?.binding.selects ?? {})) {
              if (
                module.values[id] !== undefined ||
                spec?.controls.find((control) => control.id === id)?.default !== value
              )
                module.values[id] = value
            }
          }
          const accepted =
            numericCV &&
            arg &&
            arg.type !== 'SpreadElement' &&
            (candidate === undefined || numericNotation(candidate))
              ? lfo(arg, module, id, scope, index) || patternCV(arg, module, id, scope, index)
              : literal(module, id, call, scope, index)
          if (accepted) {
            Object.assign(module.values, activation)
            if (!reuse) upstream = soundInput(upstream, scalarType)
            if (!reuse) wire(upstream, module)
            group = module
            upstream = output(module)
            continue
          }
          if (!reuse) {
            patch.modules.splice(patch.modules.indexOf(module), 1)
            reserved.delete(module.id)
            row = positionBefore.row
            hp = positionBefore.hp
          }
        }
      }
      upstream = code(scope, [index], source.slice(call.start, call.end), upstream)
      group = undefined
    }
    for (const binding of bindings.filter(
      (binding) =>
        binding.scope === scope.descriptor.id &&
        descriptor([binding.loop, binding.path]) === descriptor([scope.loop, scope.path]),
    )) {
      // A pre-129 source snapshot owns its historical projection, including absent MODE.
      // Only exact saved syntax and call ownership justify retaining that saved state.
      const legacyDelay =
        savedScope &&
        saved?.modules.some(
          (module) =>
            module.type === 'delay' &&
            module.values['mode'] === undefined &&
            binding.calls.every((index) =>
              module.bindings.some(
                (owner) =>
                  owner.scope === binding.scope &&
                  owner.role === 'module' &&
                  owner.calls.includes(index),
              ),
            ),
        )
      const module = patch.modules.find((module) => module.id === binding.module)
      if (
        module?.type === 'delay' &&
        module.values['mode'] === undefined &&
        !Object.hasOwn(binding.controls, 'time') &&
        !legacyDelay
      )
        module.values['mode'] = 'sync'
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
      mixerModulations.delete(scope.descriptor.id)
      arrangements.delete(scope.descriptor.id)
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
      let opaqueGain = false
      if (gain) {
        const arg = gain.call.args[0]
        const scalarGain = scalar(arg)
        if (typeof scalarGain === 'number') {
          bus.values[`ch${channel}`] = scalarGain
          bind(bus, voice.scope, [gain.index], literalControls(`ch${channel}`, arg), {
            role: 'mixer',
          })
        } else if (
          arg &&
          arg.type !== 'SpreadElement' &&
          (lfo(arg, bus, `ch${channel}`, voice.scope, gain.index) ||
            patternCV(arg, bus, `ch${channel}`, voice.scope, gain.index))
        ) {
          const binding = bindings.find(
            (binding) =>
              binding.module === bus?.id &&
              binding.scope === voice.scope.descriptor.id &&
              binding.role === 'module',
          )
          if (binding) binding.role = 'mixer'
        } else {
          opaqueGain = true
        }
      }
      const modulations = mixerModulations.get(voice.scope.descriptor.id) ?? []
      // A channel has one CV jack. Multiple per-voice modulators stay ordered CODE.
      // Insert from the end so every fallback can still find its later receiver.
      for (const { index, upstream } of [...modulations].reverse()) {
        const call = voice.scope.calls[index]
        if (
          call &&
          (opaqueGain ||
            modulations.length > 1 ||
            !audioCV(call, bus, voice.scope, index, `ch${channel}`))
        )
          retainDeferredCode(voice.scope, index, upstream, { module: bus.id, jack: `in${channel}` })
      }
      if (gain && opaqueGain)
        retainDeferredCode(voice.scope, gain.index, gain.upstream, {
          module: bus.id,
          jack: `in${channel}`,
        })
      const channels = outputChannels.get(voice.scope.descriptor.id)
      if (channels) {
        bus.values[`channels${channel}`] = channels.value
        bind(
          bus,
          voice.scope,
          [channels.index],
          literalControls(`channels${channel}`, voice.scope.calls[channels.index]?.args[0]),
          { role: 'mixer' },
        )
      }
      const arrangement = arrangements.get(voice.scope.descriptor.id)
      const lane = arrangement && voice.scope.calls[arrangement.index]?.args[0]
      if (arrangement && lane) {
        bus.values[`arr${channel}`] = String(scalar(lane))
        bind(bus, voice.scope, [arrangement.index], literalControls(`arr${channel}`, lane), {
          role: 'mixer',
        })
      }
      const label = voice.scope.label ?? '$'
      const mute = label.startsWith('_') || label.endsWith('_')
      const unmuted = label.replace(/^_/, '').replace(/_$/, '')
      const solo = unmuted.length > 1 && unmuted.startsWith('S')
      const name = (solo ? unmuted.slice(1) : unmuted).replaceAll('$', '')
      if (label !== '$') {
        bus.values[`mute${channel}`] = mute ? 'on' : 'off'
        bus.values[`solo${channel}`] = solo ? 'on' : 'off'
        bus.values[`name${channel}`] = name
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
  // A declaration is an explicit evaluation boundary even with a single use.
  for (const [name, signal] of resolved)
    if (patch.cables.some((c) => c.from.module === signal.module.id && c.from.jack === signal.jack))
      patch.names[`${signal.module.id}:${signal.jack}`] = name
  // Native setters retain the fixed engine order on import. Only a rack-owned
  // repatch may opt into inline processing; preserving text alone cannot prove sound.
  const { inline } = planEffects(graph(patch))
  for (const module of patch.modules)
    if (inline.has(module.id) && module.fx !== true) module.fx = 'native'
  return { patch, bindings, represented }
}

/** Parse without executing any JavaScript. Syntax errors throw with Acorn's location. */
export function read(source: string): SourceDocument {
  const parsed = parseSource(source)
  let saved = readLayout(source)
  if (saved.kind === 'valid' && saved.layout.source !== undefined) {
    try {
      const snapshot = parseSource(saved.generated)
      const projected = project(saved.generated, snapshot, saved.layout, snapshot.scopes)
      restore(
        projected.patch,
        projected.bindings,
        saved.layout,
        matchScopes(saved.layout.scopes, snapshot.scopes, true),
        projected.represented,
        snapshot.scopes,
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
      const projectedProgram = descriptor(parseSource(generate(projected.patch)).program)
      if (
        saved.patch.modules.every((m) => m.fx === undefined) &&
        projectedProgram ===
          descriptor(
            parseSource(generateDocument(saved.patch, { nativeEffects: true }).code).program,
          )
      ) {
        // Source-owned pre-134 snapshots also wrote all stages as native setters.
        // Full independent projection and binding equality still follow this migration.
        const { inline } = planEffects(graph(saved.patch))
        for (const module of saved.patch.modules) if (inline.has(module.id)) module.fx = 'native'
        for (const module of saved.layout.modules) if (inline.has(module.id)) module.fx = 'native'
      }
      if (
        descriptor(parseSource(generate(projected.patch)).program) !==
        descriptor(parseSource(generate(saved.patch)).program)
      )
        throw new Error('Saved graph does not agree with source')
      // Every sounding binding must also be justified by the reader, not just valid indices.
      const actual = (bindings: SourceBinding[]) =>
        bindings
          .map((b) => [b.module, b.scope, b.loop, b.path, b.part, b.role, b.calls, b.target, b.fx])
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
    parsed,
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
      restore(
        projection.patch,
        projection.bindings,
        saved.layout,
        matches,
        projection.represented,
        parsed.scopes,
      )
      projection.patch = saved.patch
      const controls = projection.bindings
      projection.bindings = saved.layout.modules.flatMap((module) =>
        module.bindings.flatMap((binding) => {
          const index = saved.layout.scopes.findIndex((scope) => scope.id === binding.scope)
          const scope = bindingScope(parsed.scopes, binding)
          const old = saved.layout.scopes[index]
          if (
            !scope ||
            !old ||
            descriptor([
              parsed.scopes[index]?.descriptor.root,
              parsed.scopes[index]?.descriptor.calls,
            ]) !== descriptor([old.root, old.calls])
          )
            return []
          const calls = binding.calls.flatMap((index) => scope.calls[index] ?? [])
          const projected = controls.find(
            (item) =>
              item.module === module.id &&
              item.scope === scope.descriptor.id &&
              descriptor([item.loop, item.path]) === descriptor([binding.loop, binding.path]),
          )
          const editable = projected?.controls ?? {}
          return [
            {
              module: module.id,
              scope: scope.descriptor.id,
              ...(binding.loop ? { loop: binding.loop } : {}),
              ...(binding.path ? { path: binding.path } : {}),
              ...(binding.part === undefined ? {} : { part: binding.part }),
              calls: binding.calls,
              role: binding.role,
              ...(binding.fx === undefined ? {} : { fx: binding.fx }),
              ...(binding.target === undefined ? {} : { target: binding.target }),
              start:
                module.type === 'code'
                  ? (projected?.start ?? calls[0]?.start ?? scope.start)
                  : (calls[0]?.start ?? scope.start),
              end:
                module.type === 'code'
                  ? (projected?.end ?? calls.at(-1)?.end ?? scope.end)
                  : (calls.at(-1)?.end ?? scope.end),
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
        parsed.scopes,
      )
      layout = 'reconciled'
      diagnostics.push(
        'Code changed: restored only unambiguous sounding module identities; saved disconnected state was not applied.',
      )
    }
  }
  if (saved.kind === 'absent') projection.patch = packImported(projection.patch)
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
  currentScopes: ParsedScope[],
): void {
  if (saved.railHp !== undefined) patch.railHp = saved.railHp
  const sectionSpec = getModuleSpec('sections'),
    sections = sectionSpec.sections
  if (!sections) throw new Error('Missing section catalog')
  const nextJack = sections.next
  const continuation = (rack: Pick<Patch, 'cables'>, id: string) =>
    rack.cables.some((c) => c.from.module === id && c.to.jack === nextJack)
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
        (module.type !== 'sections' ||
          continuation(patch, module.id) === continuation(saved, old.id)) &&
        (!claimed.has(old.id) ||
          ['env', 'lfo'].includes(module.type) ||
          getModuleSpec(module.type).operatorTarget !== undefined) &&
        own.some((binding) => {
          const match = matches.get(binding.scope)
          if (!match) return false
          // A changed tuple list cannot inherit an old socket order by ordinal.
          if (
            getModuleSpec(module.type).sections &&
            !binding.path &&
            !binding.calls.every((call) => {
              const previous = match.calls.get(call)
              return (
                previous !== undefined &&
                descriptor(match.current.calls[call]) === descriptor(match.saved.calls[previous])
              )
            })
          )
            return false
          if (binding.path) {
            const first = binding.path[0]
            const mapped = first && match.calls.get(first.call)
            if (
              !first ||
              mapped === undefined ||
              descriptor(match.current.calls[first.call]) !== descriptor(match.saved.calls[mapped])
            )
              return false
            const oldPath = [{ ...first, call: mapped }, ...binding.path.slice(1)]
            return old.bindings.some(
              (b) =>
                b.scope === match.saved.id &&
                b.role === binding.role &&
                descriptor(b.path) === descriptor(oldPath) &&
                descriptor(b.loop) === descriptor(binding.loop) &&
                b.fx === binding.fx &&
                b.part === binding.part &&
                binding.calls.every((c) => b.calls.includes(c)),
            )
          }
          const path = binding.loop
          const first = path?.[0]
          const mapped = first === undefined ? undefined : match.calls.get(first)
          if (
            first !== undefined &&
            (mapped === undefined ||
              descriptor(match.current.calls[first]) !== descriptor(match.saved.calls[mapped]))
          )
            return false
          const loop = path && mapped !== undefined ? [mapped, ...path.slice(1)] : undefined
          const calls = binding.calls.map((index) => (path ? index : match.calls.get(index)))
          const oldBindings = old.bindings.filter(
            (oldBinding) =>
              oldBinding.scope === match.saved.id &&
              oldBinding.role === binding.role &&
              oldBinding.part === binding.part &&
              descriptor(oldBinding.loop) === descriptor(loop) &&
              (binding.fx === undefined
                ? oldBinding.fx === undefined
                : path
                  ? oldBinding.fx === binding.fx
                  : oldBinding.fx !== undefined &&
                    binding.calls.some((index) => {
                      const oldIndex = match.calls.get(index)
                      const previous =
                        oldIndex === undefined ? undefined : match.saved.calls[oldIndex]
                      const current = currentScopes.find((s) => s.descriptor.id === binding.scope)
                        ?.calls[index]
                      if (!previous || !current || previous.name !== 'FX' || current.name !== 'FX')
                        return false
                      const oldArgs: unknown = JSON.parse(previous.arguments)
                      if (!Array.isArray(oldArgs)) return false
                      if (descriptor(oldArgs) === descriptor(current.args))
                        return oldBinding.fx === binding.fx
                      if (oldArgs.length === 1 && current.args.length === 1)
                        return oldBinding.fx === 0 && binding.fx === 0
                      const key = descriptor(current.args[binding.fx ?? -1])
                      return (
                        descriptor(oldArgs[oldBinding.fx ?? -1]) === key &&
                        oldArgs.filter((a) => descriptor(a) === key).length === 1 &&
                        current.args.filter((a) => descriptor(a) === key).length === 1
                      )
                    })) &&
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
      // Repeated context-specific calls share saved identity only while all values agree.
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
  // One arrange call owns the entire NEXT chain, regardless of panel boundaries.
  // Only an exactly matched head may redistribute its proven tuples and spans.
  function sectionChain(rack: Pick<Patch, 'modules' | 'cables'>, head: PlacedModule) {
    const panels: PlacedModule[] = []
    let panel: PlacedModule | undefined = head
    while (panel) {
      if (panels.includes(panel)) throw new Error('Cyclic section continuation')
      panels.push(panel)
      const next = rack.cables.find((c) => c.to.module === panel?.id && c.to.jack === nextJack)
      panel = next && rack.modules.find((m) => m.id === next.from.module)
      if (panel && panel.type !== 'sections') throw new Error('Invalid section continuation')
    }
    return panels
  }
  const heads = patch.modules.filter(
    (m) => m.type === 'sections' && claimed.has(m.id) && !continuation(patch, m.id),
  )
  for (const head of heads) {
    const old = saved.modules.find((m) => m.id === head.id)
    const owner = bindings.find((b) => b.module === head.id && b.part === 0)
    if (!old || !owner) continue
    const current = sectionChain(patch, head),
      previous = sectionChain(saved, old),
      ids = new Set(current.map((m) => m.id))
    const tuples = current.flatMap((panel) =>
      sectionOrder(sectionSpec, panel).flatMap((slot) => {
        const cable = patch.cables.find((c) => c.to.module === panel.id && c.to.jack === slot.jack)
        const control = sectionSpec.controls.find((c) => c.id === slot.cycles)
        const span = bindings.find((b) => b.module === panel.id)?.controls[slot.cycles]
        return cable && control ? [{ cable, value: controlValue(panel, control), span }] : []
      }),
    )
    let offset = 0
    const restored = previous.map((panel) => {
      const slots = sectionOrder(sectionSpec, panel).filter((slot) =>
        saved.cables.some((c) => c.to.module === panel.id && c.to.jack === slot.jack),
      )
      const binding = saved.modules
        .find((m) => m.id === panel.id)
        ?.bindings.find(
          (b) =>
            b.part === offset &&
            b.role === owner.role &&
            b.scope === matches.get(owner.scope)?.saved.id &&
            descriptor([b.loop, b.path, b.calls]) ===
              descriptor([owner.loop, owner.path, owner.calls]),
        )
      const start = offset
      offset += slots.length
      return { panel, slots, start, binding }
    })
    if (
      offset !== tuples.length ||
      restored.some(
        ({ panel, binding }) =>
          !binding || patch.modules.some((m) => m.id === panel.id && !ids.has(m.id)),
      )
    )
      continue
    patch.modules = patch.modules.filter((m) => !ids.has(m.id))
    patch.cables = patch.cables.filter(
      (c) => !(ids.has(c.to.module) && c.to.jack === sections.next),
    )
    const kept = bindings.filter((b) => !ids.has(b.module))
    bindings.splice(0, bindings.length, ...kept)
    for (const { panel, slots, start } of restored) {
      const values = { ...panel.values },
        controls: Record<string, Span> = {}
      slots.forEach((slot, index) => {
        const tuple = tuples[start + index]
        if (!tuple) throw new Error('Missing proven section tuple')
        values[slot.cycles] = tuple.value
        tuple.cable.to = { module: panel.id, jack: slot.jack }
        if (tuple.span) controls[slot.cycles] = tuple.span
      })
      patch.modules.push({
        id: panel.id,
        type: panel.type,
        row: panel.row,
        hp: panel.hp,
        look: panel.look,
        values,
      })
      bindings.push({ ...owner, module: panel.id, part: start, controls })
    }
    for (const cable of saved.cables.filter(
      (c) => previous.some((m) => m.id === c.to.module) && c.to.jack === sections.next,
    )) {
      let id = `section-next-${cable.to.module}`
      while (patch.cables.some((c) => c.id === id)) id += '-'
      patch.cables.push({ id, from: { ...cable.from }, to: { ...cable.to } })
    }
  }
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
      for (const prefix of ['mute', 'solo', 'name', 'channels', 'arr']) {
        const oldId = `${prefix}${cable.to.jack.slice(2)}`
        const newId = `${prefix}${jack.slice(2)}`
        const control = getModuleSpec('mix').controls.find((control) => control.id === oldId)
        if (control) values[newId] = module.values[oldId] ?? control.default
        controls.set(oldId, newId)
      }
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
