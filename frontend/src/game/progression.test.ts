import { describe, expect, test } from 'bun:test'
import {
  advanceDaily,
  applyGame,
  dayKey,
  daysBetween,
  emptyProfile,
  levelInfo,
  liveDailyStreak,
  parseProfile,
  xpForGame,
  xpToNext,
} from './progression'
import { RULES } from './rules'
import type { RoundResult } from './types'

function result(i: number, correct: boolean, extra: Partial<RoundResult> = {}): RoundResult {
  return {
    index: i,
    outcome: correct ? 'correct' : 'wrong',
    answer: { songId: `s${i}`, title: `Song ${i}`, artist: 'Artist' },
    timeMs: 8000,
    hints: { lettersLevel: 0, artist: false },
    wrongAttempts: 0,
    streak: 0,
    points: correct ? 100 : 0,
    breakdown: null,
    ...extra,
  }
}

describe('levels', () => {
  test('xp curve', () => {
    expect(xpToNext(1)).toBe(100)
    expect(xpToNext(2)).toBe(150)
    expect(xpToNext(5)).toBe(300)
  })

  test('levelInfo boundaries', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, span: 100 })
    expect(levelInfo(99).level).toBe(1)
    expect(levelInfo(100)).toMatchObject({ level: 2, into: 0, span: 150 })
    expect(levelInfo(250)).toMatchObject({ level: 3, into: 0 })
    expect(levelInfo(260).progress).toBeCloseTo(10 / 200)
  })

  test('xp per game', () => {
    expect(xpForGame(0, 0, false)).toBe(10)
    expect(xpForGame(1000, 8, true)).toBe(10 + 80 + 50 + 25)
    expect(xpForGame(39, 1, false)).toBe(10 + 10 + 1)
  })
})

describe('daily streak', () => {
  test('dayKey uses local date parts', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  test('daysBetween across month/DST boundaries', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  test('advance: same day no-op, next day +1, gap resets', () => {
    const d0 = { current: 0, best: 0, lastDate: null }
    const d1 = advanceDaily(d0, '2026-11-10')
    expect(d1).toEqual({ current: 1, best: 1, lastDate: '2026-11-10' })
    expect(advanceDaily(d1, '2026-11-10')).toBe(d1)
    const d2 = advanceDaily(d1, '2026-11-11')
    expect(d2.current).toBe(2)
    const d3 = advanceDaily(d2, '2026-11-14')
    expect(d3).toEqual({ current: 1, best: 2, lastDate: '2026-11-14' })
  })

  test('live streak survives until a day is skipped', () => {
    const d = { current: 4, best: 4, lastDate: '2026-11-10' }
    expect(liveDailyStreak(d, '2026-11-10')).toBe(4)
    expect(liveDailyStreak(d, '2026-11-11')).toBe(4)
    expect(liveDailyStreak(d, '2026-11-12')).toBe(0)
  })
})

describe('applyGame', () => {
  test('updates totals, best score, xp and first badges', () => {
    const results = [result(0, true, { streak: 1, timeMs: 2500 }), result(1, false), result(2, true, { streak: 1 })]
    const u = applyGame(emptyProfile(), { difficulty: 'pro', results, score: 230 }, '2026-11-15')
    expect(u.xpGained).toBe(10 + 20 + 11)
    expect(u.profile.gamesPlayed).toBe(1)
    expect(u.profile.roundsPlayed).toBe(3)
    expect(u.profile.roundsCorrect).toBe(2)
    expect(u.profile.bestScore).toEqual({ easy: 0, pro: 230 })
    expect(u.newBest).toBe(true)
    expect(u.newBadges.sort()).toEqual(['first_note', 'speed_demon'])
    expect(u.profile.daily).toEqual({ current: 1, best: 1, lastDate: '2026-11-15' })
    expect(u.dailyAdvanced).toBe(true)
  })

  test('perfect, no-hint game earns flawless, on_fire, ear_only and platinum', () => {
    const results = Array.from({ length: RULES.rounds }, (_, i) => result(i, true, { streak: i + 1, points: 200 }))
    const u = applyGame(emptyProfile(), { difficulty: 'easy', results, score: 1600 }, '2026-11-15')
    expect(u.newBadges).toEqual(expect.arrayContaining(['flawless', 'on_fire', 'ear_only', 'platinum']))
    expect(u.newBadges).not.toContain('speed_demon')
    expect(u.levelAfter).toBeGreaterThan(u.levelBefore)
  })

  test('badges are only new once and best score is kept', () => {
    const first = applyGame(emptyProfile(), { difficulty: 'easy', results: [result(0, true)], score: 300 }, '2026-11-14')
    const second = applyGame(first.profile, { difficulty: 'easy', results: [result(0, true)], score: 100 }, '2026-11-15')
    expect(second.newBadges).toEqual([])
    expect(second.newBest).toBe(false)
    expect(second.profile.bestScore.easy).toBe(300)
    expect(second.profile.daily.current).toBe(2)
  })

  test('three_day badge on the third consecutive day', () => {
    let p = emptyProfile()
    for (const day of ['2026-11-13', '2026-11-14']) p = applyGame(p, { difficulty: 'easy', results: [], score: 0 }, day).profile
    const u = applyGame(p, { difficulty: 'easy', results: [], score: 0 }, '2026-11-15')
    expect(u.newBadges).toContain('three_day')
  })
})

describe('parseProfile', () => {
  test('rejects garbage and unknown versions', () => {
    expect(parseProfile(null)).toEqual(emptyProfile())
    expect(parseProfile('x')).toEqual(emptyProfile())
    expect(parseProfile({ version: 2, xp: 50 })).toEqual(emptyProfile())
  })

  test('round-trips a valid profile and drops bad fields', () => {
    const p = { ...emptyProfile(), xp: 420, badges: { first_note: '2026-11-01', bogus: 'x' } }
    const parsed = parseProfile(JSON.parse(JSON.stringify({ ...p, gamesPlayed: -3 })))
    expect(parsed.xp).toBe(420)
    expect(parsed.gamesPlayed).toBe(0)
    expect(parsed.badges).toEqual({ first_note: '2026-11-01' })
  })
})
