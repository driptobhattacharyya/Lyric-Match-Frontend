/**
 * The whole game as one pure state machine.
 *
 * Async work is *described* in state (`request`, tagged with a unique `seq`)
 * and performed by an effect hook, which dispatches the result with the same
 * `seq`. Results whose `seq` (and round id) no longer match are ignored, so a
 * late response can never touch a newer round. Nothing advances on a timer:
 * rounds only move forward on explicit actions.
 *
 * Time is passed in via `at` (epoch ms) on actions, so the reducer stays pure.
 */
import { applyGame, emptyProfile, type Profile, type ProgressUpdate } from './progression'
import { RULES, applyStreak, streakMultiplier } from './rules'
import type {
  Answer,
  ApiFailure,
  ApiMode,
  CheckResponse,
  Difficulty,
  HintKind,
  HintResponse,
  HintUsage,
  RevealResponse,
  RoundOutcome,
  RoundPayload,
  RoundResult,
} from './types'
import { API_MODE } from './types'

export type Phase =
  | 'idle'
  | 'warming'
  | 'loading'
  | 'guessing'
  | 'checking'
  | 'feedback'
  | 'results'
  | 'error'

export type ServerStatus = 'unknown' | 'ready' | 'down'

export interface Round {
  /** Unique per fetched round (the seq of its fetch), used to validate responses. */
  id: number
  index: number
  data: RoundPayload
  /** Current token: replaced by every hint response. */
  token: string
  mask: string
  artist: string | null
  hints: HintUsage
  wrongGuesses: string[]
  durationMs: number
  /** Authoritative time left while the clock is stopped (`deadline === null`). */
  remainingMs: number
  /** Epoch ms when time runs out, while the clock is running. */
  deadline: number | null
}

/** Outcomes that end a round through POST /api/rounds/reveal. */
export type MissOutcome = Exclude<RoundOutcome, 'correct'>

export type Request =
  | { kind: 'health' }
  | { kind: 'round'; index: number; mode: ApiMode; packs: string[]; exclude: string[] }
  | { kind: 'hint'; roundId: number; token: string; hint: HintKind; level: number }
  | { kind: 'check'; roundId: number; token: string; guess: string }
  | { kind: 'reveal'; roundId: number; token: string; outcome: MissOutcome }

export interface InFlight {
  seq: number
  req: Request
}

export interface GameError {
  failure: ApiFailure
  /** Request to send again when the player presses Retry. */
  retry: Request
  /** The round was voided (its token expired) and will be replaced for free. */
  voided: boolean
}

export interface GameConfig {
  difficulty: Difficulty
  /** Pack ids to draw from; empty means all packs. */
  packs: string[]
  totalRounds: number
}

export interface State {
  phase: Phase
  server: ServerStatus
  seq: number
  request: InFlight | null
  /** Work to resume once a warm-up health check succeeds. */
  resume: Request | null
  config: GameConfig
  hearts: number
  streak: number
  score: number
  round: Round | null
  results: RoundResult[]
  /** Song ids seen this session (kept across games), sent as `exclude`. */
  seen: string[]
  error: GameError | null
  profile: Profile
  progress: ProgressUpdate | null
}

export type Action =
  | { type: 'START'; difficulty: Difficulty; packs: string[]; totalRounds: number; at: number }
  | { type: 'HEALTH_OK'; seq: number }
  | { type: 'ROUND_OK'; seq: number; data: RoundPayload; at: number }
  | { type: 'HINT'; hint: HintKind; at: number }
  | { type: 'HINT_OK'; seq: number; response: HintResponse; at: number }
  | { type: 'SUBMIT'; guess: string; at: number }
  | { type: 'CHECK_OK'; seq: number; response: CheckResponse; at: number }
  | { type: 'TIME_UP'; roundId: number; at: number }
  | { type: 'SKIP'; at: number }
  | { type: 'REVEAL_OK'; seq: number; response: RevealResponse }
  | { type: 'REQUEST_FAIL'; seq: number; failure: ApiFailure }
  | { type: 'CONTINUE'; today: string }
  | { type: 'RETRY' }
  | { type: 'QUIT' }
  /** Re-check the server from the start screen. */
  | { type: 'PING' }

