import { describe, expect, test } from 'bun:test'
import { initialState, isGameOver, reducer, remainingAt, type Action, type State } from './reducer'
import { RULES, scoreGame } from './rules'
import type { Answer, CheckResponse, RoundPayload } from './types'

const T0 = 1_000_000
const TODAY = '2026-11-15'

function payload(n: number, mode: 'choice' | 'type' = 'choice', language = 'en'): RoundPayload {
  return {
    roundToken: `tok-${n}`,
    lyrics: 'Placeholder lyric line one\nPlaceholder lyric line two',
    mode,
    language,
    packId: `${language}-test`,
    titleLength: 9,
    titleMask: '____ ____',
    options: mode === 'choice' ? ['Alpha Song', 'Beta Song', 'Gamma Song', 'Delta Song'] : null,
    timeLimitSeconds: mode === 'choice' ? 20 : 45,
  }
}

const answer = (n: number): Answer => ({ songId: `song-${n}`, title: 'Alpha Song', artist: 'The Fakes', year: 2010, film: null })
const right = (n: number, points: number): CheckResponse => ({ correct: true, answer: answer(n), points, receipt: `rcpt-${n}` })
const wrong: CheckResponse = { correct: false, answer: null, points: 0, receipt: null }

function run(state: State, ...actions: Action[]): State {
  return actions.reduce(reducer, state)
}

const seqOf = (s: State) => s.request!.seq

function start(difficulty: 'easy' | 'pro' = 'easy', totalRounds = 8, packs: string[] = []): State {
  const s = run(initialState(), { type: 'HEALTH_OK', seq: 1 })
  return reducer(s, { type: 'START', difficulty, packs, totalRounds, at: T0 })
}

/** A started game whose server is warm and round `n` is on screen. */
function deal(s: State, n: number, at = T0): State {
  expect(s.phase).toBe('loading')
  expect(s.request?.req.kind).toBe('round')
  return reducer(s, { type: 'ROUND_OK', seq: seqOf(s), data: payload(n, s.config.difficulty === 'easy' ? 'choice' : 'type'), at })
}

function playing(difficulty: 'easy' | 'pro' = 'easy', totalRounds = 8): State {
  return deal(start(difficulty, totalRounds), 0)
}

function answerRight(s: State, n: number, points: number, at = T0 + 1000): State {
  s = reducer(s, { type: 'SUBMIT', guess: 'Alpha Song', at })
  return reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: right(n, points), at })
}

function timeOut(s: State, n: number): State {
  const r = s.round!
  s = reducer(s, { type: 'TIME_UP', roundId: r.id, at: r.deadline! })
  return reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), response: { answer: answer(n), points: 0, receipt: `rcpt-${n}` } })
}

describe('warm-up', () => {
  test('starting while the server sleeps waits for health, then loads', () => {
    let s = reducer(initialState(), { type: 'START', difficulty: 'easy', packs: [], totalRounds: 8, at: T0 })
    expect(s.phase).toBe('warming')
    expect(s.request).toEqual({ seq: 1, req: { kind: 'health' } })
    expect(s.round).toBeNull()
    s = reducer(s, { type: 'HEALTH_OK', seq: 1 })
    expect(s.server).toBe('ready')
    expect(s.phase).toBe('loading')
    expect(s.request?.req).toMatchObject({ kind: 'round', index: 0, mode: 'choice' })
  })

  test('health failure while warming shows an error; retry warms again and keeps the plan', () => {
    let s = reducer(initialState(), { type: 'START', difficulty: 'pro', packs: ['hi-x'], totalRounds: 8, at: T0 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: 1, failure: { code: 'timeout', message: 'slow' } })
    expect(s.phase).toBe('error')
    expect(s.round).toBeNull()
    s = reducer(s, { type: 'RETRY' })
    expect(s.phase).toBe('warming')
    expect(s.request?.req.kind).toBe('health')
    s = reducer(s, { type: 'HEALTH_OK', seq: seqOf(s) })
    expect(s.request?.req).toMatchObject({ kind: 'round', mode: 'type', packs: ['hi-x'] })
  })

  test('health failure on the start screen only marks the server down', () => {
    const s = reducer(initialState(), { type: 'REQUEST_FAIL', seq: 1, failure: { code: 'network', message: 'x' } })
    expect(s.phase).toBe('idle')
    expect(s.server).toBe('down')
    expect(reducer(s, { type: 'PING' }).request?.req.kind).toBe('health')
  })
})

