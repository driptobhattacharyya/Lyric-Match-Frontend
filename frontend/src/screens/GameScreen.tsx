import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ChoiceAnswers } from '../components/ChoiceAnswers'
import { Equalizer } from '../components/Equalizer'
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
import { packName } from '../game/packs'
import { isGameOver, type Round, type State } from '../game/reducer'
import { RULES } from '../game/rules'
import { API_MODE, type Meta } from '../game/types'
import type { GameActions } from '../hooks/useGame'
import { useCountdown } from '../hooks/useCountdown'
import { burst } from '../lib/confetti'
import { buzz, sfx } from '../lib/sound'

interface Props {
  state: State
  actions: GameActions
  meta: Meta | null
}

/** Calls `cb` whenever `value` grows (not on mount). */
function useOnIncrease(value: number, cb: (value: number) => void) {
  const prev = useRef(value)
  useEffect(() => {
    if (value > prev.current) cb(value)
    prev.current = value
  })
}

export function GameScreen({ state, actions, meta }: Props) {
  const { phase, round, results, hearts, streak, score, config, request, error } = state
  const [confirmQuit, setConfirmQuit] = useState(false)
  const last = results.at(-1)
  const fallbackMs = (meta?.roundSeconds[API_MODE[config.difficulty]] ?? RULES.defaultRoundSeconds[API_MODE[config.difficulty]]) * 1000

  const remaining = useCountdown(
    phase === 'guessing' && !request ? (round?.deadline ?? null) : null,
    round?.remainingMs ?? fallbackMs,
    () => {
      if (!round) return
      sfx.timeUp()
      buzz([80, 50, 80])
      actions.timeUp(round.id)
    },
    (s) => {
      if (s <= 5) sfx.tick(s <= 3)
    },
  )

  useOnIncrease(results.length, () => {
    const r = results.at(-1)
    if (!r || r.outcome !== 'correct') return
    sfx.correct(r.streak)
    buzz(35)
    if (r.streak >= 3 && r.streak % 3 === 0) {
      sfx.streak()
      burst(r.streak >= 6 ? 'big' : 'small')
    }
  })
  useOnIncrease(RULES.hearts - hearts, () => {
    sfx.heart()
    buzz([60, 40, 60])
  })
  useOnIncrease(round?.wrongGuesses.length ?? 0, () => sfx.wrong())
  useOnIncrease((round?.hints.lettersLevel ?? 0) + (round?.hints.artist ? 1 : 0), () => sfx.hint())

  const roundId = round?.id
  useEffect(() => {
    if (roundId !== undefined) window.scrollTo({ top: 0 })
  }, [roundId])

  const showRound = round && (phase === 'guessing' || phase === 'checking' || phase === 'feedback')
  const feedback = phase === 'feedback' && last ? last : null
  const currentIndex = round && phase !== 'feedback' ? round.index : results.length
  const timerMs = showRound ? remaining : (round?.remainingMs ?? fallbackMs)

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 ${
        feedback ? 'pb-72 sm:pb-48' : 'pb-8'
      }`}
    >
      <header className="flex items-center gap-3 py-2">
        <IconButton icon="close" label="Quit game" onClick={() => setConfirmQuit(true)} />
        <RoundProgress results={results} current={currentIndex} total={config.totalRounds} />
        <Hearts hearts={hearts} />
      </header>

      <div className="mt-2 mb-4 flex items-center justify-between gap-3">
        <RingTimer remainingMs={timerMs} durationMs={round?.durationMs ?? fallbackMs} paused={phase !== 'guessing' || !!request} />
        <StreakChip streak={streak} />
        <div className="text-right">
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
            <m.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ErrorPanel error={error} inGame={results.length > 0 || !!round} onRetry={actions.retry} onQuit={actions.quit} />
            </m.div>
          ) : phase === 'warming' ? (
            <m.div key="warming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Reconnecting onQuit={actions.quit} />
            </m.div>
          ) : showRound ? (
            <m.div
              key={round.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <RoundView state={state} round={round} actions={actions} meta={meta} answerTitle={feedback ? feedback.answer.title : null} />
            </m.div>
          ) : (
            <m.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingRound index={results.length} total={config.totalRounds} />
            </m.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {feedback && (
          <FeedbackBanner
            key={feedback.index}
            result={feedback}
            gameOver={isGameOver(state)}
            outOfHearts={hearts === 0}
            onContinue={actions.next}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmQuit && (
          <Modal title="Quit this game?" onClose={() => setConfirmQuit(false)}>
            <h2 className="font-display text-2xl font-bold">Quit this game?</h2>
            <p className="mt-1 mb-6 text-mist">This game won’t count towards your stats. The clock keeps running while you decide.</p>
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

function RoundView({
  state,
  round,
  actions,
  meta,
  answerTitle,
}: {
  state: State
  round: Round
  actions: GameActions
  meta: Meta | null
  answerTitle: string | null
}) {
  const { phase, request } = state
  const interactive = phase === 'guessing' && !request
  const hintLoading = request?.req.kind === 'hint' ? request.req.hint : null
  const pending = request?.req.kind === 'check' ? request.req.guess : null
  const options = round.data.options
  const language = meta?.languages.find((l) => l.id === round.data.language)?.name ?? round.data.language.toUpperCase()
  const pack = packName(meta, round.data.packId)
  return (
    <div className="space-y-5">
      <LyricCard lyrics={round.data.lyrics} label={pack ? `${language} · ${pack}` : language} />
      <div className="space-y-3">
        <TitleMask mask={answerTitle ? revealMask(round.mask, answerTitle) : round.mask} baseMask={round.data.titleMask} />
        {!answerTitle && (
          <HintBar hints={round.hints} artist={round.artist} disabled={!interactive} loading={hintLoading} onHint={actions.hint} />
        )}
      </div>
      {round.data.mode === 'choice' && options ? (
        <ChoiceAnswers
          options={options}
          interactive={interactive}
          pending={pending}
          wrong={round.wrongGuesses}
          answerTitle={answerTitle}
          onPick={actions.submit}
        />
      ) : (
        !answerTitle && (
          <TypeAnswer
            interactive={interactive}
            checking={pending !== null}
            wrongGuesses={round.wrongGuesses}
            titleLength={round.data.titleLength}
            onSubmit={actions.submit}
            onSkip={actions.skip}
          />
        )
      )}
      {round.data.mode === 'choice' && !answerTitle && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={actions.skip}
            disabled={!interactive}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 font-display font-semibold text-mist transition hover:text-cloud disabled:cursor-not-allowed disabled:opacity-40"
          >
            Skip this one (−1 heart)
          </button>
        </div>
      )}
    </div>
  )
}

/** After the round, fill the mask with the real title if it lines up. */
function revealMask(mask: string, title: string): string {
  return title.length === mask.length ? title : mask
}

function LoadingRound({ index, total }: { index: number; total: number }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="card flex flex-col items-center gap-4 px-6 py-10">
        <Equalizer />
        <p className="font-display text-xl font-semibold">
          {index === 0 ? 'Picking your first song…' : index === total - 1 ? 'Cueing up the final round…' : `Cueing up round ${index + 1}…`}
        </p>
        <div className="w-full space-y-2.5" aria-hidden="true">
          <div className="skeleton mx-auto h-5 w-11/12" />
          <div className="skeleton mx-auto h-5 w-9/12" />
          <div className="skeleton mx-auto h-5 w-10/12" />
        </div>
        <p className="animate-fade-late text-center text-sm text-mist">Still spinning… the clock won’t start until the lyric is on screen.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-chunk" />
        ))}
      </div>
    </div>
  )
}

function Reconnecting({ onQuit }: { onQuit: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-10 text-center" role="status" aria-live="polite">
      <Equalizer bars={7} />
      <h2 className="font-display text-2xl font-bold">Reconnecting…</h2>
      <p className="max-w-xs text-mist">
        <span className="animate-fade-late inline">Waking up the server. </span>
        Your score, hearts and streak are safe and the clock is paused.
      </p>
      <button type="button" onClick={onQuit} className="btn-chunk btn-ghost text-base">
        Back to home
      </button>
    </div>
  )
}