export function initialState(profile: Profile = emptyProfile(), seen: string[] = []): State {
  return {
    phase: 'idle',
    server: 'unknown',
    seq: 1,
    // Warm the (possibly sleeping) backend as soon as the app loads.
    request: { seq: 1, req: { kind: 'health' } },
    resume: null,
    config: { difficulty: 'easy', packs: [], totalRounds: RULES.defaultRounds },
    hearts: RULES.hearts,
    streak: 0,
    score: 0,
    round: null,
    results: [],
    seen,
    error: null,
    profile,
    progress: null,
  }
}

// ---------------------------------------------------------------- clock helpers

export function remainingAt(round: Round, now: number): number {
  if (round.deadline === null) return round.remainingMs
  return Math.max(0, round.deadline - now)
}

function pause(round: Round, at: number): Round {
  if (round.deadline === null) return round
  return { ...round, remainingMs: remainingAt(round, at), deadline: null }
}

function resume(round: Round, at: number): Round {
  if (round.deadline !== null) return round
  return { ...round, deadline: at + round.remainingMs }
}

// ---------------------------------------------------------------- transitions

function issue(state: State, req: Request): State {
  const seq = state.seq + 1
  return { ...state, seq, request: { seq, req } }
}

function roundRequest(state: State, index: number): Request {
  return {
    kind: 'round',
    index,
    mode: API_MODE[state.config.difficulty],
    packs: state.config.packs,
    exclude: state.seen.slice(-RULES.maxExclude),
  }
}

function phaseFor(req: Request): Phase {
  switch (req.kind) {
    case 'health':
      return 'warming'
    case 'round':
      return 'loading'
    case 'hint':
      return 'guessing'
    case 'check':
    case 'reveal':
      return 'checking'
  }
}

function run(state: State, req: Request): State {
  return { ...issue(state, req), phase: phaseFor(req), error: null }
}

function beginRound(state: State, id: number, index: number, data: RoundPayload, at: number): State {
  const fallback = RULES.defaultRoundSeconds[data.mode] ?? RULES.defaultRoundSeconds.type
  const seconds = data.timeLimitSeconds > 0 ? data.timeLimitSeconds : fallback
  const durationMs = seconds * 1000
  const round: Round = {
    id,
    index,
    data,
    token: data.roundToken,
    mask: data.titleMask,
    artist: null,
    hints: { lettersLevel: 0, artist: false },
    wrongGuesses: [],
    durationMs,
    remainingMs: durationMs,
    deadline: at + durationMs,
  }
  return { ...state, phase: 'guessing', request: null, round, error: null, server: 'ready' }
}

function warm(state: State, plan: Request | null): State {
  const pending = state.request?.req.kind === 'health'
  const next = pending ? state : issue(state, { kind: 'health' })
  return { ...next, phase: 'warming', resume: plan, error: null }
}

function fail(state: State, failure: ApiFailure, retry: Request, voided = false): State {
  const offline = failure.code === 'network' || failure.code === 'timeout'
  return {
    ...state,
    phase: 'error',
    request: null,
    // The clock is always stopped while a request is in flight, so it stays frozen here.
    round: voided ? null : state.round,
    error: { failure, retry, voided },
    server: offline ? 'down' : state.server,
  }
}

