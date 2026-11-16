/**
 * Standalone mock of the Lyric Match API (docs/api.md) for local UI testing.
 * Every lyric and title here is an obviously fake placeholder.
 *
 * It follows the real Flask backend's behaviour (validation, error codes and
 * messages, revealed rounds, token expiry, receipt checks, duplicate games in
 * any order, competition ranks, ASCII names). Tokens are plain base64 JSON here,
 * not encrypted, and answer matching is a simple normalised comparison.
 *
 *   node tests/mock-api/server.mjs            # listens on :5055 (PORT to change)
 *
 * Test controls (not part of the real API):
 *   POST /__mock/config {"healthDelayMs":0,"latencyMs":0,"down":false,"failNext":0,
 *                        "failCode":"rate_limited","failPath":"/api/rounds","leaderboard":true}
 *   GET  /__mock/answer?token=…  (the title for a round token, for automated play)
 *   POST /__mock/seed    (adds fake leaderboard entries)
 *   POST /__mock/reset
 */
import http from 'node:http'

const PORT = Number(process.env.PORT || 5055)
const ROUNDS_PER_GAME = 8
const SECONDS = { type: 45, choice: 20 }

const word = ['Neon', 'Paper', 'Velvet', 'Static', 'Golden', 'Midnight', 'Echo', 'Cobalt', 'Silver', 'Thunder', 'Placeholder', 'Sample', 'Mock', 'Dummy']
const noun = ['Hearts', 'Skyline', 'Rocket', 'Lanterns', 'Ocean', 'Signal', 'Garden', 'Mirror', 'Highway', 'Satellite', 'River', 'Parade']
const hiWord = ['Dil', 'Sapna', 'Raat', 'Chanda', 'Safar', 'Barish', 'Tara', 'Pyaar', 'Mausam', 'Kahani']
const hiNoun = ['Ki Baatein', 'Ka Geet', 'Se Pehle', 'Ke Rang', 'Mein Tum', 'Hai Yahin']

function seeded(n) {
  let x = n * 9301 + 49297
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280)
}

const PACKS = [
  { lang: 'en', id: 'en-pop-2010s', name: 'Pop: 2010s to now', size: 24 },
  { lang: 'en', id: 'en-rock-classic', name: 'Classic Rock', size: 16 },
  { lang: 'en', id: 'en-hiphop-rnb', name: 'Hip-hop & R&B', size: 12 },
  { lang: 'hi', id: 'hi-bollywood-90s', name: 'Bollywood: 90s', size: 18 },
  { lang: 'hi', id: 'hi-indie', name: 'Hindi Indie', size: 10 },
]

const SONGS = []
for (const p of PACKS) {
  const rnd = seeded(p.id.length * 31 + p.size)
  for (let i = 0; i < p.size; i++) {
    const hi = p.lang === 'hi'
    const a = hi ? hiWord : word
    const b = hi ? hiNoun : noun
    const title = `${a[Math.floor(rnd() * a.length)]} ${b[Math.floor(rnd() * b.length)]}${i % 5 === 0 ? ` No. ${i}` : ''}`
    SONGS.push({
      songId: `${p.id}-${i}`,
      packId: p.id,
      lang: p.lang,
      title,
      artist: hi ? `Test Singer ${i % 7}` : `The Placeholders ${i % 9}`,
      year: (hi ? 1990 : 2010) + (i % 10),
      film: hi && p.id === 'hi-bollywood-90s' ? `Sample Film ${i}` : null,
    })
  }
}

const fake = (s) => [`♪ placeholder lyric line 1 for ${s.songId} ♪`, `♪ placeholder lyric line 2 for ${s.songId} ♪`].join('\n')

// Mirrors backend/lyric_match/config.py and api.py.
const TOKEN_TTL_MS = 15 * 60 * 1000
const RECEIPT_MAX_AGE_MS = 60 * 60 * 1000
const MAX_PACKS = 30
const MAX_EXCLUDE = 200
const MAX_ID_LENGTH = 64
const MAX_GUESS_LENGTH = 200

