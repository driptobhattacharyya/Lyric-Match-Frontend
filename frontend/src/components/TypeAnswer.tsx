import { m, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './Icon'

interface Props {
  interactive: boolean
  checking: boolean
  wrongCount: number
  attemptsLeft: number
  lastWrong: string | null
  onSubmit: (guess: string) => void
  onGiveUp: () => void
}

/** Pro mode: a real form with a labelled input; Enter submits. */
export function TypeAnswer({ interactive, checking, wrongCount, attemptsLeft, lastWrong, onSubmit, onGiveUp }: Props) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const shake = useAnimationControls()

  useEffect(() => {
    if (interactive) input.current?.focus({ preventScroll: true })
  }, [interactive])

  useEffect(() => {
    if (wrongCount === 0) return
    void shake.start({ x: [0, -12, 12, -8, 8, -4, 0], transition: { duration: 0.45 } })
    input.current?.select()
  }, [wrongCount, shake])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!interactive || !value.trim()) return
    onSubmit(value)
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label htmlFor="guess" className="block text-center font-display text-sm font-semibold tracking-wider text-mist uppercase">
        Type the song title
      </label>
      <m.div animate={shake} className="flex gap-2">
        <input
          id="guess"
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!interactive}
          aria-invalid={wrongCount > 0 && value === lastWrong}
          aria-describedby="guess-status"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={120}
          placeholder="Song title…"
          className={`min-h-14 w-full min-w-0 rounded-chunk border-2 bg-night px-4 font-display text-xl text-cloud placeholder:text-mist/60 focus:outline-none focus-visible:border-aqua ${
            wrongCount > 0 && value === lastWrong ? 'border-coral' : 'border-line'
          }`}
        />
        <button type="submit" className="btn-chunk btn-aqua shrink-0 px-5" disabled={!value.trim() || !interactive} aria-busy={checking}>
          {checking ? <Icon name="disc" className="animate-spin" /> : <Icon name="arrow" />}
          <span className="sr-only sm:not-sr-only">Check</span>
        </button>
      </m.div>
      <div className="flex items-center justify-between gap-3 px-1">
        <p id="guess-status" className="flex items-center gap-2 text-sm text-mist" aria-live="polite">
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: wrongCount + attemptsLeft }, (_, i) => (
              <span key={i} className={`size-2.5 rounded-full ${i < wrongCount ? 'bg-coral' : 'bg-aqua'}`} />
            ))}
          </span>
          {wrongCount > 0 ? `Not that one. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left` : `${attemptsLeft} tries`}
        </p>
        <button
          type="button"
          onClick={onGiveUp}
          disabled={!interactive}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 font-display font-semibold text-mist transition hover:text-cloud disabled:opacity-40"
        >
          <Icon name="flag" size={18} /> Give up
        </button>
      </div>
    </form>
  )
}
