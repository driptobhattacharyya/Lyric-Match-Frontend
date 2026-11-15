import { describe, expect, test } from 'bun:test'
import { initialState, reducer, remainingAt, type Action, type State } from './reducer'
import { RULES } from './rules'
import type { RoundPayload } from './types'

const T0 = 1_000_000
const TODAY = '2026-11-15'

function payload(n: number, mode: 'choice' | 'type' = 'choice'): RoundPayload {
  return {
    roundToken: `tok-${n}`,
    lyrics: 'Placeholder lyric line one\nPlaceholder lyric line two',
    mode,
    titleLength: 9,
    titleMask: '____ ____',
    options: mode === 'choice' ? ['Alpha Song', 'Beta Song', 'Gamma Song', 'Delta Song'] : null,
  }
}

const answer = (n: number) => ({ songId: `song-${n}`, title: 'Alpha Song', artist: 'The Fakes' })

function run(state: State, ...actions: Action[]): State {
  return actions.reduce(reducer, state)
}

/** A started game whose server is warm and round 0 is on screen. */
function playing(difficulty: 'easy' | 'pro' = 'easy'): State {
  let s = run(initialState(), { type: 'HEALTH_OK', seq: 1, at: T0 })
  s = reducer(s, { type: 'START', difficulty, at: T0 })
  expect(s.phase).toBe('loading')
  return reducer(s, { type: 'ROUND_OK', seq: s.nextRound!.seq, data: payload(0, difficulty === 'easy' ? 'choice' : 'type'), at: T0 })
}

function seqOf(s: State) {
  return s.request!.seq
}

describe('warm-up', () => {
  test('starting while the server sleeps waits for health, then loads', () => {
    let s = reducer(initialState(), { type: 'START', difficulty: 'easy', at: T0 })
    expect(s.phase).toBe('warming')
    expect(s.request?.req.kind).toBe('health')
    expect(s.nextRound).toBeNull()
    s = reducer(s, { type: 'HEALTH_OK', seq: s.request!.seq, at: T0 })
    expect(s.server).toBe('ready')
    expect(s.phase).toBe('loading')
    expect(s.nextRound?.index).toBe(0)
  })

  test('health failure while warming shows an error; retry warms again', () => {
    let s = reducer(initialState(), { type: 'START', difficulty: 'easy', at: T0 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: 1, failure: { code: 'timeout', message: 'slow' } })
    expect(s.phase).toBe('error')
    expect(s.round).toBeNull()
    s = reducer(s, { type: 'RETRY', at: T0 })
    expect(s.phase).toBe('warming')
    expect(s.request?.req.kind).toBe('health')
  })

  test('health failure on the start screen only marks the server down', () => {
    const s = reducer(initialState(), { type: 'REQUEST_FAIL', seq: 1, failure: { code: 'network', message: 'x' } })
    expect(s.phase).toBe('idle')
    expect(s.server).toBe('down')
  })
})