describe('round flow', () => {
  test('round starts with a running clock from timeLimitSeconds', () => {
    const s = playing()
    expect(s.phase).toBe('guessing')
    expect(s.round?.deadline).toBe(T0 + 20_000)
    expect(remainingAt(s.round!, T0 + 5000)).toBe(15_000)
  })

  test('packs and exclude are sent with round requests', () => {
    let s = deal(start('easy', 8, ['en-a', 'hi-b']), 0)
    s = answerRight(s, 0, 120)
    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    expect(s.request?.req).toMatchObject({ kind: 'round', index: 1, packs: ['en-a', 'hi-b'], exclude: ['song-0'] })
  })

  test('correct answer applies the streak multiplier to server points', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: '  Alpha Song ', at: T0 + 4000 })
    expect(s.phase).toBe('checking')
    expect(s.request?.req).toMatchObject({ kind: 'check', guess: 'Alpha Song', token: 'tok-0' })
    expect(s.round?.deadline).toBeNull()
    expect(s.round?.remainingMs).toBe(16_000)
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: right(0, 140), at: T0 + 4200 })
    expect(s.phase).toBe('feedback')
    expect(s.score).toBe(140)
    expect(s.results[0]).toMatchObject({ outcome: 'correct', points: 140, basePoints: 140, streak: 1, receipt: 'rcpt-0' })
    expect(s.request).toBeNull() // no prefetch: the next round is only issued on Continue

    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    s = deal(s, 1, T0 + 10_000)
    s = answerRight(s, 1, 105, T0 + 11_000)
    expect(s.results[1]).toMatchObject({ streak: 2, multiplier: 1.1, points: 116 })
    expect(s.score).toBe(256)
  })

  test('client total equals the server recompute from receipts', () => {
    let s = playing('easy', 5)
    const bases = [130, 0, 112, 147, 101]
    bases.forEach((b, i) => {
      if (i > 0) s = deal(reducer(s, { type: 'CONTINUE', today: TODAY }), i, T0 + i * 100_000)
      s = b > 0 ? answerRight(s, i, b, T0 + i * 100_000 + 500) : timeOut(s, i)
    })
    const server = scoreGame(bases.map((b) => ({ correct: b > 0, basePoints: b }))).total
    expect(s.score).toBe(server)
    expect(s.results.map((r) => r.receipt)).toEqual(['rcpt-0', 'rcpt-1', 'rcpt-2', 'rcpt-3', 'rcpt-4'])
  })

  test('wrong guess costs a heart and the round continues with the clock running', () => {
    let s = playing('pro')
    s = reducer(s, { type: 'SUBMIT', guess: 'nope', at: T0 + 5000 })
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: wrong, at: T0 + 5500 })
    expect(s.phase).toBe('guessing')
    expect(s.hearts).toBe(RULES.hearts - 1)
    expect(s.round?.wrongGuesses).toEqual(['nope'])
    expect(s.round?.deadline).toBe(T0 + 5500 + 40_000)
    s = answerRight(s, 0, 100, T0 + 6000)
    expect(s.results[0].outcome).toBe('correct')
    expect(s.hearts).toBe(RULES.hearts - 1)
  })

  test('losing the last heart on a wrong guess reveals the round and ends the game', () => {
    let s = playing('pro')
    for (let i = 0; i < RULES.hearts; i++) {
      s = reducer(s, { type: 'SUBMIT', guess: `nope ${i}`, at: T0 + 1000 * (i + 1) })
      s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: wrong, at: T0 + 1000 * (i + 1) + 100 })
    }
    expect(s.hearts).toBe(0)
    expect(s.phase).toBe('checking')
    expect(s.request?.req).toMatchObject({ kind: 'reveal', outcome: 'wrong' })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), response: { answer: answer(0), points: 0, receipt: 'rcpt-0' } })
    expect(s.phase).toBe('feedback')
    expect(s.hearts).toBe(0)
    expect(isGameOver(s)).toBe(true)
    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    expect(s.phase).toBe('results')
    expect(s.progress?.profile.gamesPlayed).toBe(1)
  })

  test('time up reveals, costs a heart and resets the streak', () => {
    let s = answerRight(playing(), 0, 120)
    s = deal(reducer(s, { type: 'CONTINUE', today: TODAY }), 1, T0 + 50_000)
    const r = s.round!
    expect(reducer(s, { type: 'TIME_UP', roundId: r.id, at: r.deadline! - 1 })).toBe(s)
    s = timeOut(s, 1)
    expect(s.results[1]).toMatchObject({ outcome: 'timeout', points: 0, streak: 0 })
    expect(s.hearts).toBe(RULES.hearts - 1)
    expect(s.streak).toBe(0)
  })

  test('skip costs a heart too', () => {
    let s = playing()
    s = reducer(s, { type: 'SKIP', at: T0 + 3000 })
    expect(s.request?.req).toMatchObject({ kind: 'reveal', outcome: 'skipped' })
    s = reducer(s, { type: 'REVEAL_OK', seq: seqOf(s), response: { answer: answer(0), points: 0, receipt: 'r' } })
    expect(s.hearts).toBe(RULES.hearts - 1)
    expect(s.results[0].outcome).toBe('skipped')
  })

  test('game ends after the last round', () => {
    let s = playing('easy', 2)
    s = answerRight(s, 0, 100)
    expect(isGameOver(s)).toBe(false)
    s = deal(reducer(s, { type: 'CONTINUE', today: TODAY }), 1)
    s = answerRight(s, 1, 100)
    expect(isGameOver(s)).toBe(true)
    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    expect(s.phase).toBe('results')
    expect(s.score).toBe(210)
  })

  test('seen songs persist across games in a session', () => {
    let s = playing('easy', 1)
    s = answerRight(s, 0, 100)
    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    s = reducer(s, { type: 'START', difficulty: 'easy', packs: [], totalRounds: 1, at: T0 })
    expect(s.request?.req).toMatchObject({ kind: 'round', exclude: ['song-0'] })
    expect(s.score).toBe(0)
    expect(s.results).toEqual([])
  })
})

