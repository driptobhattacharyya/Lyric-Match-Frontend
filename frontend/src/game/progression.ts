import { RULES } from './rules'
import type { Difficulty, RoundResult } from './types'

/** Long-term player progress, persisted in localStorage. */
export interface Profile {
  version: 1
  xp: number
  gamesPlayed: number
  roundsPlayed: number
  roundsCorrect: number
  bestScore: Record<Difficulty, number>
  /** Longest in-game answer streak ever. */
  bestStreak: number
  daily: { current: number; best: number; lastDate: string | null }
  /** Badge id -> local date it was earned. */
  badges: Partial<Record<BadgeId, string>>
}

export const emptyProfile = (): Profile => ({
  version: 1,
  xp: 0,
  gamesPlayed: 0,
  roundsPlayed: 0,
  roundsCorrect: 0,
  bestScore: { easy: 0, pro: 0 },
  bestStreak: 0,
  daily: { current: 0, best: 0, lastDate: null },
  badges: {},
})

// ---------------------------------------------------------------- XP & levels

export const XP = {
  perGame: 10,
  perCorrect: 10,
  /** One XP per this many points scored. */
  pointsPerXp: 20,
  perfectBonus: 25,
} as const

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1)
}

export interface LevelInfo {
  level: number
  /** XP earned inside the current level. */
  into: number
  /** XP size of the current level. */
  span: number
  progress: number
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1
  let rest = Math.max(0, Math.floor(totalXp))
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level += 1
  }
  const span = xpToNext(level)
  return { level, into: rest, span, progress: rest / span }
}

export function xpForGame(score: number, correct: number, perfect: boolean): number {
  return (
    XP.perGame +
    XP.perCorrect * correct +
    Math.floor(score / XP.pointsPerXp) +
    (perfect ? XP.perfectBonus : 0)
  )
}

// ---------------------------------------------------------------- daily streak

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Whole calendar days from a to b (DST-safe: compares at UTC midnight). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

export function advanceDaily(daily: Profile['daily'], today: string): Profile['daily'] {
  if (daily.lastDate === today) return daily
  const gap = daily.lastDate ? daysBetween(daily.lastDate, today) : Infinity
  const current = gap === 1 ? daily.current + 1 : 1
  return { current, best: Math.max(daily.best, current), lastDate: today }
}

/** The flame counter to display: a streak is still alive until a full day is skipped. */
export function liveDailyStreak(daily: Profile['daily'], today: string): number {
  if (!daily.lastDate) return 0
  const gap = daysBetween(daily.lastDate, today)
  return gap <= 1 ? daily.current : 0
}

export function playedToday(daily: Profile['daily'], today: string): boolean {
  return daily.lastDate === today
}

// ---------------------------------------------------------------- badges

export type BadgeId =
  | 'first_note'
  | 'on_fire'
  | 'flawless'
  | 'ear_only'
  | 'speed_demon'
  | 'platinum'
  | 'three_day'

export interface BadgeDef {
  id: BadgeId
  name: string
  description: string
  icon: string
}

export const SPEED_DEMON_MS = 4000
export const PLATINUM_SCORE = 1000

export const BADGES: readonly BadgeDef[] = [
  { id: 'first_note', name: 'First Note', description: 'Name your first song.', icon: 'note' },
  { id: 'on_fire', name: 'On Fire', description: 'Get 5 right in a row.', icon: 'flame' },
  {
    id: 'flawless',
    name: 'Flawless',
    description: `Get all ${RULES.rounds} rounds of a game right.`,
    icon: 'crown',
  },
  {
    id: 'ear_only',
    name: 'Ear Only',
    description: 'Finish every round of a game without a hint.',
    icon: 'ear',
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: `Answer correctly in under ${SPEED_DEMON_MS / 1000} seconds.`,
    icon: 'bolt',
  },
  {
    id: 'platinum',
    name: 'Platinum',
    description: `Score ${PLATINUM_SCORE.toLocaleString('en-US')}+ points in one game.`,
    icon: 'disc',
  },
  { id: 'three_day', name: 'Groove Habit', description: 'Play 3 days in a row.', icon: 'calendar' },
]

