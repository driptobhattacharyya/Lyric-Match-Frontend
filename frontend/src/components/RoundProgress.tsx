import type { RoundResult } from '../game/types'

interface Props {
  results: RoundResult[]
  current: number
  total: number
}

/** Segmented round tracker: green/red for played rounds, glowing for the current one. */
export function RoundProgress({ results, current, total }: Props) {
  return (
    <div
      className="flex flex-1 items-center gap-1.5"
      role="progressbar"
      aria-label="Round"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={Math.min(current + 1, total)}
      aria-valuetext={`Round ${Math.min(current + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const r = results[i]
        const cls = r
          ? r.outcome === 'correct'
            ? 'bg-mint'
            : 'bg-coral'
          : i === current
            ? 'bg-aqua/70 animate-pulse'
            : 'bg-plum'
        return <span key={i} className={`h-3 min-w-0 flex-1 rounded-full transition-colors duration-500 ${cls}`} />
      })}
    </div>
  )
}
