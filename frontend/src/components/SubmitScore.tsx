import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ApiFailure, ScoreSubmission } from '../game/types'
import * as api from '../lib/api'
import { Icon } from './Icon'

interface Props {
  receipts: string[]
  initialName: string
  onNameSaved: (name: string) => void
  onSubmitted: (name: string, result: ScoreSubmission) => void
  onView: () => void
}

type Sub =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'done'; result: ScoreSubmission }
  | { status: 'duplicate' }
  | { status: 'error'; failure: ApiFailure }

/** Name form that posts the game's receipts to the leaderboard and shows the rank. */
export function SubmitScore({ receipts, initialName, onNameSaved, onSubmitted, onView }: Props) {
  const [name, setName] = useState(initialName)
  const [sub, setSub] = useState<Sub>({ status: 'idle' })
  const [touched, setTouched] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  const localError = api.validateName(name)

  useEffect(() => () => ctrl.current?.abort(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (localError || sub.status === 'sending' || sub.status === 'done') return
    const clean = name.trim()
    onNameSaved(clean)
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setSub({ status: 'sending' })
    try {
      const result = await api.submitScore(clean, receipts, c.signal)
      if (c.signal.aborted) return
      setSub({ status: 'done', result })
      onSubmitted(clean, result)
    } catch (err) {
      if (c.signal.aborted) return
      const failure = api.toFailure(err)
      setSub(failure.code === 'duplicate_game' ? { status: 'duplicate' } : { status: 'error', failure })
    }
  }

  if (sub.status === 'done' || sub.status === 'duplicate') {
    const done = sub.status === 'done'
    return (
      <m.section
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="card flex items-center gap-4 border-sun/60 p-4"
        aria-live="polite"
      >
        <m.span
          initial={{ rotate: -30, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 12, delay: 0.1 }}
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sun font-display text-xl font-bold text-ink"
        >
          {done ? `#${sub.result.rank}` : <Icon name="check" strokeWidth={3} />}
        </m.span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{done ? `You’re #${sub.result.rank} on the board!` : 'Already on the board'}</p>
          <p className="text-sm text-mist">
            {done ? `Verified score: ${sub.result.score.toLocaleString('en-US')} pts` : 'This game was submitted before. Play again to set a new score.'}
          </p>
        </div>
        <button type="button" onClick={onView} className="btn-chunk btn-ghost min-h-12 shrink-0 px-4 text-sm">
          View
        </button>
      </m.section>
    )
  }

  const shownError = sub.status === 'error' ? sub.failure : touched && localError ? { code: 'bad_request' as const, message: localError } : null
  const unavailable = sub.status === 'error' && sub.failure.code === 'leaderboard_unavailable'

  return (
    <section className="card p-4" aria-labelledby="submit-title">
      <h2 id="submit-title" className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
        <Icon name="trophy" size={20} className="text-sun" /> Post to the leaderboard
      </h2>
      <p className="mb-3 text-sm text-mist">Your score is verified by the server from this game’s rounds.</p>
      <form onSubmit={submit} noValidate className="flex gap-2">
        <label htmlFor="player-name" className="sr-only">
          Your name
        </label>
        <input
          id="player-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (sub.status === 'error') setSub({ status: 'idle' })
          }}
          onBlur={() => setTouched(true)}
          maxLength={20}
          autoComplete="nickname"
          placeholder="Your name"
          aria-invalid={!!shownError && !unavailable}
          aria-describedby="name-help"
          className={`min-h-14 w-full min-w-0 rounded-chunk border-2 bg-ink px-4 font-display text-lg text-cloud placeholder:text-mist/70 focus:outline-none focus-visible:border-aqua ${
            shownError && !unavailable ? 'border-coral' : 'border-line'
          }`}
        />
        <button type="submit" className="btn-chunk btn-sun shrink-0 px-5" disabled={sub.status === 'sending'} aria-busy={sub.status === 'sending'}>
          {sub.status === 'sending' ? <Icon name="disc" className="animate-spin" /> : <Icon name="arrow" />}
          <span>{unavailable ? 'Retry' : 'Post'}</span>
        </button>
      </form>
      <AnimatePresence mode="wait" initial={false}>
        <m.p
          key={shownError ? shownError.message : 'help'}
          id="name-help"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`mt-2 text-sm ${shownError ? 'text-coral' : 'text-mist'}`}
          role={shownError ? 'alert' : undefined}
        >
          {shownError ? shownError.message : 'Up to 20 letters, numbers, spaces, _ - or .'}
        </m.p>
      </AnimatePresence>
    </section>
  )
}
