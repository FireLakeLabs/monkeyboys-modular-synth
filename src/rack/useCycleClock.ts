import { useEffect, useState } from 'react'
import * as engine from '../strudel/engine'

/** Media changes immediately stop visual motion, including already queued frames. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    change()
    return () => media.removeEventListener('change', change)
  }, [])
  return reduced
}

/** Shared scheduler snapshot; reduced motion freezes both clock and arranger. */
export function useCycleClock() {
  const reduced = useReducedMotion()
  const [clock, setClock] = useState(engine.getClock)
  useEffect(() => {
    const update = () => setClock(engine.getClock())
    update()
    const off = engine.subscribe((event) => {
      if (event.type === 'activity-clear') update()
    })
    const timer = reduced ? undefined : setInterval(update, 100)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [reduced])
  return { clock, reduced }
}
