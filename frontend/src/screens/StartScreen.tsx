import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import { Logo } from '../components/Logo'
import { PackPicker } from '../components/PackPicker'
import type { ServerStatus } from '../game/reducer'
import { levelInfo, liveDailyStreak, playedToday, type Profile } from '../game/progression'
import { RULES } from '../game/rules'
import type { Difficulty, Meta } from '../game/types'
import type { MetaStatus } from '../hooks/useMeta'
import type { Settings } from '../hooks/useSettings'

interface Props {
  profile: Profile
  today: string
  server: ServerStatus
  pinging: boolean
  settings: Settings
  meta: Meta | null
  metaStatus: MetaStatus
  onSettings: (patch: Partial<Settings>) => void
  onReloadMeta: () => void
  onStats: () => void
  onLeaderboard: (() => void) | null
  onPlay: () => void
  onPing: () => void
}

interface ModeDef {
  id: Difficulty
  name: string
  blurb: string
  icon: IconName
  tone: string
}

export function StartScreen(props: Props) {
  const { profile, today, server, pinging, settings, meta, metaStatus, onSettings, onStats, onLeaderboard, onPlay, onPing } = props
  const lvl = levelInfo(profile.xp)
  const flame = liveDailyStreak(profile.daily, today)
  const doneToday = playedToday(profile.daily, today)
  const rounds = meta?.roundsPerGame ?? RULES.defaultRounds
  const secs = meta?.roundSeconds ?? RULES.defaultRoundSeconds
  const modes: ModeDef[] = [
    { id: 'easy', name: 'Easy', blurb: `Pick from 4 · ${secs.choice}s`, icon: 'note', tone: 'btn-aqua' },
    { id: 'pro', name: 'Pro', blurb: `Type the title · ${secs.type}s`, icon: 'crown', tone: 'btn-pop' },
  ]
  const mode = modes.find((x) => x.id === settings.difficulty) ?? modes[0]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 sm:px-6">
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
        {onLeaderboard && <IconButton icon="trophy" label="Leaderboard" onClick={onLeaderboard} />}
        <IconButton icon="chart" label="Stats and badges" onClick={onStats} />
        <IconButton
          icon={settings.muted ? 'mute' : 'volume'}
          label={settings.muted ? 'Unmute sounds' : 'Mute sounds'}
          aria-pressed={settings.muted}
          onClick={() => onSettings({ muted: !settings.muted })}
        />
      </header>

      <main className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-12">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <m.div
            initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="mb-4 animate-float"
          >
            <Logo size={104} spin />
          </m.div>
          <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Lyric <span className="text-pop">Match</span>
          </h1>
          <p className="mt-2 max-w-sm text-lg text-mist">Read the lyric. Name the song. Keep the streak alive.</p>
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
          <ul className="mt-5 flex flex-wrap justify-center gap-2 text-sm font-semibold text-mist lg:justify-start">
            <Pill icon="note">{rounds} rounds</Pill>
            <Pill icon="heart">{RULES.hearts} hearts</Pill>
            <Pill icon="flame">Streak bonus up to ×{RULES.maxMultiplierTenths / 10}</Pill>
            <Pill icon="bolt">Speed bonus</Pill>
          </ul>
        </div>

        <div className="mx-auto grid w-full max-w-md gap-4">
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 gap-3">
            {modes.map((x, i) => {
              const on = x.id === mode.id
              return (
                <m.button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onSettings({ difficulty: x.id })}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
                  className={`btn-chunk ${on ? x.tone : 'btn-ghost'} min-h-28 flex-col items-start justify-between gap-1 px-4 py-3 text-left normal-case`}
                >
                  <span className="flex w-full items-center justify-between">
                    <Icon name={x.icon} size={26} />
                    <span
                      className={`grid size-6 place-items-center rounded-full border-2 ${on ? 'border-ink/40 bg-ink/15' : 'border-line'}`}
                      aria-hidden="true"
                    >
                      {on && <Icon name="check" size={14} strokeWidth={3.5} />}
                    </span>
                  </span>
                  <span className="text-2xl leading-none font-bold uppercase">{x.name}</span>
                  <span className={`text-sm leading-snug font-medium ${on ? 'opacity-80' : 'text-mist'}`}>{x.blurb}</span>
                  {profile.bestScore[x.id] > 0 && (
                    <span className={`text-xs font-semibold ${on ? 'opacity-80' : 'text-mist'}`}>
                      Best {profile.bestScore[x.id].toLocaleString('en-US')}
                    </span>
                  )}
                </m.button>
              )
            })}
          </div>

          <m.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 24 }}>
            <PackPicker
              meta={meta}
              status={metaStatus}
              selected={settings.packs}
              onChange={(packs) => onSettings({ packs })}
              onReload={props.onReloadMeta}
            />
          </m.div>

          <m.button
            type="button"
            onClick={onPlay}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 320, damping: 18 }}
            className="btn-chunk btn-sun min-h-16 w-full text-2xl"
          >
            <Icon name="play" filled size={26} /> Play {mode.name}
          </m.button>

          <ServerPill server={server} pinging={pinging} onPing={onPing} />
        </div>
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
  return (
    <div className="flex min-h-11 justify-center" aria-live="polite">
      {server === 'ready' ? (
        <p className="inline-flex items-center gap-2 text-sm text-mist">
          <span className="size-2.5 rounded-full bg-mint shadow-[0_0_10px] shadow-mint" /> Server ready
        </p>
      ) : server === 'down' && !pinging ? (
        <p className="inline-flex items-center gap-2 text-sm text-mist">
          <span className="size-2.5 rounded-full bg-coral" /> Server unreachable.
          <button type="button" onClick={onPing} className="min-h-11 cursor-pointer px-1 font-semibold text-cloud underline underline-offset-4">
            Retry
          </button>
        </p>
      ) : (
        // Only mention the warm-up if it is actually taking a while (CSS-delayed by ~3s).
        <p className="inline-flex animate-fade-late items-center gap-2 text-sm text-mist">
          <span className="size-2.5 animate-pulse rounded-full bg-sun" /> Waking up the server… first visit can take a minute.
        </p>
      )}
    </div>
  )
}
