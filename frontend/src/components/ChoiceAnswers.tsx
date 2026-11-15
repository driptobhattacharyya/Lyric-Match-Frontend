import { m } from 'motion/react'
import { useEffect, useEffectEvent } from 'react'

interface Props {
  options: string[]
  /** Accepting a pick right now. */
  interactive: boolean
  /** Option being judged by the server. */
  pending: string | null
  /** Options already guessed wrong this round. */
  wrong: string[]
  /** Revealed title once the round is over. */
  answerTitle: string | null
  onPick: (option: string) => void
}

const norm = (s: string) => s.trim().toLowerCase()

type OptionState = 'idle' | 'pending' | 'wrong' | 'right' | 'dim'

const TONE: Record<OptionState, string> = {
  idle: 'btn-ghost',
  pending: 'btn-aqua',
  wrong: 'btn-coral',
  right: 'btn-mint',
  dim: 'btn-ghost',
}

/** Four big tappable options; number keys 1-4 pick too. A wrong pick costs a heart and locks that option. */
export function ChoiceAnswers({ options, interactive, pending, wrong, answerTitle, onPick }: Props) {
  const wrongSet = new Set(wrong.map(norm))

  const pick = (opt: string) => {
    if (!interactive || wrongSet.has(norm(opt))) return
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
    <div>
      <p id="choice-help" className="mb-2 text-center font-display text-sm font-semibold tracking-wider text-mist uppercase">
        Pick the title <span className="hidden normal-case sm:inline">· keys 1–4</span>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2" aria-describedby="choice-help">
        {options.map((opt, i) => {
          const isAnswer = answerTitle !== null && norm(opt) === norm(answerTitle)
          const isWrong = wrongSet.has(norm(opt))
          const state: OptionState = isAnswer
            ? 'right'
            : isWrong
              ? 'wrong'
              : answerTitle !== null
                ? 'dim'
                : pending === opt
                  ? 'pending'
                  : 'idle'
          const light = state === 'idle' || state === 'dim'
          return (
            <m.li
              key={opt}
              initial={{ opacity: 0, y: 16 }}
              animate={
                state === 'wrong'
                  ? { opacity: 0.85, y: 0, x: [0, -10, 10, -7, 7, 0] }
                  : state === 'right'
                    ? { opacity: 1, y: 0, scale: [1, 1.07, 1] }
                    : { opacity: state === 'dim' ? 0.45 : 1, y: 0 }
              }
              transition={{ delay: answerTitle !== null || isWrong ? 0 : 0.2 + i * 0.06, duration: state === 'wrong' ? 0.45 : 0.3 }}
            >
              <button
                type="button"
                onClick={() => pick(opt)}
                disabled={isWrong}
                aria-disabled={!interactive || isWrong}
                aria-label={`${i + 1}. ${opt}${isWrong ? ', wrong' : ''}${isAnswer ? ', correct answer' : ''}`}
                className={`btn-chunk ${TONE[state]} min-h-16 w-full justify-start px-4 py-3 text-left normal-case ${
                  state === 'pending' ? 'animate-pulse' : ''
                } ${!interactive && state === 'idle' ? 'cursor-default' : ''} ${isWrong ? 'line-through decoration-2' : ''}`}
              >
                <kbd
                  className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 font-display text-base ${
                    light ? 'border-line text-mist' : 'border-ink/30 text-ink'
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </kbd>
                <span className={`text-lg leading-tight font-semibold ${light ? 'text-cloud' : 'text-ink'}`}>{opt}</span>
              </button>
            </m.li>
          )
        })}
      </ul>
    </div>
  )
}
