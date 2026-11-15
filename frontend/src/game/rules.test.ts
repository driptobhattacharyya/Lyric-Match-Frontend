import { describe, expect, test } from 'bun:test'
import { RULES, hintPenalty, scoreCorrect, streakMultiplier } from './rules'

const noHints = { lettersLevel: 0, artist: false } as const

describe('streakMultiplier', () => {
  test('starts at 1 and grows by 0.25, capped at 2', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(streakMultiplier)).toEqual([1, 1, 1.25, 1.5, 1.75, 2, 2, 2])
  })
})

describe('hintPenalty', () => {
  test('letters cost per level, artist flat', () => {
    expect(hintPenalty(noHints)).toBe(0)
    expect(hintPenalty({ lettersLevel: 2, artist: false })).toBe(40)
    expect(hintPenalty({ lettersLevel: 3, artist: true })).toBe(90)
  })
})

describe('scoreCorrect', () => {
  const base = { durationMs: 20_000, hints: noHints, wrongAttempts: 0, streak: 1 } as const

  test('instant easy answer = 100 base + 50 speed', () => {
    expect(scoreCorrect({ ...base, difficulty: 'easy', remainingMs: 20_000 }).total).toBe(150)
  })

  test('speed bonus scales with time left', () => {
    expect(scoreCorrect({ ...base, difficulty: 'easy', remainingMs: 10_000 }).speedBonus).toBe(25)
    expect(scoreCorrect({ ...base, difficulty: 'easy', remainingMs: 0 }).speedBonus).toBe(0)
  })

  test('pro base is higher', () => {
    expect(scoreCorrect({ ...base, difficulty: 'pro', remainingMs: 0 }).total).toBe(150)
  })

  test('hints and wrong attempts reduce base, multiplier applies last', () => {
    const r = scoreCorrect({
      difficulty: 'pro',
      remainingMs: 10_000,
      durationMs: 20_000,
      hints: { lettersLevel: 1, artist: true },
      wrongAttempts: 1,
      streak: 3,
    })
    // (150 - 20 - 30 - 25 + 25) * 1.5
    expect(r.total).toBe(150)
    expect(r.multiplier).toBe(1.5)
  })

  test('penalties never push base below the floor', () => {
    const r = scoreCorrect({
      difficulty: 'easy',
      remainingMs: 0,
      durationMs: 20_000,
      hints: { lettersLevel: 3, artist: true },
      wrongAttempts: 0,
      streak: 1,
    })
    expect(r.total).toBe(RULES.minBasePoints)
    expect(r.base - r.hintPenalty - r.attemptPenalty).toBe(RULES.minBasePoints)
  })

  test('breakdown adds up to the total', () => {
    const r = scoreCorrect({
      difficulty: 'pro',
      remainingMs: 7_300,
      durationMs: 45_000,
      hints: { lettersLevel: 2, artist: false },
      wrongAttempts: 2,
      streak: 4,
    })
    expect(Math.round((r.base - r.hintPenalty - r.attemptPenalty + r.speedBonus) * r.multiplier)).toBe(r.total)
  })
})
