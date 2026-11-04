import * as engine from '../strudel/engine'

/** Only visual nodes animate; cancellation never changes panel geometry or cables. */
export function observeActivity(
  surface: HTMLElement,
  motion = matchMedia('(prefers-reduced-motion: reduce)'),
) {
  const animations = new Map<Element, Animation>()
  function clear() {
    animations.forEach((animation) => animation.cancel())
    animations.clear()
    surface
      .querySelectorAll('.playing-grid')
      .forEach((grid) => grid.classList.remove('playing-grid'))
  }
  motion.addEventListener('change', clear)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'activity-clear') clear()
    if (event.type !== 'activity') return
    for (const step of event.steps) {
      const panel = Array.from(surface.querySelectorAll<HTMLElement>('[data-module]')).find(
        (p) => p.dataset.module === step.module,
      )
      if (!panel) continue
      const grid = panel.querySelector('.step-editor, .grid-editor')
      if (motion.matches) {
        grid?.classList.add('playing-grid')
        continue
      }
      for (const cell of panel.querySelectorAll<HTMLElement>('[data-step]')) {
        animations.get(cell)?.cancel()
        animations.delete(cell)
        if (cell.dataset.step !== String(step.index)) continue
        const animation = cell.animate(
          [
            { boxShadow: 'inset 0 0 0 2px #fff3a0', filter: 'brightness(1.6)' },
            { boxShadow: 'none', filter: 'brightness(1)' },
          ],
          { duration: 400, easing: 'ease-out' },
        )
        animations.set(cell, animation)
        animation.onfinish = () => animations.delete(cell)
      }
    }
    if (motion.matches) return
    for (const panel of surface.querySelectorAll<HTMLElement>('[data-module]')) {
      if (!event.modules.includes(panel.dataset.module ?? '')) continue
      const element = panel.matches('.family-alien')
        ? panel.querySelector('.activity-glow')
        : panel.matches('.look-instrument')
          ? panel.querySelector('.module-dot')
          : null
      if (!element) continue
      animations.get(element)?.cancel()
      const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 400,
        easing: 'ease-out',
        ...(panel.matches('.look-instrument') ? { pseudoElement: '::after' } : {}),
      })
      animations.set(element, animation)
      animation.onfinish = () => animations.delete(element)
    }
  })
  return () => {
    clear()
    motion.removeEventListener('change', clear)
    unsubscribe()
  }
}
