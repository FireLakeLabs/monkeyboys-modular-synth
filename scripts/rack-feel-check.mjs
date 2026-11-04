// In a Vite page: (await import('/scripts/rack-feel-check.mjs')).verifyPanels().
// No audio is started; this suite checks the actual catalog-backed controls.
import { CATALOG } from '../src/modules/catalog.ts'
import { looksFor } from '../src/modules/looks.ts'
import { emptyPatch } from '../src/patch/types.ts'
import { HP, placeModule, placementPosition } from '../src/rack/model.ts'
import { generate } from '../src/codegen/generate.ts'
import { replaceSource } from './editor-browser.mjs'

const pause = () => new Promise((resolve) => setTimeout(resolve, 30))
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for rack')
}
export async function load(source) {
  await until(() => document.querySelector('.cm-content'))
  replaceSource(source)
  await pause()
  await until(() =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code'),
  )
  await pause()
}
export async function loadLook(look) {
  const specs = CATALOG.filter((spec) => looksFor(spec.family).includes(look))
  assert(specs.length, `Unknown look ${look}`)
  let patch = emptyPatch()
  for (const spec of [
    ...specs,
    ...CATALOG.filter((spec) => spec.id === 'out' && !specs.includes(spec)),
  ]) {
    const position = placementPosition(patch, spec.id)
    patch = placeModule(patch, spec.id, position.row, position.hp)
  }
  patch.modules = patch.modules.map((module) => ({
    ...module,
    ...(specs.some((spec) => spec.id === module.type) ? { look } : {}),
  }))
  await load(generate(patch))
  document.querySelector('[aria-label="Rack zoom"]').value = '1'
  document
    .querySelector('[aria-label="Rack zoom"]')
    .dispatchEvent(new Event('change', { bubbles: true }))
  await pause()
}
function contrast(element) {
  const style = getComputedStyle(element)
  const luminance = (color) => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((n) => {
        const c = Number(n) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const a = luminance(style.color),
    b = luminance(style.backgroundColor)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
export function inspectPanels(look) {
  const panels = [
    ...document.querySelectorAll(look ? `.module-panel.look-${look}` : '.module-panel'),
  ]
  for (const panel of panels) {
    const id = panel.dataset.module
    const spec = CATALOG.find((spec) =>
      panel.getAttribute('aria-label').startsWith(`${spec.name} ${id}`),
    )
    assert(spec && panel.offsetWidth === spec.hp * HP, `${id}: width differs from catalog`)
    assert(contrast(panel.querySelector('.module-id')) >= 4.5, `${id}: low ID contrast`)
    const controls = panel.querySelector('.module-controls')
    assert(
      controls.scrollHeight <= controls.clientHeight + 1,
      `${id}: vertical control overflow ${controls.scrollHeight}/${controls.clientHeight}`,
    )
    assert(controls.scrollWidth <= controls.clientWidth + 1, `${id}: horizontal control overflow`)
    const box = controls.getBoundingClientRect()
    for (const control of controls.querySelectorAll('button,input,select,textarea')) {
      const rect = control.getBoundingClientRect()
      assert(
        rect.top >= box.top - 1 &&
          rect.bottom <= box.bottom + 1 &&
          rect.left >= box.left - 1 &&
          rect.right <= box.right + 1,
        `${id}: clipped ${control.getAttribute('aria-label') ?? control.textContent}`,
      )
    }
    for (const node of panel.querySelectorAll('*')) {
      if (
        [...node.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
        )
      ) {
        assert(
          parseFloat(getComputedStyle(node).fontSize) >= 11,
          `${id}: undersized text ${node.className}`,
        )
      }
    }
    for (const readout of panel.querySelectorAll('.readout')) {
      assert(parseFloat(getComputedStyle(readout).fontSize) >= 12, `${id}: undersized value`)
      assert(readout.scrollWidth <= readout.clientWidth + 1, `${id}: value overflow`)
    }
    assert(!panel.querySelector('.reset'), `${id}: redundant Reset link`)
    const jacks = [...panel.querySelectorAll('[data-jack]')].map((jack) =>
      jack.getBoundingClientRect(),
    )
    for (const [index, rect] of jacks.entries()) {
      assert(rect.width >= 23.99 && rect.height >= 23.99, `${id}: jack smaller than 24px`)
      for (const other of jacks.slice(index + 1))
        assert(
          rect.right <= other.left ||
            other.right <= rect.left ||
            rect.bottom <= other.top ||
            other.bottom <= rect.top,
          `${id}: overlapping jack targets`,
        )
    }
    for (const slider of panel.querySelectorAll('.knob')) {
      assert(slider.getAttribute('role') === 'slider', `${id}: missing slider role`)
      for (const name of ['min', 'max', 'now', 'text'])
        assert(slider.hasAttribute(`aria-value${name}`), `${id}: missing slider value${name}`)
    }
  }
  for (const label of document.querySelectorAll('.row-label'))
    assert(contrast(label) >= 4.5, 'Low rail label contrast')
  return panels.length
}
export async function verifyPanels(zooms = [1, 0.75, 'fit']) {
  const results = []
  for (const look of [
    'powder',
    'instrument',
    'vintage',
    'learner',
    'crystal',
    'bio',
    'monolith',
    'terminal',
    'neon',
    'bare',
  ]) {
    await loadLook(look)
    for (const zoom of zooms) {
      const select = document.querySelector('[aria-label="Rack zoom"]')
      select.value = String(zoom)
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await pause()
      results.push({ look, zoom, panels: inspectPanels(look) })
    }
  }
  assert(
    results.reduce((sum, result) => sum + result.panels, 0) === 61 * zooms.length,
    'Missing module/look combination',
  )
  return results
}
export async function loadEnveloped() {
  await load(await (await fetch('/src/library/patches/enveloped-synth.strudel')).text())
}
export function inspectCables() {
  const surface = document.querySelector('.rack-surface')
  const scale = surface.getBoundingClientRect().width / surface.offsetWidth
  const bounds = surface.getBoundingClientRect()
  const jacks = new Map(
    [...surface.querySelectorAll('[data-jack]')].map((jack) => {
      const rect = jack.getBoundingClientRect()
      return [
        jack.dataset.jack,
        {
          x: (rect.left + rect.width / 2 - bounds.left) / scale,
          y: (rect.top + rect.height / 2 - bounds.top) / scale,
        },
      ]
    }),
  )
  for (const cable of surface.querySelectorAll('.cable')) {
    const [from, to] = cable.querySelector('title').textContent.split(' → ')
    const start = jacks.get(from),
      end = jacks.get(to.split(' · ')[0])
    const path = cable.querySelector('path')
    const a = path.getPointAtLength(0),
      b = path.getPointAtLength(path.getTotalLength())
    assert(start && end, 'Cable has no jack')
    assert(Math.hypot(a.x - start.x, a.y - start.y) < 6, 'Cable start detached from jack')
    assert(Math.hypot(b.x - end.x, b.y - end.y) < 0.1, 'Cable end detached from jack')
  }
  return { scale, cables: surface.querySelectorAll('.cable').length }
}
