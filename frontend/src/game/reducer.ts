/**
 * The whole game as one pure state machine.
 *
 * Async work is *described* in state (`request` / `nextRound`, each tagged with a
 * unique `seq`) and performed by an effect hook, which dispatches the result
 * with the same `seq`. Results whose `seq` no longer matches are ignored, so a
 * late response can never touch a newer round, and nothing advances on a timer:
 * rounds only move forward on explicit actions.
 *
 * Time is passed in via `at` (epoch ms) on actions, so the reducer stays pure.
 */
import { applyGame, emptyProfile, type Profile, type ProgressUpdate } from './progression'
import { RULES, roundDurationMs, scoreCorrect } from './rules'
import type {
  Answer,
  ApiFailure,
  CheckResponse,
  Difficulty,
  HintKind,
  HintResponse,
  HintUsage,
  RoundOutcome,
  RoundPayload,
  RoundResult,
} from './types'

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
  /** Unique per fetched round (the seq of the fetch), used to validate events. */
  id: number
  index: number
  data: RoundPayload
  mask: string
  artist: string | null
  hints: HintUsage
  wrongAttempts: number
  wrongGuesses: string[]
  durationMs: number
  /** Authoritative time left while the clock is stopped (`deadline === null`). */
  remainingMs: number
  /** Epoch ms when time runs out, while the clock is running. */
  deadline: number | null
}

export type Request =
  | { kind: 'health' }
  | { kind: 'hint'; roundId: number; token: string; hint: HintKind; level: number }
  | { kind: 'check'; roundId: number; token: string; guess: string }
  | {
      kind: 'reveal'
      roundId: number
      token: string
      outcome: RoundOutcome
    }

export interface InFlight {
  seq: number
  req: Request
}

export interface NextRound {
  seq: number
  index: number
  exclude: string[]
  status: 'pending' | 'ready'
  data: RoundPayload | null
}

/** What to do when the player presses Retry on the error screen. */
export type RetryPlan =
  | { kind: 'request'; req: Request }
  | { kind: 'round'; index: number }

export interface GameError {
  failure: ApiFailure
  retry: RetryPlan
  /** The round was voided (its token expired) and will be replaced for free. */
  voided: boolean
}

export interface State {
  phase: Phase
  server: ServerStatus
  seq: number
  request: InFlight | null
  nextRound: NextRound | null
  /** Work to resume once a warm-up health check succeeds. */
  resume: RetryPlan | null
  difficulty: Difficulty
  hearts: number
  streak: number
  score: number
  round: Round | null
  results: RoundResult[]
  seen: string[]
  error: GameError | null
  profile: Profile
  progress: ProgressUpdate | null
}

export type Action =
  | { type: 'START'; difficulty: Difficulty; at: number }
  | { type: 'HEALTH_OK'; seq: number; at: number }
  | { type: 'ROUND_OK'; seq: number; data: RoundPayload; at: number }
  | { type: 'ROUND_FAIL'; seq: number; failure: ApiFailure }
  | { type: 'HINT'; hint: HintKind; at: number }
  | { type: 'HINT_OK'; seq: number; response: HintResponse; at: number }
  | { type: 'SUBMIT'; guess: string; at: number }
  | { type: 'CHECK_OK'; seq: number; response: CheckResponse; at: number }
  | { type: 'TIME_UP'; roundId: number; at: number }
  | { type: 'GIVE_UP'; at: number }
  | { type: 'REVEAL_OK'; seq: number; answer: Answer }
  | { type: 'REQUEST_FAIL'; seq: number; failure: ApiFailure }
  | { type: 'CONTINUE'; at: number; today: string }
  | { type: 'RETRY'; at: number }
  | { type: 'QUIT' }
  /** Re-check the server from the start screen. */
  | { type: 'PING' }

