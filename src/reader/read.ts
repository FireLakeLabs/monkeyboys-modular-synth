import { tokenizer, type Expression, type Node } from 'acorn'
import { graph } from '../codegen/graph'
import { generate } from '../codegen/generate'
import { descriptor, type RackLayout } from '../codegen/layout'
import { CATALOG, getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'
import type { ControlValue, Patch, PlacedModule } from '../patch/types'
import { nextPosition } from '../patch/layout'
import { matchScopes, readLayout } from './layout'
import { chain, parseSource, scalar, type Call, type ParsedScope } from './syntax'
import type { ReadResult, SourceAddress, SourceBinding, SourceDocument, Span } from './types'

type Output = { module: PlacedModule; jack: string }

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

function jux(expression: Expression | undefined): string | undefined {
  if (expression?.type === 'Identifier' && ['rev', 'press'].includes(expression.name))
    return expression.name
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
  return call.name === 'fast' && scalar(call.args[0]) === 2
    ? 'fast2'
    : call.name === 'iter' && scalar(call.args[0]) === 4
      ? 'iter4'
      : undefined
}

function project(
  source: string,
  scopes: ParsedScope[],
  saved?: RackLayout,
): { patch: Patch; bindings: SourceBinding[] } {
  const patch: Patch = { version: 1, modules: [], cables: [], names: {} }
  const bindings: SourceBinding[] = []
  const reserved = new Set(saved?.modules.map((module) => module.id))
  const snapshotUnchanged =
    saved?.source !== undefined &&
    descriptor(scopes.map((scope) => scope.descriptor)) ===
      descriptor(parseSource(saved.source).scopes.map((scope) => scope.descriptor))
  const matches = matchScopes(saved?.scopes ?? [], scopes, snapshotUnchanged)
  const voiceScopes = scopes.filter((scope) => scope.kind === 'voice')
  const gains = new Map<string, { value: number; index: number }>()
  const depths = new Map<string, { value: number; isDefault: boolean }[]>()
  let row = 0
  let hp = 0
  let cableId = 0
  const nextRow = () => patch.modules.reduce((end, module) => Math.max(end, module.row + 1), 0)
  function add(type: string, values: Record<string, ControlValue> = {}): PlacedModule {
    const spec = getModuleSpec(type)
    const position = nextPosition(patch.modules, type, row, hp)
    row = position.row
    hp = position.hp
    let counter = 1
    while (reserved.has(`${type}${counter}`)) counter++
    const id = `${type}${counter}`
    reserved.add(id)
    const module = { id, type, row, hp, look: DEFAULT_LOOK[spec.family], values }
    hp += spec.hp
    patch.modules.push(module)
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
    bind(module, scope, [index], literalControls(id, arg))
    return true
  }
  function literalControls(id: string, arg: Node | undefined): Record<string, Span> {
    if (
      !arg ||
      !['Literal', 'UnaryExpression'].includes(arg.type) ||
      (arg.type === 'UnaryExpression' && /\/[/*]/.test(source.slice(arg.start, arg.end)))
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
    depths.set(signal.module.id, uses)
    if (sameDepth) signal.module.values['depth'] = top - base
    else delete signal.module.values['depth']
    target.values[control] = base
    wire(signal, target, 'cv')
    // CV values are coupled expressions; no scalar edit is advertised for them.
    bind(
      signal.module,
      scope,
      [index],
      {},
      { role: 'cv', target: { module: target.id, jack: 'cv', control } },
    )
    bind(target, scope, [index])
    return true
  }
  function expression(scope: ParsedScope): Output {
    const { root, calls } = scope
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
    if (root.type === 'Identifier') {
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
      const provenance = matches.get(scope.descriptor.id)
      // A changed voice set can retain an old orbit number. If current allocation
      // no longer proves ownership, retain that call as source-owned CODE.
      if (
        provenance?.exact &&
        provenance.saved.routing?.call === index &&
        (snapshotUnchanged || provenance.saved.routing.orbit === voiceScopes.indexOf(scope) + 1)
      )
        continue
      const type = owner(call.name, false)
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
      if (type === 'env') {
        const prefix = call.name.endsWith('attack') ? call.name.slice(0, -6) : undefined
        const ids = ['atk', 'dec', 'sus', 'rel']
        const methods = ['attack', 'decay', 'sustain', 'release']
        const envelope = calls.slice(index, index + 4)
        const valid =
          prefix !== undefined &&
          envelope.length === 4 &&
          envelope.every(
            (item, offset) =>
              item.name === `${prefix}${methods[offset]}` &&
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
        if (
          valid &&
          target &&
          !patch.cables.some((cable) => cable.to.module === target?.id && cable.to.jack === 'cv')
        ) {
          const env = add('env')
          envelope.forEach((call, offset) => {
            const id = ids[offset]
            if (id) literal(env, id, call, scope, index + offset)
          })
          wire(output(env), target, 'cv')
          for (const binding of bindings.filter((binding) => binding.module === env.id)) {
            binding.role = 'cv'
            binding.target = {
              module: target.id,
              jack: 'cv',
              control: target.type === 'vcf' ? 'cutoff' : 'level',
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
      if (type === 'seq' && group?.type === 'seq' && ['fast', 'slow'].includes(call.name)) {
        const value = scalar(call.args[0])
        const rate =
          typeof value === 'number' ? (call.name === 'slow' ? 1 / value : value) : undefined
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
      switch (type) {
        case 'osc':
          id = call.name === 's' ? 'wave' : 'tune'
          merge = id === 'tune'
          break
        case 'smpl':
          id = call.name
          values = { bank: '', speed: 1 }
          merge = true
          break
        case 'drums':
          if (call.name === 'degradeBy' && group?.type === 'drums') {
            id = 'drop'
            merge = true
          }
          break
        case 'vcf': {
          const mode = call.name.slice(0, 2)
          id = call.name.endsWith('f')
            ? 'cutoff'
            : call.name.endsWith('q')
              ? 'res'
              : call.name.endsWith('env')
                ? 'envAmt'
                : undefined
          values = { mode }
          merge = id !== 'cutoff' && group?.values['mode'] === mode
          break
        }
        case 'vca':
          id = 'level'
          break
        case 'delay':
          id = (
            { delay: 'mix', delaytime: 'time', delayfeedback: 'fdbk' } as Record<string, string>
          )[call.name]
          merge = call.name !== 'delay'
          break
        case 'reverb':
          id = call.name === 'room' ? 'room' : 'size'
          merge = call.name !== 'room'
          break
        case 'iter':
          id = 'steps'
          break
        case 'jux': {
          const arg = call.args[0]
          const right =
            call.args.length === 1 && arg?.type !== 'SpreadElement' ? jux(arg) : undefined
          if (right) {
            group = add('jux', { right })
            wire(upstream, group)
            bind(group, scope, [index])
            upstream = output(group)
            continue
          }
          break
        }
        case 'quant': {
          const value = scalar(call.args[0])
          const [root, scale, extra] = typeof value === 'string' ? value.split(':') : []
          if (
            call.args.length === 1 &&
            root &&
            scale &&
            !extra &&
            fits('quant', 'root', root) &&
            fits('quant', 'scale', scale)
          ) {
            group = add('quant', { root, scale })
            wire(upstream, group)
            bind(group, scope, [index])
            upstream = output(group)
            continue
          }
          break
        }
      }
      if (type && id) {
        const arg = call.args[0]
        const candidate = scalar(arg)
        const numericCV = (type === 'vcf' && id === 'cutoff') || type === 'vca'
        if (
          (candidate !== undefined && call.args.length === 1 && fits(type, id, candidate)) ||
          (numericCV && arg && arg.type !== 'SpreadElement' && candidate === undefined)
        ) {
          const reuse =
            merge &&
            group?.type === type &&
            !bindings.some((binding) => binding.module === group?.id && id in binding.controls)
          const module = reuse && group ? group : add(type, values)
          const accepted =
            candidate === undefined && arg && arg.type !== 'SpreadElement'
              ? lfo(arg, module, id, scope, index)
              : literal(module, id, call, scope, index)
          if (accepted) {
            if (
              !reuse &&
              needsSampler(upstream) &&
              getModuleSpec(type).jacks.some(
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
  return { patch, bindings }
}

/** Parse without executing any JavaScript. Syntax errors throw with Acorn's location. */
export function read(source: string): SourceDocument {
  const parsed = parseSource(source)
  let saved = readLayout(source)
  if (saved.kind === 'valid' && saved.layout.source !== undefined) {
    try {
      const snapshot = parseSource(saved.generated)
      const projected = project(saved.generated, snapshot.scopes, saved.layout)
      restore(
        projected.patch,
        projected.bindings,
        saved.layout,
        matchScopes(saved.layout.scopes, snapshot.scopes, true),
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
  const projection = project(
    source,
    parsed.scopes,
    saved.kind === 'valid' ? saved.layout : undefined,
  )
  let layout: SourceDocument['layout'] = saved.kind === 'invalid' ? 'invalid' : 'absent'
  const diagnostics = saved.kind === 'invalid' ? [`Layout not restored: ${saved.message}`] : []
  if (saved.kind === 'valid') {
    const original = parseSource(saved.generated)
    if (descriptor(parsed.program) === descriptor(original.program)) {
      // All executable statements agree, including declarations and statement order.
      // It is now safe to restore omitted/bypassed/disconnected state and cables.
      const matches = matchScopes(saved.layout.scopes, parsed.scopes, true)
      restore(projection.patch, projection.bindings, saved.layout, matches)
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
    ...projection,
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
): void {
  const rename = new Map<string, string>()
  const claimed = new Set<string>()
  for (const module of patch.modules) {
    const own = bindings.filter((binding) => binding.module === module.id)
    const candidates = saved.modules.filter(
      (old) =>
        old.type === module.type &&
        !claimed.has(old.id) &&
        own.some((binding) => {
          const match = matches.get(binding.scope)
          if (!match) return false
          const calls = binding.calls.map((index) => match.calls.get(index))
          const oldBindings = old.bindings.filter(
            (oldBinding) =>
              oldBinding.scope === match.saved.id &&
              oldBinding.role === binding.role &&
              oldBinding.target?.jack === binding.target?.jack &&
              oldBinding.target?.control === binding.target?.control,
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
    claimed.add(old.id)
    rename.set(module.id, old.id)
    module.row = old.row
    module.hp = old.hp
    module.look = old.look
  }
  // Restored positions are occupied even when they are on a later overflow row.
  const occupied = patch.modules.filter((module) => rename.has(module.id))
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
        nextPosition(occupied, module.type, module.row, ends.get(module.row) ?? 0),
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
    return {
      kind: 'invalid',
      source,
      offset: error.pos,
      line: error.loc.line,
      column: error.loc.column,
      message: error.message,
    }
  }
}
