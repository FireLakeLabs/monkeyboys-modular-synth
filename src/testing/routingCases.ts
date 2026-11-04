import type { Patch, PlacedModule, ControlValue } from '../patch/types'
import { getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'

/** Small sample-free acceptance patches, shared with the real browser probe. */
export function routingFixture(kind: 'gates' | 'switch' | 'aux' | 'duck' | 'audio-mod'): Patch {
  const patch: Patch = { version: 1, modules: [], cables: [], names: {}, railHp: 64 }
  let row = 0,
    hp = 0
  function add(type: string, values: Record<string, ControlValue> = {}): PlacedModule {
    const spec = getModuleSpec(type)
    if (hp + spec.hp > 64) {
      row++
      hp = 0
    }
    const m: PlacedModule = {
      id: `${type}${patch.modules.filter((m) => m.type === type).length + 1}`,
      type,
      row: type === 'out' ? 0 : row,
      hp: type === 'out' ? 0 : hp,
      look: DEFAULT_LOOK[spec.family],
      values,
    }
    if (type !== 'out') hp += spec.hp
    patch.modules.push(m)
    return m
  }
  function wire(from: PlacedModule, to: PlacedModule, jack: string, output?: string) {
    const out = output ?? getModuleSpec(from.type).jacks.find((j) => j.direction === 'out')?.id
    if (!out) throw new Error('Missing output')
    patch.cables.push({
      id: `c${patch.cables.length + 1}`,
      from: { module: from.id, jack: out },
      to: { module: to.id, jack },
    })
  }
  function oscillator(note = 'c3') {
    const seq = add('seq', { steps: note })
    const osc = add('osc', { wave: 'sine' })
    wire(seq, osc, 'note')
    return osc
  }
  let voice: PlacedModule
  let dry: PlacedModule | undefined
  switch (kind) {
    case 'gates': {
      const gates = add('gates', { steps: 'x ~ x x ~ x ~ x' })
      const seq = add('seq', { steps: 'c2 eb2 g2' })
      voice = add('osc', { wave: 'sine' })
      wire(gates, seq, 'gate')
      wire(seq, voice, 'note')
      break
    }
    case 'switch': {
      const sources = ['c3', 'd3', 'e3', 'f3'].map((steps) => add('seq', { steps }))
      sources.forEach((m) => {
        patch.names[`${m.id}:note`] = `voice_${m.id}`
      })
      const pick = add('switch')
      sources.forEach((source, i) => wire(source, pick, `in${i + 1}`))
      voice = add('osc', { wave: 'sine' })
      wire(pick, voice, 'note')
      break
    }
    case 'aux': {
      const a = oscillator('c3*4'),
        b = oscillator('e3*4')
      const aux = add('aux')
      wire(a, aux, 'send1')
      wire(b, aux, 'send2')
      voice = add('vcf', { cutoff: 900 })
      wire(aux, voice, 'in')
      break
    }
    case 'duck': {
      dry = oscillator('c1*4')
      const target = oscillator('c3')
      voice = add('duck')
      wire(target, voice, 'in')
      wire(dry, voice, 'side')
      break
    }
    case 'audio-mod': {
      const modulator = add('osc', { mode: 'freq', freq: 40, wave: 'sine' })
      const carrier = oscillator('c3')
      voice = add('vcf', { cutoff: 1200 })
      wire(carrier, voice, 'in')
      wire(modulator, voice, 'cv')
      break
    }
  }
  if (kind === 'duck') patch.names['osc1:out'] = 'trigger'
  const mix = add('mix', { ch1: 0.15, ch2: 0.1 })
  if (dry) {
    wire(dry, mix, 'in1')
    wire(voice, mix, 'in2')
  } else wire(voice, mix, 'in1')
  const out = add('out')
  wire(mix, out, 'in')
  return patch
}
export const ROUTING_KINDS = ['gates', 'switch', 'aux', 'duck', 'audio-mod'] as const
