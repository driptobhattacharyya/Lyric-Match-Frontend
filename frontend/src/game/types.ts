/** Shapes shared by the API client, the reducer and the UI. */

export type ApiMode = 'type' | 'choice'
/** Player-facing difficulty. Easy = multiple choice, Pro = type the title. */
export type Difficulty = 'easy' | 'pro'

export const API_MODE: Record<Difficulty, ApiMode> = { easy: 'choice', pro: 'type' }

export interface Answer {
  songId: string
  title: string
  artist: string
}

export interface RoundPayload {
  roundToken: string
  lyrics: string
  mode: ApiMode
  titleLength: number
  titleMask: string
  options: string[] | null
}

export type HintKind = 'letters' | 'artist'

export type HintResponse = { kind: 'letters'; titleMask: string } | { kind: 'artist'; artist: string }

export interface CheckResponse {
  correct: boolean
  answer: Answer | null
}

export interface RevealResponse {
  answer: Answer
}

export type ErrorCode =
  | 'bad_request'
  | 'invalid_token'
  | 'rate_limited'
  | 'llm_unavailable'
  | 'not_found'
  | 'network'
  | 'timeout'
  | 'server'

export interface ApiFailure {
  code: ErrorCode
  message: string
}

/** How a finished round ended. */
export type RoundOutcome = 'correct' | 'wrong' | 'timeout' | 'gaveup'

export interface HintUsage {
  lettersLevel: 0 | 1 | 2 | 3
  artist: boolean
}

export interface RoundResult {
  index: number
  outcome: RoundOutcome
  answer: Answer
  /** Milliseconds the clock ran before the round ended. */
  timeMs: number
  hints: HintUsage
  wrongAttempts: number
  /** Streak value after this round (0 when the round was lost). */
  streak: number
  points: number
  breakdown: PointsBreakdown | null
}

export interface PointsBreakdown {
  base: number
  hintPenalty: number
  attemptPenalty: number
  speedBonus: number
  multiplier: number
  total: number
}
