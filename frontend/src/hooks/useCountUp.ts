import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/** Animates a number from 0 to `target` with an ease-out curve. */
export function useCountUp(target: number, durationMs = 1200, delayMs = 0): number {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (reduce) return
    let raf = 0
    let start = 0
    const step = (t: number) => {
      if (!start) start = t + delayMs
      const p = Math.min(1, Math.max(0, (t - start) / durationMs))
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, delayMs, reduce])

  return reduce ? target : value
}
