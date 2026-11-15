import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ApiFailure, ApiMode, LeaderboardEntry, Period } from '../game/types'
import * as api from '../lib/api'
import { Icon } from './Icon'
import { Modal } from './Modal'

export interface OwnEntry {
  mode: ApiMode
  name: string
  score: number
  rank: number
}

interface Props {
  initialMode: ApiMode
  own: OwnEntry | null
  onClose: () => void
}

const MODES: { id: ApiMode; label: string }[] = [
  { id: 'choice', label: 'Easy' },
  { id: 'type', label: 'Pro' },
]
const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'week', label: 'This week' },
  { id: 'day', label: 'Today' },
]

type Load = { status: 'loading' } | { status: 'ready'; entries: LeaderboardEntry[] } | { status: 'error'; failure: ApiFailure }

/** Top 20 per mode and period, with the player's latest entry highlighted. */
export function LeaderboardSheet({ initialMode, own, onClose }: Props) {
  const [mode, setMode] = useState<ApiMode>(initialMode)
  const [period, setPeriod] = useState<Period>('all')
  const [attempt, setAttempt] = useState(0)
  const key = `${mode}:${period}:${attempt}`
  const [load, setLoad] = useState<{ key: string; value: Load }>({ key: '', value: { status: 'loading' } })
  const current: Load = load.key === key ? load.value : { status: 'loading' }

  useEffect(() => {
    const ctrl = new AbortController()
    api.getLeaderboard(mode, period, 20, ctrl.signal).then(
      (entries) => !ctrl.signal.aborted && setLoad({ key, value: { status: 'ready', entries } }),
      (err: unknown) => !ctrl.signal.aborted && setLoad({ key, value: { status: 'error', failure: api.toFailure(err) } }),
    )
    return () => ctrl.abort()
  }, [mode, period, key])

  const isOwn = (e: LeaderboardEntry) => !!own && own.mode === mode && own.name === e.name && own.score === e.score

  return (
    <Modal title="Leaderboard" onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Icon name="trophy" className="text-sun" /> Leaderboard
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close leaderboard"
          className="grid size-11 cursor-pointer place-items-center rounded-xl text-mist hover:bg-plum hover:text-cloud"
        >
          <Icon name="close" />
        </button>
      </div>

      <Segmented label="Mode" options={MODES} value={mode} onChange={setMode} />
      <div className="mt-2">
        <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} small />
      </div>

      <div className="mt-4 min-h-80" aria-live="polite" aria-busy={current.status === 'loading'}>
        {current.status === 'loading' && (
          <ul className="space-y-2" aria-label="Loading scores">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="skeleton h-14 rounded-2xl" />
            ))}
          </ul>
        )}
        {current.status === 'error' && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-10 text-center">
            <Icon name="wifi" size={32} className="text-coral" />
            <p className="font-display text-lg font-semibold">
              {current.failure.code === 'leaderboard_unavailable' ? 'Leaderboard is offline' : 'Couldn’t load scores'}
            </p>
            <p className="max-w-xs text-sm text-mist">{current.failure.message}</p>
            <button type="button" className="btn-chunk btn-sun mt-1 text-base" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="replay" /> Try again
            </button>
          </div>
        )}
        {current.status === 'ready' && current.entries.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-12 text-center">
            <m.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}>
              <Icon name="trophy" size={40} className="text-sun" />
            </m.span>
            <p className="font-display text-lg font-semibold">No scores yet</p>
            <p className="max-w-xs text-sm text-mist">
              {period === 'all' ? 'The stage is empty. Finish a game and claim the top spot!' : 'Nobody has played this one yet in this period. Be the first!'}
            </p>
          </div>
        )}
        {current.status === 'ready' && current.entries.length > 0 && (
          <ol className="space-y-2">
            <AnimatePresence initial>
              {current.entries.map((e, i) => {
                const mine = isOwn(e)
                return (
                  <m.li
                    key={`${e.rank}-${e.name}-${e.score}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 ${
                      mine ? 'border-sun bg-sun/15' : 'border-line bg-plum/40'
                    }`}
                    aria-current={mine ? 'true' : undefined}
                  >
                    <RankBadge rank={e.rank} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-semibold">
                        {e.name}
                        {mine && <span className="ml-2 rounded-full bg-sun px-2 text-xs font-bold text-ink">You</span>}
                      </p>
                      <p className="text-xs text-mist">
                        {e.correct}/{e.rounds} right{e.createdAt ? ` · ${relative(e.createdAt)}` : ''}
                      </p>
                    </div>
                    <span className="font-display text-xl font-bold tabular-nums">{e.score.toLocaleString('en-US')}</span>
                  </m.li>
                )
              })}
            </AnimatePresence>
          </ol>
        )}
        {own && own.mode === mode && current.status === 'ready' && !current.entries.some(isOwn) && (
          <p className="mt-3 text-center text-sm text-mist">
            Your latest entry: <strong className="text-cloud">#{own.rank}</strong> with {own.score.toLocaleString('en-US')} pts
          </p>
        )}
      </div>
    </Modal>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? 'bg-sun text-ink' : rank === 2 ? 'bg-cloud text-ink' : rank === 3 ? 'bg-[#e59a5b] text-ink' : 'bg-night text-mist'
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-display font-bold tabular-nums ${medal}`} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  )
}

function relative(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

interface SegmentedProps<T extends string> {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  small?: boolean
}

function Segmented<T extends string>({ label, options, value, onChange, small }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-ink/60 p-1">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`relative cursor-pointer rounded-xl font-display font-semibold transition-colors ${small ? 'min-h-10 text-sm' : 'min-h-11'} ${
              on ? 'text-ink' : 'text-mist hover:text-cloud'
            }`}
          >
            {on && (
              <m.span
                layoutId={`seg-${label}`}
                className={`absolute inset-0 rounded-xl ${small ? 'bg-cloud' : 'bg-aqua'}`}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
