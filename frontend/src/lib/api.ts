import type {
  Answer,
  ApiFailure,
  ApiMode,
  CheckResponse,
  ErrorCode,
  HintKind,
  HintResponse,
  Language,
  LeaderboardEntry,
  Meta,
  Period,
  RevealResponse,
  RoundPayload,
  ScoreSubmission,
} from '../game/types'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '')

/** Render's free tier can take up to a minute to boot. */
export const WARMUP_BUDGET_MS = 90_000
const WARMUP_ATTEMPT_MS = 30_000
const WARMUP_PAUSE_MS = 2_000
export const REQUEST_TIMEOUT_MS = 20_000

export class ApiError extends Error implements ApiFailure {
  readonly code: ErrorCode
  readonly status: number
  constructor(code: ErrorCode, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const KNOWN: readonly ErrorCode[] = [
  'bad_request',
  'invalid_token',
  'rate_limited',
  'llm_unavailable',
  'leaderboard_unavailable',
  'duplicate_game',
  'not_found',
  'internal_error',
]

const FRIENDLY: Record<ErrorCode, string> = {
  bad_request: 'That request did not go through.',
  invalid_token: 'This round expired.',
  rate_limited: 'Whoa, too fast! Give it a few seconds, then try again.',
  llm_unavailable: 'The lyric machine is catching its breath. Try again in a moment.',
  leaderboard_unavailable: 'The leaderboard is offline right now. Your game still counts here.',
  duplicate_game: 'This game is already on the leaderboard.',
  not_found: 'Could not find that.',
  internal_error: 'The server hit a wrong note.',
  network: 'Cannot reach the server. Check your connection.',
  timeout: 'The server is taking too long to answer.',
}

export function friendlyMessage(code: ErrorCode): string {
  return FRIENDLY[code]
}

interface CallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** fetch + JSON with a hard timeout, an outer abort signal and the API's error envelope. */
async function call<T>(path: string, body: unknown, opts: CallOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onAbort = () => ctrl.abort()
  if (opts.signal?.aborted) ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    let res: Response
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (opts.signal?.aborted) throw err
      if (timedOut) throw new ApiError('timeout', FRIENDLY.timeout)
      throw new ApiError('network', FRIENDLY.network)
    }
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (timedOut) throw new ApiError('timeout', FRIENDLY.timeout)
    }
    if (!res.ok) throw toApiError(res.status, data)
    if (data === null || typeof data !== 'object') throw new ApiError('internal_error', FRIENDLY.internal_error, res.status)
    return data as T
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

function toApiError(status: number, data: unknown): ApiError {
  const err = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error
  const raw = typeof err?.code === 'string' ? err.code : ''
  const code: ErrorCode = (KNOWN as readonly string[]).includes(raw)
    ? (raw as ErrorCode)
    : status === 429
      ? 'rate_limited'
      : status === 503
        ? 'llm_unavailable'
        : status === 409
          ? 'duplicate_game'
          : status === 404
            ? 'not_found'
            : status >= 500
              ? 'internal_error'
              : 'bad_request'
  // Validation messages are written to be shown; keep the friendly copy for everything else.
  const serverText = typeof err?.message === 'string' && err.message.length <= 160 ? err.message : ''
  const message = code === 'bad_request' && serverText ? serverText : FRIENDLY[code]
  return new ApiError(code, message, status)
}

function invalid(): never {
  throw new ApiError('internal_error', FRIENDLY.internal_error)
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function toAnswer(v: unknown): Answer | null {
  const a = v as Record<string, unknown> | null
  if (!a || typeof a !== 'object' || !isStr(a.songId) || !isStr(a.title) || !isStr(a.artist)) return null
  return {
    songId: a.songId,
    title: a.title,
    artist: a.artist,
    year: isNum(a.year) ? a.year : null,
    film: isStr(a.film) && a.film.trim() ? a.film : null,
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/**
 * Wakes a sleeping backend: keeps knocking on /healthz (Render answers 5xx or
 * drops the connection while it boots) until it answers or the budget runs out.
 */
export async function health(signal?: AbortSignal): Promise<void> {
  const until = Date.now() + WARMUP_BUDGET_MS
  for (;;) {
    const left = until - Date.now()
    try {
      const res = await call<{ status?: unknown }>('/healthz', undefined, { signal, timeoutMs: Math.min(WARMUP_ATTEMPT_MS, Math.max(left, 1000)) })
      if (res.status === 'ok') return
      invalid()
    } catch (err) {
      if (signal?.aborted) throw err
      const retryable = err instanceof ApiError && (err.code === 'network' || err.code === 'timeout' || err.status >= 500)
      if (!retryable || Date.now() + WARMUP_PAUSE_MS >= until) {
        throw err instanceof ApiError && err.status >= 500 ? new ApiError('timeout', FRIENDLY.timeout) : err
      }
      await sleep(WARMUP_PAUSE_MS, signal)
    }
  }
}

export async function getMeta(signal?: AbortSignal): Promise<Meta> {
  const r = await call<Record<string, unknown>>('/api/meta', undefined, { signal })
  if (!Array.isArray(r.languages)) invalid()
  const languages: Language[] = (r.languages as unknown[]).flatMap((l) => {
    const lang = l as Record<string, unknown>
    if (!isStr(lang?.id) || !isStr(lang.name) || !Array.isArray(lang.packs)) return []
    const packs = (lang.packs as unknown[]).flatMap((p) => {
      const pack = p as Record<string, unknown>
      return pack && isStr(pack.id) && isStr(pack.name) ? [{ id: pack.id, name: pack.name, count: isNum(pack.count) ? pack.count : 0 }] : []
    })
    return [{ id: lang.id, name: lang.name, packs }]
  })
  const secs = (r.roundSeconds ?? {}) as Record<string, unknown>
  return {
    languages,
    leaderboard: r.leaderboard === true,
    roundsPerGame: isNum(r.roundsPerGame) && r.roundsPerGame > 0 ? Math.floor(r.roundsPerGame) : 8,
    roundSeconds: {
      type: isNum(secs.type) && secs.type > 0 ? secs.type : 45,
      choice: isNum(secs.choice) && secs.choice > 0 ? secs.choice : 20,
    },
  }
}

export async function createRound(
  mode: ApiMode,
  packs: string[],
  exclude: string[],
  signal?: AbortSignal,
): Promise<RoundPayload> {
  const r = await call<Record<string, unknown>>('/api/rounds', { mode, packs, exclude }, { signal })
  const options = r.options
  const optionsOk = options === null || options === undefined || (Array.isArray(options) && options.every(isStr))
  if (!isStr(r.roundToken) || !isStr(r.lyrics) || !isStr(r.titleMask) || !optionsOk) invalid()
  const roundMode: ApiMode = r.mode === 'choice' || r.mode === 'type' ? r.mode : mode
  if (roundMode === 'choice' && !Array.isArray(options)) invalid()
  return {
    roundToken: r.roundToken,
    lyrics: r.lyrics,
    mode: roundMode,
    language: isStr(r.language) ? r.language : 'en',
    packId: isStr(r.packId) ? r.packId : '',
    titleLength: isNum(r.titleLength) ? r.titleLength : r.titleMask.length,
    titleMask: r.titleMask,
    options: Array.isArray(options) ? (options as string[]) : null,
    timeLimitSeconds: isNum(r.timeLimitSeconds) && r.timeLimitSeconds > 0 ? r.timeLimitSeconds : 0,
  }
}

export async function requestHint(roundToken: string, kind: HintKind, level: number, signal?: AbortSignal): Promise<HintResponse> {
  const body = kind === 'letters' ? { roundToken, kind, level } : { roundToken, kind }
  const r = await call<Record<string, unknown>>('/api/rounds/hint', body, { signal })
  if (!isStr(r.roundToken)) invalid()
  if (r.kind === 'letters' && isStr(r.titleMask)) return { kind: 'letters', titleMask: r.titleMask, roundToken: r.roundToken }
  if (r.kind === 'artist' && isStr(r.artist)) return { kind: 'artist', artist: r.artist, roundToken: r.roundToken }
  return invalid()
}

export async function checkGuess(roundToken: string, guess: string, signal?: AbortSignal): Promise<CheckResponse> {
  const r = await call<Record<string, unknown>>('/api/rounds/check', { roundToken, guess }, { signal })
  if (typeof r.correct !== 'boolean') invalid()
  if (!r.correct) return { correct: false, answer: null, points: 0, receipt: null }
  const answer = toAnswer(r.answer)
  if (!answer || !isStr(r.receipt) || !isNum(r.points)) invalid()
  return { correct: true, answer, points: Math.max(0, Math.round(r.points)), receipt: r.receipt }
}

export async function revealAnswer(roundToken: string, signal?: AbortSignal): Promise<RevealResponse> {
  const r = await call<Record<string, unknown>>('/api/rounds/reveal', { roundToken }, { signal })
  const answer = toAnswer(r.answer)
  if (!answer || !isStr(r.receipt)) invalid()
  return { answer, points: 0, receipt: r.receipt }
}

export async function submitScore(name: string, receipts: string[], signal?: AbortSignal): Promise<ScoreSubmission> {
  const r = await call<Record<string, unknown>>('/api/scores', { name, receipts }, { signal })
  if (!isStr(r.id) || !isNum(r.score) || !isNum(r.rank)) invalid()
  return { id: r.id, score: r.score, rank: r.rank }
}

export async function getLeaderboard(mode: ApiMode, period: Period, limit = 20, signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  const q = new URLSearchParams({ mode, period, limit: String(limit) })
  const r = await call<Record<string, unknown>>(`/api/leaderboard?${q}`, undefined, { signal })
  if (!Array.isArray(r.entries)) invalid()
  return (r.entries as unknown[]).flatMap((e) => {
    const x = e as Record<string, unknown>
    if (!x || !isNum(x.rank) || !isStr(x.name) || !isNum(x.score)) return []
    return [
      {
        rank: x.rank,
        name: x.name,
        score: x.score,
        correct: isNum(x.correct) ? x.correct : 0,
        rounds: isNum(x.rounds) ? x.rounds : 0,
        createdAt: isStr(x.createdAt) ? x.createdAt : '',
      },
    ]
  })
}

export function toFailure(err: unknown): ApiFailure {
  if (err instanceof ApiError) return { code: err.code, message: err.message }
  return { code: 'internal_error', message: FRIENDLY.internal_error }
}

/** Mirrors the server's name rule: 1-20 chars after trimming; letters, digits, spaces, _ - . only. */
export function validateName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Enter a name first.'
  if (name.length > 20) return 'Keep it to 20 characters.'
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return 'Letters, numbers, spaces, _ - and . only.'
  return null
}
