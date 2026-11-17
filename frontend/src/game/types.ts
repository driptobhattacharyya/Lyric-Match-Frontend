/** Shapes shared by the API client, the reducer and the UI. Mirrors docs/api.md. */

export type ApiMode = 'type' | 'choice'
/** Player-facing difficulty. Easy = multiple choice, Pro = type the title. */
export type Difficulty = 'easy' | 'pro'

export const API_MODE: Record<Difficulty, ApiMode> = { easy: 'choice', pro: 'type' }
export const DIFFICULTY_OF: Record<ApiMode, Difficulty> = { choice: 'easy', type: 'pro' }

export interface Answer {
  songId: string
  title: string
  artist: string
  year: number | null
  /** Film the song is from (Hindi film songs), otherwise null. */
  film: string | null
}

export interface Pack {
  id: string
  name: string
  count: number
}

export interface Language {
  id: string
  name: string
  packs: Pack[]
}

export interface Meta {
  languages: Language[]
  leaderboard: boolean
  roundsPerGame: number
  roundSeconds: Record<ApiMode, number>
}

export interface RoundPayload {
  roundToken: string
  lyrics: string
  mode: ApiMode
  language: string
  packId: string
  titleLength: number
  titleMask: string
  options: string[] | null
  timeLimitSeconds: number
}

export type HintKind = 'letters' | 'artist'

export type HintResponse =
  | { kind: 'letters'; titleMask: string; roundToken: string }
  | { kind: 'artist'; artist: string; roundToken: string }

export interface CheckResponse {
  correct: boolean
  answer: Answer | null
  /** Server-computed base points (0 when wrong). */
  points: number
  receipt: string | null
}

export interface RevealResponse {
  answer: Answer
  points: number
  receipt: string
}

export interface ScoreSubmission {
  id: string
  score: number
  rank: number
}

export type Period = 'all' | 'week' | 'day'

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
  correct: number
  rounds: number
  createdAt: string
}

export type ErrorCode =
  | 'bad_request'
  | 'invalid_token'
  | 'rate_limited'
  | 'llm_unavailable'
  | 'leaderboard_unavailable'
  | 'duplicate_game'
  | 'not_found'
  | 'internal_error'
  | 'network'
  | 'timeout'

export interface ApiFailure {
  code: ErrorCode
  message: string
}

/** How a finished round ended. */
export type RoundOutcome = 'correct' | 'wrong' | 'timeout' | 'skipped'

export interface HintUsage {
  lettersLevel: 0 | 1 | 2 | 3
  artist: boolean
}

export interface RoundResult {
  index: number
  outcome: RoundOutcome
  answer: Answer
  language: string
  packId: string
  /** Milliseconds the (client) clock ran before the round ended. */
  timeMs: number
  hints: HintUsage
  wrongGuesses: string[]
  /** Streak value after this round (0 when the round was lost). */
  streak: number
  /** Base points from the server. */
  basePoints: number
  /** Streak multiplier applied to this round (1 on a miss). */
  multiplier: number
  /** Points after the multiplier: what the server will recompute. */
  points: number
  /** Signed proof of the round, for the leaderboard. */
  receipt: string
}
