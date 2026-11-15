import { AnimatePresence, m } from 'motion/react'
import { streakMultiplier } from '../game/rules'
import { Icon } from './Icon'

/** Shows the current answer streak and the multiplier the next correct answer earns. */
export function StreakChip({ streak }: { streak: number }) {
  const hot = streak >= 2
  const nextMult = streakMultiplier(streak + 1)
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-display font-semibold transition-colors ${
        hot ? 'border-sun/60 bg-sun/10 text-sun' : 'border-line text-mist'
      }`}
      aria-label={`Streak ${streak}. Next correct answer earns times ${nextMult}`}
    >
      <m.span
        key={streak}
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 14 }}
        className="grid place-items-center"
      >
        <Icon name="flame" size={20} filled={hot} />
      </m.span>
      <span className="tabular-nums">{streak}</span>
      <AnimatePresence>
        {nextMult > 1 && (
          <m.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-full bg-sun px-1.5 text-sm text-ink"
          >
            ×{nextMult}
          </m.span>
        )}
      </AnimatePresence>
    </div>
  )
}
