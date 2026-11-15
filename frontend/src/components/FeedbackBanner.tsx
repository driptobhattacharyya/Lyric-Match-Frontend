import { m } from 'motion/react'
import type { ReactNode } from 'react'
import type { RoundResult } from '../game/types'
import { Icon } from './Icon'

interface Props {
  result: RoundResult
  gameOver: boolean
  outOfHearts: boolean
  waiting: boolean
  onContinue: () => void
}

const PRAISE = ['Nailed it!', 'Spot on!', 'Big ears!', 'Encore!', 'You know it!', 'Smooth!', 'Bang on!', 'Hit single!']
const MISS: Record<Exclude<RoundResult['outcome'], 'correct'>, string> = {
  wrong: 'Not quite!',
  timeout: "Time's up!",
  gaveup: 'Skipped',
}

/** Bottom sheet that reports the round and waits for the player to continue. */
export function FeedbackBanner({ result, gameOver, outOfHearts, waiting, onContinue }: Props) {
  const ok = result.outcome === 'correct'
  const b = result.breakdown
  const title = ok ? (result.streak >= 3 ? `${result.streak} in a row!` : PRAISE[result.index % PRAISE.length]) : MISS[result.outcome]
  const cta = gameOver ? 'See results' : 'Continue'
  return (
    <m.section
      role="status"
      aria-live="assertive"
      aria-label="Round result"
      initial={{ y: '110%' }}
      animate={{ y: 0 }}
      exit={{ y: '110%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={`fixed inset-x-0 bottom-0 z-30 border-t-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${
        ok ? 'border-mint bg-[#0f2b2a]' : 'border-coral bg-[#2e1230]'
      }`}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <m.span
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
            className={`grid size-12 shrink-0 place-items-center rounded-full ${ok ? 'bg-mint text-ink' : 'bg-coral text-ink'}`}
          >
            <Icon name={ok ? 'check' : result.outcome === 'timeout' ? 'clock' : 'close'} size={28} strokeWidth={3} />
          </m.span>
          <div className="min-w-0 flex-1">
            <h2 className={`font-display text-2xl font-bold ${ok ? 'text-mint' : 'text-coral'}`}>{title}</h2>
            <p className="truncate text-cloud">
              <span className="text-mist">{ok ? 'It’s ' : 'It was '}</span>
              <strong className="font-semibold">{result.answer.title}</strong>
              <span className="text-mist"> · {result.answer.artist}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-sm font-semibold">
              {ok && b ? (
                <>
                  <Chip tone="sun">+{result.points} pts</Chip>
                  {b.speedBonus > 0 && <Chip tone="aqua">Speed +{b.speedBonus}</Chip>}
                  {b.multiplier > 1 && <Chip tone="pop">Streak ×{b.multiplier}</Chip>}
                  {b.hintPenalty > 0 && <Chip tone="mist">Hints −{b.hintPenalty}</Chip>}
                  {b.attemptPenalty > 0 && <Chip tone="mist">Retries −{b.attemptPenalty}</Chip>}
                </>
              ) : (
                <Chip tone="coral">
                  <Icon name="heart" size={14} filled /> −1 heart{outOfHearts ? ' · out of hearts' : ''}
                </Chip>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onContinue}
          aria-busy={waiting}
          className={`btn-chunk w-full sm:w-auto sm:min-w-44 ${ok ? 'btn-mint' : 'btn-coral'}`}
        >
          {cta}
        </button>
      </div>
    </m.section>
  )
}

const TONES = {
  sun: 'bg-sun text-ink',
  aqua: 'bg-aqua/15 text-aqua',
  pop: 'bg-pop/20 text-pop',
  mist: 'bg-white/10 text-mist',
  coral: 'bg-coral/20 text-coral',
} as const

function Chip({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${TONES[tone]}`}>{children}</span>
}