export function initialState(profile: Profile = emptyProfile()): State {
  return {
    phase: 'idle',
    server: 'unknown',
    seq: 1,
    // Warm the (possibly sleeping) backend as soon as the app loads.
    request: { seq: 1, req: { kind: 'health' } },
    nextRound: null,
    resume: null,
    difficulty: 'easy',
    hearts: RULES.hearts,
    streak: 0,
    score: 0,
    round: null,
    results: [],
    seen: [],
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

function fetchRound(state: State, index: number, phase: Phase): State {
  const seq = state.seq + 1
  return {
    ...state,
    seq,
    phase,
    nextRound: { seq, index, exclude: [...state.seen], status: 'pending', data: null },
  }
}

function beginRound(state: State, seq: number, index: number, data: RoundPayload, at: number): State {
  const durationMs = roundDurationMs(state.difficulty)
  const round: Round = {
    id: seq,
    index,
    data,
    mask: data.titleMask,
    artist: null,
    hints: { lettersLevel: 0, artist: false },
    wrongAttempts: 0,
    wrongGuesses: [],
    durationMs,
    remainingMs: durationMs,
    deadline: at + durationMs,
  }
  return { ...state, phase: 'guessing', round, nextRound: null, error: null }
}

function warm(state: State, resumePlan: RetryPlan | null): State {
  const pending = state.request?.req.kind === 'health'
  const next = pending ? state : issue(state, { kind: 'health' })
  return { ...next, phase: 'warming', resume: resumePlan }
}

function runPlan(state: State, plan: RetryPlan): State {
  if (plan.kind === 'round') return fetchRound({ ...state, error: null }, plan.index, 'loading')
  const phase: Phase = plan.req.kind === 'hint' ? 'guessing' : 'checking'
  return { ...issue(state, plan.req), phase, error: null }
}

function fail(state: State, failure: ApiFailure, retry: RetryPlan): State {
  return {
    ...state,
    phase: 'error',
    request: null,
    nextRound: null,
    // Rounds are always paused while a request is in flight, so the clock is frozen here.
    round: state.round,
    error: { failure, retry, voided: false },
    server: failure.code === 'network' || failure.code === 'timeout' ? 'down' : state.server,
  }
}

function finishRound(state: State, outcome: RoundOutcome, answer: Answer): State {
  const round = state.round
  if (!round) return state
  const correct = outcome === 'correct'
  const streak = correct ? state.streak + 1 : 0
  const breakdown = correct
    ? scoreCorrect({
        difficulty: state.difficulty,
        remainingMs: round.remainingMs,
        durationMs: round.durationMs,
        hints: round.hints,
        wrongAttempts: round.wrongAttempts,
        streak,
      })
    : null
  const points = breakdown?.total ?? 0
  const result: RoundResult = {
    index: round.index,
    outcome,
    answer,
    timeMs: round.durationMs - round.remainingMs,
    hints: round.hints,
    wrongAttempts: round.wrongAttempts,
    streak,
    points,
    breakdown,
  }
  const hearts = correct ? state.hearts : Math.max(0, state.hearts - 1)
  const seen = state.seen.includes(answer.songId) ? state.seen : [...state.seen, answer.songId]
  const next: State = {
    ...state,
    phase: 'feedback',
    request: null,
    hearts,
    streak,
    score: state.score + points,
    results: [...state.results, result],
    seen,
    round: { ...round, deadline: null },
  }
  // Prefetch the next round while the player reads the feedback.
  return isGameOver(next) ? next : fetchRound(next, round.index + 1, 'feedback')
}

export function isGameOver(state: State): boolean {
  return state.hearts <= 0 || state.results.length >= RULES.rounds
}

function startGame(state: State, difficulty: Difficulty): State {
  const fresh: State = {
    ...state,
    difficulty,
    hearts: RULES.hearts,
    streak: 0,
    score: 0,
    round: null,
    results: [],
    seen: [],
    error: null,
    progress: null,
    nextRound: null,
    resume: null,
  }
  if (fresh.server === 'ready') return fetchRound(fresh, 0, 'loading')
  return warm(fresh, { kind: 'round', index: 0 })
}

/** Accept only the response to the request currently in flight. */
function matches(state: State, seq: number, kind: Request['kind']): boolean {
  return state.request?.seq === seq && state.request.req.kind === kind
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START': {
      if (state.phase !== 'idle' && state.phase !== 'results') return state
      return startGame(state, action.difficulty)
    }

    case 'HEALTH_OK': {
      if (!matches(state, action.seq, 'health')) return state
      const ready: State = { ...state, server: 'ready', request: null }
      if (state.phase !== 'warming') return ready
      const plan = state.resume ?? { kind: 'round', index: state.results.length }
      return runPlan({ ...ready, resume: null }, plan)
    }

    case 'ROUND_OK': {
      const nr = state.nextRound
      if (!nr || nr.seq !== action.seq || nr.status !== 'pending') return state
      const s: State = { ...state, server: 'ready' }
      if (state.phase === 'loading') return beginRound(s, nr.seq, nr.index, action.data, action.at)
      if (state.phase === 'feedback') {
        return { ...s, nextRound: { ...nr, status: 'ready', data: action.data } }
      }
      return state
    }

    case 'ROUND_FAIL': {
      const nr = state.nextRound
      if (!nr || nr.seq !== action.seq) return state
      // A failed prefetch stays silent; Continue will fetch again.
      if (state.phase === 'feedback') return { ...state, nextRound: null }
      if (state.phase !== 'loading') return state
      return fail(state, action.failure, { kind: 'round', index: nr.index })
    }

    case 'HINT': {
      const r = state.round
      if (state.phase !== 'guessing' || !r || state.request) return state
      if (action.hint === 'artist' && r.hints.artist) return state
      if (action.hint === 'letters' && r.hints.lettersLevel >= 3) return state
      if (remainingAt(r, action.at) <= 0) return state
      const level = action.hint === 'letters' ? r.hints.lettersLevel + 1 : 1
      return issue(
        { ...state, round: pause(r, action.at) },
        { kind: 'hint', roundId: r.id, token: r.data.roundToken, hint: action.hint, level },
      )
    }

    case 'HINT_OK': {
      const r = state.round
      if (!matches(state, action.seq, 'hint') || !r || state.request?.req.kind !== 'hint') return state
      const req = state.request.req
      if (req.roundId !== r.id) return state
      const res = action.response
      const updated: Round =
        res.kind === 'letters'
          ? {
              ...r,
              mask: res.titleMask,
              hints: { ...r.hints, lettersLevel: Math.min(3, req.level) as HintUsage['lettersLevel'] },
            }
          : { ...r, artist: res.artist, hints: { ...r.hints, artist: true } }
      return { ...state, request: null, phase: 'guessing', round: resume(updated, action.at) }
    }

    case 'SUBMIT': {
      const r = state.round
      const guess = action.guess.trim()
      if (state.phase !== 'guessing' || !r || state.request || !guess) return state
      if (remainingAt(r, action.at) <= 0) return state
      return {
        ...issue({ ...state, round: pause(r, action.at) }, {
          kind: 'check',
          roundId: r.id,
          token: r.data.roundToken,
          guess,
        }),
        phase: 'checking',
      }
    }

    case 'CHECK_OK': {
      const r = state.round
      if (!matches(state, action.seq, 'check') || !r || state.request?.req.kind !== 'check') return state
      const guess = state.request.req.guess
      if (action.response.correct) {
        if (action.response.answer) return finishRound(state, 'correct', action.response.answer)
        // Contract says the answer comes with a correct check; fetch it if not.
        return issue(state, { kind: 'reveal', roundId: r.id, token: r.data.roundToken, outcome: 'correct' })
      }
      const wrong: Round = {
        ...r,
        wrongAttempts: r.wrongAttempts + 1,
        wrongGuesses: [...r.wrongGuesses, guess],
      }
      const outOfTries = wrong.wrongAttempts >= RULES.attempts[state.difficulty]
      if (outOfTries || wrong.remainingMs <= 0) {
        return issue(
          { ...state, round: wrong },
          { kind: 'reveal', roundId: r.id, token: r.data.roundToken, outcome: outOfTries ? 'wrong' : 'timeout' },
        )
      }
      return { ...state, request: null, phase: 'guessing', round: resume(wrong, action.at) }
    }

    case 'TIME_UP': {
      const r = state.round
      if (state.phase !== 'guessing' || !r || r.id !== action.roundId || r.deadline === null) return state
      if (state.request) return state
      if (action.at < r.deadline) return state
      return {
        ...issue(
          { ...state, round: { ...r, remainingMs: 0, deadline: null } },
          { kind: 'reveal', roundId: r.id, token: r.data.roundToken, outcome: 'timeout' },
        ),
        phase: 'checking',
      }
    }

    case 'GIVE_UP': {
      const r = state.round
      if (state.phase !== 'guessing' || !r || state.request) return state
      return {
        ...issue(
          { ...state, round: pause(r, action.at) },
          { kind: 'reveal', roundId: r.id, token: r.data.roundToken, outcome: 'gaveup' },
        ),
        phase: 'checking',
      }
    }

    case 'REVEAL_OK': {
      const r = state.round
      if (!matches(state, action.seq, 'reveal') || !r || state.request?.req.kind !== 'reveal') return state
      if (state.request.req.roundId !== r.id) return state
      return finishRound(state, state.request.req.outcome, action.answer)
    }

    case 'REQUEST_FAIL': {
      const inflight = state.request
      if (!inflight || inflight.seq !== action.seq) return state
      const req = inflight.req
      if (req.kind === 'health') {
        const down: State = { ...state, server: 'down', request: null }
        if (state.phase !== 'warming') return down
        return {
          ...down,
          phase: 'error',
          error: { failure: action.failure, retry: state.resume ?? { kind: 'round', index: 0 }, voided: false },
        }
      }
      if (action.failure.code === 'invalid_token' && state.round) {
        // The round can no longer be resolved: void it and deal a fresh one, no penalty.
        const s = fail(state, action.failure, { kind: 'round', index: state.round.index })
        return { ...s, round: null, error: s.error && { ...s.error, voided: true } }
      }
      return fail(state, action.failure, { kind: 'request', req })
    }

    case 'CONTINUE': {
      if (state.phase !== 'feedback') return state
      if (isGameOver(state)) {
        const progress = applyGame(
          state.profile,
          { difficulty: state.difficulty, results: state.results, score: state.score },
          action.today,
        )
        return {
          ...state,
          phase: 'results',
          round: null,
          nextRound: null,
          request: null,
          profile: progress.profile,
          progress,
        }
      }
      const nr = state.nextRound
      if (nr?.status === 'ready' && nr.data) return beginRound(state, nr.seq, nr.index, nr.data, action.at)
      if (nr?.status === 'pending') return { ...state, phase: 'loading' }
      return fetchRound(state, state.results.length, 'loading')
    }

    case 'RETRY': {
      if (state.phase !== 'error' || !state.error) return state
      const plan = state.error.retry
      const code = state.error.failure.code
      // If the server looks asleep, wake it with a patient health check first.
      if (code === 'network' || code === 'timeout') {
        return warm({ ...state, error: null }, plan)
      }
      return runPlan(state, plan)
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
        nextRound: null,
        resume: null,
        round: null,
        error: null,
      }
    }
  }
}
