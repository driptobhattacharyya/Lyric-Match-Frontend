import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ChoiceAnswers } from '../components/ChoiceAnswers'
import { ErrorPanel } from '../components/ErrorPanel'
import { FeedbackBanner } from '../components/FeedbackBanner'
import { Hearts } from '../components/Hearts'
import { HintBar } from '../components/HintBar'
import { IconButton } from '../components/IconButton'
import { LyricCard } from '../components/LyricCard'
import { Modal } from '../components/Modal'
import { RingTimer } from '../components/RingTimer'
import { RoundProgress } from '../components/RoundProgress'
import { StreakChip } from '../components/StreakChip'
import { TitleMask } from '../components/TitleMask'
import { TypeAnswer } from '../components/TypeAnswer'
import { Equalizer } from '../components/Equalizer'
import { isGameOver, type Round, type State } from '../game/reducer'
import { RULES } from '../game/rules'
import type { GameActions } from '../hooks/useGame'
import { useCountdown } from '../hooks/useCountdown'
import { burst } from '../lib/confetti'
import { buzz, sfx } from '../lib/sound'

interface Props {
  state: State
  actions: GameActions
}

/** Fires `cb` whenever `value` grows (not on mount). */
function useOnIncrease(value: number, cb: (value: number) => void) {
  const prev = useRef(value)
  useEffect(() => {
    if (value > prev.current) cb(value)
    prev.current = value
  })
}