describe('hints', () => {
  test('hint pauses the clock, then replaces the mask and the round token', () => {
    let s = playing('pro')
    s = reducer(s, { type: 'HINT', hint: 'letters', at: T0 + 2000 })
    expect(s.request?.req).toMatchObject({ kind: 'hint', hint: 'letters', level: 1, token: 'tok-0' })
    expect(s.round?.deadline).toBeNull()
    s = reducer(s, { type: 'HINT_OK', seq: seqOf(s), response: { kind: 'letters', titleMask: 'A___ ____', roundToken: 'tok-0b' }, at: T0 + 2500 })
    expect(s.round).toMatchObject({ mask: 'A___ ____', token: 'tok-0b', hints: { lettersLevel: 1, artist: false } })
    expect(s.round?.deadline).toBe(T0 + 2500 + 43_000)

    s = reducer(s, { type: 'HINT', hint: 'artist', at: T0 + 3000 })
    expect(s.request?.req).toMatchObject({ kind: 'hint', hint: 'artist', token: 'tok-0b' })
    s = reducer(s, { type: 'HINT_OK', seq: seqOf(s), response: { kind: 'artist', artist: 'The Fakes', roundToken: 'tok-0c' }, at: T0 + 3100 })
    expect(s.round?.artist).toBe('The Fakes')

    // Later calls use the newest token.
    s = reducer(s, { type: 'SUBMIT', guess: 'x', at: T0 + 4000 })
    expect(s.request?.req).toMatchObject({ kind: 'check', token: 'tok-0c' })
  })

  test('letters stop at level 3 and artist only once', () => {
    let s = playing('pro')
    for (let lvl = 1; lvl <= 3; lvl++) {
      s = reducer(s, { type: 'HINT', hint: 'letters', at: T0 })
      s = reducer(s, { type: 'HINT_OK', seq: seqOf(s), response: { kind: 'letters', titleMask: 'm', roundToken: `t${lvl}` }, at: T0 })
    }
    expect(s.round?.hints.lettersLevel).toBe(3)
    expect(reducer(s, { type: 'HINT', hint: 'letters', at: T0 })).toBe(s)
  })
})