const defaults = { healthDelayMs: 0, latencyMs: 0, down: false, failNext: 0, failCode: 'rate_limited', failPath: '', leaderboard: true }
let cfg = { ...defaults }
let scores = []
let fingerprints = new Set()
let revealed = new Set()
let healthWoken = false

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const dec = (t) => {
  if (typeof t !== 'string' || !t || t.length > 2048) return null
  try {
    const v = JSON.parse(Buffer.from(t, 'base64url').toString())
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
const isAlnum = (ch) => /[\p{L}\p{N}]/u.test(ch)
const mask = (title, shown = new Set()) => [...title].map((ch, i) => (isAlnum(ch) && !shown.has(i) ? '_' : ch)).join('')
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Same shape as backend hints.letters_hint: first letters, then a seeded shuffle; level 2 = 40%, 3 = 60%. */
function letterMask(title, seed, level) {
  const chars = [...title]
  const positions = chars.flatMap((ch, i) => (isAlnum(ch) ? [i] : []))
  const firsts = positions.filter((i) => i === 0 || !isAlnum(chars[i - 1]))
  const rest = positions.filter((i) => !firsts.includes(i))
  const rnd = seeded([...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100000, 7))
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const order = [...firsts, ...rest]
  let count = firsts.length
  const fraction = { 2: 0.4, 3: 0.6 }[level]
  if (fraction) count = Math.max(count, Math.min(Math.round(fraction * positions.length), positions.length - 1))
  return mask(title, new Set(order.slice(0, count)))
}

// backend/lyric_match/leaderboard.py name rules.
const BLOCKED_SUBSTRINGS = ['fuck', 'shit', 'nigg', 'faggot', 'bitch', 'whore', 'slut', 'rapist', 'hitler', 'asshole', 'dickhead', 'motherf', 'chutiya', 'chutia', 'madarchod', 'bhenchod', 'behenchod', 'benchod', 'bhosd', 'gandu', 'lavde', 'lawda']
const BLOCKED_WORDS = new Set(['ass', 'cum', 'tit', 'tits', 'dick', 'cock', 'porn', 'sex', 'fag', 'cunt', 'nazi', 'wank', 'twat', 'pedo', 'randi', 'gaand', 'lauda', 'kutta', 'kamina', 'harami'])
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' }
function cleanName(raw) {
  if (typeof raw !== 'string') return null
  const name = raw.trim().split(/\s+/).filter(Boolean).join(' ')
  return name.length >= 1 && name.length <= 20 && /^[A-Za-z0-9 _.-]+$/.test(name) ? name : null
}
function isBlockedName(name) {
  const lowered = name.toLowerCase().replace(/[0134578]/g, (d) => LEET[d])
  const squashed = lowered.replace(/[^a-z]/g, '')
  return BLOCKED_SUBSTRINGS.some((w) => squashed.includes(w)) || lowered.split(/[^a-z]+/).some((w) => BLOCKED_WORDS.has(w))
}

const ERR = { bad_request: 400, invalid_token: 400, rate_limited: 429, llm_unavailable: 503, leaderboard_unavailable: 503, duplicate_game: 409, not_found: 404, internal_error: 500 }
const MSG = {
  invalid_token: 'This round has expired or is invalid. Start a new round.',
  leaderboard_unavailable: 'The leaderboard is unavailable right now.',
  duplicate_game: 'This game has already been submitted.',
  not_found: 'Not found.',
}
function err(res, code, message = MSG[code] || 'Bad request.', status = ERR[code] || 400) {
  send(res, status, { error: { code, message } })
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' })
  res.end(status === 204 ? undefined : JSON.stringify(body))
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(null)
      }
    })
  })
}

/** A list of ids, or null when invalid (like api._string_list). */
function idList(value, max) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > max || !value.every((x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID_LENGTH)) return null
  return value
}

/** Exact integer maths, same as backend scoring.apply_streak and the client's applyStreak. */
function streakTotal(rounds) {
  let streak = 0
  let total = 0
  for (const r of rounds) {
    streak = r.correct ? streak + 1 : 0
    if (r.correct && r.points > 0) total += Math.floor((r.points * Math.min(15, 10 + (streak - 1)) + 5) / 10)
  }
  return total
}

