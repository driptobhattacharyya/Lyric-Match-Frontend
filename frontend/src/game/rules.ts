import type { Difficulty, HintUsage, PointsBreakdown } from './types'

/** Every tunable number of the game lives here so the UI and tests agree. */
export const RULES = {
  rounds: 8,
  hearts: 3,
  roundSeconds: { easy: 20, pro: 45 } satisfies Record<Difficulty, number>,
  /** Guesses allowed per round before it counts as lost. */
  attempts: { easy: 1, pro: 3 } satisfies Record<Difficulty, number>,
  basePoints: { easy: 100, pro: 150 } satisfies Record<Difficulty, number>,
  /** Max bonus, scaled linearly by the share of the clock left. */
  speedBonusMax: 50,
  /** Cost of each letters-hint level (cumulative: level 3 costs 3x). */
  letterHintCost: 20,
  artistHintCost: 30,
  wrongAttemptCost: 25,
  /** Points before speed bonus and multiplier never drop below this. */
  minBasePoints: 10,
  /** Streak multiplier grows 0.25 per consecutive correct answer, capped. */
  streakStep: 0.25,
  maxMultiplier: 2,
} as const

export function roundDurationMs(difficulty: Difficulty): number {
  return RULES.roundSeconds[difficulty] * 1000
}

/** Multiplier for the Nth consecutive correct answer (streak >= 1). */
export function streakMultiplier(streak: number): number {
  if (streak <= 1) return 1
  return Math.min(1 + RULES.streakStep * (streak - 1), RULES.maxMultiplier)
}

export function hintPenalty(hints: HintUsage): number {
  return hints.lettersLevel * RULES.letterHintCost + (hints.artist ? RULES.artistHintCost : 0)
}

export interface ScoreInput {
  difficulty: Difficulty
  remainingMs: number
  durationMs: number
  hints: HintUsage
  wrongAttempts: number
  /** Streak including this correct answer. */
  streak: number
}

/** Points for a correct answer. Lost rounds always score 0. */
export function scoreCorrect(input: ScoreInput): PointsBreakdown {
  const base = RULES.basePoints[input.difficulty]
  const hp = hintPenalty(input.hints)
  const ap = input.wrongAttempts * RULES.wrongAttemptCost
  const afterPenalties = Math.max(base - hp - ap, RULES.minBasePoints)
  const share = input.durationMs > 0 ? clamp(input.remainingMs / input.durationMs, 0, 1) : 0
  const speedBonus = Math.round(RULES.speedBonusMax * share)
  const multiplier = streakMultiplier(input.streak)
  const total = Math.round((afterPenalties + speedBonus) * multiplier)
  return {
    base,
    hintPenalty: Math.min(hp, base - RULES.minBasePoints),
    attemptPenalty: Math.min(ap, Math.max(base - RULES.minBasePoints - hp, 0)),
    speedBonus,
    multiplier,
    total,
  }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
