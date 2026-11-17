import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { BadgeTile } from '../components/BadgeTile'
import { Icon, type IconName } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import { SubmitScore } from '../components/SubmitScore'
import { XpBar } from '../components/XpBar'
import { packName } from '../game/packs'
import { BADGES, levelInfo, levelProgressLabel, summarize } from '../game/progression'
import type { State } from '../game/reducer'
import type { Meta, RoundResult, ScoreSubmission } from '../game/types'
import { useCountUp } from '../hooks/useCountUp'
import { burst } from '../lib/confetti'
import { shareResult, shareText } from '../lib/share'
import { buzz, sfx } from '../lib/sound'

interface Props {
  state: State
  meta: Meta | null
  muted: boolean
  playerName: string
  onToggleMute: () => void
  onPlayAgain: () => void
  onHome: () => void
  onLeaderboard: () => void
  onNameSaved: (name: string) => void
  onSubmitted: (name: string, result: ScoreSubmission) => void
  toast: (text: string) => void
}

export function ResultsScreen(props: Props) {
  const { state, meta, toast } = props
  const { results, score, config, progress, hearts } = state
  const s = summarize(results, config.totalRounds)
  const leveledUp = !!progress && progress.levelAfter > progress.levelBefore
  const [celebrating, setCelebrating] = useState(leveledUp)

  const headline = s.perfect
    ? 'Perfect game!'
    : hearts === 0
      ? 'Out of hearts!'
      : s.correct / Math.max(1, results.length) >= 0.75
        ? 'Superstar run!'
        : s.correct / Math.max(1, results.length) >= 0.5
          ? 'Nice run!'
          : 'Warm-up done!'

  const celebrate = useEffectEvent(() => {
    if (leveledUp) {
      sfx.levelUp()
      buzz([40, 30, 40, 30, 80])
      burst('big')
      return
    }
    sfx.fanfare()
    if (s.perfect || progress?.newBest) burst('big')
  })
  // Celebrate once, when the screen appears.
  useEffect(() => celebrate(), [])

  // Focus Play again for keyboard players without scrolling the score out of view.
  const focusOnMount = useCallback((el: HTMLButtonElement | null) => el?.focus({ preventScroll: true }), [])

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : ''
    const outcome = await shareResult(shareText(config.difficulty, score, results, url))
    if (outcome === 'copied') toast('Result copied to clipboard')
    else if (outcome === 'failed') toast('Couldn’t share. Try a screenshot!')
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 sm:px-6">
      <header className="flex items-center justify-between">
        <IconButton icon="home" label="Home" onClick={props.onHome} />
        <span className="rounded-full bg-plum px-3 py-1 font-display text-sm font-semibold text-mist">
          {config.difficulty === 'easy' ? 'Easy' : 'Pro'} · {results.length} {results.length === 1 ? 'round' : 'rounds'}
        </span>
        <IconButton
          icon={props.muted ? 'mute' : 'volume'}
          label={props.muted ? 'Unmute sounds' : 'Mute sounds'}
          aria-pressed={props.muted}
          onClick={props.onToggleMute}
        />
      </header>

      <AnimatePresence mode="wait">
        {celebrating && progress ? (
          <LevelUp key="level" level={progress.levelAfter} onDone={() => setCelebrating(false)} />
        ) : (
          <m.main key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pt-6">
            <section className="text-center" aria-labelledby="results-title">
              <m.h1
                id="results-title"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                className="font-display text-4xl font-bold sm:text-5xl"
              >
                {headline}
              </m.h1>
              <ScoreCounter score={score} newBest={!!progress?.newBest} />
            </section>

            <dl className="grid grid-cols-3 gap-3">
              <Stat icon="check" tone="text-mint" label="Correct" value={`${s.correct}/${results.length}`} delay={0.5} />
              <Stat icon="flame" tone="text-pop" label="Best streak" value={String(s.bestStreak)} delay={0.6} />
              <Stat icon="sparkle" tone="text-sun" label="XP" value={`+${progress?.xpGained ?? 0}`} delay={0.7} />
            </dl>

            {progress && <XpCard xpBefore={progress.profile.xp - progress.xpGained} xpAfter={progress.profile.xp} />}

            {progress && progress.newBadges.length > 0 && (
              <section className="card p-4" aria-labelledby="badges-title">
                <h2 id="badges-title" className="mb-3 font-display text-lg font-bold">
                  New {progress.newBadges.length === 1 ? 'badge' : 'badges'}!
                </h2>
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {BADGES.filter((b) => progress.newBadges.includes(b.id)).map((b, i) => (
                    <BadgeTile key={b.id} badge={b} earned fresh delay={0.9 + i * 0.15} />
                  ))}
                </ul>
              </section>
            )}

            {meta?.leaderboard && results.length > 0 && (
              <SubmitScore
                receipts={results.map((r) => r.receipt)}
                initialName={props.playerName}
                onNameSaved={props.onNameSaved}
                onSubmitted={props.onSubmitted}
                onView={props.onLeaderboard}
              />
            )}

            <div className="grid gap-3">
              <button type="button" className="btn-chunk btn-sun min-h-16 w-full text-xl" onClick={props.onPlayAgain} ref={focusOnMount}>
                <Icon name="replay" /> Play again
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn-chunk btn-grape w-full" onClick={share}>
                  <Icon name="share" /> Share
                </button>
                <button type="button" className="btn-chunk btn-ghost w-full" onClick={props.onHome}>
                  <Icon name="home" /> Home
                </button>
              </div>
              {meta?.leaderboard && (
                <button
                  type="button"
                  onClick={props.onLeaderboard}
                  className="mx-auto inline-flex min-h-11 cursor-pointer items-center gap-2 px-3 font-display font-semibold text-mist hover:text-cloud"
                >
                  <Icon name="trophy" size={18} /> See the leaderboard
                </button>
              )}
            </div>

            <section aria-labelledby="rounds-title">
              <h2 id="rounds-title" className="mb-2 font-display text-lg font-bold">
                Round by round
              </h2>
              <ol className="space-y-2">
                {results.map((r, i) => (
                  <RoundRow key={r.index} result={r} meta={meta} delay={0.2 + i * 0.05} />
                ))}
              </ol>
            </section>
          </m.main>
        )}
      </AnimatePresence>
    </div>
  )
}

