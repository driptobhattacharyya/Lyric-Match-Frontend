import type {
  Answer,
  ApiFailure,
  ApiMode,
  CheckResponse,
  ErrorCode,
  HintKind,
  HintResponse,
  RevealResponse,
  RoundPayload,
} from '../game/types'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '')

/** Render's free tier can take up to a minute to boot. */
export const WARMUP_TIMEOUT_MS = 75_000
export const REQUEST_TIMEOUT_MS = 20_000

export class ApiError extends Error implements ApiFailure {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const KNOWN: readonly ErrorCode[] = ['bad_request', 'invalid_token', 'rate_limited', 'llm_unavailable', 'not_found']

const FRIENDLY: Record<ErrorCode, string> = {
  bad_request: 'That request did not go through.',
  invalid_token: 'This round expired.',
  rate_limited: 'Whoa, too fast! Give it a few seconds.',
  llm_unavailable: 'The lyric machine is catching its breath.',
  not_found: 'Could not find that.',
  network: 'Cannot reach the server. Check your connection.',
  timeout: 'The server is taking too long to answer.',
  server: 'The server hit a wrong note.',
}

export function friendlyMessage(code: ErrorCode): string {
  return FRIENDLY[code]
}

interface CallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

async function call<T>(path: string, body: unknown, opts: CallOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onAbort = () => ctrl.abort()
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
      if (timedOut) throw new ApiError('timeout', FRIENDLY.timeout)
      if (opts.signal?.aborted) throw err
      throw new ApiError('network', FRIENDLY.network)
    }
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      if (timedOut) throw new ApiError('timeout', FRIENDLY.timeout)
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }
    if (!res.ok) throw toApiError(res.status, data)
    if (data === null || typeof data !== 'object') throw new ApiError('server', FRIENDLY.server)
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
        : status >= 500
          ? 'server'
          : 'bad_request'
  return new ApiError(code, FRIENDLY[code])
}

function isAnswer(v: unknown): v is Answer {
  const a = v as Answer | null
  return !!a && typeof a.songId === 'string' && typeof a.title === 'string' && typeof a.artist === 'string'
}

function invalid(): never {
  throw new ApiError('server', FRIENDLY.server)
}

export async function health(signal?: AbortSignal): Promise<void> {
  const res = await call<{ status?: string }>('/healthz', undefined, { signal, timeoutMs: WARMUP_TIMEOUT_MS })
  if (res.status !== 'ok') invalid()
}

export async function createRound(mode: ApiMode, exclude: string[], signal?: AbortSignal): Promise<RoundPayload> {
  const r = await call<RoundPayload>('/api/rounds', { mode, exclude }, { signal })
  const optionsOk = r.options === null || r.options === undefined || (Array.isArray(r.options) && r.options.every((o) => typeof o === 'string'))
  if (typeof r.roundToken !== 'string' || typeof r.lyrics !== 'string' || typeof r.titleMask !== 'string' || !optionsOk) {
    invalid()
  }
  return { ...r, options: r.options ?? null, titleLength: Number(r.titleLength) || r.titleMask.length }
}

export async function requestHint(roundToken: string, kind: HintKind, level: number, signal?: AbortSignal): Promise<HintResponse> {
  const r = await call<HintResponse>('/api/rounds/hint', { roundToken, kind, level }, { signal })
  if (r.kind === 'letters' && typeof r.titleMask === 'string') return r
  if (r.kind === 'artist' && typeof r.artist === 'string') return r
  return invalid()
}

export async function checkGuess(roundToken: string, guess: string, signal?: AbortSignal): Promise<CheckResponse> {
  const r = await call<CheckResponse>('/api/rounds/check', { roundToken, guess }, { signal })
  if (typeof r.correct !== 'boolean') invalid()
  return { correct: r.correct, answer: isAnswer(r.answer) ? r.answer : null }
}

export async function revealAnswer(roundToken: string, signal?: AbortSignal): Promise<RevealResponse> {
  const r = await call<RevealResponse>('/api/rounds/reveal', { roundToken }, { signal })
  if (!isAnswer(r.answer)) invalid()
  return r
}

export function toFailure(err: unknown): ApiFailure {
  if (err instanceof ApiError) return { code: err.code, message: err.message }
  return { code: 'server', message: FRIENDLY.server }
}
