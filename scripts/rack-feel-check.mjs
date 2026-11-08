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
  // Keep the growing family matrix in a full-width case so Fit tests panel
  // geometry rather than shrinking an ever-taller collection to minimum zoom.
  let patch = { ...emptyPatch(), railHp: 104 }
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
    if (document.querySelector('.rack-frame')?.dataset.overview === 'true') {
      assert(controls.inert === (spec.id !== 'out'), `${id}: wrong overview control availability`)
      assert(getComputedStyle(controls).overflowY === 'hidden', `${id}: overview scrollbars`)
      assert(
        [...panel.querySelectorAll('[data-jack]')].every((jack) => jack.disabled),
        `${id}: live overview jack`,
      )
      assert(
        !!panel.querySelector('.overview-module') === (spec.id !== 'out'),
        `${id}: wrong overview navigation target`,
      )
      continue
    }
    assert(controls.clientHeight > 0, `${id}: controls have no usable height`)
    assert(
      getComputedStyle(controls).overflowY === 'auto',
      `${id}: overflowing controls cannot scroll`,
    )
    assert(controls.scrollWidth <= controls.clientWidth + 1, `${id}: horizontal control overflow`)
    const scrollTop = controls.scrollTop
    for (const control of controls.querySelectorAll('button,input,select,textarea')) {
      control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      const box = controls.getBoundingClientRect()
      const rect = control.getBoundingClientRect()
      assert(
        rect.top >= box.top - 1 &&
          rect.bottom <= box.bottom + 1 &&
          rect.left >= box.left - 1 &&
          rect.right <= box.right + 1,
        `${id}: unreachable ${control.getAttribute('aria-label') ?? control.textContent}`,
      )
    }
    controls.scrollTop = scrollTop
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
    for (const text of panel.querySelectorAll(
      '.segments, .toggle-control, .module-header strong',
    )) {
      assert(text.scrollWidth <= text.clientWidth + 1, `${id}: clipped ${text.textContent}`)
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
      // Chromium rounds fractional zoom geometry to 1/64 of a CSS pixel.
      assert(
        rect.width >= 24 - 1 / 64 && rect.height >= 24 - 1 / 64,
        `${id}: jack smaller than 24px`,
      )
      for (const other of jacks.slice(index + 1))
        assert(
          rect.right <= other.left ||
            other.right <= rect.left ||
            rect.bottom <= other.top ||
            other.bottom <= rect.top,
          `${id}: overlapping jack targets`,
        )
    }
    for (const slider of panel.querySelectorAll('.knob, .fader')) {
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
  const focus = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Focus rack',
  )
  focus?.click()
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
    results.reduce((sum, result) => sum + result.panels, 0) ===
      CATALOG.reduce((sum, spec) => sum + looksFor(spec.family).length, 0) * zooms.length,
    'Missing module/look combination',
  )
  if (focus)
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Restore workspace')
      ?.click()
  return results
}
export async function loadEnveloped() {
  await load(await (await fetch('/src/library/patches/enveloped-synth.strudel')).text())
}
export function inspectCables() {
  const surface = document.querySelector('.rack-frame')
  const rails = document.querySelector('.rack-surface')
  const scale = rails.getBoundingClientRect().width / rails.offsetWidth
  const bounds = surface.querySelector('.cables').getBoundingClientRect()
  const jacks = new Map(
    [...surface.querySelectorAll('[data-jack]')].map((jack) => {
      const rect = jack.getBoundingClientRect()
      let x = rect.left + rect.width / 2
      let y = rect.top + rect.height / 2
      const box = jack.closest('.patch-box')?.getBoundingClientRect()
      if (surface.dataset.overview !== 'true' && box) {
        x = Math.max(box.left, Math.min(x, box.right))
        y = Math.max(box.top, Math.min(y, box.bottom))
      }
      // Rail jacks scrolled out of view pin to the viewport edge rather than crossing OUT.
      const rail = jack.closest('.rack-scroll')
      const view = rail?.getBoundingClientRect()
      return [
        jack.dataset.jack,
        {
          x:
            (view ? Math.max(view.left, Math.min(x, view.left + rail.clientWidth)) : x) -
            bounds.left,
          y:
            (view ? Math.max(view.top, Math.min(y, view.top + rail.clientHeight)) : y) - bounds.top,
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
