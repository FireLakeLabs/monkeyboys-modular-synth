import { getModuleSpec } from '../modules/catalog'
import { DEFAULT_LOOK } from '../modules/looks'
import type { Patch, PlacedModule } from './types'

/** A sounding fixture for build step 3; New patch's silent starter belongs to the rack editor. */
export function demoPatch(): Patch {
  let hp = 0
  const modules: PlacedModule[] = [
    { type: 'seq', values: { steps: ['c2', 'c2', 'eb2', 'g2', 'c3', 'bb2', 'g2', 'eb2'] } },
    { type: 'osc', values: {} },
    { type: 'vcf', values: {} },
    { type: 'vca', values: { level: 0.3 } },
    { type: 'out', values: {} },
  ].map(({ type, values }) => {
    const spec = getModuleSpec(type)
    const module = {
      id: `${type}1`,
      type,
      values,
      row: 0,
      hp: type === 'out' ? 0 : hp,
      look: DEFAULT_LOOK[spec.family],
    }
    hp += spec.hp
    return module
  })
  return {
    version: 1,
    modules,
    names: {},
    cables: modules.flatMap((module, index) => {
      const next = modules[index + 1]
      return next
        ? [
            {
              id: `c${index}`,
              from: { module: module.id, jack: module.type === 'seq' ? 'note' : 'out' },
              to: { module: next.id, jack: next.type === 'osc' ? 'note' : 'in' },
            },
          ]
        : []
    }),
  }
}
