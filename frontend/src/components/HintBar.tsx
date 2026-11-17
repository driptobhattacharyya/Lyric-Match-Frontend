import { AnimatePresence, m } from 'motion/react'
import { RULES } from '../game/rules'
import type { HintKind, HintUsage } from '../game/types'
import { Icon } from './Icon'

interface Props {
  hints: HintUsage
  artist: string | null
  disabled: boolean
  loading: HintKind | null
  onHint: (kind: HintKind) => void
}

export function HintBar({ hints, artist, disabled, loading, onHint }: Props) {
  const lettersDone = hints.lettersLevel >= RULES.maxLetterLevel
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Hints (cost points if you get it right)">
      <HintButton
        icon="bulb"
        label={`Letters ${hints.lettersLevel}/${RULES.maxLetterLevel}`}
        cost={RULES.letterHintCost}
        description={lettersDone ? 'All letter hints used' : `Reveal more letters, level ${hints.lettersLevel + 1} of ${RULES.maxLetterLevel}`}
        disabled={disabled || lettersDone}
        loading={loading === 'letters'}
        onClick={() => onHint('letters')}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {artist ? (
          <m.span
            key="artist"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-grape bg-grape/15 px-4 font-display font-semibold text-cloud"
          >
            <Icon name="mic" size={18} className="text-grape" />
            <span className="sr-only">Artist: </span>
            {artist}
          </m.span>
        ) : (
          <m.span key="btn" exit={{ scale: 0.6, opacity: 0 }}>
            <HintButton
              icon="mic"
              label="Artist"
              cost={RULES.artistHintCost}
              description="Reveal the artist"
              disabled={disabled}
              loading={loading === 'artist'}
              onClick={() => onHint('artist')}
            />
          </m.span>
        )}
      </AnimatePresence>
    </div>
  )
}

interface HintButtonProps {
  icon: 'bulb' | 'mic'
  label: string
  cost: number
  description: string
  disabled: boolean
  loading: boolean
  onClick: () => void
}

function HintButton({ icon, label, cost, description, disabled, loading, onClick }: HintButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      aria-label={`${label}. ${description}. Costs ${cost} points`}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-line bg-night px-4 font-display font-semibold text-cloud transition hover:border-grape hover:bg-plum active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-night"
    >
      <Icon name={icon} size={18} className={loading ? 'animate-spin text-grape' : 'text-grape'} />
      {label}
      <span className="rounded-full bg-plum px-2 text-sm text-sun" aria-hidden="true">
        −{cost}
      </span>
    </button>
  )
}
