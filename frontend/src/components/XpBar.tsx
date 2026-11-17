import { m } from 'motion/react'

interface Props {
  progress: number
  from?: number
  delay?: number
  className?: string
  label: string
}

/** Chunky XP progress bar that animates from `from` to `progress` (0..1). */
export function XpBar({ progress, from = progress, delay = 0, className = '', label }: Props) {
  const pct = Math.round(progress * 100)
  return (
    <div
      className={`h-4 overflow-hidden rounded-full bg-plum ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <m.div
        className="relative h-full rounded-full bg-sun"
        initial={{ width: `${from * 100}%` }}
        animate={{ width: `${Math.max(progress * 100, 4)}%` }}
        transition={{ duration: 1, delay, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/45" />
      </m.div>
    </div>
  )
}
