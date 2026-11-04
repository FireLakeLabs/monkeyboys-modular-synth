import type { GridStep } from '../strudel/activity'
import * as engine from '../strudel/engine'

/** Only visual nodes animate; cancellation never changes panel geometry or cables. */
export function observeActivity(
  surface: HTMLElement,
  motion = matchMedia('(prefers-reduced-motion: reduce)'),
) {
  const animations = new Map<Element, Animation>()
  let frame: number | null = null
  const pendingSteps: GridStep[] = []
  function clear() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    pendingSteps.length = 0
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
    pendingSteps.push(...event.steps)
    if (frame === null)
      frame = requestAnimationFrame(() => {
        frame = null
        const cellsByGrid = new Map<HTMLElement, Set<HTMLElement>>()
        for (const step of pendingSteps.splice(0)) {
          const panel = Array.from(surface.querySelectorAll<HTMLElement>('[data-module]')).find(
            (p) => p.dataset.module === step.module,
          )
          if (!panel) continue
          const grid = Array.from(panel.querySelectorAll<HTMLElement>('[data-mini-control]')).find(
            (g) => g.dataset.miniControl === step.control,
          )
          if (!grid) continue
          if (motion.matches) {
            grid?.classList.add('playing-grid')
            continue
          }
          const candidates = Array.from(
            grid?.querySelectorAll<HTMLElement>('[data-mini-start]') ?? [],
          ).filter(
            (cell) =>
              Number(cell.dataset.miniStart) <= step.start &&
              Number(cell.dataset.miniEnd) >= step.end,
          )
          // Choose the innermost visible cell; a collapsed or text group owns its leaves.
          const innermost = Math.min(
            ...candidates.map((c) => Number(c.dataset.miniEnd) - Number(c.dataset.miniStart)),
          )
          const matching = candidates.filter(
            (c) => Number(c.dataset.miniEnd) - Number(c.dataset.miniStart) === innermost,
          )
          const timed = matching.filter(
            (c) =>
              step.position >= Number(c.dataset.miniTimeStart) - 1e-8 &&
              step.position < Number(c.dataset.miniTimeEnd) - 1e-8,
          )
          const cells = cellsByGrid.get(grid) ?? new Set<HTMLElement>()
          for (const cell of timed.length ? timed : matching) cells.add(cell)
          cellsByGrid.set(grid, cells)
        }
        for (const [grid, cells] of cellsByGrid) {
          for (const cell of grid.querySelectorAll<HTMLElement>('[data-mini-start]')) {
            animations.get(cell)?.cancel()
            animations.delete(cell)
            if (!cells.has(cell)) continue
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
      })
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
