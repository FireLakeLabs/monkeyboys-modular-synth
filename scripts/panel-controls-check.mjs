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
export function loadSwitchCase(type, values = {}) {
  patch = routedOrPlaced(type)
  for (const [control, value] of Object.entries(values))
    patch = setValue(patch, `${type}1`, control, value)
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
/** Inner scrollers left in any panel at default size. */
export function overflowingPanels() {
  return [...document.querySelectorAll('.module-panel')].flatMap((panel) =>
    [...panel.querySelectorAll('.module-controls, .patch-box')]
      .filter((box) => box.scrollHeight > box.clientHeight + 1)
      .map((box) => `${panel.dataset.module} ${box.className}`),
  )
}
export function accentHeight(id) {
  return document.querySelector(`[data-module="${id}"] .notation-control textarea`).offsetHeight
}
/** How far the open editor sits outside its scroller, with the scroller at each end. */
export function accentClipping(id) {
  const controls = document.querySelector(`[data-module="${id}"] .module-controls`)
  const editor = controls.querySelector('.notation-control textarea')
  const measure = () => {
    const box = controls.getBoundingClientRect()
    const rect = editor.getBoundingClientRect()
    return { above: box.top - rect.top, below: rect.bottom - box.bottom }
  }
  const { scrollTop } = controls
  controls.scrollTop = 0
  const top = measure()
  controls.scrollTop = controls.scrollHeight
  const bottom = measure()
  controls.scrollTop = scrollTop
  return { above: Math.max(top.above, bottom.above), below: Math.min(top.below, bottom.below) }
}
