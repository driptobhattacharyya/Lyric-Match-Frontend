import { m } from 'motion/react'
import type { ReactNode } from 'react'
import type { ServerStatus } from '../game/reducer'
import { levelInfo, liveDailyStreak, playedToday, type Profile } from '../game/progression'
import { RULES } from '../game/rules'
import type { Difficulty } from '../game/types'
import { Icon, type IconName } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import { Logo } from '../components/Logo'

interface Props {
  profile: Profile
  today: string
  server: ServerStatus
  pinging: boolean
  muted: boolean
  onToggleMute: () => void
  onStats: () => void
  onStart: (d: Difficulty) => void
  onPing: () => void
}

const MODES: { id: Difficulty; name: string; blurb: string; icon: IconName; tone: string; ring: string }[] = [
  {
    id: 'easy',
    name: 'Easy',
    blurb: `Pick from 4 · ${RULES.roundSeconds.easy}s a round`,
    icon: 'note',
    tone: 'btn-aqua',
    ring: 'text-aqua',
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: `Type the title · ${RULES.roundSeconds.pro}s · 1.5× points`,
    icon: 'crown',
    tone: 'btn-pop',
    ring: 'text-pop',
  },
]

export function StartScreen({ profile, today, server, pinging, muted, onToggleMute, onStats, onStart, onPing }: Props) {
  const lvl = levelInfo(profile.xp)
  const flame = liveDailyStreak(profile.daily, today)
  const doneToday = playedToday(profile.daily, today)
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 sm:px-6">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStats}
          className="flex min-h-12 cursor-pointer items-center gap-1.5 rounded-2xl border-2 border-line bg-night px-3 font-display font-bold transition hover:border-mist/60"
          aria-label={`Day streak ${flame}${doneToday ? ', played today' : ''}. Open stats`}
        >
          <Icon name="flame" size={22} filled={flame > 0} className={flame > 0 ? 'text-pop' : 'text-mist'} />
          <span className="tabular-nums">{flame}</span>
        </button>
        <button
          type="button"
          onClick={onStats}
          className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border-2 border-line bg-night px-3 font-display font-bold transition hover:border-mist/60"
          aria-label={`Level ${lvl.level}, ${lvl.into} of ${lvl.span} XP. Open stats`}
        >
          <span className="grid size-7 place-items-center rounded-lg bg-sun text-sm text-ink">{lvl.level}</span>
          <span className="hidden h-2.5 w-16 overflow-hidden rounded-full bg-plum min-[380px]:block" aria-hidden="true">
            <span className="block h-full rounded-full bg-sun" style={{ width: `${Math.max(lvl.progress * 100, 6)}%` }} />
          </span>
        </button>
        <span className="flex-1" />
        <IconButton icon={muted ? 'mute' : 'volume'} label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted} onClick={onToggleMute} />
        <IconButton icon="chart" label="Stats and badges" onClick={onStats} />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        <div className="flex flex-col items-center text-center">
          <m.div
            initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="mb-4 animate-float"
          >
            <Logo size={112} spin />
          </m.div>
          <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Lyric <span className="text-pop">Match</span>
          </h1>
          <p className="mt-2 max-w-xs text-lg text-mist">Read the lyric. Name the song. Keep the streak alive.</p>
          {flame > 0 && !doneToday && (
            <m.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-3 rounded-full bg-pop/15 px-4 py-1.5 font-display text-sm font-semibold text-pop"
            >
              Play today to keep your {flame}-day flame lit!
            </m.p>
          )}
        </div>

        <div className="grid w-full max-w-md gap-4">
          {MODES.map((mode, i) => (
            <m.button
              key={mode.id}
              type="button"
              onClick={() => onStart(mode.id)}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 300, damping: 24 }}
              className={`btn-chunk ${mode.tone} min-h-24 w-full justify-start gap-4 px-5 py-4 text-left normal-case`}
              aria-label={`Play ${mode.name}: ${mode.blurb}. Best score ${profile.bestScore[mode.id]}`}
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink/15">
                <Icon name={mode.icon} size={30} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xl leading-tight font-bold uppercase">{mode.name}</span>
                <span className="block text-base leading-snug font-medium opacity-80">{mode.blurb}</span>
              </span>
              {profile.bestScore[mode.id] > 0 && (
                <span className="shrink-0 rounded-xl bg-ink/15 px-2.5 py-1 text-center leading-tight">
                  <span className="block text-[0.65rem] font-semibold uppercase opacity-80">Best</span>
                  <span className="block text-base font-bold tabular-nums">{profile.bestScore[mode.id].toLocaleString('en-US')}</span>
                </span>
              )}
            </m.button>
          ))}
        </div>

        <ul className="flex flex-wrap justify-center gap-2 text-sm font-semibold text-mist">
          <Pill icon="note">{RULES.rounds} rounds</Pill>
          <Pill icon="heart">{RULES.hearts} hearts</Pill>
          <Pill icon="flame">Streaks up to ×{RULES.maxMultiplier}</Pill>
          <Pill icon="bolt">Speed bonus</Pill>
        </ul>

        <ServerPill server={server} pinging={pinging} onPing={onPing} />
      </main>

      <footer className="text-center text-sm text-mist">
        Built by{' '}
        <a href="#" className="font-semibold text-cloud underline decoration-pop decoration-2 underline-offset-4 hover:text-pop">
          Dripto
        </a>
      </footer>
    </div>
  )
}

function Pill({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1">
      <Icon name={icon} size={15} /> {children}
    </li>
  )
}

function ServerPill({ server, pinging, onPing }: { server: ServerStatus; pinging: boolean; onPing: () => void }) {
  if (server === 'ready') {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-mist" aria-live="polite">
        <span className="size-2.5 rounded-full bg-mint shadow-[0_0_10px] shadow-mint" /> Server ready
      </p>
    )
  }
  if (server === 'down' && !pinging) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-mist" aria-live="polite">
        <span className="size-2.5 rounded-full bg-coral" /> Server unreachable.
        <button type="button" onClick={onPing} className="min-h-11 cursor-pointer px-1 font-semibold text-cloud underline underline-offset-4">
          Retry
        </button>
      </p>
    )
  }
  // Only mention the warm-up if it is actually taking a while (CSS-delayed).
  return (
    <p className="inline-flex animate-fade-late items-center gap-2 text-sm text-mist" aria-live="polite">
      <span className="size-2.5 animate-pulse rounded-full bg-sun" /> Waking up the server…
    </p>
  )
}
