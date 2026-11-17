import type { ApiMode, HintUsage } from './types'

/**
 * Every tunable number of the client lives here so the UI and tests agree.
 *
 * Base points are computed by the server (docs/api.md, "Scoring") and arrive
 * with each check/reveal. The client only applies the streak multiplier, the
 * same way the server recomputes it from the receipts.
 */
export const RULES = {
  hearts: 3,
  /** Fallbacks used until /api/meta has loaded. */
  defaultRounds: 8,
  defaultRoundSeconds: { type: 45, choice: 20 } satisfies Record<ApiMode, number>,
  /** Display-only mirror of the server's hint penalties (taken off the base). */
  letterHintCost: 15,
  artistHintCost: 20,
  maxLetterLevel: 3,
  /** Each consecutive correct round adds 0.1 to the multiplier, capped at 1.5. */
  streakStepTenths: 1,
  maxMultiplierTenths: 15,
  /** Session exclude list sent to POST /api/rounds is capped by the server. */
  maxExclude: 200,
} as const

/** Multiplier, in tenths, for the n-th consecutive correct round (n >= 1). Integer maths: no float drift. */
export function multiplierTenths(streak: number): number {
  if (streak <= 1) return 10
  return Math.min(RULES.maxMultiplierTenths, 10 + RULES.streakStepTenths * (streak - 1))
}

/** `min(1.5, 1 + 0.1 * (n - 1))` as a display number (1, 1.1 … 1.5). */
export function streakMultiplier(streak: number): number {
  return multiplierTenths(streak) / 10
}

/** Base points × streak multiplier, rounded half up, computed exactly in integers. */
export function applyStreak(basePoints: number, streak: number): number {
  if (basePoints <= 0) return 0
  return Math.floor((basePoints * multiplierTenths(streak) + 5) / 10)
}

/** Total hint penalty the server takes off a correct round's base. */
export function hintPenalty(hints: HintUsage): number {
  return RULES.letterHintCost * hints.lettersLevel + (hints.artist ? RULES.artistHintCost : 0)
}

/** Extra penalty of asking for the next letters level (levels are cumulative by highest level). */
export function nextLetterCost(): number {
  return RULES.letterHintCost
}

export interface ScoredRound {
  correct: boolean
  basePoints: number
}

export interface ScoredStep {
  streak: number
  multiplier: number
  points: number
}

/** Folds rounds in play order exactly as the server recomputes a submitted game. */
export function scoreGame(rounds: readonly ScoredRound[]): { steps: ScoredStep[]; total: number } {
  let streak = 0
  let total = 0
  const steps = rounds.map((r) => {
    streak = r.correct ? streak + 1 : 0
    const points = r.correct ? applyStreak(r.basePoints, streak) : 0
    total += points
    return { streak, multiplier: r.correct ? streakMultiplier(streak) : 1, points }
  })
  return { steps, total }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
