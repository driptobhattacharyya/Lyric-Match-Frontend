import type { Difficulty, RoundResult } from '../game/types'

export function shareText(difficulty: Difficulty, score: number, results: RoundResult[], url: string): string {
  const correct = results.filter((r) => r.outcome === 'correct').length
  const best = results.reduce((m, r) => Math.max(m, r.streak), 0)
  const grid = results.map((r) => (r.outcome === 'correct' ? (r.hints.lettersLevel || r.hints.artist ? '🟨' : '🟩') : '🟥')).join('')
  return [
    `Lyric Match · ${difficulty === 'easy' ? 'Easy' : 'Pro'} · ${score.toLocaleString('en-US')} pts`,
    `${grid} ${correct}/${results.length} · best streak ${best}`,
    url,
  ].join('\n')
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Web Share API where available, clipboard otherwise. Never throws. */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
