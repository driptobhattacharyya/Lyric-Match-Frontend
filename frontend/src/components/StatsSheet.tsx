import { BADGES, levelInfo, liveDailyStreak, type Profile } from '../game/progression'
import { BadgeTile } from './BadgeTile'
import { Icon, type IconName } from './Icon'
import { Modal } from './Modal'
import { XpBar } from './XpBar'

interface Props {
  profile: Profile
  today: string
  onClose: () => void
}

export function StatsSheet({ profile, today, onClose }: Props) {
  const lvl = levelInfo(profile.xp)
  const flame = liveDailyStreak(profile.daily, today)
  const accuracy = profile.roundsPlayed ? Math.round((profile.roundsCorrect / profile.roundsPlayed) * 100) : 0
  const earned = BADGES.filter((b) => profile.badges[b.id]).length
  return (
    <Modal title="Your stats" onClose={onClose}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Your stats</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stats"
          className="grid size-11 cursor-pointer place-items-center rounded-xl text-mist hover:bg-plum hover:text-cloud"
        >
          <Icon name="close" />
        </button>
      </div>

      <section className="mb-5 flex items-center gap-4 rounded-2xl bg-plum/60 p-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-sun font-display text-ink">
          <span className="text-xs leading-none font-semibold uppercase">Level</span>
          <span className="text-3xl leading-none font-bold">{lvl.level}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex justify-between font-display text-sm font-semibold text-mist">
            <span>{profile.xp.toLocaleString('en-US')} XP total</span>
            <span>
              {lvl.into}/{lvl.span}
            </span>
          </div>
          <XpBar progress={lvl.progress} label={`Level ${lvl.level} progress`} />
          <p className="text-sm text-mist">{lvl.span - lvl.into} XP to level {lvl.level + 1}</p>
        </div>
      </section>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon="flame" tone="text-pop" label="Day streak" value={flame} sub={`Best ${profile.daily.best}`} />
        <Stat icon="note" tone="text-aqua" label="Games" value={profile.gamesPlayed} />
        <Stat icon="check" tone="text-mint" label="Accuracy" value={`${accuracy}%`} sub={`${profile.roundsCorrect}/${profile.roundsPlayed}`} />
        <Stat icon="star" tone="text-sun" label="Best Easy" value={profile.bestScore.easy.toLocaleString('en-US')} />
        <Stat icon="crown" tone="text-sun" label="Best Pro" value={profile.bestScore.pro.toLocaleString('en-US')} />
        <Stat icon="bolt" tone="text-grape" label="Best streak" value={profile.bestStreak} />
      </dl>

      <h3 className="mb-3 flex items-baseline justify-between font-display text-lg font-bold">
        Badges <span className="text-sm font-semibold text-mist">{earned}/{BADGES.length}</span>
      </h3>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {BADGES.map((b) => (
          <BadgeTile key={b.id} badge={b} earned={!!profile.badges[b.id]} />
        ))}
      </ul>
    </Modal>
  )
}

function Stat({ icon, tone, label, value, sub }: { icon: IconName; tone: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-line p-3">
      <dt className="flex items-center gap-1.5 text-sm text-mist">
        <Icon name={icon} size={16} className={tone} /> {label}
      </dt>
      <dd className="font-display text-2xl font-bold tabular-nums">
        {value}
        {sub && <span className="ml-1.5 text-sm font-medium text-mist">{sub}</span>}
      </dd>
    </div>
  )
}
