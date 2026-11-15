import { m, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './Icon'

interface Props {
  interactive: boolean
  checking: boolean
  wrongGuesses: string[]
  titleLength: number
  onSubmit: (guess: string) => void
  onSkip: () => void
}

/** Pro mode: a real form with a labelled input; Enter submits. Each wrong guess costs a heart. */
export function TypeAnswer({ interactive, checking, wrongGuesses, titleLength, onSubmit, onSkip }: Props) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const shake = useAnimationControls()
  const wrongCount = wrongGuesses.length
  const lastWrong = wrongGuesses.at(-1) ?? null
  const showWrong = lastWrong !== null && value.trim() === lastWrong

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
    <form onSubmit={submit} className="space-y-3" noValidate aria-label="Guess the title">
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
          aria-invalid={showWrong}
          aria-describedby="guess-status"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={200}
          placeholder={`${titleLength} characters…`}
          className={`min-h-14 w-full min-w-0 rounded-chunk border-2 bg-night px-4 font-display text-xl text-cloud placeholder:text-mist/70 focus:outline-none focus-visible:border-aqua ${
            showWrong ? 'border-coral' : 'border-line'
          }`}
        />
        <button type="submit" className="btn-chunk btn-aqua shrink-0 px-5" disabled={!value.trim() || !interactive} aria-busy={checking}>
          {checking ? <Icon name="disc" className="animate-spin" /> : <Icon name="arrow" />}
          <span className="sr-only sm:not-sr-only">Check</span>
        </button>
      </m.div>
      <div className="flex items-center justify-between gap-3 px-1">
        <p id="guess-status" className="min-w-0 text-sm text-mist" aria-live="polite">
          {lastWrong ? (
            <span className="text-coral">
              Not “<span className="break-all">{lastWrong}</span>”. −1 heart
            </span>
          ) : (
            'Spelling is forgiving. Wrong guesses cost a heart.'
          )}
        </p>
        <button
          type="button"
          onClick={onSkip}
          disabled={!interactive}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 font-display font-semibold text-mist transition hover:text-cloud disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="flag" size={18} /> Skip
        </button>
      </div>
    </form>
  )
}
