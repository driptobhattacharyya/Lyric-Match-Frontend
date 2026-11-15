import { describe, expect, test } from 'bun:test'
import { effectivePacks, languageState, songCount, toggleLanguage, togglePack } from './packs'
import type { Meta } from './types'

const meta: Meta = {
  languages: [
    { id: 'en', name: 'English', packs: [{ id: 'en-a', name: 'A', count: 100 }, { id: 'en-b', name: 'B', count: 50 }] },
    { id: 'hi', name: 'Hindi', packs: [{ id: 'hi-a', name: 'HA', count: 30 }] },
  ],
  leaderboard: true,
  roundsPerGame: 8,
  roundSeconds: { type: 45, choice: 20 },
}

describe('pack selection', () => {
  test('empty means all; unknown ids are dropped; full selection collapses to all', () => {
    expect(effectivePacks([], meta)).toEqual([])
    expect(effectivePacks(['en-a', 'gone'], meta)).toEqual(['en-a'])
    expect(effectivePacks(['en-a', 'en-b', 'hi-a'], meta)).toEqual([])
    expect(effectivePacks(['x'], null)).toEqual(['x'])
  })

  test('toggle packs and languages', () => {
    let s = togglePack([], 'en-a', meta)
    expect(s).toEqual(['en-a'])
    s = toggleLanguage(s, meta.languages[1], meta)
    expect(s.sort()).toEqual(['en-a', 'hi-a'])
    expect(languageState(s, meta.languages[0])).toBe('some')
    s = togglePack(s, 'en-b', meta)
    expect(s).toEqual([])
    expect(toggleLanguage(['en-a'], meta.languages[0], meta)).toEqual(['en-a', 'en-b'])
    expect(toggleLanguage(['en-a', 'en-b'], meta.languages[0], meta)).toEqual([])
  })

  test('song counts', () => {
    expect(songCount([], meta)).toBe(180)
    expect(songCount(['en-b', 'hi-a'], meta)).toBe(80)
  })
})
