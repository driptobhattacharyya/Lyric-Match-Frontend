/**
 * Standalone mock of the Lyric Match API (docs/api.md) for local UI testing.
 * Every lyric and title here is an obviously fake placeholder.
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

const fake = (s) => [
  `placeholder lyric line one for round ${s.songId}`,
  'la la la (this is not a real song)',
  'sample words go here, oh oh',
].join('\n')

const defaults = { healthDelayMs: 0, latencyMs: 0, down: false, failNext: 0, failCode: 'rate_limited', failPath: '', leaderboard: true }
let cfg = { ...defaults }
let scores = []
let usedReceipts = new Set()
let healthWoken = false

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const dec = (t) => {
  try {
    return JSON.parse(Buffer.from(String(t), 'base64url').toString())
  } catch {
    return null
  }
}
const mask = (title) => title.replace(/[\p{L}\p{N}]/gu, '_')
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function letterMask(title, level) {
  let wordIdx = 0
  return [...title]
    .map((ch, i, arr) => {
      if (!/[\p{L}\p{N}]/u.test(ch)) return ch
      const startOfWord = i === 0 || !/[\p{L}\p{N}]/u.test(arr[i - 1])
      if (startOfWord) wordIdx++
      const endOfWord = i === arr.length - 1 || !/[\p{L}\p{N}]/u.test(arr[i + 1])
      if (level >= 1 && startOfWord) return ch
      if (level >= 2 && endOfWord) return ch
      if (level >= 3 && i % 2 === 0) return ch
      return '_'
    })
    .join('')
}

const ERR = { bad_request: 400, invalid_token: 400, rate_limited: 429, llm_unavailable: 503, leaderboard_unavailable: 503, duplicate_game: 409, not_found: 404, internal_error: 500 }
function err(res, code, message) {
  send(res, ERR[code] || 400, { error: { code, message } })
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' })
  res.end(JSON.stringify(body))
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve(null)
      }
    })
  })
}

function streakTotal(rounds) {
  let streak = 0
  let total = 0
  for (const r of rounds) {
    streak = r.correct ? streak + 1 : 0
    if (r.correct) total += Math.floor((r.points * Math.min(15, 10 + (streak - 1)) + 5) / 10)
  }
  return total
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  if (req.method === 'OPTIONS') return send(res, 204, {})

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
    usedReceipts = new Set()
    healthWoken = false
    return send(res, 200, { ok: true })
  }

  if (cfg.down) {
    req.socket.destroy()
    return
  }

  if (path === '/healthz') {
    if (!healthWoken && cfg.healthDelayMs) await wait(cfg.healthDelayMs)
    healthWoken = true
    return send(res, 200, { status: 'ok' })
  }

  if (cfg.latencyMs) await wait(cfg.latencyMs)
  if (cfg.failNext > 0 && (!cfg.failPath || path === cfg.failPath)) {
    cfg.failNext--
    return err(res, cfg.failCode, 'Injected failure')
  }

  if (path === '/api/meta' && req.method === 'GET') {
    const languages = [
      { id: 'en', name: 'English', packs: PACKS.filter((p) => p.lang === 'en').map((p) => ({ id: p.id, name: p.name, count: p.size })) },
      { id: 'hi', name: 'Hindi', packs: PACKS.filter((p) => p.lang === 'hi').map((p) => ({ id: p.id, name: p.name, count: p.size })) },
    ]
    return send(res, 200, { languages, leaderboard: cfg.leaderboard, roundsPerGame: ROUNDS_PER_GAME, roundSeconds: SECONDS })
  }

  if (path === '/api/leaderboard' && req.method === 'GET') {
    if (!cfg.leaderboard) return err(res, 'leaderboard_unavailable', 'No database configured.')
    const mode = url.searchParams.get('mode') || 'type'
    const period = url.searchParams.get('period') || 'all'
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
    const since = period === 'day' ? Date.now() - 86400e3 : period === 'week' ? Date.now() - 7 * 86400e3 : 0
    const entries = scores
      .filter((s) => s.mode === mode && s.at >= since)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, limit)
      .map((s, i) => ({ rank: i + 1, name: s.name, score: s.score, correct: s.correct, rounds: s.rounds, createdAt: new Date(s.at).toISOString() }))
    return send(res, 200, { entries })
  }

  if (req.method !== 'POST') return err(res, 'not_found', 'Not found.')
  const body = await readBody(req)
  if (!body || typeof body !== 'object') return err(res, 'bad_request', 'Body must be JSON.')

  if (path === '/api/rounds') {
    const mode = body.mode === 'choice' ? 'choice' : 'type'
    const packs = Array.isArray(body.packs) ? body.packs : []
    if (packs.some((p) => !PACKS.find((x) => x.id === p))) return err(res, 'bad_request', 'Unknown pack.')
    let pool = SONGS.filter((s) => packs.length === 0 || packs.includes(s.packId))
    const excl = new Set(Array.isArray(body.exclude) ? body.exclude : [])
    const fresh = pool.filter((s) => !excl.has(s.songId))
    if (fresh.length) pool = fresh
    const song = pool[Math.floor(Math.random() * pool.length)]
    const rid = Math.random().toString(36).slice(2)
    let options = null
    if (mode === 'choice') {
      const others = SONGS.filter((s) => s.lang === song.lang && s.title !== song.title).sort(() => Math.random() - 0.5)
      const titles = [song.title]
      for (const o of others) if (titles.length < 4 && !titles.includes(o.title)) titles.push(o.title)
      options = titles.sort(() => Math.random() - 0.5)
    }
    return send(res, 200, {
      roundToken: enc({ rid, sid: song.songId, mode, at: Date.now(), letters: 0, artist: false }),
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

  const tok = dec(body.roundToken)
  const song = tok && SONGS.find((s) => s.songId === tok.sid)
  if (!song) return err(res, 'invalid_token', 'This round expired.')
  const answer = { songId: song.songId, title: song.title, artist: song.artist, year: song.year, film: song.film }

  if (path === '/api/rounds/hint') {
    if (body.kind === 'artist') return send(res, 200, { kind: 'artist', artist: song.artist, roundToken: enc({ ...tok, artist: true }) })
    const level = Number(body.level)
    if (![1, 2, 3].includes(level)) return err(res, 'bad_request', 'Level must be 1 to 3.')
    const letters = Math.max(tok.letters, level)
    return send(res, 200, { kind: 'letters', titleMask: letterMask(song.title, letters), roundToken: enc({ ...tok, letters }) })
  }
  if (path === '/api/rounds/check') {
    const guess = typeof body.guess === 'string' ? body.guess : ''
    if (guess.length < 1 || guess.length > 200) return err(res, 'bad_request', 'Guess must be 1 to 200 characters.')
    if (norm(guess) !== norm(song.title)) return send(res, 200, { correct: false, answer: null, points: 0, receipt: null })
    const elapsed = (Date.now() - tok.at) / 1000
    const speed = Math.round(50 * Math.max(0, 1 - elapsed / SECONDS[tok.mode]))
    const penalty = 15 * tok.letters + (tok.artist ? 20 : 0)
    const points = Math.max(10, 100 + speed - penalty)
    return send(res, 200, { correct: true, answer, points, receipt: enc({ rid: tok.rid, mode: tok.mode, points, correct: true }) })
  }
  if (path === '/api/rounds/reveal') {
    return send(res, 200, { answer, points: 0, receipt: enc({ rid: tok.rid, mode: tok.mode, points: 0, correct: false }) })
  }
  if (path === '/api/scores') {
    if (!cfg.leaderboard) return err(res, 'leaderboard_unavailable', 'No database configured.')
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 20 || !/^[\p{L}\p{N} _.-]+$/u.test(name)) return err(res, 'bad_request', 'Name must be 1 to 20 letters, digits, spaces, _ - or .')
    const receipts = Array.isArray(body.receipts) ? body.receipts.map(dec) : []
    if (!receipts.length || receipts.length > ROUNDS_PER_GAME || receipts.some((r) => !r)) return err(res, 'bad_request', 'Invalid receipts.')
    const key = receipts.map((r) => r.rid).join(',')
    if (usedReceipts.has(key)) return err(res, 'duplicate_game', 'This game was already submitted.')
    usedReceipts.add(key)
    const score = streakTotal(receipts)
    const entry = { id: Math.random().toString(36).slice(2), name, score, mode: receipts[0].mode, correct: receipts.filter((r) => r.correct).length, rounds: receipts.length, at: Date.now() }
    scores.push(entry)
    const rank = scores.filter((s) => s.mode === entry.mode && s.score > score).length + 1
    return send(res, 200, { id: entry.id, score, rank })
  }
  return err(res, 'not_found', 'Not found.')
})

server.listen(PORT, () => {
  process.stdout.write(`mock api on http://localhost:${PORT}\n`)
})