function finishRound(state: State, outcome: RoundOutcome, answer: Answer, basePoints: number, receipt: string): State {
  const round = state.round
  if (!round) return state
  const correct = outcome === 'correct'
  const streak = correct ? state.streak + 1 : 0
  const points = correct ? applyStreak(basePoints, streak) : 0
  const result: RoundResult = {
    index: round.index,
    outcome,
    answer,
    language: round.data.language,
    packId: round.data.packId,
    timeMs: round.durationMs - round.remainingMs,
    hints: round.hints,
    wrongGuesses: round.wrongGuesses,
    streak,
    basePoints: correct ? basePoints : 0,
    multiplier: correct ? streakMultiplier(streak) : 1,
    points,
    receipt,
  }
  // A wrong guess already cost its heart; running out of time or skipping costs one now.
  const heartLost = outcome === 'timeout' || outcome === 'skipped'
  const seen = state.seen.includes(answer.songId) ? state.seen : [...state.seen, answer.songId].slice(-RULES.maxExclude)
  return {
    ...state,
    phase: 'feedback',
    request: null,
    hearts: heartLost ? Math.max(0, state.hearts - 1) : state.hearts,
    streak,
    score: state.score + points,
    results: [...state.results, result],
    seen,
    round: { ...round, deadline: null },
  }
}

export function isGameOver(state: State): boolean {
  return state.hearts <= 0 || state.results.length >= state.config.totalRounds
}

function startGame(state: State, config: GameConfig): State {
  const fresh: State = {
    ...state,
    config,
    hearts: RULES.hearts,
    streak: 0,
    score: 0,
    round: null,
    results: [],
    error: null,
    progress: null,
    resume: null,
  }
  const first = roundRequest(fresh, 0)
  if (fresh.server === 'ready') return run(fresh, first)
  return warm(fresh, first)
}

/** The in-flight request, if it is the one `seq` answers and of the given kind. */
function inflight<K extends Request['kind']>(state: State, seq: number, kind: K): Extract<Request, { kind: K }> | null {
  const r = state.request
  if (!r || r.seq !== seq || r.req.kind !== kind) return null
  return r.req as Extract<Request, { kind: K }>
}