describe('round flow', () => {
  test('round starts with a running clock', () => {
    const s = playing()
    expect(s.phase).toBe('guessing')
    expect(s.round?.deadline).toBe(T0 + RULES.roundSeconds.easy * 1000)
    expect(remainingAt(s.round!, T0 + 5000)).toBe(15_000)
  })

  test('correct answer scores, keeps hearts, prefetches next round', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Alpha Song', at: T0 + 4000 })
    expect(s.phase).toBe('checking')
    expect(s.round?.deadline).toBeNull()
    expect(s.round?.remainingMs).toBe(16_000)
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: { correct: true, answer: answer(0) }, at: T0 + 4300 })
    expect(s.phase).toBe('feedback')
    expect(s.hearts).toBe(3)
    expect(s.streak).toBe(1)
    expect(s.results[0].points).toBe(100 + 40)
    expect(s.score).toBe(140)
    expect(s.seen).toEqual(['song-0'])
    expect(s.nextRound).toMatchObject({ index: 1, status: 'pending', exclude: ['song-0'] })
  })

  test('wrong easy guess costs a heart via reveal', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Beta Song', at: T0 + 1000 })
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: { correct: false, answer: null }, at: T0 + 1200 })
    expect(s.phase).toBe('checking')
    expect(s.request?.req).toMatchObject({ kind: 'reveal', outcome: 'wrong' })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), answer: answer(0) })
    expect(s.phase).toBe('feedback')
    expect(s.hearts).toBe(2)
    expect(s.streak).toBe(0)
    expect(s.results[0]).toMatchObject({ outcome: 'wrong', points: 0 })
  })

  test('pro allows retries; clock resumes from where it paused', () => {
    let s = playing('pro')
    s = reducer(s, { type: 'SUBMIT', guess: 'nope', at: T0 + 10_000 })
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: { correct: false, answer: null }, at: T0 + 12_000 })
    expect(s.phase).toBe('guessing')
    expect(s.round?.wrongAttempts).toBe(1)
    // 2s spent waiting for the server are not charged to the player.
    expect(s.round?.deadline).toBe(T0 + 12_000 + 35_000)
    expect(s.hearts).toBe(3)
  })

  test('time up reveals and costs a heart; stale TIME_UP ignored', () => {
    let s = playing()
    const id = s.round!.id
    expect(reducer(s, { type: 'TIME_UP', roundId: id, at: T0 + 100 })).toBe(s)
    expect(reducer(s, { type: 'TIME_UP', roundId: id + 99, at: T0 + 30_000 })).toBe(s)
    s = reducer(s, { type: 'TIME_UP', roundId: id, at: T0 + 20_000 })
    expect(s.request?.req).toMatchObject({ kind: 'reveal', outcome: 'timeout' })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), answer: answer(0) })
    expect(s.results[0]).toMatchObject({ outcome: 'timeout', timeMs: 20_000 })
    expect(s.hearts).toBe(2)
  })

  test('time up cannot double-advance after an answer', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Alpha Song', at: T0 + 19_000 })
    // Timer fires while the check is in flight: ignored (clock paused).
    const same = reducer(s, { type: 'TIME_UP', roundId: s.round!.id, at: T0 + 21_000 })
    expect(same).toBe(s)
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: { correct: true, answer: answer(0) }, at: T0 + 21_000 })
    expect(s.results).toHaveLength(1)
    // Duplicate response is ignored too.
    expect(reducer(s, { type: 'CHECK_OK', seq: s.seq, response: { correct: true, answer: answer(0) }, at: T0 })).toBe(s)
  })

  test('hints pause the clock and record usage', () => {
    let s = playing()
    s = reducer(s, { type: 'HINT', hint: 'letters', at: T0 + 2000 })
    expect(s.request?.req).toMatchObject({ kind: 'hint', hint: 'letters', level: 1 })
    expect(s.round?.deadline).toBeNull()
    s = reducer(s, { type: 'HINT_OK', seq: seqOf(s), response: { kind: 'letters', titleMask: 'A___ ____' }, at: T0 + 3000 })
    expect(s.round?.mask).toBe('A___ ____')
    expect(s.round?.hints.lettersLevel).toBe(1)
    expect(s.round?.deadline).toBe(T0 + 3000 + 18_000)
    s = reducer(s, { type: 'HINT', hint: 'artist', at: T0 + 4000 })
    s = reducer(s, { type: 'HINT_OK', seq: seqOf(s), response: { kind: 'artist', artist: 'The Fakes' }, at: T0 + 4000 })
    expect(s.round?.artist).toBe('The Fakes')
    expect(reducer(s, { type: 'HINT', hint: 'artist', at: T0 + 5000 })).toBe(s)
  })

  test('continue starts the prefetched round instantly, or waits for it', () => {
    let s = playing()
    s = reducer(s, { type: 'GIVE_UP', at: T0 + 1000 })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), answer: answer(0) })
    const prefetchSeq = s.nextRound!.seq
    const waiting = reducer(s, { type: 'CONTINUE', at: T0 + 2000, today: TODAY })
    expect(waiting.phase).toBe('loading')
    const started = reducer(waiting, { type: 'ROUND_OK', seq: prefetchSeq, data: payload(1), at: T0 + 2500 })
    expect(started.phase).toBe('guessing')
    expect(started.round?.index).toBe(1)

    const ready = reducer(s, { type: 'ROUND_OK', seq: prefetchSeq, data: payload(1), at: T0 + 1500 })
    expect(ready.phase).toBe('feedback')
    const instant = reducer(ready, { type: 'CONTINUE', at: T0 + 9000, today: TODAY })
    expect(instant.round?.deadline).toBe(T0 + 9000 + 20_000)
  })

  test('failed prefetch is silent; continue refetches', () => {
    let s = playing()
    s = reducer(s, { type: 'GIVE_UP', at: T0 })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), answer: answer(0) })
    s = reducer(s, { type: 'ROUND_FAIL', seq: s.nextRound!.seq, failure: { code: 'llm_unavailable', message: 'x' } })
    expect(s.phase).toBe('feedback')
    s = reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })
    expect(s.phase).toBe('loading')
    expect(s.nextRound?.index).toBe(1)
  })
})

