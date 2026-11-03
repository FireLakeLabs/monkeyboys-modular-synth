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
  }
  motion.addEventListener('change', clear)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'activity-clear') clear()
    if (event.type !== 'activity' || motion.matches) return
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
