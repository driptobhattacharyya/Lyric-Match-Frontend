import { useEffect, useState } from 'react'
import type { ServerStatus } from '../game/reducer'
import type { Meta } from '../game/types'
import * as api from '../lib/api'
import { KEYS, readJson, writeJson } from '../lib/storage'

function cached(): Meta | null {
  const raw = readJson(KEYS.meta) as Meta | null
  return raw && Array.isArray(raw.languages) && typeof raw.roundsPerGame === 'number' ? raw : null
}

export type MetaStatus = 'loading' | 'ready' | 'error'

/**
 * /api/meta, fetched once the warm-up says the server is awake. The last good
 * copy is kept in localStorage so packs show instantly on the next visit.
 */
export function useMeta(server: ServerStatus) {
  const [meta, setMeta] = useState<Meta | null>(cached)
  const [fresh, setFresh] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (server !== 'ready' || fresh) return
    const ctrl = new AbortController()
    api.getMeta(ctrl.signal).then(
      (m) => {
        if (ctrl.signal.aborted) return
        setMeta(m)
        setFresh(true)
        setFailed(false)
        writeJson(KEYS.meta, m)
      },
      () => !ctrl.signal.aborted && setFailed(true),
    )
    return () => ctrl.abort()
  }, [server, fresh, attempt])

  const status: MetaStatus = fresh ? 'ready' : failed ? 'error' : 'loading'
  return { meta, status, reload: () => setAttempt((n) => n + 1) }
}
