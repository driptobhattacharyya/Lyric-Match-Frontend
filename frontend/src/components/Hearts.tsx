import { AnimatePresence, m } from 'motion/react'
import { RULES } from '../game/rules'
import { Icon } from './Icon'

export function Hearts({ hearts }: { hearts: number }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${hearts} of ${RULES.hearts} hearts left`}>
      {Array.from({ length: RULES.hearts }, (_, i) => {
        const alive = i < hearts
        return (
          <span key={i} className="relative grid size-7 place-items-center">
            <Icon name="heart" size={26} filled className="text-plum" />
            <AnimatePresence>
              {alive && (
                <m.span
                  className="absolute inset-0 grid place-items-center text-coral"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: [1, 1.5, 0], rotate: [0, -15, 20], opacity: [1, 1, 0] }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  <Icon name="heart" size={26} filled />
                </m.span>
              )}
            </AnimatePresence>
          </span>
        )
      })}
    </div>
  )
}
