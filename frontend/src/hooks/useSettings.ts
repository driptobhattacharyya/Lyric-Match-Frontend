import { useEffect, useState } from 'react'
import { KEYS, readJson, writeJson } from '../lib/storage'
import { setMuted } from '../lib/sound'

interface Settings {
  muted: boolean
}

function load(): Settings {
  const raw = readJson(KEYS.settings) as Partial<Settings> | null
  return { muted: raw?.muted === true }
}

export function useSettings() {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    setMuted(settings.muted)
    writeJson(KEYS.settings, settings)
  }, [settings])

  const toggleMute = () => setSettings((s) => ({ ...s, muted: !s.muted }))
  return { muted: settings.muted, toggleMute }
}
