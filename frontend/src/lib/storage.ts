/** localStorage that never throws (private mode, quota, disabled storage). */
export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: progress simply is not persisted.
  }
}

export const KEYS = {
  profile: 'lyric-match:profile:v1',
  settings: 'lyric-match:settings:v1',
  meta: 'lyric-match:meta:v1',
  /** The player's latest leaderboard entry, to highlight it. */
  lastEntry: 'lyric-match:last-entry:v1',
} as const