/** The current round, if `roundId` still names it. */
function currentRound(state: State, roundId: number): Round | null {
  return state.round && state.round.id === roundId ? state.round : null
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START': {
      if (state.phase !== 'idle' && state.phase !== 'results') return state
      const totalRounds = Math.max(1, Math.floor(action.totalRounds) || RULES.defaultRounds)
      return startGame(state, { difficulty: action.difficulty, packs: [...action.packs], totalRounds })
    }

    case 'HEALTH_OK': {
      if (!inflight(state, action.seq, 'health')) return state
      const ready: State = { ...state, server: 'ready', request: null }
      if (state.phase !== 'warming') return ready
      const plan = state.resume ?? roundRequest(state, state.results.length)
      return run({ ...ready, resume: null }, plan)
    }

    case 'ROUND_OK': {
      const req = inflight(state, action.seq, 'round')
      if (!req || state.phase !== 'loading') return state
      return beginRound(state, action.seq, req.index, action.data, action.at)
    }

    case 'HINT': {
      const r = state.round
      if (state.phase !== 'guessing' || !r || state.request) return state
      if (action.hint === 'artist' && r.hints.artist) return state
      if (action.hint === 'letters' && r.hints.lettersLevel >= RULES.maxLetterLevel) return state
      if (remainingAt(r, action.at) <= 0) return state
      const level = action.hint === 'letters' ? r.hints.lettersLevel + 1 : 1
      return issue(
        { ...state, round: pause(r, action.at) },
        { kind: 'hint', roundId: r.id, token: r.token, hint: action.hint, level },
      )
    }

    case 'HINT_OK': {
      const req = inflight(state, action.seq, 'hint')
      const r = req && currentRound(state, req.roundId)
      if (!req || !r) return state
      const res = action.response
      const updated: Round =
        res.kind === 'letters'
          ? {
              ...r,
              token: res.roundToken,
              mask: res.titleMask,
              hints: { ...r.hints, lettersLevel: Math.min(RULES.maxLetterLevel, req.level) as HintUsage['lettersLevel'] },
            }
          : { ...r, token: res.roundToken, artist: res.artist, hints: { ...r.hints, artist: true } }
      return { ...state, request: null, phase: 'guessing', round: resume(updated, action.at) }
    }

    case 'SUBMIT': {
      const r = state.round
      const guess = action.guess.trim().slice(0, 200)
      if (state.phase !== 'guessing' || !r || state.request || !guess) return state
      if (remainingAt(r, action.at) <= 0) return state
      return run({ ...state, round: pause(r, action.at) }, { kind: 'check', roundId: r.id, token: r.token, guess })
    }

    case 'CHECK_OK': {
      const req = inflight(state, action.seq, 'check')
      const r = req && currentRound(state, req.roundId)
      if (!req || !r) return state
      const res = action.response
      if (res.correct && res.answer && res.receipt) {
        return finishRound(state, 'correct', res.answer, res.points, res.receipt)
      }
      // Wrong: costs a heart, the round carries on unless that was the last heart.
      // The answer streak is untouched: it counts rounds, exactly like the server's recompute.
      const wrong: Round = { ...r, wrongGuesses: [...r.wrongGuesses, req.guess] }
      const hearts = Math.max(0, state.hearts - 1)
      const next: State = { ...state, hearts, round: wrong }
      if (hearts === 0) {
        return run(next, { kind: 'reveal', roundId: r.id, token: r.token, outcome: 'wrong' })
      }
      return { ...next, request: null, phase: 'guessing', round: resume(wrong, action.at) }
    }

    case 'TIME_UP': {
      const r = currentRound(state, action.roundId)
      if (state.phase !== 'guessing' || !r || r.deadline === null || state.request) return state
      if (action.at < r.deadline) return state
      return run(
        { ...state, round: { ...r, remainingMs: 0, deadline: null } },
        { kind: 'reveal', roundId: r.id, token: r.token, outcome: 'timeout' },
      )
    }

    case 'SKIP': {
      const r = state.round
      if (state.phase !== 'guessing' || !r || state.request) return state
      return run({ ...state, round: pause(r, action.at) }, { kind: 'reveal', roundId: r.id, token: r.token, outcome: 'skipped' })
    }

    case 'REVEAL_OK': {
      const req = inflight(state, action.seq, 'reveal')
      if (!req || !currentRound(state, req.roundId)) return state
      const res = action.response
      return finishRound(state, req.outcome, res.answer, 0, res.receipt)
    }

    case 'REQUEST_FAIL': {
      const current = state.request
      if (!current || current.seq !== action.seq) return state
      const req = current.req
      if (req.kind === 'health') {
        const down: State = { ...state, server: 'down', request: null }
        if (state.phase !== 'warming') return down
        return fail(down, action.failure, state.resume ?? roundRequest(state, state.results.length))
      }
      if (action.failure.code === 'invalid_token' && req.kind !== 'round' && state.round) {
        // The round can no longer be resolved: void it and deal a fresh one, no penalty.
        return fail(state, action.failure, roundRequest(state, state.round.index), true)
      }
      return fail(state, action.failure, req)
    }

    case 'CONTINUE': {
      if (state.phase !== 'feedback') return state
      if (isGameOver(state)) {
        const progress = applyGame(
          state.profile,
          {
            difficulty: state.config.difficulty,
            results: state.results,
            score: state.score,
            totalRounds: state.config.totalRounds,
          },
          action.today,
        )
        return { ...state, phase: 'results', round: null, request: null, profile: progress.profile, progress }
      }
      return run({ ...state, round: null }, roundRequest(state, state.results.length))
    }

    case 'RETRY': {
      if (state.phase !== 'error' || !state.error) return state
      const plan = state.error.retry
      const code = state.error.failure.code
      // If the server looks asleep or gone, wake it with a patient health check first.
      if (code === 'network' || code === 'timeout') return warm(state, plan)
      return run(state, plan)
    }

    case 'PING': {
      if (state.phase !== 'idle' || state.request) return state
      return { ...issue(state, { kind: 'health' }), server: 'unknown' }
    }

    case 'QUIT': {
      return {
        ...state,
        phase: 'idle',
        request: state.request?.req.kind === 'health' ? state.request : null,
        resume: null,
        round: null,
        error: null,
      }
    }
  }
}
