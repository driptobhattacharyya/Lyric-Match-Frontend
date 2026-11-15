import { useEffect, useEffectEvent, useState } from 'react'

const TICK_MS = 100

/**
 * Deadline-based countdown. Remaining time is always recomputed from
 * Date.now(), so throttled timers in background tabs cannot drift.
 * Calls `onExpire` once when the deadline passes and `onSecond` as each of
 * the final seconds begins.
 */
export function useCountdown(
  deadline: number | null,
  frozenMs: number,
  onExpire: () => void,
  onSecond?: (secondsLeft: number) => void,
): number {
  const [now, setNow] = useState(() => Date.now())
  const expire = useEffectEvent(onExpire)
  const second = useEffectEvent((s: number) => onSecond?.(s))

  useEffect(() => {
    if (deadline === null) return
    let lastSecond = Math.ceil((deadline - Date.now()) / 1000)
    let fired = false
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const left = deadline - t
      const s = Math.ceil(left / 1000)
      if (s !== lastSecond && s > 0) {
        lastSecond = s
        second(s)
      }
      if (left <= 0 && !fired) {
        fired = true
        expire()
      }
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deadline])

  return deadline === null ? frozenMs : Math.max(0, deadline - now)
}