/** Competition ranking ("1, 2, 2, 4") over rows sorted by score desc. */
function ranked(rows) {
  const out = []
  rows.forEach((row, i) => {
    const prev = out.at(-1)
    out.push({ rank: prev && prev.row.score === row.score ? prev.rank : i + 1, row })
  })
  return out
}

function distractors(song, count) {
  const shuffled = (xs) => [...xs].sort(() => Math.random() - 0.5)
  const tiers = [SONGS.filter((s) => s.packId === song.packId), SONGS.filter((s) => s.lang === song.lang && s.packId !== song.packId), SONGS.filter((s) => s.lang !== song.lang)]
  const used = new Set([song.title.toLowerCase()])
  const chosen = []
  for (const tier of tiers) {
    for (const o of shuffled(tier)) {
      if (chosen.length === count) return chosen
      if (!used.has(o.title.toLowerCase())) {
        used.add(o.title.toLowerCase())
        chosen.push(o.title)
      }
    }
  }
  return chosen
}

const POST_PATHS = new Set(['/api/rounds', '/api/rounds/hint', '/api/rounds/check', '/api/rounds/reveal', '/api/scores'])
const GET_PATHS = new Set(['/healthz', '/api/meta', '/api/leaderboard'])

/** Claims of a round token, or an error already sent. */
function claims(res, body, { open }) {
  if (typeof body.roundToken !== 'string' || !body.roundToken) {
    err(res, 'bad_request', 'roundToken is required.')
    return null
  }
  const tok = dec(body.roundToken)
  const song = tok && SONGS.find((s) => s.songId === tok.sid)
  const age = tok ? Date.now() - tok.at : Infinity
  if (!song || !(age <= TOKEN_TTL_MS) || (open && revealed.has(tok.rid))) {
    err(res, 'invalid_token')
    return null
  }
  return { tok, song }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  if (req.method === 'OPTIONS') return send(res, 204, null)

  if (path === '/__mock/config') {
    const body = await readBody(req)
    cfg = { ...cfg, ...(body || {}) }
    if (body && 'healthDelayMs' in body) healthWoken = false
    return send(res, 200, cfg)
  }
  if (path === '/__mock/answer') {
    const t = dec(url.searchParams.get('token'))
    const song = t && SONGS.find((x) => x.songId === t.sid)
    return send(res, song ? 200 : 404, { title: song ? song.title : null })
  }
  if (path === '/__mock/seed') {
    const names = ['Ana', 'Ravi', 'Mo', 'Kiko', 'Lena', 'Arjun', 'Sam', 'Priya', 'Tom', 'Zoe', 'Ishaan', 'Mei']
    names.forEach((name, i) => {
      for (const mode of ['type', 'choice']) {
        scores.push({ id: `seed-${mode}-${i}`, name: `${name}_Test`, score: 1300 - i * 97 - (mode === 'choice' ? 40 : 0), mode, correct: 8 - (i % 4), rounds: 8, at: Date.now() - i * 3 * 3600e3 })
      }
    })
    return send(res, 200, { ok: true })
  }
  if (path === '/__mock/reset') {
    cfg = { ...defaults }
    scores = []
    fingerprints = new Set()
    revealed = new Set()
    healthWoken = false
    return send(res, 200, { ok: true })
  }

  if (cfg.down) {
    req.socket.destroy()
    return
  }

  if (path === '/healthz' && req.method === 'GET') {
    if (!healthWoken && cfg.healthDelayMs) await wait(cfg.healthDelayMs)
    healthWoken = true
    return send(res, 200, { status: 'ok' })
  }

  if (cfg.latencyMs) await wait(cfg.latencyMs)
  if (cfg.failNext > 0 && (!cfg.failPath || path === cfg.failPath)) {
    cfg.failNext--
    return err(res, cfg.failCode, 'Injected failure')
  }

  const known = POST_PATHS.has(path) || GET_PATHS.has(path)
  if (!known) return err(res, 'not_found')
  if ((POST_PATHS.has(path) && req.method !== 'POST') || (GET_PATHS.has(path) && req.method !== 'GET')) {
    return err(res, 'bad_request', 'Method not allowed.', 405)
  }

  if (path === '/api/meta') {
    const languages = [
      { id: 'en', name: 'English', packs: PACKS.filter((p) => p.lang === 'en').map((p) => ({ id: p.id, name: p.name, count: p.size })) },
      { id: 'hi', name: 'Hindi', packs: PACKS.filter((p) => p.lang === 'hi').map((p) => ({ id: p.id, name: p.name, count: p.size })) },
    ]
    return send(res, 200, { languages, leaderboard: cfg.leaderboard, roundsPerGame: ROUNDS_PER_GAME, roundSeconds: SECONDS })
  }

  if (path === '/api/leaderboard') {
    if (!cfg.leaderboard) return err(res, 'leaderboard_unavailable')
    const mode = url.searchParams.get('mode') ?? 'type'
    if (mode !== 'type' && mode !== 'choice') return err(res, 'bad_request', 'mode must be "type" or "choice".')
    const period = url.searchParams.get('period') ?? 'all'
    if (!['all', 'week', 'day'].includes(period)) return err(res, 'bad_request', 'period must be "all", "week" or "day".')
    const rawLimit = url.searchParams.get('limit') ?? '20'
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) return err(res, 'bad_request', 'limit must be 1 to 50.')
    const since = period === 'day' ? Date.now() - 86400e3 : period === 'week' ? Date.now() - 7 * 86400e3 : 0
    const rows = scores
      .filter((s) => s.mode === mode && s.at >= since)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, Number(rawLimit))
    const entries = ranked(rows).map(({ rank, row: s }) => ({ rank, name: s.name, score: s.score, correct: s.correct, rounds: s.rounds, createdAt: new Date(s.at).toISOString().replace(/\.\d{3}Z$/, 'Z') }))
    return send(res, 200, { entries })
  }

  // POST routes. Only POST /api/rounds accepts an empty body.
  const raw = await readBody(req)
  const body = raw === undefined && path === '/api/rounds' ? {} : raw
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err(res, 'bad_request', 'Request body must be a JSON object.')

  if (path === '/api/rounds') {
    const mode = body.mode ?? 'type'
    if (mode !== 'type' && mode !== 'choice') return err(res, 'bad_request', 'mode must be "type" or "choice".')
    const packs = idList(body.packs, MAX_PACKS)
    if (!packs) return err(res, 'bad_request', `packs must be a list of at most ${MAX_PACKS} ids.`)
    const exclude = idList(body.exclude, MAX_EXCLUDE)
    if (!exclude) return err(res, 'bad_request', `exclude must be a list of at most ${MAX_EXCLUDE} ids.`)
    if (packs.some((p) => !PACKS.find((x) => x.id === p))) return err(res, 'bad_request', 'Unknown pack id.')
    let pool = SONGS.filter((s) => packs.length === 0 || packs.includes(s.packId))
    const excl = new Set(exclude)
    const fresh = pool.filter((s) => !excl.has(s.songId))
    if (fresh.length) pool = fresh
    if (!pool.length) return err(res, 'bad_request', 'No songs are available in the selected packs yet.')
    const song = pool[Math.floor(Math.random() * pool.length)]
    const rid = Math.random().toString(36).slice(2)
    const options = mode === 'choice' ? [...distractors(song, 3), song.title].sort(() => Math.random() - 0.5) : null
    return send(res, 200, {
      roundToken: enc({ rid, sid: song.songId, mode, at: Date.now(), limit: SECONDS[mode], letters: 0, artist: false }),
      lyrics: fake(song),
      mode,
      language: song.lang,
      packId: song.packId,
      titleLength: song.title.length,
      titleMask: mask(song.title),
      options,
      timeLimitSeconds: SECONDS[mode],
    })
  }

  if (path === '/api/scores') {
    if (!cfg.leaderboard) return err(res, 'leaderboard_unavailable')
    const name = cleanName(body.name)
    if (!name) return err(res, 'bad_request', 'name must be 1-20 characters: letters, digits, spaces, _, - and . only.')
    if (isBlockedName(name)) return err(res, 'bad_request', 'Please choose a different name.')
    const list = body.receipts
    if (!Array.isArray(list) || list.length < 1 || list.length > ROUNDS_PER_GAME || !list.every((r) => typeof r === 'string' && r)) {
      return err(res, 'bad_request', `receipts must be a list of 1 to ${ROUNDS_PER_GAME} receipts.`)
    }
    const receipts = list.map(dec)
    const fresh = (r) => r && typeof r.rid === 'string' && typeof r.at === 'number' && Date.now() - r.at <= RECEIPT_MAX_AGE_MS && r.at <= Date.now() + 60e3
    if (!receipts.every(fresh)) return err(res, 'invalid_token', 'A receipt is invalid or has expired.')
    const modes = new Set(receipts.map((r) => r.mode))
    if (modes.size !== 1 || !['type', 'choice'].includes(receipts[0].mode)) return err(res, 'bad_request', 'All receipts must be from the same mode.')
    const rids = receipts.map((r) => r.rid)
    if (new Set(rids).size !== rids.length) return err(res, 'bad_request', 'Each receipt must be for a different round.')
    const mode = receipts[0].mode
    const fingerprint = [mode, ...[...rids].sort()].join('|')
    const score = streakTotal(receipts)
    const rank = scores.filter((s) => s.mode === mode && s.score > score).length + 1
    if (fingerprints.has(fingerprint)) return err(res, 'duplicate_game')
    fingerprints.add(fingerprint)
    const entry = { id: crypto.randomUUID(), name, score, mode, correct: receipts.filter((r) => r.correct).length, rounds: receipts.length, at: Date.now() }
    scores.push(entry)
    return send(res, 200, { id: entry.id, score, rank })
  }

  if (path === '/api/rounds/reveal') {
    const c = claims(res, body, { open: false })
    if (!c) return
    const { tok, song } = c
    revealed.add(tok.rid)
    const answer = { songId: song.songId, title: song.title, artist: song.artist, year: song.year, film: song.film }
    return send(res, 200, { answer, points: 0, receipt: enc({ rid: tok.rid, mode: tok.mode, points: 0, correct: false, at: tok.at }) })
  }

  const c = claims(res, body, { open: true })
  if (!c) return
  const { tok, song } = c

  if (path === '/api/rounds/hint') {
    if (body.kind === 'artist') return send(res, 200, { kind: 'artist', artist: song.artist, roundToken: enc({ ...tok, artist: true }) })
    if (body.kind !== 'letters') return err(res, 'bad_request', 'kind must be "letters" or "artist".')
    const level = body.level ?? 1
    if (!Number.isInteger(level) || level < 1 || level > 3) return err(res, 'bad_request', 'level must be 1, 2 or 3.')
    const letters = Math.max(tok.letters, level)
    return send(res, 200, { kind: 'letters', titleMask: letterMask(song.title, tok.rid, level), roundToken: enc({ ...tok, letters }) })
  }

  // /api/rounds/check
  const guess = body.guess
  if (typeof guess !== 'string' || !guess.trim() || guess.length > MAX_GUESS_LENGTH) return err(res, 'bad_request', `guess must be 1-${MAX_GUESS_LENGTH} characters.`)
  if (norm(guess) !== norm(song.title)) return send(res, 200, { correct: false, answer: null, points: 0, receipt: null })
  const elapsed = (Date.now() - tok.at) / 1000
  const speed = Math.round(50 * Math.max(0, 1 - Math.max(0, elapsed) / tok.limit))
  const penalty = 15 * tok.letters + (tok.artist ? 20 : 0)
  const points = Math.max(10, 100 + speed - penalty)
  const answer = { songId: song.songId, title: song.title, artist: song.artist, year: song.year, film: song.film }
  return send(res, 200, { correct: true, answer, points, receipt: enc({ rid: tok.rid, mode: tok.mode, points, correct: true, at: tok.at }) })
})

server.listen(PORT, () => {
  process.stdout.write(`mock api on http://localhost:${PORT}\n`)
})
