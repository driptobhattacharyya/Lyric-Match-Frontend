import { m } from 'motion/react'
import type { GameError } from '../game/reducer'
import { Icon } from './Icon'

interface Props {
  error: GameError
  inGame: boolean
  onRetry: () => void
  onQuit: () => void
}

const TITLES: Partial<Record<GameError['failure']['code'], string>> = {
  network: 'Lost the signal',
  timeout: 'The server is snoozing',
  rate_limited: 'Slow down a beat',
  llm_unavailable: 'Lyric machine is busy',
  invalid_token: 'That round expired',
}

export function ErrorPanel({ error, inGame, onRetry, onQuit }: Props) {
  const title = TITLES[error.failure.code] ?? 'Something hit a wrong note'
  return (
    <m.div
      role="alert"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card flex flex-col items-center gap-4 px-6 py-8 text-center"
    >
      <m.span
        animate={{ rotate: [0, -8, 8, -4, 0] }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="grid size-16 place-items-center rounded-full bg-coral/15 text-coral"
      >
        <Icon name="wifi" size={34} />
      </m.span>
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="text-mist">{error.failure.message}</p>
        {inGame && (
          <p className="text-sm text-mist">
            {error.voided
              ? 'No heart lost. We’ll deal you a fresh round.'
              : 'Your score and hearts are safe, and the clock is paused.'}
          </p>
        )}
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" className="btn-chunk btn-sun" onClick={onRetry} autoFocus>
          <Icon name="replay" /> {error.voided ? 'New round' : 'Try again'}
        </button>
        <button type="button" className="btn-chunk btn-ghost" onClick={onQuit}>
          <Icon name="home" /> Home
        </button>
      </div>
    </m.div>
  )
}
