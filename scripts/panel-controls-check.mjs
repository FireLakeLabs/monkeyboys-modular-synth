// In a Vite page: drives real panel controls against the catalog's option values.
import { CATALOG } from '../src/modules/catalog.ts'
import { generate } from '../src/codegen/generate.ts'
import { placeModule, setValue, starterPatch, switchStyle } from '../src/rack/model.ts'
import { panelFixture } from '../src/testing/panelCases.ts'
import { editorSource, replaceSource } from './editor-browser.mjs'

let patch

function routedOrPlaced(type) {
  try {
    return panelFixture(type)
  } catch {
    // Modules without a plain audio path still prove their saved rack state.
    return placeModule(starterPatch(104), type, 1)
  }
}
export function switchCases() {
  return CATALOG.flatMap((spec) => {
    const controls = spec.controls
      .filter((c) => c.kind === 'switch' && switchStyle(c, spec.hp) !== 'dropdown')
      .map((c) => ({
        id: c.id,
        label: c.label,
        style: switchStyle(c, spec.hp),
        default: c.default,
        options: c.options.map((option) => option.value),
      }))
    return spec.id === 'out' || !controls.length ? [] : [{ type: spec.id, controls }]
  })
}
export function loadSwitchCase(type) {
  patch = routedOrPlaced(type)
  const source = generate(patch)
  replaceSource(source)
  return { id: patch.modules.find((m) => m.type === type).id, source }
}
/** The document the former dropdown wrote, which goes through the same setValue commit. */
export function expectedAfter(id, control, value) {
  patch = setValue(patch, id, control, value)
  return generate(patch)
}
export const currentSource = () => editorSource()
export function accentHeight(id) {
  return document.querySelector(`[data-module="${id}"] .notation-control textarea`).offsetHeight
}
