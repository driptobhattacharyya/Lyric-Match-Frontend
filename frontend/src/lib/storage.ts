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
} as const
