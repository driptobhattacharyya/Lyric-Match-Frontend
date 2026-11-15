import { m } from 'motion/react'
import { useEffect, useEffectEvent, useState } from 'react'

interface Props {
  options: string[]
  /** Accepting a pick right now. */
  interactive: boolean
  /** Waiting for the server to judge the pick. */
  checking: boolean
  /** Revealed title once the round is over. */
  answerTitle: string | null
  onPick: (option: string) => void
}

const norm = (s: string) => s.trim().toLowerCase()

/** Four big tappable options; number keys 1-4 pick too. */
export function ChoiceAnswers({ options, interactive, checking, answerTitle, onPick }: Props) {
  const [picked, setPicked] = useState<string | null>(null)

  const pick = (opt: string) => {
    if (!interactive) return
    setPicked(opt)
    onPick(opt)
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      e.preventDefault()
      pick(options[n - 1])
    }
  })

  useEffect(() => {
    if (!interactive) return
    const h = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [interactive])

  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Pick the song title">
      {options.map((opt, i) => {
        const isPicked = picked === opt
        const isAnswer = answerTitle !== null && norm(opt) === norm(answerTitle)
        const state = answerTitle !== null ? (isAnswer ? 'right' : isPicked ? 'wrong' : 'dim') : isPicked ? 'picked' : 'idle'
        const tone =
          state === 'right'
            ? 'btn-mint'
            : state === 'wrong'
              ? 'btn-coral'
              : state === 'picked'
                ? 'btn-aqua'
                : 'btn-ghost'
        return (
          <m.li
            key={opt}
            initial={{ opacity: 0, y: 16 }}
            animate={
              state === 'wrong'
                ? { opacity: 1, y: 0, x: [0, -10, 10, -7, 7, 0] }
                : state === 'right'
                  ? { opacity: 1, y: 0, scale: [1, 1.06, 1] }
                  : { opacity: state === 'dim' ? 0.45 : 1, y: 0 }
            }
            transition={{ delay: answerTitle !== null ? 0 : 0.25 + i * 0.06, duration: state === 'wrong' ? 0.45 : 0.3 }}
          >
            <button
              type="button"
              onClick={() => pick(opt)}
              aria-disabled={!interactive}
              aria-pressed={isPicked}
              className={`btn-chunk ${tone} w-full justify-start px-4 py-3 text-left normal-case ${
                checking && isPicked ? 'animate-pulse' : ''
              } ${!interactive && state === 'idle' ? 'cursor-default' : ''}`}
            >
              <kbd
                className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 font-display text-base ${
                  state === 'idle' || state === 'dim' ? 'border-line text-mist' : 'border-ink/30 text-ink'
                }`}
                aria-hidden="true"
              >
                {i + 1}
              </kbd>
              <span className={`text-lg leading-tight font-semibold ${state === 'idle' || state === 'dim' ? 'text-cloud' : 'text-ink'}`}>
                {opt}
              </span>
            </button>
          </m.li>
        )
      })}
    </ul>
  )
}