export interface GameSummary {
  difficulty: Difficulty
  results: RoundResult[]
  score: number
}

export function summarize(results: RoundResult[]) {
  const correct = results.filter((r) => r.outcome === 'correct').length
  const bestStreak = results.reduce((m, r) => Math.max(m, r.streak), 0)
  const perfect = results.length === RULES.rounds && correct === RULES.rounds
  const hintsUsed = results.some((r) => r.hints.lettersLevel > 0 || r.hints.artist)
  const fastest = results
    .filter((r) => r.outcome === 'correct')
    .reduce((m, r) => Math.min(m, r.timeMs), Infinity)
  return { correct, bestStreak, perfect, hintsUsed, fastest }
}

function earnedBadges(game: GameSummary, daily: Profile['daily']): BadgeId[] {
  const s = summarize(game.results)
  const out: BadgeId[] = []
  if (s.correct > 0) out.push('first_note')
  if (s.bestStreak >= 5) out.push('on_fire')
  if (s.perfect) out.push('flawless')
  if (game.results.length === RULES.rounds && !s.hintsUsed) out.push('ear_only')
  if (s.fastest < SPEED_DEMON_MS) out.push('speed_demon')
  if (game.score >= PLATINUM_SCORE) out.push('platinum')
  if (daily.current >= 3) out.push('three_day')
  return out
}

export interface ProgressUpdate {
  profile: Profile
  xpGained: number
  levelBefore: number
  levelAfter: number
  newBadges: BadgeId[]
  newBest: boolean
  /** True when this game was the first of the day (flame grew or restarted). */
  dailyAdvanced: boolean
}

/** Pure: fold one finished game into the profile. */
export function applyGame(profile: Profile, game: GameSummary, today: string): ProgressUpdate {
  const s = summarize(game.results)
  const xpGained = xpForGame(game.score, s.correct, s.perfect)
  const daily = advanceDaily(profile.daily, today)
  const earned = earnedBadges(game, daily)
  const newBadges = earned.filter((b) => !profile.badges[b])
  const badges = { ...profile.badges }
  for (const b of newBadges) badges[b] = today
  const newBest = game.score > profile.bestScore[game.difficulty]
  const next: Profile = {
    ...profile,
    xp: profile.xp + xpGained,
    gamesPlayed: profile.gamesPlayed + 1,
    roundsPlayed: profile.roundsPlayed + game.results.length,
    roundsCorrect: profile.roundsCorrect + s.correct,
    bestScore: newBest ? { ...profile.bestScore, [game.difficulty]: game.score } : profile.bestScore,
    bestStreak: Math.max(profile.bestStreak, s.bestStreak),
    daily,
    badges,
  }
  return {
    profile: next,
    xpGained,
    levelBefore: levelInfo(profile.xp).level,
    levelAfter: levelInfo(next.xp).level,
    newBadges,
    newBest: newBest && game.score > 0,
    dailyAdvanced: daily !== profile.daily,
  }
}

/** Validate untrusted JSON (from localStorage) into a Profile, falling back to defaults. */
export function parseProfile(raw: unknown): Profile {
  const base = emptyProfile()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return base
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  const best = (r.bestScore ?? {}) as Record<string, unknown>
  const daily = (r.daily ?? {}) as Record<string, unknown>
  const badgesIn = (r.badges ?? {}) as Record<string, unknown>
  const badges: Profile['badges'] = {}
  for (const b of BADGES) {
    const v = badgesIn[b.id]
    if (typeof v === 'string') badges[b.id] = v
  }
  return {
    version: 1,
    xp: num(r.xp),
    gamesPlayed: num(r.gamesPlayed),
    roundsPlayed: num(r.roundsPlayed),
    roundsCorrect: num(r.roundsCorrect),
    bestScore: { easy: num(best.easy), pro: num(best.pro) },
    bestStreak: num(r.bestStreak),
    daily: {
      current: num(daily.current),
      best: num(daily.best),
      lastDate:
        typeof daily.lastDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily.lastDate)
          ? daily.lastDate
          : null,
    },
    badges,
  }
}
