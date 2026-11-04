import type { Expression } from 'acorn'
import { chain, scalar } from './syntax'
import { getModuleSpec } from '../modules/catalog'
import { numericNotation } from '../patch/notation'
import type { ControlValue } from '../patch/types'

export interface ModPattern {
  type: string
  values: Record<string, ControlValue>
  inputs: ModPattern[]
  start: number
  end: number
}

function fits(type: string, id: string, value: unknown): value is number {
  const c = getModuleSpec(type).controls.find((c) => c.id === id)
  return (
    c?.kind === 'knob' &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= c.min &&
    value <= c.max &&
    (c.step !== 1 || Number.isInteger(value))
  )
}

/** Read the utility expression as one transaction before adding any rack modules. */
export function modPattern(
  arg: Expression,
  isReference: (name: string) => boolean = () => false,
): ModPattern | undefined {
  const literal = scalar(arg)
  if (numericNotation(literal))
    return { type: 'cvseq', values: { steps: literal }, inputs: [], start: arg.start, end: arg.end }
  const parsed = chain(arg)
  let result: ModPattern | undefined
  let index = 0
  if (parsed.root.type === 'Identifier') {
    const shape = getModuleSpec('lfo').controls.find((c) => c.id === 'shape')
    if (
      shape?.kind === 'switch' &&
      shape.options.some(
        (o) => o.value === (parsed.root.type === 'Identifier' ? parsed.root.name : ''),
      )
    )
      result = {
        type: 'lfo',
        values: { shape: parsed.root.name, rate: 1 },
        inputs: [],
        start: parsed.root.start,
        end: parsed.root.end,
      }
    else if (isReference(parsed.root.name))
      result = {
        type: 'reference',
        values: { name: parsed.root.name },
        inputs: [],
        start: parsed.root.start,
        end: parsed.root.end,
      }
  } else {
    const first = parsed.calls[0]
    const value = scalar(first?.args[0])
    if (first?.name === 'mini' && first.args.length === 1 && numericNotation(value)) {
      result = {
        type: 'cvseq',
        values: { steps: value },
        inputs: [],
        start: first.start,
        end: first.end,
      }
      index = 1
    } else if (
      first?.name === 'mini' &&
      first.args.length === 1 &&
      first.args[0]?.type === 'Identifier' &&
      isReference(first.args[0].name)
    ) {
      result = {
        type: 'reference',
        values: { name: first.args[0].name },
        inputs: [],
        start: first.start,
        end: first.end,
      }
      index = 1
    }
  }
  if (!result) return undefined
  for (; index < parsed.calls.length; index++) {
    const call = parsed.calls[index]
    if (!call) return undefined
    const a = scalar(call.args[0])
    if (
      result.type === 'lfo' &&
      ['fast', 'slow'].includes(call.name) &&
      call.args.length === 1 &&
      typeof a === 'number' &&
      a > 0
    ) {
      const rate = Number(result.values.rate) * (call.name === 'slow' ? a : 1 / a)
      if (!fits('lfo', 'rate', rate)) return undefined
      result.values.rate = rate
      result.end = call.end
    } else if (call.name === 'segment' && call.args.length === 1 && fits('samplehold', 'rate', a)) {
      result = {
        type: 'samplehold',
        values: { rate: a },
        inputs: [result],
        start: call.start,
        end: call.end,
      }
    } else if (call.name === 'mul' && call.args.length === 1 && fits('attenuverter', 'amount', a)) {
      const range = parsed.calls[++index]
      const low = scalar(range?.args[0]),
        high = scalar(range?.args[1])
      if (
        !range ||
        !['range', 'rangex'].includes(range.name) ||
        range.args.length !== 2 ||
        !fits('attenuverter', 'min', low) ||
        !fits('attenuverter', 'max', high) ||
        (range.name === 'rangex' && (low <= 0 || high <= 0))
      )
        return undefined
      result = {
        type: 'attenuverter',
        values: {
          amount: a,
          min: low,
          max: high,
          scale: range.name === 'rangex' ? 'EXP' : 'LINEAR',
        },
        inputs: [result],
        start: call.start,
        end: range.end,
      }
    } else if (call.name === 'add' && call.args.length === 1) {
      const other = call.args[0]
      const second = other && other.type !== 'SpreadElement' && modPattern(other, isReference)
      if (!second) return undefined
      result = {
        type: 'modmix',
        values: {},
        inputs: [result, second],
        start: call.start,
        end: call.end,
      }
    } else {
      // A lone range belongs to the target-scaled LFO adapter, not a utility.
      return undefined
    }
  }
  return result
}

/** The pinned core supports scalar object fields here; computed/spread fields stay CODE. */
export function modConfig(
  arg: Expression | undefined,
): Record<string, number | string> | undefined {
  if (arg?.type !== 'ObjectExpression') return undefined
  const result: Record<string, number | string> = {}
  for (const property of arg.properties) {
    if (
      property.type !== 'Property' ||
      property.computed ||
      property.method ||
      property.kind !== 'init' ||
      property.shorthand
    )
      return undefined
    const key = property.key.type === 'Identifier' ? property.key.name : scalar(property.key)
    const value = scalar(property.value)
    if (typeof key !== 'string' || value === undefined || Object.hasOwn(result, key))
      return undefined
    result[key] = value
  }
  return result
}