export function GameScreen({ state, actions }: Props) {
  const { phase, round, results, hearts, streak, score, difficulty, request, error } = state
  const [confirmQuit, setConfirmQuit] = useState(false)
  const last = results.at(-1)

  const remaining = useCountdown(
    phase === 'guessing' && !request ? (round?.deadline ?? null) : null,
    round?.remainingMs ?? 0,
    () => {
      if (!round) return
      sfx.timeUp()
      buzz([80, 50, 80])
      actions.timeUp(round.id)
    },
    (s) => s <= 5 && sfx.tick(s <= 3),
  )

  useOnIncrease(results.length, () => {
    const r = results.at(-1)
    if (!r) return
    if (r.outcome === 'correct') {
      sfx.correct(r.streak)
      buzz(35)
      if (r.streak >= 5 && r.streak % 5 === 0) burst('big')
      else if (r.streak >= 3) burst('small')
    } else if (r.outcome !== 'timeout') {
      sfx.wrong()
      buzz([60, 40, 60])
    }
  })
  useOnIncrease(round?.wrongAttempts ?? 0, () => {
    sfx.wrong()
    buzz([50, 30, 50])
  })
  useOnIncrease((round?.hints.lettersLevel ?? 0) + (round?.hints.artist ? 1 : 0), () => sfx.hint())

  const showRound = round && (phase === 'guessing' || phase === 'checking' || phase === 'feedback')
  const feedback = phase === 'feedback' && last
  const currentIndex = round && phase !== 'feedback' ? round.index : results.length

  return (
    <div className={`mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 ${feedback ? 'pb-64 sm:pb-44' : 'pb-8'}`}>
      <header className="flex items-center gap-3 py-2">
        <IconButton icon="close" label="Quit game" onClick={() => setConfirmQuit(true)} />
        <RoundProgress results={results} current={currentIndex} />
        <Hearts hearts={hearts} />
      </header>

      <div className="mt-2 mb-4 flex items-center justify-between gap-3">
        <RingTimer
          remainingMs={showRound ? remaining : round && phase === 'error' ? round.remainingMs : roundSeconds(difficulty)}
          durationMs={round?.durationMs ?? roundSeconds(difficulty)}
          paused={phase !== 'guessing' || !!request}
        />
        <StreakChip streak={streak} />
        <div className="text-right" aria-live="off">
          <div className="font-display text-xs font-semibold tracking-wider text-mist uppercase">Score</div>
          <m.div
            key={score}
            initial={{ scale: 1.35, color: 'var(--color-sun)' }}
            animate={{ scale: 1, color: 'var(--color-cloud)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="font-display text-2xl font-bold tabular-nums"
          >
            {score.toLocaleString('en-US')}
          </m.div>
        </div>
      </div>

      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'error' && error ? (
            <m.div key="error" exit={{ opacity: 0 }}>
              <ErrorPanel error={error} inGame={results.length > 0 || !!round} onRetry={actions.retry} onQuit={actions.quit} />
            </m.div>
          ) : showRound ? (
            <m.div
              key={round.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <RoundView state={state} round={round} actions={actions} answerTitle={feedback ? last.answer.title : null} />
            </m.div>
          ) : (
            <m.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingRound index={results.length} />
            </m.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {feedback && (
          <FeedbackBanner
            key={last.index}
            result={last}
            gameOver={isGameOver(state)}
            outOfHearts={hearts === 0}
            waiting={false}
            onContinue={actions.next}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmQuit && (
          <Modal title="Quit this game?" onClose={() => setConfirmQuit(false)}>
            <h2 className="font-display text-2xl font-bold">Quit this game?</h2>
            <p className="mt-1 mb-6 text-mist">Your score for this game won’t be saved. The clock keeps running while you decide.</p>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button type="button" data-autofocus className="btn-chunk btn-aqua flex-1" onClick={() => setConfirmQuit(false)}>
                Keep playing
              </button>
              <button
                type="button"
                className="btn-chunk btn-coral flex-1"
                onClick={() => {
                  setConfirmQuit(false)
                  actions.quit()
                }}
              >
                Quit
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

function roundSeconds(d: State['difficulty']) {
  return RULES.roundSeconds[d] * 1000
}

function RoundView({
  state,
  round,
  actions,
  answerTitle,
}: {
  state: State
  round: Round
  actions: GameActions
  answerTitle: string | null
}) {
  const { phase, request, difficulty } = state
  const interactive = phase === 'guessing' && !request
  const checking = phase === 'checking'
  const hintLoading = request?.req.kind === 'hint' ? request.req.hint : null
  const options = round.data.options
  return (
    <div className="space-y-5">
      <LyricCard lyrics={round.data.lyrics} />
      <div className="space-y-3">
        <TitleMask mask={answerTitle && difficulty === 'pro' ? revealMask(round.mask, answerTitle) : round.mask} baseMask={round.data.titleMask} />
        <HintBar
          hints={round.hints}
          artist={round.artist}
          disabled={!interactive}
          loading={hintLoading}
          onHint={actions.hint}
        />
      </div>
      {difficulty === 'easy' && options ? (
        <ChoiceAnswers options={options} interactive={interactive} checking={checking} answerTitle={answerTitle} onPick={actions.submit} />
      ) : (
        <TypeAnswer
          interactive={interactive}
          checking={checking && request?.req.kind === 'check'}
          wrongCount={round.wrongAttempts}
          attemptsLeft={Math.max(0, RULES.attempts[difficulty] - round.wrongAttempts)}
          lastWrong={round.wrongGuesses.at(-1) ?? null}
          onSubmit={actions.submit}
          onGiveUp={actions.giveUp}
        />
      )}
    </div>
  )
}

/** After the round, fill the mask with the real title if it lines up. */
function revealMask(mask: string, title: string): string {
  return title.length === mask.length ? title : mask
}

function LoadingRound({ index }: { index: number }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="card flex flex-col items-center gap-4 px-6 py-10">
        <Equalizer />
        <p className="font-display text-xl font-semibold">
          {index === 0 ? 'Picking your first song…' : `Cueing up round ${index + 1}…`}
        </p>
        <div className="w-full space-y-2.5">
          <div className="skeleton mx-auto h-5 w-11/12" />
          <div className="skeleton mx-auto h-5 w-9/12" />
          <div className="skeleton mx-auto h-5 w-10/12" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 rounded-chunk" />
        ))}
      </div>
    </div>
  )
}
