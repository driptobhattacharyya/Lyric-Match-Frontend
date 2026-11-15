import { m } from 'motion/react'

interface Props {
  remainingMs: number
  durationMs: number
  paused: boolean
}

const R = 26
const C = 2 * Math.PI * R

/** Circular countdown. Colour shifts aqua -> sun -> coral as time runs out. */
export function RingTimer({ remainingMs, durationMs, paused }: Props) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000))
  const frac = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0
  const color = secs <= 5 ? 'var(--color-coral)' : frac <= 0.5 ? 'var(--color-sun)' : 'var(--color-aqua)'
  const urgent = secs <= 5 && secs > 0 && !paused
  return (
    <m.div
      className="relative grid size-16 shrink-0 place-items-center"
      role="timer"
      aria-label={`${secs} seconds left${paused ? ', paused' : ''}`}
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="var(--color-night)" stroke="var(--color-plum)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 100ms linear, stroke 300ms' }}
        />
      </svg>
      <span className="relative font-display text-xl font-bold tabular-nums" style={{ color }}>
        {secs}
      </span>
    </m.div>
  )
}
