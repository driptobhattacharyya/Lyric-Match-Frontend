import { useEffect, useState } from 'react'
import type { Difficulty } from '../game/types'
import { setMuted } from '../lib/sound'
import { KEYS, readJson, writeJson } from '../lib/storage'

export interface Settings {
  muted: boolean
  /** Selected pack ids; empty means "All". */
  packs: string[]
  difficulty: Difficulty
  /** Name last used on the leaderboard. */
  playerName: string
}

function load(): Settings {
  const raw = (readJson(KEYS.settings) ?? {}) as Partial<Record<keyof Settings, unknown>>
  return {
    muted: raw.muted === true,
    packs: Array.isArray(raw.packs) ? raw.packs.filter((p): p is string => typeof p === 'string').slice(0, 30) : [],
    difficulty: raw.difficulty === 'pro' ? 'pro' : 'easy',
    playerName: typeof raw.playerName === 'string' ? raw.playerName.slice(0, 20) : '',
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    setMuted(settings.muted)
    writeJson(KEYS.settings, settings)
  }, [settings])

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  return { settings, update }
}