function ScoreCounter({ score, newBest }: { score: number; newBest: boolean }) {
  const shown = useCountUp(score, 1400, 250)
  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="font-display text-sm font-semibold tracking-wider text-mist uppercase">Score</div>
      <div className="font-display text-7xl leading-none font-bold text-sun tabular-nums" aria-hidden="true">
        {shown.toLocaleString('en-US')}
      </div>
      <span className="sr-only">{score} points</span>
      {newBest && (
        <m.span
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: -4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 12, delay: 1.6 }}
          className="mt-3 rounded-full bg-pop px-3 py-1 font-display text-sm font-bold text-ink uppercase"
        >
          New best!
        </m.span>
      )}
    </div>
  )
}

function XpCard({ xpBefore, xpAfter }: { xpBefore: number; xpAfter: number }) {
  const before = levelInfo(xpBefore)
  const after = levelInfo(xpAfter)
  const sameLevel = before.level === after.level
  return (
    <section className="card flex items-center gap-4 p-4" aria-label="Level progress">
      <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sun font-display text-ink">
        <span className="text-[0.6rem] leading-none font-semibold uppercase">Level</span>
        <span className="text-2xl leading-none font-bold">{after.level}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex justify-between font-display text-sm font-semibold text-mist">
          <span>{levelProgressLabel(after)}</span>
          <span className="tabular-nums">
            {after.into}/{after.span} XP
          </span>
        </div>
        <XpBar progress={after.progress} from={sameLevel ? before.progress : 0} delay={0.8} label={`Level ${after.level} progress`} />
      </div>
    </section>
  )
}

function Stat({ icon, tone, label, value, delay }: { icon: IconName; tone: string; label: string; value: string; delay: number }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex flex-col items-center rounded-2xl border-2 border-line bg-night p-3 text-center"
    >
      <dt className="flex items-center gap-1 text-xs font-semibold text-mist sm:text-sm">
        <Icon name={icon} size={15} className={tone} /> {label}
      </dt>
      <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
    </m.div>
  )
}

const OUTCOME_LABEL: Record<RoundResult['outcome'], string> = {
  correct: 'Correct',
  wrong: 'Missed',
  timeout: 'Time up',
  skipped: 'Skipped',
}

function RoundRow({ result: r, meta, delay }: { result: RoundResult; meta: Meta | null; delay: number }) {
  const ok = r.outcome === 'correct'
  const extra = [r.answer.film, r.answer.year ? String(r.answer.year) : null, packName(meta, r.packId)].filter(Boolean).join(' · ')
  return (
    <m.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3 rounded-2xl border-2 border-line bg-night/70 px-3 py-2.5"
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${ok ? 'bg-mint text-ink' : 'bg-coral/20 text-coral'}`}
        aria-label={OUTCOME_LABEL[r.outcome]}
        role="img"
      >
        <Icon name={ok ? 'check' : r.outcome === 'timeout' ? 'clock' : 'close'} size={18} strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-semibold">
          <span className="text-mist">{r.index + 1}. </span>
          {r.answer.title}
        </p>
        <p className="truncate text-xs text-mist">
          {r.answer.artist}
          {extra ? ` · ${extra}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-display text-lg font-bold tabular-nums ${ok ? 'text-sun' : 'text-mist'}`}>{ok ? `+${r.points}` : '0'}</p>
        {ok && r.multiplier > 1 && (
          <p className="text-xs text-mist tabular-nums">
            {r.basePoints}×{r.multiplier}
          </p>
        )}
      </div>
    </m.li>
  )
}

function LevelUp({ level, onDone }: { level: number; onDone: () => void }) {
  return (
    <m.main
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <m.div
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          className="absolute -inset-10 rounded-full bg-[conic-gradient(from_0deg,var(--color-sun),transparent_25%,var(--color-pop)_50%,transparent_75%,var(--color-sun))] opacity-30 blur-xl"
          aria-hidden="true"
        />
        <m.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.15 }}
          className="relative grid size-40 place-items-center rounded-[2.5rem] bg-sun font-display text-ink shadow-[0_10px_0_var(--color-sun-deep)]"
        >
          <span className="text-sm font-semibold uppercase">Level</span>
          <span className="text-7xl leading-none font-bold">{level}</span>
        </m.div>
      </div>
      <div>
        <h1 className="font-display text-4xl font-bold">Level up!</h1>
        <p className="mt-1 text-mist">Your ears are getting sharper. Keep the music going.</p>
      </div>
      <button type="button" className="btn-chunk btn-sun min-w-56" onClick={onDone} autoFocus>
        See results <Icon name="arrow" />
      </button>
    </m.main>
  )
}