describe('stale responses and failures', () => {
  test('responses for an old seq or a replaced round are ignored', () => {
    let s = playing('pro')
    s = reducer(s, { type: 'SUBMIT', guess: 'x', at: T0 + 1000 })
    const stale = seqOf(s)
    s = reducer(s, { type: 'QUIT' })
    expect(reducer(s, { type: 'CHECK_OK', seq: stale, response: right(0, 100), at: T0 })).toBe(s)

    let g = playing('pro')
    g = reducer(g, { type: 'SUBMIT', guess: 'x', at: T0 + 1000 })
    expect(reducer(g, { type: 'CHECK_OK', seq: seqOf(g) + 5, response: right(0, 100), at: T0 })).toBe(g)
    expect(reducer(g, { type: 'REVEAL_OK', seq: seqOf(g), response: { answer: answer(0), points: 0, receipt: 'r' } })).toBe(g)
  })

  test('network failure freezes the round; retry warms the server then resends the same check', () => {
    let s = playing('pro')
    s = reducer(s, { type: 'SUBMIT', guess: 'x', at: T0 + 3000 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'network', message: 'down' } })
    expect(s.phase).toBe('error')
    expect(s.server).toBe('down')
    expect(s.round?.remainingMs).toBe(42_000)
    expect(s.round?.deadline).toBeNull()
    s = reducer(s, { type: 'RETRY' })
    expect(s.phase).toBe('warming')
    s = reducer(s, { type: 'HEALTH_OK', seq: seqOf(s) })
    expect(s.phase).toBe('checking')
    expect(s.request?.req).toMatchObject({ kind: 'check', guess: 'x' })
    s = reducer(s, { type: 'CHECK_OK', seq: seqOf(s), response: wrong, at: T0 + 90_000 })
    expect(s.round?.deadline).toBe(T0 + 90_000 + 42_000)
  })

  test('rate limit retries directly; round fetch failures keep progress', () => {
    let s = answerRight(playing(), 0, 100)
    s = reducer(s, { type: 'CONTINUE', today: TODAY })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'rate_limited', message: 'slow down' } })
    expect(s.phase).toBe('error')
    expect(s.score).toBe(100)
    s = reducer(s, { type: 'RETRY' })
    expect(s.phase).toBe('loading')
    expect(s.request?.req).toMatchObject({ kind: 'round', index: 1 })
  })

  test('an expired token voids the round without a penalty', () => {
    let s = playing()
    s = reducer(s, { type: 'SUBMIT', guess: 'Alpha Song', at: T0 + 1000 })
    s = reducer(s, { type: 'REQUEST_FAIL', seq: seqOf(s), failure: { code: 'invalid_token', message: 'expired' } })
    expect(s.error?.voided).toBe(true)
    expect(s.round).toBeNull()
    expect(s.hearts).toBe(RULES.hearts)
    s = reducer(s, { type: 'RETRY' })
    expect(s.request?.req).toMatchObject({ kind: 'round', index: 0 })
  })

  test('time up is ignored while a request is in flight', () => {
    let s = playing()
    const r = s.round!
    s = reducer(s, { type: 'HINT', hint: 'artist', at: T0 })
    expect(reducer(s, { type: 'TIME_UP', roundId: r.id, at: T0 + 999_999 })).toBe(s)
  })
})
