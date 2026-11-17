import { describe, expect, test } from 'bun:test'
import { applyStreak, hintPenalty, multiplierTenths, scoreGame, streakMultiplier } from './rules'

describe('streak multiplier (docs/api.md Scoring)', () => {
  test('min(1.5, 1 + 0.1 * (n - 1))', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(streakMultiplier)).toEqual([1, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5, 1.5])
    expect(multiplierTenths(3)).toBe(12)
  })

  test('applyStreak matches the backend table of exact .5 cases (backend/tests/test_scoring.py)', () => {
    const cases: [number, number, number][] = [
      [105, 4, 137],
      [115, 4, 150],
      [125, 2, 138],
      [135, 2, 149],
      [145, 2, 160],
      [15, 2, 17],
      [25, 4, 33],
      [35, 6, 53],
      [45, 8, 68],
      [11, 6, 17],
      [101, 2, 111],
      [109, 2, 120],
      [150, 1, 150],
      [0, 3, 0],
    ]
    for (const [base, streak, expected] of cases) expect(applyStreak(base, streak)).toBe(expected)
    for (let base = 1; base <= 200; base++) {
      for (let streak = 1; streak <= 8; streak++) {
        const k = Math.min(5, streak - 1)
        expect(applyStreak(base, streak)).toBe(Math.floor((base * (10 + k) + 5) / 10))
      }
    }
  })

  test('applyStreak multiplies and rounds half up without float drift', () => {
    expect(applyStreak(132, 1)).toBe(132)
    expect(applyStreak(132, 2)).toBe(145) // 145.2
    expect(applyStreak(105, 2)).toBe(116) // 115.5 -> 116
    expect(applyStreak(105, 4)).toBe(137) // 136.5 -> 137
    expect(applyStreak(150, 9)).toBe(225)
    expect(applyStreak(0, 5)).toBe(0)
  })
})

describe('hintPenalty mirrors the server', () => {
  test('15 per highest letters level, 20 for the artist', () => {
    expect(hintPenalty({ lettersLevel: 0, artist: false })).toBe(0)
    expect(hintPenalty({ lettersLevel: 2, artist: false })).toBe(30)
    expect(hintPenalty({ lettersLevel: 3, artist: true })).toBe(65)
  })
})

describe('scoreGame', () => {
  test('streak grows over consecutive correct rounds and a miss resets it', () => {
    const { steps, total } = scoreGame([
      { correct: true, basePoints: 100 },
      { correct: true, basePoints: 100 },
      { correct: true, basePoints: 100 },
      { correct: false, basePoints: 0 },
      { correct: true, basePoints: 140 },
      { correct: true, basePoints: 125 },
    ])
    expect(steps.map((s) => s.streak)).toEqual([1, 2, 3, 0, 1, 2])
    expect(steps.map((s) => s.points)).toEqual([100, 110, 120, 0, 140, 138])
    expect(total).toBe(608)
  })

  test('a long perfect game caps at x1.5', () => {
    const { steps, total } = scoreGame(Array.from({ length: 8 }, () => ({ correct: true, basePoints: 150 })))
    expect(steps.map((s) => s.multiplier)).toEqual([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5, 1.5])
    expect(total).toBe(150 + 165 + 180 + 195 + 210 + 225 + 225 + 225)
  })
})