describe('errors and retry keep progress', () => {
  test('check failure freezes the clock; retry resends the same guess', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Gamma Song', at: T0 + 5000 })
    const req = s.request!.req
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'rate_limited', message: 'slow down' } })
    expect(s.phase).toBe('error')
    expect(s.round?.remainingMs).toBe(15_000)
    expect(s.round?.deadline).toBeNull()
    s = reducer(s, { type: 'RETRY', at: T0 + 60_000 })
    expect(s.phase).toBe('checking')
    expect(s.request?.req).toEqual(req)
  })

  test('network failure retries through a warm-up', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Gamma Song', at: T0 + 5000 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'network', message: 'offline' } })
    expect(s.server).toBe('down')
    s = reducer(s, { type: 'RETRY', at: T0 })
    expect(s.phase).toBe('warming')
    s = reducer(s, { type: 'HEALTH_OK', seq: seqOf(s), at: T0 })
    expect(s.phase).toBe('checking')
    expect(s.request?.req.kind).toBe('check')
    expect(s.score).toBe(0)
    expect(s.hearts).toBe(3)
  })

  test('loading failure retries the same round index', () => {
    let s = run(initialState(), { type: 'HEALTH_OK', seq: 1, at: T0 }, { type: 'START', difficulty: 'easy', at: T0 })
    s = reducer(s, { type: 'ROUND_FAIL', seq: s.nextRound!.seq, failure: { code: 'llm_unavailable', message: 'x' } })
    expect(s.phase).toBe('error')
    s = reducer(s, { type: 'RETRY', at: T0 })
    expect(s.phase).toBe('loading')
    expect(s.nextRound?.index).toBe(0)
  })

  test('expired token voids the round without a penalty', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'x', at: T0 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'invalid_token', message: 'expired' } })
    expect(s.error?.voided).toBe(true)
    expect(s.round).toBeNull()
    s = reducer(s, { type: 'RETRY', at: T0 })
    expect(s.nextRound?.index).toBe(0)
    expect(s.hearts).toBe(3)
    expect(s.results).toHaveLength(0)
  })

  test('responses after quitting are ignored', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'x', at: T0 })
    const seq = seqOf(s)
    s = reducer(s, { type: 'QUIT' })
    expect(s.phase).toBe('idle')
    expect(reducer(s, { type: 'CHECK_OK', seq, response: { correct: true, answer: answer(0) }, at: T0 })).toBe(s)
  })
})

describe('game end', () => {
  function loseRound(s: State, n: number): State {
    s = reducer(s, { type: 'GIVE_UP', at: T0 })
    return reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), answer: answer(n) })
  }

  test('three lost rounds end the game and apply progress once', () => {
    let s = playing()
    for (let n = 0; n < 3; n++) {
      s = loseRound(s, n)
      if (n < 2) {
        s = reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })
        s = reducer(s, { type: 'ROUND_OK', seq: s.nextRound!.seq, data: payload(n + 1), at: T0 })
      }
    }
    expect(s.hearts).toBe(0)
    expect(s.nextRound).toBeNull()
    s = reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })
    expect(s.phase).toBe('results')
    expect(s.profile.gamesPlayed).toBe(1)
    expect(s.progress?.xpGained).toBe(10)
    expect(reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })).toBe(s)
  })

  test('total score equals the sum of round points over a full game', () => {
    let s = playing()
    for (let n = 0; n < RULES.rounds; n++) {
      s = reducer(s, { type: 'SUBMIT', guess: 'Alpha Song', at: T0 + n * 1000 })
      s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: { correct: true, answer: answer(n) }, at: T0 })
      if (n < RULES.rounds - 1) {
        s = reducer(s, { type: 'ROUND_OK', seq: s.nextRound!.seq, data: payload(n + 1), at: T0 })
        s = reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })
      }
    }
    s = reducer(s, { type: 'CONTINUE', at: T0, today: TODAY })
    expect(s.phase).toBe('results')
    expect(s.results).toHaveLength(RULES.rounds)
    expect(s.score).toBe(s.results.reduce((a, r) => a + r.points, 0))
    expect(s.results.at(-1)!.streak).toBe(RULES.rounds)
    expect(s.progress?.newBadges).toContain('flawless')
  })

  test('play again from results restarts cleanly', () => {
    let s = playing()
    s = { ...s, phase: 'results' }
    s = reducer(s, { type: 'START', difficulty: 'pro', at: T0 })
    expect(s).toMatchObject({ phase: 'loading', hearts: 3, score: 0, results: [], difficulty: 'pro' })
  })
})

describe('ping', () => {
  test('re-checks a down server from the start screen only', () => {
    let s = reducer(initialState(), { type: 'REQUEST_FAIL', seq: 1, failure: { code: 'network', message: 'x' } })
    s = reducer(s, { type: 'PING' })
    expect(s.server).toBe('unknown')
    expect(s.request?.req.kind).toBe('health')
    expect(reducer(s, { type: 'PING' })).toBe(s)
  })
})
